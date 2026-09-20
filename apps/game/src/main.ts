import Phaser from "phaser";
import { type GameEngine, type GameEvent } from "@fantasy-frontiers/core";
import { GAME_CONFIG, type Coordinate, type Difficulty, type EvaluationRecord, type GameAction, type GameResult, type LevelRecord, type MapSpec, type TowerArchetype, type WorldSkin, type WorldSpec } from "@fantasy-frontiers/shared";
import { generateMap } from "@fantasy-frontiers/maps";
import { ScreenFlow, type AppScreen } from "./app/screen-flow";
import { createBoardProjection, type BoardProjection } from "./game/board-projection";
import { createGameplayController, type GameplayController } from "./game/gameplay-controller";
import { resolveWorldSkin } from "./presentation/world-skin-resolver";
import { getLocalGameAssetKey, getLocalGameAssetUrl, getPresentationAssets } from "./presentation/local-game-assets";
import { createDecorationPlacements } from "./presentation/deterministic-decoration";
import { createRoadConnectionMap, ROAD_DIRECTION_OFFSETS } from "./presentation/road-renderer";
import { ENEMY_WORLD_ASSET_BY_ARCHETYPE, TOWER_WORLD_ASSET_BY_ARCHETYPE, resolveWorldAssets, type ResolvedWorldAssets, type WorldAssetName } from "./presentation/world-asset-registry";
import { WORLD_VISUAL_DEPTH } from "./presentation/world-asset-render-config";
import { footprintDiamond, getIsometricPlacement, placeIsometricSprite, type IsometricPlacement } from "./presentation/isometric-render-contract";
import { mountAssetCalibrationPage } from "./presentation/asset-calibration-scene";
import "./style.css";

const difficultySeeds: Record<Difficulty, number> = { easy: 70421, medium: 70422, hard: 70423 };
const debugRenderMode = new URLSearchParams(window.location.search).get("debugRender") === "1";
const assetCalibrationMode = window.location.pathname.endsWith("/dev/assets") || new URLSearchParams(window.location.search).get("assetCalibration") === "1";
const difficultyNames: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const defaultTowerNames: Record<TowerArchetype, string> = { basic: "弩塔", aoe: "爆裂塔", slow: "霜缚塔", heavy: "重炮塔" };
function createDemoMap(difficulty: Difficulty): MapSpec {
  const generated = generateMap({ difficulty, seed: difficultySeeds[difficulty] });
  if (generated.ok === false) throw new Error(`Unable to load the ${difficulty} demo map: ${generated.message}`);
  return generated.map;
}

let currentDifficulty: Difficulty = "easy";
let currentMap = createDemoMap(currentDifficulty);
let currentWorldId = "frontier-world";
let currentWorldName = "边境哨站";
let currentEnemyNames = "";
let currentLevels: Record<Difficulty, LevelRecord> = Object.fromEntries((Object.keys(difficultyNames) as Difficulty[]).map(difficulty => {
  const map = createDemoMap(difficulty);
  const id = `frontier-${difficulty}`;
  return [difficulty, { id, worldId: currentWorldId, difficulty, name: `${currentWorldName} · ${difficultyNames[difficulty]}`, story: "", map: { ...map, id } }];
})) as Record<Difficulty, LevelRecord>;

let engine: GameplayController = createGameplayController({ map: currentMap, levelId: `frontier-${currentDifficulty}`, seed: currentMap.seed });
let selectedArchetype: TowerArchetype | null = null;
let selectedTowerId: string | null = null;
let selectedBuildSlot: Coordinate | null = null;
let gameSpeed: 1 | 2 = 1;
let message = "选择防御塔，再点击地图上的空心建造位。";
let boardScene: BoardScene;
let activeRunId: string | null = null;
let resultRunId: string | null = null;
let presentedResultKey: string | null = null;
let currentSkin = resolveWorldSkin("fantasy");
let currentWorldAssets = resolveWorldAssets(currentWorldId);
const apiBase = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "/fantasy-frontiers" : "http://127.0.0.1:3001");
let game: Phaser.Game | undefined;
const screenFlow = new ScreenFlow((screen: AppScreen) => {
  document.querySelectorAll<HTMLElement>("section[data-app-screen]").forEach(element => {
    const active = element.dataset.appScreen === screen;
    element.hidden = !active;
    element.setAttribute("aria-hidden", String(!active));
  });
  document.body.dataset.appScreen = screen;
  if (screen === "gameplay") requestAnimationFrame(resizeGameToStage);
});

function resizeGameToStage(): void {
  if (screenFlow.current !== "gameplay") return;
  const stage = document.querySelector<HTMLElement>("#game-root");
  if (!stage || stage.clientWidth === 0 || stage.clientHeight === 0) return;
  game?.scale.resize(stage.clientWidth, stage.clientHeight);
  game?.scale.refresh();
  boardScene?.changeMap();
}

document.querySelectorAll<HTMLImageElement>("img[data-asset-id]").forEach(image => {
  const url = getLocalGameAssetUrl(image.dataset.assetId ?? "");
  if (url) image.src = url;
});

const ui = {
  status: document.querySelector<HTMLElement>("#game-status")!,
  hp: document.querySelector<HTMLElement>("#hp-value")!,
  gold: document.querySelector<HTMLElement>("#gold-value")!,
  wave: document.querySelector<HTMLElement>("#wave-value")!,
  message: document.querySelector<HTMLElement>("#game-message")!,
  upgrade: document.querySelector<HTMLButtonElement>("#upgrade-button")!,
  nextWave: document.querySelector<HTMLButtonElement>("#wave-button")!,
  pause: document.querySelector<HTMLButtonElement>("#pause-button")!,
  speed: document.querySelector<HTMLButtonElement>("#speed-button")!,
  restart: document.querySelector<HTMLButtonElement>("#restart-button")!,
  resultTitle: document.querySelector<HTMLElement>("#result-title")!,
  resultCopy: document.querySelector<HTMLElement>("#result-copy")!,
  replayLevel: document.querySelector<HTMLButtonElement>("#replay-level")!,
  returnLevels: document.querySelector<HTMLButtonElement>("#return-levels")!,
  returnWorlds: document.querySelector<HTMLButtonElement>("#return-worlds")!,
  levelLabel: document.querySelector<HTMLElement>("#level-label")!,
  worldList: document.querySelector<HTMLElement>("#world-list")!,
  worldForm: document.querySelector<HTMLFormElement>("#world-create-form")!,
  worldPrompt: document.querySelector<HTMLInputElement>("#world-prompt")!,
  worldCreateButton: document.querySelector<HTMLButtonElement>("#world-create-button")!,
  generationJobs: document.querySelector<HTMLElement>("#generation-jobs")!,
  workshop: document.querySelector<HTMLElement>("#workshop-panel")!,
  workshopList: document.querySelector<HTMLElement>("#workshop-list")!,
  worldLibrary: document.querySelector<HTMLElement>(".world-library")!,
  creator: document.querySelector<HTMLElement>(".world-creator")!,
  detail: document.querySelector<HTMLElement>("#world-detail")!,
  detailTitle: document.querySelector<HTMLElement>("#detail-title")!,
  detailSummary: document.querySelector<HTMLElement>("#detail-summary")!,
  detailLevels: document.querySelector<HTMLElement>("#detail-levels")!,
  reports: document.querySelector<HTMLElement>("#evaluation-reports")!,
  evaluate: document.querySelector<HTMLButtonElement>("#evaluate-world")!,
  publish: document.querySelector<HTMLButtonElement>("#publish-world")!,
  publishStatus: document.querySelector<HTMLElement>("#publish-status")!,
  leaveGameplay: document.querySelector<HTMLButtonElement>("#leave-gameplay")!,
  playSelectedLevel: document.querySelector<HTMLButtonElement>("#play-selected-level")!,
  pauseOverlay: document.querySelector<HTMLElement>("#pause-overlay")!,
  pauseResume: document.querySelector<HTMLButtonElement>("#pause-resume")!,
  pauseReturn: document.querySelector<HTMLButtonElement>("#pause-return")!,
  towerContext: document.querySelector<HTMLElement>("#tower-context-panel")!,
  towerContextName: document.querySelector<HTMLElement>("#tower-context-name")!,
  towerContextLevel: document.querySelector<HTMLElement>("#tower-context-level")!,
  towerContextDamage: document.querySelector<HTMLElement>("#tower-context-damage")!,
  towerContextRange: document.querySelector<HTMLElement>("#tower-context-range")!,
  towerContextCost: document.querySelector<HTMLElement>("#tower-context-cost")!,
  waveBanner: document.querySelector<HTMLElement>("#wave-banner")!,
  feedback: document.querySelector<HTMLElement>("#battle-feedback")!,
  nextLevel: document.querySelector<HTMLButtonElement>("#next-level")!,
};
type ListedEvaluation = Pick<EvaluationRecord, "id" | "worldId" | "levelId" | "status" | "error" | "createdAt" | "updatedAt"> & { report: EvaluationRecord["report"] };
type KnownWorld = { spec: WorldSpec; levels: LevelRecord[]; evaluations: ListedEvaluation[]; readiness: { ready: boolean; issues: string[] } | null; skin?: WorldSkin; towerTheme?: { entries: { archetype: TowerArchetype; name: string }[] }; enemyTheme?: { entries: { name: string }[] } };
const knownWorlds = new Map<string, KnownWorld>();
let unlockedLevelIds = new Set<string>();
let feedbackSequence = 0;
const pollingJobs = new Set<string>();
const pollingEvaluations = new Set<string>();
type HubView = "menu" | "play" | "studio" | "generate" | "evaluation" | "settings";
let currentHubView: HubView = "menu";
let selectedEvaluationWorldId: string | null = null;

function showHubView(view: HubView): void {
  currentHubView = view;
  screenFlow.show("hub");
  document.querySelectorAll<HTMLElement>("[data-hub-view]").forEach(element => {
    const active = element.dataset.hubView === view;
    element.hidden = !active;
    element.setAttribute("aria-hidden", String(!active));
  });
  if (view === "play") {
    ui.detail.hidden = true;
    ui.worldList.hidden = false;
  }
  if (view === "evaluation") renderEvaluationWorlds();
  if (view === "generate") renderCreatorWorlds();
}

function renderCreatorWorlds(): void {
  const list = document.querySelector<HTMLElement>("#generation-world-list")!;
  list.replaceChildren();
  const heading = document.createElement("h3"); heading.textContent = "已有世界"; list.append(heading);
  for (const world of knownWorlds.values()) {
    const row = document.createElement("article"); row.className = "creator-world-row";
    const copy = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = world.spec.name;
    const status = document.createElement("small"); status.textContent = `${world.spec.status} · ${world.levels.length}/3 关`;
    copy.append(title, status); row.append(copy); list.append(row);
  }
}

function renderEvaluationWorlds(): void {
  const list = document.querySelector<HTMLElement>("#evaluation-world-list")!;
  list.replaceChildren();
  for (const world of knownWorlds.values()) {
    const button = document.createElement("button"); button.className = "evaluation-world-card"; button.type = "button";
    const assets = resolveWorldAssets(world.skin?.assetWorldId ?? world.spec.id);
    const image = document.createElement("img"); image.src = assets.worldKeyArtUrl; image.alt = "";
    const copy = document.createElement("span");
    const title = document.createElement("strong"); title.textContent = world.spec.name;
    const summary = document.createElement("small"); summary.textContent = world.evaluations.length ? `已有 ${world.evaluations.length} 条实验记录` : "尚未评测";
    copy.append(title, summary); button.append(image, copy);
    button.addEventListener("click", () => renderEvaluationDetail(world.spec.id)); list.append(button);
  }
}

function renderEvaluationDetail(worldId: string): void {
  const known = knownWorlds.get(worldId); if (!known) return;
  selectedEvaluationWorldId = worldId;
  const panel = document.querySelector<HTMLElement>("#evaluation-detail")!; panel.hidden = false;
  document.querySelector<HTMLElement>("#evaluation-title")!.textContent = `${known.spec.name} · 评测`;
  const running = known.evaluations.some(record => record.status === "queued" || record.status === "running");
  const start = document.querySelector<HTMLButtonElement>("#evaluation-start")!;
  start.disabled = running; start.textContent = running ? "评测进行中…" : known.evaluations.length ? "重新评测" : "开始评测";
  const download = document.querySelector<HTMLAnchorElement>("#evaluation-download")!;
  download.hidden = !known.evaluations.some(record => record.status === "completed" && record.report);
  download.href = `${apiBase}/api/worlds/${encodeURIComponent(worldId)}/evaluation-report.md`;
  document.querySelector<HTMLElement>("#evaluation-status")!.textContent = "评测将运行 Easy、Medium、Hard，并保留 Simulator 实验 Trace 与指标报告。";
  const reports = document.querySelector<HTMLElement>("#evaluation-report-list")!; reports.replaceChildren();
  const latestByLevel = new Map<string, ListedEvaluation>();
  for (const evaluation of [...known.evaluations].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) latestByLevel.set(evaluation.levelId, evaluation);
  for (const difficulty of ["easy", "medium", "hard"] as const) {
    const level = known.levels.find(item => item.difficulty === difficulty); if (!level) continue;
    const evaluation = latestByLevel.get(level.id); const card = document.createElement("article"); card.className = "evaluation-report";
    const title = document.createElement("h3"); title.textContent = `${difficultyNames[difficulty]} · ${level.name}`;
    const copy = document.createElement("p"); copy.textContent = evaluation?.report
      ? `${evaluation.report.summary} 胜率 ${(evaluation.report.metrics.winRate * 100).toFixed(0)}% · ${evaluation.report.runIds.length} 次运行`
      : evaluation ? `评测${evaluation.status}${evaluation.error ? `：${evaluation.error}` : ""}` : "尚无评测报告。";
    card.append(title, copy); reports.append(card);
  }
}

async function beginPersistentRun(): Promise<void> {
  activeRunId = null;
  resultRunId = null;
  try {
    const response = await fetch(`${apiBase}/api/levels/${encodeURIComponent(currentLevels[currentDifficulty].id)}/start`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerId: "local-player", seed: currentMap.seed }),
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json() as { runId: string };
    activeRunId = data.runId;
  } catch {
    message = "本地 API 不可用；本局仍可游玩，但进度不会保存。";
    renderHud();
  }
}

async function saveGameResult(result: GameResult): Promise<void> {
  if (!activeRunId || resultRunId === activeRunId) return;
  const runId = activeRunId;
  resultRunId = runId;
  try {
    const response = await fetch(`${apiBase}/api/levels/${encodeURIComponent(result.levelId)}/result`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, result }),
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    await refreshWorldLibrary();
    message = result.win ? "战绩已保存，世界进度已更新。" : "战绩已保存。";
    renderHud();
  } catch {
    resultRunId = null;
    message = "本局结束，但战绩未能保存。请检查本地 API。";
    renderHud();
  }
}

async function refreshWorldLibrary(): Promise<void> {
  try {
    const [worldsResponse, progressResponse, jobsResponse, workshopResponse] = await Promise.all([
      fetch(`${apiBase}/api/worlds`), fetch(`${apiBase}/api/progress?playerId=local-player`), fetch(`${apiBase}/api/generation-jobs`), fetch(`${apiBase}/api/workshop/worlds`),
    ]);
    if (!worldsResponse.ok || !progressResponse.ok || !jobsResponse.ok || !workshopResponse.ok) throw new Error("API unavailable");
    const { worlds } = await worldsResponse.json() as { worlds: WorldSpec[] };
    const { progress } = await progressResponse.json() as { progress: { levelId: string; unlocked: boolean; completed: boolean }[] };
    unlockedLevelIds = new Set(progress.filter(record => record.unlocked).map(record => record.levelId));
    const { jobs } = await jobsResponse.json() as { jobs: { id: string; worldId: string; status: string; currentStep: string; error: string | null }[] };
    const workshopData = await workshopResponse.json() as { worlds: WorldSpec[] };
    ui.worldList.replaceChildren();
    const worldDetails = await Promise.all(worlds.map(async world => {
      const response = await fetch(`${apiBase}/api/worlds/${encodeURIComponent(world.id)}`);
      if (!response.ok) return undefined;
      const detail = await response.json() as { levels: LevelRecord[]; skin?: WorldSkin; towerTheme?: KnownWorld["towerTheme"]; enemyTheme?: KnownWorld["enemyTheme"]; evaluations?: ListedEvaluation[]; readiness?: KnownWorld["readiness"] };
      return { world, detail };
    }));
    knownWorlds.clear();
    for (const entry of worldDetails) {
      if (!entry) continue;
      const { world, detail } = entry;
      knownWorlds.set(world.id, { spec: world, levels: detail.levels, evaluations: detail.evaluations ?? [], readiness: detail.readiness ?? null, ...(detail.skin ? { skin: detail.skin } : {}), ...(detail.towerTheme ? { towerTheme: detail.towerTheme } : {}), ...(detail.enemyTheme ? { enemyTheme: detail.enemyTheme } : {}) });
      const card = document.createElement("article"); card.className = "world-card";
      const thumbnail = document.createElement("img"); thumbnail.className = "world-thumbnail"; thumbnail.alt = `${world.name}世界封面`;
      const worldAssets = resolveWorldAssets(detail.skin?.assetWorldId ?? world.id);
      thumbnail.src = worldAssets.worldKeyArtUrl;
      thumbnail.style.objectPosition = `${worldAssets.manifest.keyArt.focalX * 100}% ${worldAssets.manifest.keyArt.focalY * 100}%`;
      const copy = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = world.name;
      const summary = document.createElement("span"); summary.textContent = `${world.summary} · ${world.status}`;
      copy.append(title, summary);
      const levels = document.createElement("div"); levels.className = "world-progress";
      for (const level of detail.levels) {
        const record = progress.find(progressEntry => progressEntry.levelId === level.id);
        const badge = document.createElement("span");
        badge.className = record?.completed ? "complete" : record?.unlocked ? "unlocked" : "locked";
        badge.textContent = `${level.difficulty.toUpperCase()} ${record?.completed ? "✓" : record?.unlocked ? "可玩" : "锁定"}`;
        levels.append(badge);
      }
      const select = document.createElement("button"); select.className = "world-select"; select.type = "button"; select.textContent = world.id === currentWorldId ? "使用中" : "进入";
      select.disabled = world.status !== "ready" && world.status !== "generated" && world.status !== "published";
      select.addEventListener("click", () => void prepareWorld(world.id).then(ready => { if (ready) renderWorldDetail(world.id); }));
      const detailButton = document.createElement("button"); detailButton.className = "world-select"; detailButton.type = "button"; detailButton.textContent = "选择关卡";
      detailButton.addEventListener("click", () => void prepareWorld(world.id).then(ready => { if (ready) renderWorldDetail(world.id); }));
      const actions = document.createElement("div"); actions.className = "world-card-actions"; actions.append(select, detailButton);
      card.append(thumbnail, copy, levels, actions); ui.worldList.append(card);
    }
    renderWorkshop(workshopData.worlds);
    renderGenerationJobs(jobs);
    renderCreatorWorlds();
    renderEvaluationWorlds();
    for (const job of jobs) if ((job.status === "queued" || job.status === "running") && !pollingJobs.has(job.id)) void pollGeneration(job.id, job.worldId);
    for (const world of worlds) if (knownWorlds.get(world.id)?.evaluations.some(evaluation => evaluation.status === "queued" || evaluation.status === "running") && !pollingEvaluations.has(world.id)) void pollEvaluations(world.id);
    document.querySelectorAll<HTMLButtonElement>("[data-difficulty]").forEach(button => {
      const record = progress.find(entry => entry.levelId === currentLevels[button.dataset.difficulty as Difficulty]?.id);
      button.disabled = !record?.unlocked;
      button.title = button.disabled ? "此关卡尚未解锁" : "";
    });
  } catch {
    ui.worldList.textContent = "本地存档服务暂不可用；示例关卡仍可直接游玩。";
  }
}

function renderWorkshop(worlds: WorldSpec[]): void {
  ui.workshopList.replaceChildren();
  if (worlds.length === 0) {
    const empty = document.createElement("div"); empty.className = "workshop-empty";
    const image = document.createElement("img"); image.alt = "一座等待创建世界的边境徽记"; image.src = getLocalGameAssetUrl("ff.border-outpost.workshop-empty") ?? "";
    const title = document.createElement("strong"); title.textContent = "工坊尚无已发布世界";
    const copy = document.createElement("p"); copy.textContent = "创建并完成世界评测后，可以将它发布到这里。";
    const link = document.createElement("button"); link.className = "world-select"; link.type = "button"; link.textContent = "前往我的世界";
    link.addEventListener("click", () => document.querySelector<HTMLButtonElement>("#close-workshop")?.click());
    empty.append(image, title, copy, link); ui.workshopList.append(empty); return;
  }
  for (const world of worlds) {
    const card = document.createElement("article"); card.className = "workshop-card";
    const cover = document.createElement("img"); cover.className = "workshop-cover"; cover.alt = `${world.name}世界封面`;
    const worldAssets = resolveWorldAssets(world.id); cover.src = worldAssets.worldKeyArtUrl;
    cover.style.objectPosition = `${worldAssets.manifest.keyArt.focalX * 100}% ${worldAssets.manifest.keyArt.focalY * 100}%`;
    const title = document.createElement("strong"); title.textContent = world.name;
    const summary = document.createElement("p"); summary.textContent = world.summary;
    const enter = document.createElement("button"); enter.className = "world-select"; enter.type = "button"; enter.textContent = "查看并游玩";
    enter.addEventListener("click", () => void enterWorkshopWorld(world.id));
    card.append(cover, title, summary, enter); ui.workshopList.append(card);
  }
}

function renderWorldDetail(worldId: string): void {
  const known = knownWorlds.get(worldId);
  if (!known) return;
  ui.detail.hidden = false;
  ui.worldList.hidden = true;
  ui.detailTitle.dataset.worldId = worldId;
  ui.detailTitle.textContent = known.spec.name;
  const worldAssets = resolveWorldAssets(known.skin?.assetWorldId ?? worldId);
  ui.detail.style.setProperty("--world-key-art", `url(${JSON.stringify(worldAssets.worldKeyArtUrl)})`);
  ui.detail.style.setProperty("--world-key-position", `${worldAssets.manifest.keyArt.focalX * 100}% ${worldAssets.manifest.keyArt.focalY * 100}%`);
  ui.detailSummary.textContent = `${known.spec.summary} · 状态：${known.spec.status}`;
  ui.detailLevels.replaceChildren();
  for (const difficulty of ["easy", "medium", "hard"] as const) {
    const level = known.levels.find(candidate => candidate.difficulty === difficulty);
    const row = document.createElement("article"); row.className = "detail-level";
    const copy = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = level?.name ?? `${difficultyNames[difficulty]} · 缺少关卡`;
    const description = document.createElement("p"); description.textContent = level?.story || "地图和战役主题已保存在本地。";
    copy.append(title, description);
    const play = document.createElement("button"); play.className = "world-select"; play.type = "button"; play.textContent = "开始挑战"; play.disabled = !level;
    if (level) play.addEventListener("click", () => { void enterGameplay(worldId, difficulty); });
    row.append(copy, play); ui.detailLevels.append(row);
  }
  const running = known.evaluations.some(evaluation => evaluation.status === "queued" || evaluation.status === "running");
  ui.evaluate.disabled = known.spec.status === "published" || running;
  ui.evaluate.textContent = known.evaluations.some(evaluation => evaluation.status === "failed") ? "重试评测" : known.evaluations.length ? "重新评测" : "开始评测";
  ui.publish.disabled = !known.readiness?.ready || known.spec.status === "published";
  ui.publishStatus.textContent = known.spec.status === "published" ? "已发布到创意工坊。" : known.readiness?.ready ? "三关地图和评测报告均已通过发布检查。" : `发布条件：${(known.readiness?.issues ?? ["等待世界数据"]).join("、")}`;
  ui.reports.replaceChildren();
  const latestByLevel = new Map<string, ListedEvaluation>();
  for (const evaluation of [...known.evaluations].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) latestByLevel.set(evaluation.levelId, evaluation);
  for (const difficulty of ["easy", "medium", "hard"] as const) {
    const level = known.levels.find(candidate => candidate.difficulty === difficulty);
    if (!level) continue;
    const evaluation = latestByLevel.get(level.id);
    const report = document.createElement("article"); report.className = "evaluation-report";
    const heading = document.createElement("h3"); heading.textContent = `${difficultyNames[difficulty]} · 评测报告`;
    const body = document.createElement("p");
    if (evaluation?.report) body.textContent = `${evaluation.report.summary} 胜率 ${(evaluation.report.metrics.winRate * 100).toFixed(0)}% · 运行 ${evaluation.report.runIds.length} 局 · 策略 ${evaluation.report.policies.join("、")}`;
    else if (evaluation) body.textContent = `评测${evaluation.status}${evaluation.error ? `：${evaluation.error}` : ""}`;
    else body.textContent = "尚无评测报告。";
    const findings = document.createElement("ul");
    for (const finding of evaluation?.report?.findings ?? []) { const item = document.createElement("li"); item.textContent = finding; findings.append(item); }
    report.append(heading, body, findings); ui.reports.append(report);
  }
}

async function enterWorkshopWorld(worldId: string): Promise<void> {
  try {
    const response = await fetch(`${apiBase}/api/workshop/worlds/${encodeURIComponent(worldId)}`);
    if (!response.ok) throw new Error("该世界目前不可用。");
    const detail = await response.json() as { world: WorldSpec; levels: LevelRecord[]; skin?: WorldSkin; towerTheme?: KnownWorld["towerTheme"]; enemyTheme?: KnownWorld["enemyTheme"] };
    knownWorlds.set(worldId, { spec: detail.world, levels: detail.levels, evaluations: [], readiness: { ready: true, issues: [] }, ...(detail.skin ? { skin: detail.skin } : {}), ...(detail.towerTheme ? { towerTheme: detail.towerTheme } : {}), ...(detail.enemyTheme ? { enemyTheme: detail.enemyTheme } : {}) });
    const ready = await prepareWorld(worldId);
    if (!ready) throw new Error("该世界缺少可玩的 Easy / Medium / Hard 关卡。");
    setWorkshopVisible(false);
    renderWorldDetail(worldId);
  } catch (error) { ui.workshopList.textContent = error instanceof Error ? error.message : "无法载入工坊世界。"; }
}

function setWorkshopVisible(visible: boolean): void {
  ui.workshop.hidden = !visible;
  ui.worldLibrary.hidden = visible;
  ui.creator.hidden = visible;
  if (visible) ui.detail.hidden = true;
}

function returnToSelection(target: "world" | "levels"): void {
  showHubView("play");
  if (target === "world") renderWorldDetail(currentWorldId);
}

async function prepareWorld(worldId: string, difficulty = currentDifficulty): Promise<boolean> {
  let world = knownWorlds.get(worldId);
  if (!world) {
    await refreshWorldLibrary();
    world = knownWorlds.get(worldId);
  }
  // Keep the bundled demo playable if the local save API is offline.
  if (!world) return worldId === currentWorldId;
  if (world.levels.length !== 3) return false;
  const levels = Object.fromEntries(world.levels.map(level => [level.difficulty, level])) as Record<Difficulty, LevelRecord>;
  if (!(levels.easy && levels.medium && levels.hard)) return false;
  currentWorldId = worldId;
  currentWorldName = world.spec.name;
  currentDifficulty = difficulty;
  currentLevels = levels;
  currentMap = currentLevels[currentDifficulty].map;
  engine = createGameplayController({ map: currentMap, levelId: currentLevels[currentDifficulty].id, seed: currentMap.seed });
  selectedTowerId = null;
  selectedArchetype = null;
  selectedBuildSlot = null;
  presentedResultKey = null;
  gameSpeed = 1;
  currentEnemyNames = world.enemyTheme?.entries.map(entry => entry.name).join("、") ?? "";
  message = [currentLevels[currentDifficulty].story, currentEnemyNames ? `敌军：${currentEnemyNames}` : "选择防御塔，再点击地图上的空心建造位。"].filter(Boolean).join(" ");
  ui.levelLabel.textContent = `${currentLevels[currentDifficulty].name} · ${engine.state.totalWaves} 波`;
  const towerNames = new Map(world.towerTheme?.entries.map(entry => [entry.archetype, entry.name]));
  document.querySelectorAll<HTMLButtonElement>("[data-archetype]").forEach(button => {
    const archetype = button.dataset.archetype as TowerArchetype;
    const name = towerNames.get(archetype) ?? defaultTowerNames[archetype] ?? "防御塔";
    button.dataset.label = name;
    const text = button.querySelector<HTMLElement>("span:nth-child(2)");
    if (text) text.textContent = name;
  });
  currentSkin = resolveWorldSkin(world.spec.themeFamily, world.skin);
  currentWorldAssets = resolveWorldAssets(world.skin?.assetWorldId ?? worldId);
  document.documentElement.style.setProperty("--battle-backdrop", `url(${JSON.stringify(currentWorldAssets.battleBackdropUrl)})`);
  document.documentElement.dataset.themeFamily = world.spec.themeFamily;
  document.documentElement.dataset.themePack = currentSkin.packId;
  document.documentElement.style.setProperty("--theme-primary", currentSkin.skin.colors.primary);
  document.documentElement.style.setProperty("--theme-secondary", currentSkin.skin.colors.secondary);
  document.documentElement.style.setProperty("--theme-accent", currentSkin.skin.colors.accent);
  document.documentElement.style.setProperty("--theme-background", currentSkin.skin.colors.background);
  document.documentElement.style.setProperty("--theme-text", currentSkin.skin.colors.text);
  document.querySelectorAll<HTMLButtonElement>("[data-difficulty]").forEach(button => button.classList.toggle("selected", button.dataset.difficulty === currentDifficulty));
  boardScene?.changeMap();
  renderHud();
  return true;
}

async function enterGameplay(worldId: string, difficulty: Difficulty): Promise<void> {
  const ready = await prepareWorld(worldId, difficulty);
  if (!ready) return;
  screenFlow.show("gameplay");
  initializeGame();
  await beginPersistentRun();
}

function renderGenerationJobs(jobs: { id: string; worldId: string; status: string; currentStep: string; error: string | null }[]): void {
  ui.generationJobs.replaceChildren();
  for (const job of jobs) {
    const row = document.createElement("div"); row.className = `generation-job ${job.status === "failed" ? "failed" : ""}`;
    const text = document.createElement("span");
    text.textContent = `${knownWorlds.get(job.worldId)?.spec.name ?? "新世界"} · ${job.status} · ${job.currentStep}${job.error ? ` · ${job.error}` : ""}`;
    row.append(text);
    if (job.status === "failed") {
      const retry = document.createElement("button"); retry.className = "world-select"; retry.type = "button"; retry.textContent = "重试";
      retry.addEventListener("click", () => void retryGeneration(job.id, job.worldId)); row.append(retry);
    }
    ui.generationJobs.append(row);
  }
}

async function pollGeneration(jobId: string, worldId: string): Promise<void> {
  if (pollingJobs.has(jobId)) return;
  pollingJobs.add(jobId);
  try {
    let status = "queued";
    while (status === "queued" || status === "running") {
      await new Promise(resolve => window.setTimeout(resolve, 1200));
      const response = await fetch(`${apiBase}/api/generation-jobs/${encodeURIComponent(jobId)}`);
      if (!response.ok) break;
      const { job } = await response.json() as { job: { status: string } };
      status = job.status;
      await refreshWorldLibrary();
    }
    if (status === "completed") {
      const ready = await prepareWorld(worldId);
      if (ready) renderWorldDetail(worldId);
    }
  } finally { pollingJobs.delete(jobId); }
}

async function retryGeneration(jobId: string, worldId: string): Promise<void> {
  const response = await fetch(`${apiBase}/api/generation-jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
  if (!response.ok) { ui.generationJobs.textContent = "重试未能启动，请检查生成次数限制或服务状态。"; return; }
  await refreshWorldLibrary();
  void pollGeneration(jobId, worldId);
}

async function evaluateWorld(worldId: string): Promise<void> {
  const evaluationStart = document.querySelector<HTMLButtonElement>("#evaluation-start");
  if (evaluationStart) { evaluationStart.disabled = true; evaluationStart.textContent = "正在排队…"; }
  try {
    const response = await fetch(`${apiBase}/api/worlds/${encodeURIComponent(worldId)}/evaluate`, { method: "POST" });
    const body = await response.json() as { error?: string };
    if (!response.ok) throw new Error(body.error ?? `API ${response.status}`);
    await refreshWorldLibrary();
    renderEvaluationDetail(worldId);
    void pollEvaluations(worldId);
  } catch (error) {
    document.querySelector<HTMLElement>("#evaluation-status")!.textContent = `无法启动评测：${error instanceof Error ? error.message : "服务异常"}`;
    if (evaluationStart) evaluationStart.disabled = false;
  }
}

async function pollEvaluations(worldId: string): Promise<void> {
  if (pollingEvaluations.has(worldId)) return;
  pollingEvaluations.add(worldId);
  try {
    let running = true;
    while (running) {
      await new Promise(resolve => window.setTimeout(resolve, 1400));
      const response = await fetch(`${apiBase}/api/worlds/${encodeURIComponent(worldId)}`);
      if (!response.ok) break;
      const detail = await response.json() as { evaluations?: ListedEvaluation[] };
      running = (detail.evaluations ?? []).some(evaluation => evaluation.status === "queued" || evaluation.status === "running");
      await refreshWorldLibrary();
      if (selectedEvaluationWorldId === worldId && currentHubView === "evaluation") renderEvaluationDetail(worldId);
    }
  } finally { pollingEvaluations.delete(worldId); }
}

async function publishWorld(worldId: string): Promise<void> {
  ui.publish.disabled = true;
  try {
    const response = await fetch(`${apiBase}/api/worlds/${encodeURIComponent(worldId)}/publish`, { method: "POST" });
    const body = await response.json() as { error?: string; issues?: string[] };
    if (!response.ok) throw new Error(body.issues?.join("、") || body.error || `API ${response.status}`);
    await refreshWorldLibrary();
    renderWorldDetail(worldId);
    ui.publishStatus.textContent = "已发布到创意工坊。";
  } catch (error) {
    ui.publishStatus.textContent = `发布未通过：${error instanceof Error ? error.message : "服务异常"}`;
    ui.publish.disabled = false;
  }
}

function showFeedback(text: string, kind: "gain" | "damage" | "banner" = "gain"): void {
  const item = document.createElement("span");
  item.className = `feedback-item ${kind}`;
  item.textContent = text;
  item.dataset.sequence = String(++feedbackSequence);
  ui.feedback.append(item);
  window.setTimeout(() => item.remove(), kind === "banner" ? 1900 : 1200);
}

function send(action: GameAction): GameEvent[] {
  const result = engine.dispatch(action);
  if (result.accepted) {
    const statusEvent = result.events.find((event): event is Extract<GameEvent, { type: "statusChanged" }> => event.type === "statusChanged");
    if (result.events.some(event => event.type === "towerPlaced")) message = "防御塔已部署。检查射程，准备开始波次。";
    else if (result.events.some(event => event.type === "towerUpgraded")) message = "升级完成，火力已提升。";
    else if (statusEvent?.status === "running") message = "波次开始！";
    else if (statusEvent) message = statusEvent.status === "paused" ? "战斗已暂停。" : "战斗继续。";
    consumeBattleEvents(result.events);
  } else message = result.reason;
  boardScene?.renderState();
  renderHud();
  return result.events;
}

function consumeBattleEvents(events: readonly GameEvent[]): void {
  for (const event of events) {
    if (event.type === "towerPlaced") {
      showFeedback("防御塔部署成功 · ✦", "gain");
      boardScene?.showPlacementEffect(event.position);
    }
    else if (event.type === "towerFired") boardScene?.showProjectile(event);
    else if (event.type === "enemyKilled") {
      showFeedback(`击破 · +${event.reward} 金币`, "gain");
      boardScene?.showDeathEffect(event.position, event.reward);
    }
    else if (event.type === "enemyLeaked") {
      showFeedback(`基地受损 −${event.damage}`, "damage");
      boardScene?.showBaseHitEffect();
      document.querySelector(".battle-hud")?.classList.add("base-hit");
      window.setTimeout(() => document.querySelector(".battle-hud")?.classList.remove("base-hit"), 420);
    }
    else if (event.type === "statusChanged" && event.status === "running") {
      ui.waveBanner.textContent = `第 ${engine.state.waveIndex} 波来袭`;
      ui.waveBanner.hidden = false;
      boardScene?.showWaveStartEffect();
      window.setTimeout(() => { ui.waveBanner.hidden = true; }, 1900);
    }
  }
}

function restart(enterGame = true): void {
  engine = createGameplayController({ map: currentMap, levelId: currentLevels[currentDifficulty].id, seed: currentMap.seed });
  selectedArchetype = null;
  selectedTowerId = null;
  selectedBuildSlot = null;
  presentedResultKey = null;
  gameSpeed = 1;
  message = "新一局已准备。选择防御塔并部署。";
  if (enterGame) screenFlow.show("gameplay");
  boardScene.renderState();
  renderHud();
  if (enterGame) void beginPersistentRun();
}

function setDifficulty(difficulty: Difficulty): void {
  if (difficulty === currentDifficulty) {
    if (engine.state.status === "won" || engine.state.status === "lost") {
      restart(false);
    }
    return;
  }
  currentDifficulty = difficulty;
  currentMap = currentLevels[difficulty].map;
  engine = createGameplayController({ map: currentMap, levelId: currentLevels[difficulty].id, seed: currentMap.seed });
  selectedArchetype = null;
  selectedTowerId = null;
  selectedBuildSlot = null;
  presentedResultKey = null;
  gameSpeed = 1;
  message = [currentLevels[difficulty].story || `${difficultyNames[difficulty]} 关卡已载入。`, currentEnemyNames ? `敌军：${currentEnemyNames}` : "选择防御塔并部署。"].join(" ");
  ui.levelLabel.textContent = `${currentLevels[difficulty].name} · ${engine.state.totalWaves} 波`;
  document.querySelectorAll<HTMLButtonElement>("[data-difficulty]").forEach(button => button.classList.toggle("selected", button.dataset.difficulty === difficulty));
  boardScene?.changeMap();
  renderHud();
}

function renderHud(): void {
  const state = engine.state;
  if (import.meta.env.DEV) {
    const root = document.querySelector<HTMLElement>("#gameplay-screen");
    if (root) {
      root.dataset.debugStatus = state.status;
      root.dataset.debugElapsed = state.elapsedTime.toFixed(2);
      root.dataset.debugWave = String(state.waveIndex);
      root.dataset.debugEnemies = String(state.enemies.length);
      root.dataset.debugQueue = String(state.activeWaveQueue.length);
    }
  }
  ui.status.textContent = ({ ready: "部署阶段", running: "战斗进行中", paused: "已暂停", won: "防线守住了", lost: "基地失守" })[state.status];
  ui.status.classList.toggle("running", state.status === "running");
  ui.hp.textContent = `${state.hp} / ${state.maxHp}`;
  ui.gold.textContent = `${state.gold}`;
  ui.wave.textContent = `${state.waveIndex} / ${state.totalWaves}`;
  ui.message.textContent = message;
  ui.nextWave.disabled = state.status !== "ready" || state.waveIndex >= state.totalWaves;
  const waveLabel = ui.nextWave.querySelector("span");
  if (waveLabel) waveLabel.textContent = state.waveIndex === 0 ? "开始第一波" : "开始下一波";
  else ui.nextWave.textContent = state.waveIndex === 0 ? "开始第一波" : "开始下一波";
  ui.pause.disabled = state.status !== "running";
  ui.pauseOverlay.hidden = state.status !== "paused";
  const speedLabel = ui.speed.querySelector("span");
  if (speedLabel) speedLabel.textContent = `${gameSpeed}× 速度`;
  else ui.speed.textContent = `${gameSpeed}× 速度`;
  const tower = state.towers.find(candidate => candidate.id === selectedTowerId);
  ui.towerContext.hidden = !tower || state.status === "paused" || state.status === "won" || state.status === "lost";
  if (tower) {
    const stats = GAME_CONFIG.towers[tower.archetype];
    const upgradeCost = Math.ceil(stats.upgradeCost * stats.upgradeMultiplier ** (tower.level - 1));
    ui.upgrade.disabled = state.status === "won" || state.status === "lost" || tower.level >= GAME_CONFIG.economy.maximumTowerLevel || state.gold < upgradeCost;
    ui.towerContextName.textContent = knownWorlds.get(currentWorldId)?.towerTheme?.entries.find(entry => entry.archetype === tower.archetype)?.name ?? defaultTowerNames[tower.archetype];
    ui.towerContextLevel.textContent = `Lv.${tower.level}`;
    ui.towerContextDamage.textContent = `${Math.round(stats.damage * stats.upgradeMultiplier ** (tower.level - 1))}`;
    ui.towerContextRange.textContent = `${stats.range}`;
    ui.towerContextCost.textContent = tower.level >= GAME_CONFIG.economy.maximumTowerLevel ? "已满级" : `${upgradeCost} 金币`;
    boardScene?.positionTowerContext(tower.position);
  } else ui.upgrade.disabled = true;
  const nextDifficulty = currentDifficulty === "easy" ? "medium" : currentDifficulty === "medium" ? "hard" : null;
  ui.nextLevel.hidden = !nextDifficulty || !unlockedLevelIds.has(currentLevels[nextDifficulty]?.id ?? "");
  document.querySelectorAll<HTMLButtonElement>("[data-archetype]").forEach(button => {
    const archetype = button.dataset.archetype as TowerArchetype;
    button.classList.toggle("selected", archetype === selectedArchetype);
    button.disabled = state.gold < GAME_CONFIG.towers[archetype].cost || state.status === "won" || state.status === "lost";
  });

  const result = engine.result();
  if (result) {
    ui.resultTitle.textContent = result.win ? "胜利 · 防线守住了" : "失败 · 基地失守";
    ui.resultCopy.textContent = `完成波次 ${result.waveReached}/${result.totalWaves} · 剩余生命 ${result.remainingHp} · 击退 ${result.enemiesKilled} 个敌人 · 剩余金币 ${result.remainingGold} · 获得金币 ${result.goldEarned} · 建塔 ${result.towersBuilt} 座`;
    ui.pauseOverlay.hidden = true;
    ui.towerContext.hidden = true;
    screenFlow.show("result");
    const resultKey = `${result.levelId}:${result.seed}:${result.duration}:${result.win}`;
    if (presentedResultKey !== resultKey) {
      presentedResultKey = resultKey;
      showFeedback(result.win ? "防线守住了" : "基地失守", "banner");
      void saveGameResult(result);
    }
  }
}

class BoardScene extends Phaser.Scene {
  private backdropSprite: Phaser.GameObjects.Image | null = null;
  private terrain!: Phaser.GameObjects.Graphics;
  private roads!: Phaser.GameObjects.Graphics;
  private dynamic!: Phaser.GameObjects.Graphics;
  private shots!: Phaser.GameObjects.Graphics;
  private shotEvents: Extract<GameEvent, { type: "towerFired" }>[] = [];
  private projection!: BoardProjection;
  private terrainSprites: Phaser.GameObjects.Image[] = [];
  private entitySprites = new Map<string, Phaser.GameObjects.Image>();
  private hoverCell: Coordinate | null = null;
  private activeProjectileCount = 0;
  private readonly maxProjectileCount = 48;
  private activeDeathParticles = 0;
  private readonly maxDeathParticles = 72;
  private decorationLayer!: Phaser.GameObjects.Container;
  private riftSprites: Phaser.GameObjects.Image[] = [];
  private baseSprite: Phaser.GameObjects.Image | null = null;
  private sceneClock = 0;
  private debugGraphics: Phaser.GameObjects.Graphics | null = null;
  private debugLabels: Phaser.GameObjects.Text[] = [];

  constructor() { super("board"); }

  preload(): void {
    const pack = getPresentationAssets(currentSkin.packId);
    const ids = pack?.terrainTileIds ?? [];
    for (const id of ids) {
      const url = getLocalGameAssetUrl(id);
      const key = getLocalGameAssetKey(id);
      if (url && key && !this.textures.exists(key)) this.load.image(key, url);
    }
    for (const id of ["ff.neutral.tower", "ff.neutral.enemy"]) {
      const url = getLocalGameAssetUrl(id); const key = getLocalGameAssetKey(id);
      if (url && key && !this.textures.exists(key)) this.load.image(key, url);
    }
  }

  create(): void {
    boardScene = this;
    this.cameras.main.setBackgroundColor("rgba(16,26,26,0)");
    this.terrain = this.add.graphics().setDepth(WORLD_VISUAL_DEPTH.ground);
    this.roads = this.add.graphics().setDepth(WORLD_VISUAL_DEPTH.road);
    this.dynamic = this.add.graphics().setDepth(WORLD_VISUAL_DEPTH.indicator);
    this.shots = this.add.graphics().setDepth(WORLD_VISUAL_DEPTH.projectile);
    if (debugRenderMode) this.debugGraphics = this.add.graphics().setDepth(WORLD_VISUAL_DEPTH.debug);
    this.syncBackdrop();
    this.layoutBoard();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutBoard, this);
    this.drawTerrain();
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.onBoardClick(pointer.x, pointer.y));
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const next = this.projection.cellAt({ x: pointer.x, y: pointer.y });
      if (next?.x === this.hoverCell?.x && next?.y === this.hoverCell?.y) return;
      this.hoverCell = next;
      this.drawTerrain();
    });
    this.renderState();
    renderHud();
    // World packs can be several megabytes over a public connection. Do not
    // block Scene creation on them: render the deterministic fallback board
    // first, then replace its visuals once the themed pack has finished.
    this.loadWorldTextures(currentWorldAssets);
  }

  update(time: number, delta: number): void {
    this.sceneClock = time;
    if (engine.state.status !== "running") {
      if (engine.state.status === "ready") this.renderState();
      if (engine.state.status !== "paused") this.animateLandmarks(time);
      return;
    }
    const events = engine.advanceFrame(delta / 1000, gameSpeed);
    consumeBattleEvents(events);
    this.shotEvents = events.filter((event): event is Extract<GameEvent, { type: "towerFired" }> => event.type === "towerFired");
    this.renderState();
    renderHud();
    this.shotEvents = [];
    this.animateLandmarks(time);
  }

  renderState(): void {
    if (!this.dynamic) return;
    const state = engine.state;
    this.dynamic.clear();
    const activeIds = new Set<string>();
    for (const tower of state.towers) { activeIds.add(tower.id); this.drawTower(tower.id, tower.position, tower.archetype, tower.level, tower.id === selectedTowerId); }
    for (const enemy of state.enemies) { activeIds.add(enemy.id); this.drawEnemy(enemy.id, enemy); }
    for (const [id, sprite] of this.entitySprites) if (!activeIds.has(id)) { sprite.destroy(); this.entitySprites.delete(id); }
    this.drawPathDirection();
    this.drawInteractionHighlight();
    this.drawShots();
    if (debugRenderMode) this.drawDebugRenderMode();
  }

  private drawDebugRenderMode(): void {
    if (!this.debugGraphics) return;
    this.debugGraphics.clear();
    for (const label of this.debugLabels) label.destroy();
    this.debugLabels = [];
    for (let y = 0; y < currentMap.height; y++) for (let x = 0; x < currentMap.width; x++) {
      const center = this.project({ x, y });
      this.debugGraphics.fillStyle(0x51dcff, .75).fillCircle(center.x, center.y, 2);
      this.debugLabels.push(this.add.text(center.x + 3, center.y + 2, `${x},${y}`, { color: "#8cecff", fontSize: "8px", backgroundColor: "#00151aaa" }).setDepth(WORLD_VISUAL_DEPTH.debug));
    }
    const sprites = [...this.terrainSprites, ...this.entitySprites.values()];
    for (const sprite of sprites) {
      const placement = sprite.getData("isometricPlacement") as IsometricPlacement | undefined;
      if (!placement) continue;
      const bounds = sprite.getBounds();
      this.debugGraphics.lineStyle(1, 0xff5b79, .9).strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      this.debugGraphics.fillStyle(0xffed67, 1).fillCircle(placement.screenX, placement.groundScreenY, 3);
      const footprint = footprintDiamond(this.projection, { x: placement.worldX, y: placement.worldY }, placement.metadata);
      this.debugGraphics.lineStyle(1, 0x6dff9a, .9).beginPath().moveTo(footprint[0]!.x, footprint[0]!.y);
      for (const vertex of footprint.slice(1)) this.debugGraphics.lineTo(vertex.x, vertex.y);
      this.debugGraphics.closePath().strokePath();
      this.debugLabels.push(this.add.text(bounds.x, bounds.y - 12, `${placement.asset} s${placement.metadata.scale} o${placement.metadata.originX},${placement.metadata.originY}\ny${placement.groundScreenY.toFixed(1)} d${placement.depth.toFixed(1)}`, { color: "#fff3b0", fontSize: "8px", backgroundColor: "#111c" }).setDepth(WORLD_VISUAL_DEPTH.debug));
    }
  }

  private drawPathDirection(): void {
    if (engine.state.status !== "ready") return;
    for (const path of currentMap.paths) {
      for (let index = 1; index < path.tiles.length - 1; index += 3) {
        const from = this.project(path.tiles[index]!);
        const to = this.project(path.tiles[index + 1]!);
        const angle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y);
        const length = Math.min(12, this.projection.tileWidth * .18);
        const wing = .7;
        this.dynamic.lineStyle(2, 0xffdfa0, .46);
        this.dynamic.lineBetween(to.x, to.y - 2, to.x - Math.cos(angle - wing) * length, to.y - 2 - Math.sin(angle - wing) * length);
        this.dynamic.lineBetween(to.x, to.y - 2, to.x - Math.cos(angle + wing) * length, to.y - 2 - Math.sin(angle + wing) * length);
      }
    }
  }

  changeMap(): void {
    this.loadWorldTextures(currentWorldAssets);
  }

  private loadWorldTextures(assets: ResolvedWorldAssets): void {
    if (!this.queueWorldTextures(assets)) {
      this.refreshWorldVisuals();
      return;
    }
    this.load.once(Phaser.Loader.Events.COMPLETE, () => this.refreshWorldVisuals());
    this.load.start();
  }

  private refreshWorldVisuals(): void {
    this.syncBackdrop();
    this.layoutBoard();
    this.drawTerrain();
    this.renderState();
  }

  private queueWorldTextures(assets: ResolvedWorldAssets): boolean {
    let queued = false;
    const entries: [string, string][] = [[`world-${assets.resolvedWorldId}-battleBackdrop`, assets.battleBackdropUrl]];
    for (const name of Object.keys(assets.manifest.assets) as WorldAssetName[]) {
      if (name.startsWith("road")) continue;
      entries.push([assets.textureKey(name), assets.assetUrl(name)]);
    }
    for (const [key, url] of entries) {
      if (this.textures.exists(key)) continue;
      this.load.image(key, url);
      queued = true;
    }
    return queued;
  }

  private syncBackdrop(): void {
    const key = `world-${currentWorldAssets.resolvedWorldId}-battleBackdrop`;
    if (!this.textures.exists(key)) return;
    if (!this.backdropSprite) this.backdropSprite = this.add.image(this.scale.width / 2, this.scale.height / 2, key).setDepth(WORLD_VISUAL_DEPTH.backdrop).setScrollFactor(0);
    else this.backdropSprite.setTexture(key);
    const source = this.textures.get(key).getSourceImage() as { width: number; height: number };
    const scale = Math.max(this.scale.width / source.width, this.scale.height / source.height);
    this.backdropSprite.setPosition(this.scale.width / 2, this.scale.height / 2)
      .setDisplaySize(source.width * scale, source.height * scale)
      .setTint(this.color(currentWorldAssets.manifest.battlefieldPalette.ambientTint))
      .setAlpha(.72);
  }

  positionTowerContext(point: Coordinate): void {
    const position = this.projection.project(point);
    const panel = ui.towerContext;
    const width = panel.offsetWidth || 220;
    const height = panel.offsetHeight || 190;
    panel.style.left = `${Math.max(12, Math.min(this.scale.width - width - 12, position.x + 18))}px`;
    panel.style.top = `${Math.max(72, Math.min(this.scale.height - height - 180, position.y - height / 2))}px`;
  }

  showPlacementEffect(point: Coordinate): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const center = this.project(point);
    const ring = this.add.ellipse(center.x, center.y - 3, 20, 12, this.color(currentSkin.skin.colors.accent), 0.72);
    this.tweens.add({ targets: ring, scaleX: 2.2, scaleY: 2.4, alpha: 0, duration: 320, ease: "Back.Out", onComplete: () => ring.destroy() });
  }

  showDeathEffect(point: Coordinate, reward: number): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const center = this.project(point);
    for (let index = 0; index < 5; index += 1) {
      if (this.activeDeathParticles >= this.maxDeathParticles) break;
      this.activeDeathParticles += 1;
      const angle = index * (Math.PI * 2 / 5);
      const spark = this.add.circle(center.x, center.y - 5, 2.5, 0xffd27a, 0.95);
      this.tweens.add({
        targets: spark,
        x: center.x + Math.cos(angle) * 15,
        y: center.y - 5 + Math.sin(angle) * 11,
        alpha: 0,
        scale: 0.25,
        duration: 260,
        onComplete: () => { spark.destroy(); this.activeDeathParticles = Math.max(0, this.activeDeathParticles - 1); },
      });
    }
    const rewardText = this.add.text(center.x, center.y - 18, `+${reward}`, {
      color: "#ffe39b", fontFamily: "system-ui, sans-serif", fontSize: "12px", fontStyle: "bold",
      stroke: "#241b10", strokeThickness: 3,
    }).setOrigin(.5).setDepth(7000);
    this.tweens.add({ targets: rewardText, y: center.y - 38, alpha: 0, duration: 720, ease: "Cubic.Out", onComplete: () => rewardText.destroy() });
  }

  showHitEffect(point: Coordinate, targetId?: string): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const center = this.project(point);
    const target = targetId ? this.entitySprites.get(targetId) : undefined;
    if (target) {
      target.setTintFill(0xffffff);
      window.setTimeout(() => { if (target.active) target.clearTint(); }, 85);
    }
    const flash = this.add.ellipse(center.x, center.y - 5, 13, 10, 0xffefd0, 0.72);
    this.tweens.add({ targets: flash, scaleX: 0.35, scaleY: 0.35, alpha: 0, duration: 105, onComplete: () => flash.destroy() });
  }

  showProjectile(event: Extract<GameEvent, { type: "towerFired" }>): void {
    if (this.activeProjectileCount >= this.maxProjectileCount) return;
    this.activeProjectileCount += 1;
    const from = this.project(event.position); const to = this.project(event.targetPosition);
    const muzzle = this.add.circle(from.x, from.y - 22, event.archetype === "heavy" ? 7 : 5, 0xffedb0, .95).setDepth(WORLD_VISUAL_DEPTH.indicator);
    this.tweens.add({ targets: muzzle, scale: 1.8, alpha: 0, duration: 90, onComplete: () => muzzle.destroy() });
    const bolt = this.add.circle(from.x, from.y - 22, event.archetype === "heavy" ? 4 : 2.7, event.archetype === "slow" ? 0xa7e6dc : 0xffd47d, 1).setDepth(WORLD_VISUAL_DEPTH.projectile);
    this.tweens.add({ targets: bolt, x: to.x, y: to.y - 10, duration: 100, ease: "Linear", onComplete: () => { bolt.destroy(); this.activeProjectileCount = Math.max(0, this.activeProjectileCount - 1); this.showHitEffect(event.targetPosition, event.targetId); } });
  }

  showWaveStartEffect(): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const spawn of currentMap.spawns) {
      const center = this.project(spawn.position);
      const ring = this.add.ellipse(center.x, center.y, this.projection.tileWidth * .42, this.projection.tileHeight * .34, 0xc250d8, .58).setDepth(WORLD_VISUAL_DEPTH.indicator);
      this.tweens.add({ targets: ring, scaleX: 2.1, scaleY: 2.1, alpha: 0, duration: 680, ease: "Cubic.Out", onComplete: () => ring.destroy() });
    }
  }

  showBaseHitEffect(): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.baseSprite?.setTint(0xffb0a4);
      window.setTimeout(() => this.baseSprite?.clearTint(), 140);
      return;
    }
    this.cameras.main.shake(150, .0025);
    if (!this.baseSprite) return;
    this.baseSprite.setTint(0xff8b7d);
    this.tweens.add({ targets: this.baseSprite, x: this.baseSprite.x + 3, yoyo: true, repeat: 2, duration: 45,
      onComplete: () => this.baseSprite?.clearTint() });
  }

  private animateLandmarks(time: number): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const pulse = 1 + Math.sin(time / 420) * .035;
    for (const rift of this.riftSprites) {
      const baseScaleX = Number(rift.getData("baseScaleX") ?? rift.scaleX);
      const baseScaleY = Number(rift.getData("baseScaleY") ?? rift.scaleY);
      rift.setScale(baseScaleX * pulse, baseScaleY * pulse);
      rift.setAlpha(.93 + Math.sin(time / 360) * .07);
    }
    for (const sprite of this.terrainSprites) {
      if (!sprite.getData("buildSlotPulse")) continue;
      const baseAlpha = Number(sprite.getData("buildSlotBaseAlpha") ?? .9);
      sprite.setAlpha(baseAlpha - .08 + (Math.sin(time / 430) + 1) * .04);
    }
  }

  private layoutBoard(): void {
    this.syncBackdrop();
    const stage = document.querySelector<HTMLElement>("#game-root")?.getBoundingClientRect();
    const header = document.querySelector<HTMLElement>(".gameplay-header")?.getBoundingClientRect();
    const controls = document.querySelector<HTMLElement>(".control-panel")?.getBoundingClientRect();
    const height = this.scale.height;
    const stageTop = stage?.top ?? 0;
    this.projection = createBoardProjection(currentMap.width, currentMap.height, this.scale.width, this.scale.height, {
      top: Math.max(48, header ? header.bottom - stageTop + 4 : 48),
      right: 16,
      bottom: Math.max(12, controls ? height - (controls.top - stageTop) + 4 : 68),
      left: 16,
    });
  }

  private project(point: Coordinate): Phaser.Math.Vector2 {
    const projected = this.projection.project(point);
    return new Phaser.Math.Vector2(projected.x, projected.y);
  }

  private drawDiamond(graphics: Phaser.GameObjects.Graphics, point: Coordinate, color: number, alpha: number, inset = 0): void {
    const center = this.project(point);
    graphics.fillStyle(color, alpha);
    graphics.lineStyle(1, 0xe5d9b5, alpha < .2 ? .7 : 0);
    graphics.beginPath();
    graphics.moveTo(center.x, center.y - this.projection.tileHeight / 2 + inset);
    graphics.lineTo(center.x + this.projection.tileWidth / 2 - inset, center.y);
    graphics.lineTo(center.x, center.y + this.projection.tileHeight / 2 - inset);
    graphics.lineTo(center.x - this.projection.tileWidth / 2 + inset, center.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
  }

  drawTerrain(): void {
    this.terrain.clear();
    this.roads.clear();
    for (const sprite of this.terrainSprites) sprite.destroy();
    this.terrainSprites = [];
    this.riftSprites = [];
    this.baseSprite = null;
    const roadCells = new Set(currentMap.paths.flatMap(path => path.tiles.map(point => `${point.x},${point.y}`)));
    const roadConnections = createRoadConnectionMap(currentMap);
    const slots = new Set(currentMap.buildSlots.map(point => `${point.x},${point.y}`));
    const spawns = new Set(currentMap.spawns.map(spawn => `${spawn.position.x},${spawn.position.y}`));
    const render = currentWorldAssets.manifest.render;
    const palette = currentWorldAssets.manifest.battlefieldPalette;
    const top = this.project({ x: 0, y: 0 }); const right = this.project({ x: currentMap.width - 1, y: 0 });
    const bottom = this.project({ x: currentMap.width - 1, y: currentMap.height - 1 }); const left = this.project({ x: 0, y: currentMap.height - 1 });
    const topEdge = { x: top.x, y: top.y - this.projection.tileHeight / 2 };
    const rightEdge = { x: right.x + this.projection.tileWidth / 2, y: right.y };
    const bottomEdge = { x: bottom.x, y: bottom.y + this.projection.tileHeight / 2 };
    const leftEdge = { x: left.x - this.projection.tileWidth / 2, y: left.y };
    const cliffHeight = Math.max(12, this.projection.tileHeight * .55);
    this.terrain.fillStyle(0x07100c, .42).fillEllipse((leftEdge.x + rightEdge.x) / 2, bottomEdge.y + cliffHeight, rightEdge.x - leftEdge.x, this.projection.tileHeight * 2.2);
    this.terrain.fillStyle(this.color(palette.cliff), 1).beginPath().moveTo(leftEdge.x, leftEdge.y).lineTo(bottomEdge.x, bottomEdge.y).lineTo(rightEdge.x, rightEdge.y)
      .lineTo(rightEdge.x, rightEdge.y + cliffHeight * .65).lineTo(bottomEdge.x, bottomEdge.y + cliffHeight).lineTo(leftEdge.x, leftEdge.y + cliffHeight * .65).closePath().fillPath();
    this.terrain.fillStyle(this.color(palette.groundPrimary), 1).beginPath().moveTo(topEdge.x, topEdge.y).lineTo(rightEdge.x, rightEdge.y).lineTo(bottomEdge.x, bottomEdge.y).lineTo(leftEdge.x, leftEdge.y).closePath().fillPath();
    this.terrain.lineStyle(2, this.color(palette.groundSecondary), .48).beginPath().moveTo(leftEdge.x, leftEdge.y).lineTo(bottomEdge.x, bottomEdge.y).lineTo(rightEdge.x, rightEdge.y).strokePath();
    for (let y = 0; y < currentMap.height; y++) {
      for (let x = 0; x < currentMap.width; x++) {
        const point = { x, y };
        const key = `${x},${y}`;
        const center = this.project(point);
        const variation = (x * 37 + y * 61 + currentMap.seed) % 10;
        if (variation < 3 && !roadCells.has(key)) {
          this.terrain.lineStyle(1, this.color(palette.groundSecondary), .3);
          this.terrain.lineBetween(center.x - 3, center.y + 1, center.x - 1, center.y - 2);
          this.terrain.lineBetween(center.x - 1, center.y - 2, center.x + 1, center.y + 1);
        }
        if (slots.has(key)) {
          const selected = point.x === selectedBuildSlot?.x && point.y === selectedBuildSlot?.y;
          const occupied = engine.state.towers.some(tower => tower.position.x === x && tower.position.y === y);
          const slotKey = currentWorldAssets.textureKey("buildSlot");
          if (slotKey && this.textures.exists(slotKey)) {
            const actionable = Boolean(selectedArchetype) && !occupied;
            const metadata = render.buildSlot;
            const hovered = this.hoverCell?.x === x && this.hoverCell?.y === y;
            const affordable = !selectedArchetype || engine.state.gold >= GAME_CONFIG.towers[selectedArchetype].cost;
            const emphasis = selected ? 1.08 : hovered ? 1.05 : 1;
            const slot = this.add.image(center.x, center.y, slotKey)
              .setOrigin(metadata.originX, metadata.originY)
              .setDisplaySize(this.projection.tileWidth * metadata.scale * emphasis, this.projection.tileHeight * metadata.scale * emphasis)
              .setTint(selected || hovered ? 0xffe18c : actionable && affordable ? 0xd8ba65 : actionable ? 0x5c5d56 : occupied ? 0x565b54 : 0x8a8169)
              .setAlpha(actionable && affordable ? .94 : occupied ? .28 : actionable ? .42 : .76)
              .setDepth(WORLD_VISUAL_DEPTH.buildSlot);
            slot.setData("buildSlotPulse", actionable && affordable);
            slot.setData("buildSlotBaseAlpha", slot.alpha);
            this.terrainSprites.push(slot);
            if (!occupied) {
              this.roads.lineStyle(selected || hovered ? 2 : 1, selected || hovered ? 0xffdf83 : 0xb89d61, selected || hovered ? .9 : .42);
              this.roads.strokeEllipse(center.x, center.y, this.projection.tileWidth * .38 * emphasis, this.projection.tileHeight * .38 * emphasis);
            }
          }
        }
      }
    }
    const roadWidth = this.projection.tileHeight * .47;
    for (const [key, directions] of roadConnections) {
      const [x, y] = key.split(",").map(Number) as [number, number]; const center = this.project({ x, y });
      this.roads.fillStyle(this.color(palette.roadEdge), 1).fillCircle(center.x, center.y, roadWidth * .62);
      this.roads.fillStyle(this.color(palette.roadPrimary), 1).fillCircle(center.x, center.y, roadWidth * .48);
      for (const direction of directions) {
        const offset = ROAD_DIRECTION_OFFSETS[direction]; const neighbor = this.project({ x: x + offset.x, y: y + offset.y });
        const edge = { x: (center.x + neighbor.x) / 2, y: (center.y + neighbor.y) / 2 };
        this.roads.lineStyle(roadWidth * 1.24, this.color(palette.roadEdge), 1).lineBetween(center.x, center.y, edge.x, edge.y);
        this.roads.lineStyle(roadWidth * .96, this.color(palette.roadPrimary), 1).lineBetween(center.x, center.y, edge.x, edge.y);
        const dx = edge.x - center.x; const dy = edge.y - center.y; const length = Math.max(1, Math.hypot(dx, dy));
        const seamX = center.x + dx * .58; const seamY = center.y + dy * .58;
        const normalX = -dy / length * roadWidth * .34; const normalY = dx / length * roadWidth * .34;
        this.roads.lineStyle(1, this.color(palette.roadEdge), .5).lineBetween(seamX - normalX, seamY - normalY, seamX + normalX, seamY + normalY);
      }
      if (directions.length >= 3) this.roads.lineStyle(1.5, this.color(palette.roadEdge), .52).strokeCircle(center.x, center.y, roadWidth * .72);
    }
    const base = this.project(currentMap.base);
    const baseKey = currentWorldAssets.textureKey("playerBase");
    if (baseKey && this.textures.exists(baseKey)) {
      this.baseSprite = placeIsometricSprite(this.add.image(base.x, base.y, baseKey), getIsometricPlacement(this.projection, currentMap.base, currentWorldAssets.manifest, "playerBase"));
      this.terrainSprites.push(this.baseSprite);
    }
    else { this.terrain.fillStyle(0xc4a868, 1); this.terrain.fillTriangle(base.x - 10, base.y + 2, base.x, base.y - 22, base.x + 10, base.y + 2); }
    for (const spawn of currentMap.spawns) {
      const position = this.project(spawn.position);
      const riftKey = currentWorldAssets.textureKey("enemySpawn");
      if (riftKey && this.textures.exists(riftKey)) {
        const rift = placeIsometricSprite(this.add.image(position.x, position.y, riftKey), getIsometricPlacement(this.projection, spawn.position, currentWorldAssets.manifest, "enemySpawn"));
        rift.setData("baseScaleX", rift.scaleX); rift.setData("baseScaleY", rift.scaleY);
        this.riftSprites.push(rift); this.terrainSprites.push(rift);
      }
      else { this.terrain.fillStyle(0x271d27, 0.85); this.terrain.fillEllipse(position.x, position.y + 3, 24, 12); this.terrain.lineStyle(3, 0xb76665, 0.95); this.terrain.strokeCircle(position.x, position.y - 2, 10); }
    }
    const decorationAssets = ["propTree", "propRock", "propCrate", "propDecoration", "battlefieldLandmark"] as const;
    for (const placement of createDecorationPlacements(currentMap, 8)) {
      const name = decorationAssets[placement.variant % decorationAssets.length]!; const key = currentWorldAssets.textureKey(name);
      if (!key || !this.textures.exists(key)) continue;
      const point = this.project(placement.position);
      const prop = placeIsometricSprite(this.add.image(point.x, point.y, key), getIsometricPlacement(this.projection, placement.position, currentWorldAssets.manifest, name));
      this.terrainSprites.push(prop);
    }
  }

  private color(value: string): number { return Number.parseInt(value.replace("#", ""), 16); }

  private drawInteractionHighlight(): void {
    if (this.hoverCell) {
      const legalSlot = currentMap.buildSlots.some(point => point.x === this.hoverCell!.x && point.y === this.hoverCell!.y);
      this.drawDiamond(this.dynamic, this.hoverCell, legalSlot ? 0xffd879 : 0xe6e0c2, legalSlot ? .12 : .055, 2);
    }
    if (selectedBuildSlot) {
      const center = this.project(selectedBuildSlot);
      this.dynamic.lineStyle(2, 0xffd879, .9);
      this.dynamic.strokeEllipse(center.x, center.y - 2, this.projection.tileWidth * .42, this.projection.tileHeight * .29);
    }
  }

  private drawTower(id: string, point: Coordinate, archetype: TowerArchetype, level: number, selected: boolean): void {
    const center = this.project(point);
    const idKey = currentWorldAssets.textureKey(TOWER_WORLD_ASSET_BY_ARCHETYPE[archetype]);
    const key = this.textures.exists(idKey) ? idKey : getLocalGameAssetKey("ff.neutral.tower") ?? "tower";
    let sprite = this.entitySprites.get(id);
    if (!sprite) {
      sprite = this.add.image(center.x, center.y - 5, key);
      sprite.setData("bornAt", this.sceneClock);
      this.entitySprites.set(id, sprite);
    }
    if (sprite.texture.key !== key) sprite.setTexture(key);
    placeIsometricSprite(sprite, getIsometricPlacement(this.projection, point, currentWorldAssets.manifest, TOWER_WORLD_ASSET_BY_ARCHETYPE[archetype]));
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const age = Math.max(0, this.sceneClock - Number(sprite.getData("bornAt") ?? this.sceneClock));
      const placementFactor = age < 220 ? .72 + .34 * Math.sin(Math.min(1, age / 220) * Math.PI / 2) : 1;
      const idleFactor = age >= 220 ? 1 + Math.sin(this.sceneClock / 650 + point.x) * .008 : 1;
      sprite.setScale(sprite.scaleX * placementFactor * idleFactor, sprite.scaleY * placementFactor / idleFactor);
      sprite.setAlpha(Math.min(1, .35 + age / 180));
    }
    if (level > 1) {
      this.dynamic.lineStyle(2, 0xffe391, 1); this.dynamic.strokeCircle(center.x, center.y - 21, 8 + level);
    }
    if (selected) {
      const range = GAME_CONFIG.towers[archetype].range;
      this.dynamic.fillStyle(0xffdf8b, .055);
      this.dynamic.fillEllipse(center.x, center.y, this.projection.tileWidth * range * 1.2, this.projection.tileHeight * range * 1.2);
      this.dynamic.lineStyle(2, 0xffe391, .72);
      this.dynamic.strokeEllipse(center.x, center.y, this.projection.tileWidth * range * 1.2, this.projection.tileHeight * range * 1.2);
      this.dynamic.lineStyle(2, 0xfff0ad, .95);
      this.dynamic.strokeEllipse(center.x, center.y, this.projection.tileWidth * .62, this.projection.tileHeight * .34);
    }
  }

  private drawEnemy(id: string, enemy: GameEngine["state"]["enemies"][number]): void {
    const path = currentMap.paths.find(candidate => candidate.id === enemy.pathId)!;
    const index = Math.min(Math.floor(enemy.pathProgress), path.tiles.length - 1);
    const progress = enemy.pathProgress - index;
    const from = path.tiles[index]!;
    const to = path.tiles[Math.min(index + 1, path.tiles.length - 1)]!;
    const point = { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
    const center = this.project(point);
    const directionTarget = this.project(to);
    const idKey = currentWorldAssets.textureKey(ENEMY_WORLD_ASSET_BY_ARCHETYPE[enemy.archetype]);
    const key = this.textures.exists(idKey) ? idKey : getLocalGameAssetKey("ff.neutral.enemy") ?? "enemy";
    let sprite = this.entitySprites.get(id);
    if (!sprite) { sprite = this.add.image(center.x, center.y, key); this.entitySprites.set(id, sprite); }
    if (sprite.texture.key !== key) sprite.setTexture(key);
    const assetName = ENEMY_WORLD_ASSET_BY_ARCHETYPE[enemy.archetype];
    const placement = getIsometricPlacement(this.projection, point, currentWorldAssets.manifest, assetName);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bob = reducedMotion ? 0 : Math.sin(this.sceneClock / 105 + Number.parseInt(id.replace(/\D/g, "") || "0", 10)) * 1.6;
    placeIsometricSprite(sprite, placement).setY(placement.groundScreenY + bob).setFlipX(directionTarget.x < center.x);
    this.dynamic.fillStyle(0x251c1c, 1); this.dynamic.fillRoundedRect(center.x - 9, center.y - 25, 18, 4, 2);
    this.dynamic.fillStyle(0x92d278, 1); this.dynamic.fillRoundedRect(center.x - 9, center.y - 25, 18 * Math.max(0, enemy.hp / enemy.maxHp), 4, 2);
  }

  private drawShots(): void {
    this.shots.clear();
    for (const shot of this.shotEvents) {
      const from = this.project(shot.position);
      const to = this.project(shot.targetPosition);
      this.shots.lineStyle(2, 0xffe49a, 0.25);
      this.shots.lineBetween(from.x, from.y - 8, to.x, to.y - 5);
    }
  }

  private onBoardClick(screenX: number, screenY: number): void {
    const point = this.projection.cellAt({ x: screenX, y: screenY });
    if (!point) return;
    const tower = engine.state.towers.find(candidate => candidate.position.x === point.x && candidate.position.y === point.y);
    if (tower) {
      selectedTowerId = tower.id;
      selectedArchetype = null;
      selectedBuildSlot = null;
      message = `${tower.archetype} 防御塔 · Lv.${tower.level}。可以升级这座塔。`;
      this.renderState();
      renderHud();
      return;
    }
    selectedTowerId = null;
    const isBuildSlot = currentMap.buildSlots.some(slot => slot.x === point.x && slot.y === point.y);
    if (isBuildSlot) {
      selectedBuildSlot = point;
      if (!selectedArchetype) {
        message = "建造位已选中；再选择一种防御塔完成部署。";
        this.drawTerrain();
        this.renderState();
        renderHud();
        return;
      }
      const archetype = selectedArchetype;
      selectedBuildSlot = null;
      send({ type: "placeTower", archetype, position: point });
      this.drawTerrain();
      return;
    }
    selectedBuildSlot = null;
    selectedArchetype = null;
    message = "已取消建造位和防御塔选择。";
    this.drawTerrain();
    renderHud();
  }
}

function initializeGame(): void {
  if (game) return;
  const stage = document.querySelector<HTMLElement>("#game-root");
  if (!stage) throw new Error("Gameplay canvas container is missing.");
  game = new Phaser.Game({
    type: navigator.webdriver ? Phaser.CANVAS : Phaser.AUTO,
    parent: stage,
    width: stage.clientWidth,
    height: stage.clientHeight,
    backgroundColor: "#101a1a",
    transparent: true,
    fps: navigator.webdriver ? { target: 60, forceSetTimeOut: true } : undefined,
    scene: [BoardScene],
    render: { antialias: true, pixelArt: false },
    scale: { mode: Phaser.Scale.NONE },
  });
  window.addEventListener("resize", resizeGameToStage);
}

type LocalSettings = { provider: string; model: string; apiKey: string; masterVolume: number; musicVolume: number; effectsVolume: number; language: string; reducedMotion: boolean };
const settingsKey = "fantasy-frontiers.settings.v1";
const defaultSettings: LocalSettings = { provider: "deepseek", model: "deepseek-chat", apiKey: "", masterVolume: 80, musicVolume: 70, effectsVolume: 85, language: "zh-CN", reducedMotion: false };

function loadSettings(): LocalSettings {
  try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem(settingsKey) ?? "{}") as Partial<LocalSettings> }; }
  catch { return defaultSettings; }
}

function populateSettings(): void {
  const value = loadSettings();
  (document.querySelector<HTMLSelectElement>("#settings-provider")!).value = value.provider;
  (document.querySelector<HTMLInputElement>("#settings-model")!).value = value.model;
  (document.querySelector<HTMLInputElement>("#settings-api-key")!).value = value.apiKey;
  (document.querySelector<HTMLInputElement>("#settings-master-volume")!).value = String(value.masterVolume);
  (document.querySelector<HTMLInputElement>("#settings-music-volume")!).value = String(value.musicVolume);
  (document.querySelector<HTMLInputElement>("#settings-effects-volume")!).value = String(value.effectsVolume);
  (document.querySelector<HTMLSelectElement>("#settings-language")!).value = value.language;
  (document.querySelector<HTMLInputElement>("#settings-reduced-motion")!).checked = value.reducedMotion;
  document.documentElement.classList.toggle("reduce-motion", value.reducedMotion);
}

const menuAssets = resolveWorldAssets("frontier-outpost");
document.documentElement.style.setProperty("--menu-key-art", `url(${JSON.stringify(menuAssets.worldKeyArtUrl)})`);
document.documentElement.style.setProperty("--menu-key-position", `${menuAssets.manifest.keyArt.focalX * 100}% ${menuAssets.manifest.keyArt.focalY * 100}%`);
populateSettings();

document.querySelectorAll<HTMLButtonElement>("[data-archetype]").forEach(button => {
  button.addEventListener("click", () => {
    const archetype = button.dataset.archetype as TowerArchetype;
    selectedArchetype = archetype;
    selectedTowerId = null;
    message = `已选择${button.dataset.label}，点击地图上的建造位进行部署。`;
    if (selectedBuildSlot) {
      const slot = selectedBuildSlot;
      selectedBuildSlot = null;
      send({ type: "placeTower", archetype, position: slot });
    }
    renderHud();
    boardScene?.renderState();
    boardScene?.changeMap();
  });
});
document.querySelectorAll<HTMLButtonElement>("[data-difficulty]").forEach(button => {
  button.addEventListener("click", () => setDifficulty(button.dataset.difficulty as Difficulty));
});
ui.worldForm.addEventListener("submit", async event => {
  event.preventDefault();
  ui.worldCreateButton.disabled = true;
  ui.worldCreateButton.textContent = "提交中…";
  try {
    const response = await fetch(`${apiBase}/api/worlds/generate`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: ui.worldPrompt.value }),
    });
    if (!response.ok) {
      const body = await response.json() as { error?: string };
      throw new Error(body.error ?? `API ${response.status}`);
    }
    const { job } = await response.json() as { job: { id: string; worldId: string } };
    ui.worldPrompt.value = "";
    await refreshWorldLibrary();
    void pollGeneration(job.id, job.worldId);
  } catch (error) {
    ui.generationJobs.textContent = error instanceof Error && error.message.includes("fetch")
      ? "本地服务不可用，请确认服务端正在运行。"
      : `创建请求失败：${error instanceof Error ? error.message : "未知错误"}`;
  } finally {
    ui.worldCreateButton.disabled = false;
    ui.worldCreateButton.textContent = "生成世界";
  }
});
ui.nextWave.addEventListener("click", () => send({ type: "startWave" }));
ui.pause.addEventListener("click", () => send({ type: "pause" }));
ui.pauseResume.addEventListener("click", () => send({ type: "resume" }));
ui.pauseReturn.addEventListener("click", () => { showHubView("play"); renderWorldDetail(currentWorldId); });
ui.speed.addEventListener("click", () => { gameSpeed = gameSpeed === 1 ? 2 : 1; renderHud(); });
ui.upgrade.addEventListener("click", () => { if (selectedTowerId) send({ type: "upgradeTower", towerId: selectedTowerId }); });
ui.restart.addEventListener("click", () => restart());
ui.replayLevel.addEventListener("click", () => {
  restart();
});
ui.returnLevels.addEventListener("click", () => returnToSelection("levels"));
ui.returnWorlds.addEventListener("click", () => returnToSelection("world"));
ui.nextLevel.addEventListener("click", () => {
  const next = currentDifficulty === "easy" ? "medium" : currentDifficulty === "medium" ? "hard" : null;
  if (next) void enterGameplay(currentWorldId, next);
});
ui.playSelectedLevel.addEventListener("click", () => { void enterGameplay(currentWorldId, currentDifficulty); });
ui.leaveGameplay.addEventListener("click", () => {
  if (!window.confirm("退出当前关卡？本局尚未完成的战绩不会保存。")) return;
  if (engine.state.status === "running") send({ type: "pause" });
  showHubView("play");
  renderWorldDetail(currentWorldId);
});
document.querySelector<HTMLButtonElement>("#close-workshop")!.addEventListener("click", () => setWorkshopVisible(false));
document.querySelector<HTMLButtonElement>("#close-world-detail")!.addEventListener("click", () => { ui.detail.hidden = true; ui.worldList.hidden = false; });
ui.evaluate.addEventListener("click", () => { const worldId = ui.detailTitle.dataset.worldId; if (worldId) void evaluateWorld(worldId); });
ui.publish.addEventListener("click", () => { const worldId = ui.detailTitle.dataset.worldId; if (worldId) void publishWorld(worldId); });
document.querySelector<HTMLButtonElement>("#menu-play")!.addEventListener("click", () => showHubView("play"));
document.querySelector<HTMLButtonElement>("#menu-studio")!.addEventListener("click", () => showHubView("studio"));
document.querySelector<HTMLButtonElement>("#menu-settings")!.addEventListener("click", () => { populateSettings(); showHubView("settings"); });
document.querySelectorAll<HTMLButtonElement>("[data-back-menu]").forEach(button => button.addEventListener("click", () => showHubView("menu")));
document.querySelectorAll<HTMLButtonElement>("[data-back-studio]").forEach(button => button.addEventListener("click", () => showHubView("studio")));
document.querySelector<HTMLButtonElement>("#studio-generate")!.addEventListener("click", () => showHubView("generate"));
document.querySelector<HTMLButtonElement>("#studio-evaluate")!.addEventListener("click", () => showHubView("evaluation"));
document.querySelector<HTMLButtonElement>("#evaluation-start")!.addEventListener("click", () => { if (selectedEvaluationWorldId) void evaluateWorld(selectedEvaluationWorldId); });
document.querySelector<HTMLButtonElement>("#settings-fullscreen")!.addEventListener("click", () => {
  if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen();
});
document.querySelector<HTMLFormElement>("#settings-form")!.addEventListener("submit", event => {
  event.preventDefault();
  const value: LocalSettings = {
    provider: document.querySelector<HTMLSelectElement>("#settings-provider")!.value,
    model: document.querySelector<HTMLInputElement>("#settings-model")!.value.trim() || defaultSettings.model,
    apiKey: document.querySelector<HTMLInputElement>("#settings-api-key")!.value.trim(),
    masterVolume: Number(document.querySelector<HTMLInputElement>("#settings-master-volume")!.value),
    musicVolume: Number(document.querySelector<HTMLInputElement>("#settings-music-volume")!.value),
    effectsVolume: Number(document.querySelector<HTMLInputElement>("#settings-effects-volume")!.value),
    language: document.querySelector<HTMLSelectElement>("#settings-language")!.value,
    reducedMotion: document.querySelector<HTMLInputElement>("#settings-reduced-motion")!.checked,
  };
  localStorage.setItem(settingsKey, JSON.stringify(value));
  document.documentElement.classList.toggle("reduce-motion", value.reducedMotion);
  document.querySelector<HTMLElement>("#settings-status")!.textContent = "设置已保存在当前浏览器。";
});
document.addEventListener("keydown", event => {
  if (screenFlow.current !== "gameplay") return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))) return;
  if (event.code === "Space") {
    event.preventDefault();
    if (engine.state.status === "ready") send({ type: "startWave" });
    else if (engine.state.status === "running") send({ type: "pause" });
    else if (engine.state.status === "paused") send({ type: "resume" });
  }
  if (event.code === "Escape") { selectedTowerId = null; selectedBuildSlot = null; selectedArchetype = null; boardScene?.drawTerrain(); renderHud(); boardScene?.renderState(); }
  const index = Number(event.key) - 1;
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-archetype]");
  if (index >= 0 && index < buttons.length) buttons[index]?.click();
});
document.addEventListener("pointerdown", event => {
  if (ui.towerContext.hidden || ui.towerContext.contains(event.target as Node)) return;
  if ((event.target as HTMLElement).closest("#game-root")) return;
  selectedTowerId = null;
  ui.towerContext.hidden = true;
  boardScene?.renderState();
});

if (assetCalibrationMode) {
  document.querySelector<HTMLElement>(".shell")!.hidden = true;
  mountAssetCalibrationPage(new URLSearchParams(window.location.search).get("world") ?? "frontier-outpost");
} else {
  renderHud();
  showHubView("menu");
  void refreshWorldLibrary();
}
window.addEventListener("pagehide", () => game?.destroy(true), { once: true });
