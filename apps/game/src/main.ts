import Phaser from "phaser";
import { type GameEngine, type GameEvent } from "@fantasy-frontiers/core";
import { GAME_CONFIG, mapSpecSchema, wavePlanSchema, type Coordinate, type Difficulty, type EvaluationRecord, type GameAction, type GameResult, type LevelRecord, type MapSpec, type TowerArchetype, type WavePlan, type WorldSkin, type WorldSpec } from "@fantasy-frontiers/shared";
import { createBenchmarkContent, createWavePlanDraftForMap, generateMap } from "@fantasy-frontiers/maps";
import { ScreenFlow, type AppScreen } from "./app/screen-flow";
import { appUrl } from "./app/app-url";
import { createBoardProjection, type BoardProjection } from "./game/board-projection";
import { createGameplayController, type GameplayController } from "./game/gameplay-controller";
import { resolveWorldSkin } from "./presentation/world-skin-resolver";
import { getLocalGameAssetKey, getLocalGameAssetUrl } from "./presentation/local-game-assets";
import { createDecorationPlacements } from "./presentation/deterministic-decoration";
import { createRoadConnectionMap, ROAD_DIRECTION_OFFSETS } from "./presentation/road-renderer";
import { ENEMY_WORLD_ASSET_BY_ARCHETYPE, TOWER_WORLD_ASSET_BY_ARCHETYPE, resolveWorldAssets, type ResolvedWorldAssets, type WorldAssetName } from "./presentation/world-asset-registry";
import { WORLD_VISUAL_DEPTH } from "./presentation/world-asset-render-config";
import { footprintDiamond, getIsometricPlacement, placeIsometricSprite, type IsometricPlacement } from "./presentation/isometric-render-contract";
import { mountAssetCalibrationPage } from "./presentation/asset-calibration-scene";
import { createFantasyScene, prefersReducedMotion } from "./presentation/fantasy-scene";
import { ENEMY_ANIMATION_FRAMES, ENEMY_ANIMATION_FRAME_MS } from "./presentation/fantasy-asset-config";
import { resolveStorybookRealm, towerBrief, hasFloatingComposition, scenicChannelColumn } from "./presentation/storybook-realms";
import { AudioDirector, type AudioPreferences } from "./presentation/audio-director";
import "./style.css";

const difficultySeeds: Record<Difficulty, number> = { easy: 70421, medium: 70422, hard: 70423 };
const debugRenderMode = new URLSearchParams(window.location.search).get("debugRender") === "1";
const assetCalibrationMode = window.location.pathname.endsWith("/dev/assets") || new URLSearchParams(window.location.search).get("assetCalibration") === "1";
const editorPreviewMode = new URLSearchParams(window.location.search).get("mapPreview") === "1";
function loadEditorPreview(): { map: MapSpec; wavePlan: WavePlan } | null {
  if (!editorPreviewMode) return null;
  try {
    const value = JSON.parse(localStorage.getItem("fantasy-frontiers.level-preview.v1") ?? "null") as { map?: unknown; wavePlan?: unknown } | null;
    if (value?.map && value.wavePlan) return { map: mapSpecSchema.parse(value.map), wavePlan: wavePlanSchema.parse(value.wavePlan) };
    const map = mapSpecSchema.parse(JSON.parse(localStorage.getItem("fantasy-frontiers.map-preview.v1") ?? "null"));
    return { map, wavePlan: wavePlanSchema.parse(createWavePlanDraftForMap(map, `${map.id}-preview-waves`)) };
  } catch { return null; }
}
const editorPreview = loadEditorPreview();
const editorPreviewMap = editorPreview?.map ?? null;
const difficultyNames: Record<Difficulty, string> = { easy: "简单", medium: "普通", hard: "困难" };
const defaultTowerNames: Record<TowerArchetype, string> = { basic: "弩塔", aoe: "爆裂塔", slow: "霜缚塔", heavy: "重炮塔" };
function createDemoMap(difficulty: Difficulty): MapSpec {
  if (!editorPreviewMap) return createBenchmarkContent(difficulty, `frontier-${difficulty}`).map;
  const generated = generateMap({ difficulty, seed: difficultySeeds[difficulty] });
  if (generated.ok === false) throw new Error(`Unable to load the ${difficulty} demo map: ${generated.message}`);
  return generated.map;
}

let currentDifficulty: Difficulty = editorPreviewMap?.difficulty ?? "easy";
let currentMap = editorPreviewMap ?? createDemoMap(currentDifficulty);
let currentWorldId = editorPreviewMap ? "editor-preview" : "frontier-world";
let currentWorldName = editorPreviewMap ? "地图工坊试玩" : "边境哨站";
let currentEnemyNames = "";
let currentLevels: Record<Difficulty, LevelRecord> = Object.fromEntries((Object.keys(difficultyNames) as Difficulty[]).map(difficulty => {
  const content = createBenchmarkContent(difficulty, `frontier-${difficulty}`);
  const map = content.map;
  const id = `frontier-${difficulty}`;
  return [difficulty, { id, worldId: currentWorldId, difficulty, name: `${currentWorldName} · ${difficultyNames[difficulty]}`, story: "", map: { ...map, id }, wavePlan: content.wavePlan, contentVersion: 1, rulesetVersion: "v1.0.0" }];
})) as Record<Difficulty, LevelRecord>;
if (editorPreviewMap && editorPreview) currentLevels[currentDifficulty] = { id: editorPreviewMap.id, worldId: currentWorldId, difficulty: currentDifficulty, name: "地图工坊试玩", story: "试玩不会写入正式战役进度。", map: editorPreviewMap, wavePlan: editorPreview.wavePlan, contentVersion: 1, rulesetVersion: "v1.0.0" };

let engine: GameplayController = createGameplayController({ map: currentMap, levelId: `frontier-${currentDifficulty}`, seed: currentMap.seed, ...(currentLevels[currentDifficulty].wavePlan ? { wavePlan: currentLevels[currentDifficulty].wavePlan } : {}) });
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
let audioDirector: AudioDirector | undefined;
const screenFlow = new ScreenFlow((screen: AppScreen) => {
  document.querySelectorAll<HTMLElement>("section[data-app-screen]").forEach(element => {
    const active = element.dataset.appScreen === screen;
    element.hidden = !active;
    element.setAttribute("aria-hidden", String(!active));
  });
  document.body.dataset.appScreen = screen;
  audioDirector?.setScene(screen === "hub" ? "lobby" : screen === "result" ? "result" : engine?.state.status === "running" ? "battle" : "deployment");
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
  const id = image.dataset.assetId ?? "";
  const url = getLocalGameAssetUrl(id.includes(".tower-") ? id.replace("ff.border-outpost.", "ff.realm.") : id);
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
  towerContextSpeed: document.querySelector<HTMLElement>("#tower-context-speed")!,
  towerContextRole: document.querySelector<HTMLElement>("#tower-context-role")!,
  towerContextCost: document.querySelector<HTMLElement>("#tower-context-cost")!,
  sell: document.querySelector<HTMLButtonElement>("#sell-button")!,
  waveBrief: document.querySelector<HTMLElement>("#wave-brief")!,
  waveBriefTitle: document.querySelector<HTMLElement>("#wave-brief-title")!,
  waveBriefCopy: document.querySelector<HTMLElement>("#wave-brief-copy")!,
  guide: document.querySelector<HTMLElement>("#battle-guide")!,
  guideStep: document.querySelector<HTMLElement>("#battle-guide-step")!,
  guideTitle: document.querySelector<HTMLElement>("#battle-guide-title")!,
  guideCopy: document.querySelector<HTMLElement>("#battle-guide-copy")!,
  guideNext: document.querySelector<HTMLButtonElement>("#battle-guide-next")!,
  guideSkip: document.querySelector<HTMLButtonElement>("#battle-guide-skip")!,
  resultLeakFact: document.querySelector<HTMLElement>("#result-leak-fact")!,
  resultEconomyFact: document.querySelector<HTMLElement>("#result-economy-fact")!,
  resultActionFact: document.querySelector<HTMLElement>("#result-action-fact")!,
  waveBanner: document.querySelector<HTMLElement>("#wave-banner")!,
  feedback: document.querySelector<HTMLElement>("#battle-feedback")!,
  nextLevel: document.querySelector<HTMLButtonElement>("#next-level")!,
};
type ListedEvaluation = Pick<EvaluationRecord, "id" | "worldId" | "levelId" | "status" | "error" | "createdAt" | "updatedAt"> & { report: EvaluationRecord["report"] };
type KnownWorld = { spec: WorldSpec; levels: LevelRecord[]; evaluations: ListedEvaluation[]; readiness: { ready: boolean; issues: string[] } | null; skin?: WorldSkin; towerTheme?: { entries: { archetype: TowerArchetype; name: string }[] }; enemyTheme?: { entries: { name: string }[] } };
const knownWorlds = new Map<string, KnownWorld>();
let unlockedLevelIds = new Set<string>();
let feedbackSequence = 0;
let battleLeaks: Array<Extract<GameEvent, { type: "enemyLeaked" }>> = [];
let guideStep = 0;
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
  const heading = document.createElement("h3"); heading.textContent = "世界档案"; list.append(heading);
  const statusLabels: Record<WorldSpec["status"], string> = { draft: "草稿", generating: "塑造中", generated: "待评测", evaluating: "评测中", ready: "可守护", published: "已发布", failed: "需要修复" };
  for (const world of knownWorlds.values()) {
    const row = document.createElement("article"); row.className = "creator-world-row";
    const copy = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = world.spec.name;
    const tags = document.createElement("small"); tags.textContent = world.spec.visualKeywords.slice(0, 3).join(" · ") || world.spec.themeFamily;
    const progress = document.createElement("div"); progress.className = "archive-progress";
    const status = document.createElement("span"); status.textContent = statusLabels[world.spec.status];
    const levelCount = document.createElement("span"); levelCount.textContent = `${world.levels.length}/3 关`;
    const meter = document.createElement("progress"); meter.max = 3; meter.value = Math.min(3, world.levels.length); meter.setAttribute("aria-label", `${world.spec.name}档案完成度`);
    progress.append(status, levelCount, meter);
    copy.append(title, tags); row.append(copy, progress); list.append(row);
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
  document.querySelector<HTMLElement>("#evaluation-title")!.textContent = known.spec.name;
  const running = known.evaluations.some(record => record.status === "queued" || record.status === "running");
  const start = document.querySelector<HTMLButtonElement>("#evaluation-start")!;
  start.disabled = running; start.textContent = running ? "评测进行中…" : known.evaluations.length ? "重新评测" : "开始评测";
  const download = document.querySelector<HTMLAnchorElement>("#evaluation-download")!;
  download.hidden = !known.evaluations.some(record => record.status === "completed" && record.report);
  download.href = `${apiBase}/api/worlds/${encodeURIComponent(worldId)}/evaluation-report.md`;
  document.querySelector<HTMLElement>("#evaluation-status")!.textContent = "报告基于 Easy、Medium、Hard 的确定性模拟证据；展开卡片可查看详细结论。";
  const reports = document.querySelector<HTMLElement>("#evaluation-report-list")!; reports.replaceChildren();
  const latestByLevel = new Map<string, ListedEvaluation>();
  for (const evaluation of [...known.evaluations].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) latestByLevel.set(evaluation.levelId, evaluation);
  const completedReports = [...latestByLevel.values()].flatMap(evaluation => evaluation.report ? [evaluation.report] : []);
  const average = (values: number[]): number => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const scores = [
    { label: "策略强度", value: average(completedReports.map(report => report.metrics.winRate)) },
    { label: "资源效率", value: average(completedReports.map(report => report.metrics.resourceUtilization)) },
    { label: "防守稳定", value: average(completedReports.map(report => 1 - report.metrics.leakRate)) },
  ];
  const totalScore = average(scores.map(score => score.value));
  document.querySelector<HTMLElement>("#evaluation-grade")!.textContent = completedReports.length === 0 ? "—" : totalScore >= .85 ? "S" : totalScore >= .7 ? "A" : totalScore >= .55 ? "B" : totalScore >= .4 ? "C" : "D";
  const scorecards = document.querySelector<HTMLElement>("#evaluation-scorecards")!; scorecards.replaceChildren();
  for (const score of scores) {
    const card = document.createElement("article");
    const label = document.createElement("span"); label.textContent = score.label;
    const value = document.createElement("strong"); value.textContent = completedReports.length ? `${Math.round(score.value * 100)}` : "—";
    const meter = document.createElement("progress"); meter.max = 1; meter.value = completedReports.length ? score.value : 0; meter.setAttribute("aria-label", score.label);
    card.append(label, value, meter); scorecards.append(card);
  }
  for (const difficulty of ["easy", "medium", "hard"] as const) {
    const level = known.levels.find(item => item.difficulty === difficulty); if (!level) continue;
    const evaluation = latestByLevel.get(level.id); const card = document.createElement("details"); card.className = "evaluation-report";
    const title = document.createElement("summary"); title.textContent = `${difficultyNames[difficulty]} · ${level.name}`;
    const copy = document.createElement("p"); copy.textContent = evaluation?.report
      ? `${evaluation.report.summary} 胜率 ${(evaluation.report.metrics.winRate * 100).toFixed(0)}% · ${evaluation.report.runIds.length} 次运行`
      : evaluation ? `评测${evaluation.status}${evaluation.error ? `：${evaluation.error}` : ""}` : "尚无评测报告。";
    card.append(title, copy); reports.append(card);
  }
}

async function beginPersistentRun(): Promise<void> {
  activeRunId = null;
  resultRunId = null;
  if (editorPreviewMode) return;
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
  if (editorPreviewMode) return;
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
    const completedWorlds = worldDetails.filter(entry => entry && entry.detail.levels.length > 0 && entry.detail.levels.every(level => progress.some(record => record.levelId === level.id && record.completed))).length;
    const completedLevels = worldDetails.reduce((sum, entry) => sum + (entry?.detail.levels.filter(level => progress.some(record => record.levelId === level.id && record.completed)).length ?? 0), 0);
    const totalLevels = worldDetails.reduce((sum, entry) => sum + (entry?.detail.levels.length ?? 0), 0);
    const activeEntry = worldDetails.find(entry => entry && entry.detail.levels.some(level => !progress.some(record => record.levelId === level.id && record.completed))) ?? worldDetails.find(Boolean);
    const activeLevel = activeEntry?.detail.levels.find(level => !progress.some(record => record.levelId === level.id && record.completed)) ?? activeEntry?.detail.levels.at(-1);
    document.querySelector("#lobby-world-name")!.textContent = activeEntry?.world.name ?? "边境哨站";
    document.querySelector("#lobby-chapter")!.textContent = activeLevel ? `第 ${Math.max(1, activeEntry!.detail.levels.indexOf(activeLevel) + 1)} 章` : "战役待命";
    document.querySelector("#lobby-mission")!.textContent = activeLevel?.name ?? "等待新的号角";
    document.querySelector("#lobby-progress-value")!.textContent = `${completedLevels} / ${totalLevels}`;
    const lobbyProgress = document.querySelector<HTMLProgressElement>("#lobby-progress")!;
    lobbyProgress.max = Math.max(1, totalLevels); lobbyProgress.value = completedLevels;
    document.querySelector("#lobby-state")!.textContent = `已守护 ${completedWorlds} 个世界 · ${Object.keys(GAME_CONFIG.towers).length} 类防御塔可用`;
    for (const entry of worldDetails) {
      if (!entry) continue;
      const { world, detail } = entry;
      knownWorlds.set(world.id, { spec: world, levels: detail.levels, evaluations: detail.evaluations ?? [], readiness: detail.readiness ?? null, ...(detail.skin ? { skin: detail.skin } : {}), ...(detail.towerTheme ? { towerTheme: detail.towerTheme } : {}), ...(detail.enemyTheme ? { enemyTheme: detail.enemyTheme } : {}) });
      const card = document.createElement("article"); card.className = "world-card";
      const thumbnail = document.createElement("div"); thumbnail.className = "world-thumbnail";
      thumbnail.setAttribute("role", "img"); thumbnail.setAttribute("aria-label", `${world.name}世界封面`);
      const realm = resolveStorybookRealm(world);
      card.dataset.realm = realm.id;
      const floating = hasFloatingComposition(world);
      thumbnail.append(createFantasyScene(true, realm.variant, floating));
      const copy = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = world.name;
      const summary = document.createElement("span"); summary.className = "world-card-summary"; summary.textContent = world.summary;
      copy.append(title, summary);
      const themeLabel = document.createElement("p"); themeLabel.className = "realm-label";
      themeLabel.textContent = `✦ ${floating ? "云上群岛" : realm.name}`;
      const completed = detail.levels.filter(level => progress.some(record => record.levelId === level.id && record.completed)).length;
      const metadata = document.createElement("div"); metadata.className = "world-card-meta";
      const difficulty = document.createElement("span"); difficulty.textContent = `难度 ${"★".repeat(Math.max(1, Math.min(3, detail.levels.length)))}${"☆".repeat(Math.max(0, 3 - detail.levels.length))}`;
      const enemyLabel = document.createElement("span"); enemyLabel.className = "world-enemies"; enemyLabel.setAttribute("aria-label", `敌人：${detail.enemyTheme?.entries.map(entry => entry.name).join("、") || "普通、迅捷、重甲、首领"}`); enemyLabel.textContent = "敌人  ♟  ➶  ◆  ♛";
      const worldState = document.createElement("span"); worldState.className = `world-state state-${completed === detail.levels.length && completed > 0 ? "stable" : completed > 0 ? "active" : "unknown"}`; worldState.textContent = completed === detail.levels.length && completed > 0 ? "稳定" : completed > 0 ? "探索中" : "等待探索";
      metadata.append(difficulty, enemyLabel, worldState);
      copy.append(themeLabel, metadata);
      const completion = document.createElement("div"); completion.className = "progress-caption";
      completion.textContent = `战役进度 · ${completed} / ${detail.levels.length} 关`;
      const meter = document.createElement("progress"); meter.max = Math.max(1, detail.levels.length); meter.value = completed;
      meter.setAttribute("aria-label", `${world.name}完成进度`);
      copy.append(completion, meter);
      const levels = document.createElement("div"); levels.className = "world-progress";
      for (const level of detail.levels) {
        const record = progress.find(progressEntry => progressEntry.levelId === level.id);
        const badge = document.createElement("span");
        badge.className = record?.completed ? "complete" : record?.unlocked ? "unlocked" : "locked";
        badge.textContent = `${difficultyNames[level.difficulty]} ${record?.completed ? "✓" : record?.unlocked ? "可玩" : "锁定"}`;
        levels.append(badge);
      }
      const detailButton = document.createElement("button"); detailButton.className = "world-select"; detailButton.type = "button"; detailButton.textContent = completed > 0 && completed < detail.levels.length ? "继续探索" : "进入世界";
      detailButton.disabled = world.status !== "ready" && world.status !== "generated" && world.status !== "published";
      detailButton.addEventListener("click", () => void prepareWorld(world.id).then(ready => { if (ready) renderWorldDetail(world.id); }));
      const actions = document.createElement("div"); actions.className = "world-card-actions"; actions.append(detailButton);
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
    document.querySelector("#lobby-world-name")!.textContent = "边境哨站";
    document.querySelector("#lobby-chapter")!.textContent = "离线战役";
    document.querySelector("#lobby-mission")!.textContent = "守住第一道防线";
    document.querySelector("#lobby-state")!.textContent = "战役记录暂不可用 · 4 类塔可用";
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
  ui.detailSummary.textContent = known.spec.summary;
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
  engine = createGameplayController({ map: currentMap, levelId: currentLevels[currentDifficulty].id, seed: currentMap.seed, ...(currentLevels[currentDifficulty].wavePlan ? { wavePlan: currentLevels[currentDifficulty].wavePlan } : {}) });
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
  const realm = resolveStorybookRealm(world.spec);
  currentWorldAssets.manifest.battlefieldPalette = { ...realm.palette };
  document.querySelector<HTMLElement>("#gameplay-screen")!.dataset.realm = realm.id;
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

const towerRoles: Record<TowerArchetype, string> = {
  basic: "低成本稳定单体输出，适合前期铺设。",
  aoe: "攻击汇聚敌群，密集波次收益更高。",
  slow: "延长敌人在火力区停留时间，需要其他塔配合。",
  heavy: "高单发远射程，适合重甲与首领。",
};

function towerRefund(tower: GameEngine["state"]["towers"][number]): number {
  const definition = GAME_CONFIG.towers[tower.archetype];
  let investment = definition.cost;
  for (let level = 1; level < tower.level; level++) investment += Math.ceil(definition.upgradeCost * definition.upgradeMultiplier ** (level - 1));
  return Math.floor(investment * GAME_CONFIG.economy.sellRatio);
}

const guideKey = "fantasy-frontiers.onboarding.v1";
const guideSteps = [
  { title: "观察战场", copy: "裂隙是敌人入口，道路通往必须守住的堡垒。", action: "开始部署" },
  { title: "选择防御塔", copy: "选择一座塔，查看职责、费用和覆盖范围。", action: "等待选择" },
  { title: "部署防线", copy: "点击发光石台建造。合法位置会显示范围，金币不足会明确提示。", action: "等待建造" },
  { title: "主动开波", copy: "阅读下一波敌军与入口情报，准备好后再开波。", action: "等待开波" },
] as const;

function renderGuide(): void {
  const completed = localStorage.getItem(guideKey) === "complete" || currentDifficulty !== "easy" || editorPreviewMode;
  ui.guide.hidden = completed;
  if (completed) return;
  const step = guideSteps[Math.min(guideStep, guideSteps.length - 1)]!;
  ui.guideStep.textContent = `${guideStep + 1} / ${guideSteps.length}`;
  ui.guideTitle.textContent = step.title;
  ui.guideCopy.textContent = step.copy;
  ui.guideNext.textContent = step.action;
  ui.guideNext.disabled = guideStep > 0;
  ui.guide.dataset.passive = guideStep > 0 ? "true" : "false";
}

function advanceGuide(trigger: "start" | "towerSelected" | "towerPlaced" | "waveStarted"): void {
  if (localStorage.getItem(guideKey) === "complete" || currentDifficulty !== "easy") return;
  if (trigger === "start" && guideStep === 0) guideStep = 1;
  if (trigger === "towerSelected" && guideStep <= 1) guideStep = 2;
  if (trigger === "towerPlaced" && guideStep <= 2) guideStep = 3;
  if (trigger === "waveStarted") {
    localStorage.setItem(guideKey, "complete");
    ui.guide.hidden = true;
    return;
  }
  renderGuide();
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
  if (!result.accepted) void audioDirector?.play("ui-error");
  boardScene?.renderState();
  renderHud();
  return result.events;
}

function consumeBattleEvents(events: readonly GameEvent[]): void {
  for (const event of events) {
    if (event.type === "towerPlaced") {
      showFeedback("防御塔部署成功 · ✦", "gain");
      boardScene?.showPlacementEffect(event.position);
      void audioDirector?.play("build");
      advanceGuide("towerPlaced");
    }
    else if (event.type === "towerUpgraded") {
      const tower = engine.state.towers.find(item => item.id === event.towerId);
      if (tower) boardScene?.showUpgradeEffect(tower.position, event.level);
      showFeedback(`升级完成 · Lv.${event.level}`);
      void audioDirector?.play("ui-confirm");
    }
    else if (event.type === "towerSold") {
      showFeedback(`已拆除 · 返还 ${event.refund} 金币`, "gain");
      selectedTowerId = null;
      void audioDirector?.play("coin");
    }
    else if (event.type === "towerFired") {
      boardScene?.showProjectile(event);
      void audioDirector?.play(`tower-${event.archetype}`);
    }
    else if (event.type === "enemyKilled") {
      boardScene?.showDeathEffect(event.position, event.reward);
      void audioDirector?.play("coin");
    }
    else if (event.type === "enemyLeaked") {
      battleLeaks.push(event);
      showFeedback(`基地受损 −${event.damage}`, "damage");
      if (loadSettings().screenShake) boardScene?.showBaseHitEffect();
      document.querySelector(".battle-hud")?.classList.add("base-hit");
      window.setTimeout(() => document.querySelector(".battle-hud")?.classList.remove("base-hit"), 420);
      audioDirector?.duckMusic();
      void audioDirector?.play("base-hit");
    }
    else if (event.type === "statusChanged" && event.status === "running") {
      ui.waveBanner.textContent = `第 ${engine.state.waveIndex} 波来袭`;
      ui.waveBanner.hidden = false;
      boardScene?.showWaveStartEffect();
      window.setTimeout(() => { ui.waveBanner.hidden = true; }, 1900);
      audioDirector?.setScene("battle");
      void audioDirector?.play("wave-start");
      advanceGuide("waveStarted");
    }
    else if (event.type === "statusChanged" && event.status === "ready") audioDirector?.setScene("deployment");
    else if (event.type === "statusChanged" && (event.status === "won" || event.status === "lost")) {
      audioDirector?.setScene("result");
      audioDirector?.duckMusic(800);
      void audioDirector?.play(event.status === "won" ? "victory" : "defeat");
    }
  }
}

function restart(enterGame = true): void {
  engine = createGameplayController({ map: currentMap, levelId: currentLevels[currentDifficulty].id, seed: currentMap.seed, ...(currentLevels[currentDifficulty].wavePlan ? { wavePlan: currentLevels[currentDifficulty].wavePlan } : {}) });
  selectedArchetype = null;
  selectedTowerId = null;
  selectedBuildSlot = null;
  presentedResultKey = null;
  gameSpeed = 1;
  battleLeaks = [];
  guideStep = 0;
  message = "新一局已准备。选择防御塔并部署。";
  if (enterGame) screenFlow.show("gameplay");
  boardScene?.renderState();
  renderHud();
  if (enterGame) void beginPersistentRun();
  if (enterGame) renderGuide();
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
  engine = createGameplayController({ map: currentMap, levelId: currentLevels[difficulty].id, seed: currentMap.seed, ...(currentLevels[difficulty].wavePlan ? { wavePlan: currentLevels[difficulty].wavePlan } : {}) });
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
  const plannedWave = currentLevels[currentDifficulty].wavePlan?.waves[state.waveIndex];
  const briefing = state.status === "ready" && plannedWave ? (() => {
    const counts = Object.entries(Object.fromEntries(["normal", "fast", "tank", "boss"].map(type => [type, plannedWave.events.filter(event => event.archetype === type).length]))).filter(([, count]) => count > 0).map(([type, count]) => `${({ normal: "普通", fast: "迅捷", tank: "重甲", boss: "首领" } as Record<string, string>)[type]}×${count}`).join(" · ");
    return `下一波：${plannedWave.label || `第 ${plannedWave.index} 波`} · ${counts} · ${new Set(plannedWave.events.map(event => event.pathId)).size} 个入口`;
  })() : "";
  const contextualMessage = [briefing, message].filter(Boolean).join("\n");
  ui.message.textContent = selectedArchetype ? `${towerBrief(selectedArchetype)}\n${contextualMessage}` : contextualMessage;
  ui.waveBrief.hidden = state.status !== "ready" || !plannedWave;
  if (plannedWave) {
    const enemyNames: Record<string, string> = { normal: "普通", fast: "迅捷", tank: "重甲", boss: "首领" };
    const counts = ["normal", "fast", "tank", "boss"].map(type => ({ type, count: plannedWave.events.filter(event => event.archetype === type).length })).filter(item => item.count > 0);
    ui.waveBriefTitle.textContent = plannedWave.label || `第 ${plannedWave.index} 波`;
    ui.waveBriefCopy.textContent = `${counts.map(item => `${enemyNames[item.type]} ×${item.count}`).join(" · ")} · ${new Set(plannedWave.events.map(event => event.pathId)).size} 个入口`;
  }
  ui.nextWave.disabled = state.status !== "ready" || state.waveIndex >= state.totalWaves;
  const waveLabel = ui.nextWave.querySelector("span");
  const waveActionLabel = plannedWave?.label ? `开始 · ${plannedWave.label}` : state.waveIndex === 0 ? "开始第一波" : "开始下一波";
  if (waveLabel) waveLabel.textContent = waveActionLabel;
  else ui.nextWave.textContent = waveActionLabel;
  ui.nextWave.setAttribute("aria-label", state.waveIndex === 0 ? "开始第一波" : "开始下一波");
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
    ui.towerContextSpeed.textContent = `${stats.attackSpeed.toFixed(2)} / 秒`;
    ui.towerContextRole.textContent = towerRoles[tower.archetype];
    ui.towerContextCost.textContent = tower.level >= GAME_CONFIG.economy.maximumTowerLevel ? "已满级" : `${upgradeCost} 金币`;
    const refund = towerRefund(tower);
    ui.sell.textContent = `拆除并返还 ${refund}`;
    ui.sell.disabled = state.status !== "ready";
    ui.sell.title = state.status === "ready" ? `返还总投入的 ${Math.round(GAME_CONFIG.economy.sellRatio * 100)}%` : "只能在波次之间拆除";
    boardScene?.positionTowerContext(tower.position);
  } else { ui.upgrade.disabled = true; ui.sell.disabled = true; }
  const nextDifficulty = currentDifficulty === "easy" ? "medium" : currentDifficulty === "medium" ? "hard" : null;
  ui.nextLevel.hidden = !nextDifficulty || !unlockedLevelIds.has(currentLevels[nextDifficulty]?.id ?? "");
  document.querySelectorAll<HTMLButtonElement>("[data-archetype]").forEach(button => {
    const archetype = button.dataset.archetype as TowerArchetype;
    button.classList.toggle("selected", archetype === selectedArchetype);
    button.classList.toggle("unaffordable", state.gold < GAME_CONFIG.towers[archetype].cost);
    button.disabled = state.status === "won" || state.status === "lost" || state.status === "paused";
  });

  const result = engine.result();
  if (result) {
    ui.resultTitle.textContent = result.win ? "胜利 · 防线守住了" : "失败 · 基地失守";
    ui.resultCopy.textContent = `完成波次 ${result.waveReached}/${result.totalWaves} · 剩余生命 ${result.remainingHp} · 击退 ${result.enemiesKilled} 个敌人 · 剩余金币 ${result.remainingGold} · 获得金币 ${result.goldEarned} · 建塔 ${result.towersBuilt} 座`;
    const firstLeak = battleLeaks[0];
    const enemyNames: Record<string, string> = { normal: "普通敌人", fast: "迅捷敌人", tank: "重甲敌人", boss: "首领" };
    ui.resultLeakFact.textContent = firstLeak ? `第 ${firstLeak.waveIndex} 波，${firstLeak.pathId} 首次漏过${enemyNames[firstLeak.archetype]}；本局共漏怪 ${result.enemiesLeaked} 个。` : "本局没有敌人漏过防线。";
    ui.resultEconomyFact.textContent = `投入 ${result.goldSpent} 金币，战斗获得 ${result.goldEarned}，结束时保留 ${result.remainingGold}。`;
    const acceptedActions = engine.actionLog.filter(record => record.accepted);
    const sold = acceptedActions.filter(record => record.action.type === "sellTower").length;
    const upgraded = acceptedActions.filter(record => record.action.type === "upgradeTower").length;
    ui.resultActionFact.textContent = `有效操作 ${acceptedActions.length} 次：建塔 ${result.towersBuilt}、升级 ${upgraded}${sold > 0 ? `、拆除 ${sold}` : ""}。`;
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
  private terrain!: Phaser.GameObjects.Graphics;
  private roads!: Phaser.GameObjects.Graphics;
  private dynamic!: Phaser.GameObjects.Graphics;
  private shots!: Phaser.GameObjects.Graphics;
  private shotEvents: Extract<GameEvent, { type: "towerFired" }>[] = [];
  private projection!: BoardProjection;
  private terrainSprites: Phaser.GameObjects.Image[] = [];
  private mapLabels: Phaser.GameObjects.Text[] = [];
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
    for (const id of ["ff.neutral.tower", "ff.neutral.enemy"]) {
      const url = getLocalGameAssetUrl(id);
      const key = getLocalGameAssetKey(id);
      if (url && key) this.load.image(key, url);
    }
    this.queueWorldTextures(currentWorldAssets);
  }

  create(): void {
    boardScene = this;
    this.cameras.main.setBackgroundColor("rgba(16,26,26,0)");
    this.terrain = this.add.graphics().setDepth(WORLD_VISUAL_DEPTH.ground);
    this.roads = this.add.graphics().setDepth(WORLD_VISUAL_DEPTH.road);
    this.dynamic = this.add.graphics().setDepth(WORLD_VISUAL_DEPTH.indicator);
    this.shots = this.add.graphics().setDepth(WORLD_VISUAL_DEPTH.projectile);
    if (debugRenderMode) this.debugGraphics = this.add.graphics().setDepth(WORLD_VISUAL_DEPTH.debug);
    this.layoutBoard();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.refreshWorldVisuals, this);
    this.drawTerrain();
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.onBoardClick(pointer.x, pointer.y, pointer.wasTouch));
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const next = this.projection.cellAt({ x: pointer.x, y: pointer.y });
      if (next?.x === this.hoverCell?.x && next?.y === this.hoverCell?.y) return;
      this.hoverCell = next;
      if (selectedArchetype && next) {
        const occupied = engine.state.towers.some(tower => tower.position.x === next.x && tower.position.y === next.y);
        const legal = currentMap.buildSlots.some(slot => slot.x === next.x && slot.y === next.y);
        message = occupied ? "已建有防御塔 · 点击查看升级" : !legal ? "× 非建造位 · 道路与环境区域不可建造" : engine.state.gold < GAME_CONFIG.towers[selectedArchetype].cost ? "× 金币不足 · 可先查看射程" : "✓ 可以建造 · 点击部署";
        renderHud();
      }
      this.drawTerrain();
    });
    this.renderState();
    renderHud();
    // Subsequent world changes resolve to the same approved local visual family.
  }

  update(time: number, delta: number): void {
    if (screenFlow.current !== "gameplay") return;
    this.sceneClock = time;
    this.tweens.timeScale = engine.state.status === "paused" ? 0 : 1;
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
    this.layoutBoard();
    this.drawTerrain();
    this.renderState();
  }

  private queueWorldTextures(assets: ResolvedWorldAssets): boolean {
    let queued = false;
    const entries: [string, string][] = [];
    for (const name of Object.keys(assets.manifest.assets) as WorldAssetName[]) {
      if (name.startsWith("road")) continue;
      entries.push([assets.textureKey(name), assets.assetUrl(name)]);
    }
    for (const archetype of ["normal", "fast", "tank", "boss"]) {
      for (let frame = 0; frame < ENEMY_ANIMATION_FRAMES; frame++) {
        const url = getLocalGameAssetUrl(`ff.realm.enemy-${archetype}-${frame}`);
        if (url) entries.push([`realm-enemy-${archetype}-${frame}`, url]);
      }
    }
    for (const [key, url] of entries) {
      if (this.textures.exists(key)) continue;
      this.load.image(key, url);
      queued = true;
    }
    return queued;
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
    if (prefersReducedMotion()) return;
    const center = this.project(point);
    const ring = this.add.ellipse(center.x, center.y - 3, 20, 12, 0xffd275, 0.72).setDepth(WORLD_VISUAL_DEPTH.indicator);
    this.tweens.add({ targets: ring, scaleX: 2.2, scaleY: 2.4, alpha: 0, duration: 320, ease: "Back.Out", onComplete: () => ring.destroy() });
  }

  showUpgradeEffect(point: Coordinate, level: number): void {
    this.showPlacementEffect(point);
    if (prefersReducedMotion()) return;
    const center = this.project(point);
    for (let i = 0; i < 8; i++) {
      const spark = this.add.star(center.x, center.y - 12, 4, 2, 5, 0xffe0a0).setDepth(WORLD_VISUAL_DEPTH.indicator);
      this.tweens.add({ targets: spark, x: center.x + Math.cos(i * Math.PI / 4) * 32, y: center.y - 35 + Math.sin(i * Math.PI / 4) * 25, alpha: 0, duration: 650, delay: i * 25, onComplete: () => spark.destroy() });
    }
    const label = this.add.text(center.x, center.y - 45, `↑ Lv.${level}`, { color: "#ffe6a4", fontSize: "17px", stroke: "#283929", strokeThickness: 4 }).setOrigin(.5).setDepth(WORLD_VISUAL_DEPTH.indicator);
    this.tweens.add({ targets: label, y: center.y - 80, alpha: 0, duration: 900, onComplete: () => label.destroy() });
  }

  showDeathEffect(point: Coordinate, reward: number): void {
    if (prefersReducedMotion()) return;
    const center = this.project(point);
    for (let index = 0; index < 5; index += 1) {
      if (this.activeDeathParticles >= this.maxDeathParticles) break;
      this.activeDeathParticles += 1;
      const angle = index * (Math.PI * 2 / 5);
      const spark = this.add.circle(center.x, center.y - 5, 2.5, 0xffd27a, 0.95).setDepth(WORLD_VISUAL_DEPTH.indicator);
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
    if (prefersReducedMotion()) return;
    const center = this.project(point);
    const target = targetId ? this.entitySprites.get(targetId) : undefined;
    if (target) {
      target.setTintFill(0xffffff);
      window.setTimeout(() => { if (target.active) target.clearTint(); }, 85);
    }
    const flash = this.add.ellipse(center.x, center.y - 5, 13, 10, 0xffefd0, 0.72).setDepth(WORLD_VISUAL_DEPTH.indicator);
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
    if (prefersReducedMotion()) return;
    for (const spawn of currentMap.spawns) {
      const center = this.project(spawn.position);
      const ring = this.add.ellipse(center.x, center.y, this.projection.tileWidth * .42, this.projection.tileHeight * .34, 0xc250d8, .58).setDepth(WORLD_VISUAL_DEPTH.indicator);
      this.tweens.add({ targets: ring, scaleX: 2.1, scaleY: 2.1, alpha: 0, duration: 680, ease: "Cubic.Out", onComplete: () => ring.destroy() });
    }
  }

  showBaseHitEffect(): void {
    if (prefersReducedMotion()) {
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
    if (prefersReducedMotion()) return;
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
    for (const label of this.mapLabels) label.destroy();
    this.mapLabels = [];
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
    const realm = resolveStorybookRealm(knownWorlds.get(currentWorldId)?.spec);
    // Cosmetic river / aether channel / fissure. Road crossings get bridge planks;
    // no coordinates, collision, routes, or build legality are changed.
    const channelX = scenicChannelColumn(currentMap);
    for (let y = 0; y < currentMap.height; y++) {
      const point = { x: channelX, y };
      if (slots.has(`${channelX},${y}`) || spawns.has(`${channelX},${y}`) || (currentMap.base.x === channelX && currentMap.base.y === y)) continue;
      this.drawDiamond(this.terrain, point, realm.water, .85, 1);
      const center = this.project(point);
      this.terrain.lineStyle(1, realm.accent, .55).lineBetween(center.x - 5, center.y, center.x + 6, center.y - 3);
    }
    for (let y = 0; y < currentMap.height; y++) {
      for (let x = 0; x < currentMap.width; x++) {
        const point = { x, y };
        const key = `${x},${y}`;
        const center = this.project(point);
        const variation = (x * 37 + y * 61 + currentMap.seed) % 10;
        if (!roadCells.has(key) && !slots.has(key) && x !== channelX && variation < 6) {
          this.terrain.fillStyle(this.color(palette.groundSecondary), .2);
          this.terrain.fillEllipse(center.x, center.y, this.projection.tileWidth * .85, this.projection.tileHeight * .55);
          if (realm.id === "rift") this.terrain.lineStyle(1, 0x493b3f, .45).lineBetween(center.x - 5, center.y + 2, center.x + 6, center.y - 2);
        }
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
              .setDisplaySize(Math.max(26, this.projection.tileWidth * metadata.scale) * emphasis, Math.max(18, this.projection.tileHeight * metadata.scale) * emphasis)
              .setTint(selected || hovered ? 0xffe18c : actionable && affordable ? 0xd8ba65 : actionable ? 0x5c5d56 : occupied ? 0x565b54 : 0x8a8169)
              .setAlpha(actionable && affordable ? .94 : occupied ? .28 : actionable ? .42 : .76)
              .setDepth(WORLD_VISUAL_DEPTH.buildSlot);
            slot.setData("buildSlotPulse", actionable && affordable);
            slot.setData("buildSlotBaseAlpha", slot.alpha);
            this.terrainSprites.push(slot);
            if (!occupied) {
              this.mapLabels.push(this.add.text(center.x, center.y - 2, "+", { color: selected ? "#fff2a6" : "#f0dcaa", fontSize: "16px", fontStyle: "bold", stroke: "#42573b", strokeThickness: 2 }).setOrigin(.5).setDepth(WORLD_VISUAL_DEPTH.buildSlot + 1));
              this.roads.lineStyle(selected || hovered ? 2 : 1, selected || hovered ? 0xffdf83 : 0xb89d61, selected || hovered ? .9 : .42);
              this.roads.strokeEllipse(center.x, center.y, this.projection.tileWidth * .38 * emphasis, this.projection.tileHeight * .38 * emphasis);
            }
          }
        }
      }
    }
    const roadWidth = this.projection.tileHeight * .65;
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
      if (x === channelX && !spawns.has(key) && !(currentMap.base.x === x && currentMap.base.y === y)) {
        this.drawDiamond(this.roads, { x, y }, 0xb49a72, 1, 2);
        for (const offset of [-.2, 0, .2]) {
          const plank = this.project({ x: x + offset, y });
          this.roads.lineStyle(2, 0x6b5743, .8).lineBetween(plank.x - this.projection.tileWidth * .2, plank.y + this.projection.tileHeight * .2, plank.x + this.projection.tileWidth * .2, plank.y - this.projection.tileHeight * .2);
        }
      }
    }
    const base = this.project(currentMap.base);
    const marker = (point: Phaser.Math.Vector2, label: string, color: string) => {
      this.mapLabels.push(this.add.text(point.x, point.y + 10, label, { color, fontSize: "12px", fontStyle: "bold", backgroundColor: "#233c30dd", padding: { x: 7, y: 4 } }).setOrigin(.5, 0).setDepth(WORLD_VISUAL_DEPTH.indicator));
    };
    marker(base, "守护城堡", "#fff1b7");
    const baseKey = currentWorldAssets.textureKey("playerBase");
    if (baseKey && this.textures.exists(baseKey)) {
      this.baseSprite = placeIsometricSprite(this.add.image(base.x, base.y, baseKey), getIsometricPlacement(this.projection, currentMap.base, currentWorldAssets.manifest, "playerBase"));
      this.terrainSprites.push(this.baseSprite);
    }
    else { this.terrain.fillStyle(0xc4a868, 1); this.terrain.fillTriangle(base.x - 10, base.y + 2, base.x, base.y - 22, base.x + 10, base.y + 2); }
    for (const spawn of currentMap.spawns) {
      const position = this.project(spawn.position);
      marker(position, "敌军入口", "#ffd4b2");
      const riftKey = currentWorldAssets.textureKey("enemySpawn");
      if (riftKey && this.textures.exists(riftKey)) {
        const rift = placeIsometricSprite(this.add.image(position.x, position.y, riftKey), getIsometricPlacement(this.projection, spawn.position, currentWorldAssets.manifest, "enemySpawn"));
        rift.setData("baseScaleX", rift.scaleX); rift.setData("baseScaleY", rift.scaleY);
        this.riftSprites.push(rift); this.terrainSprites.push(rift);
      }
      else { this.terrain.fillStyle(0x271d27, 0.85); this.terrain.fillEllipse(position.x, position.y + 3, 24, 12); this.terrain.lineStyle(3, 0xb76665, 0.95); this.terrain.strokeCircle(position.x, position.y - 2, 10); }
    }
    const decorationAssets: readonly WorldAssetName[] = realm.id === "forest" ? ["propTree", "propTree", "propRock", "propTree"] : realm.id === "crystal" ? ["propDecoration", "battlefieldLandmark", "propRock", "propDecoration"] : ["propRock", "propCrate", "propRock", "battlefieldLandmark"];
    for (const placement of createDecorationPlacements(currentMap, 18)) {
      if (placement.position.x === channelX) continue;
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
      if (selectedArchetype) {
        const occupied = engine.state.towers.some(tower => tower.position.x === this.hoverCell!.x && tower.position.y === this.hoverCell!.y);
        const canBuild = legalSlot && !occupied && engine.state.gold >= GAME_CONFIG.towers[selectedArchetype].cost;
        this.drawDiamond(this.dynamic, this.hoverCell, canBuild ? 0xb9ed9b : 0xef8874, .35, 1);
        if (legalSlot && !occupied) this.drawRange(this.hoverCell, GAME_CONFIG.towers[selectedArchetype].range, canBuild ? 0xb9ed9b : 0xef8874);
      }
    }
    if (selectedBuildSlot) {
      const center = this.project(selectedBuildSlot);
      this.dynamic.lineStyle(2, 0xffd879, .9);
      this.dynamic.strokeEllipse(center.x, center.y - 2, this.projection.tileWidth * .42, this.projection.tileHeight * .29);
    }
  }

  private drawRange(point: Coordinate, range: number, color: number): void {
    const vertices = Array.from({ length: 48 }, (_, i) => this.project({ x: point.x + Math.cos(i * Math.PI / 24) * range, y: point.y + Math.sin(i * Math.PI / 24) * range }));
    this.dynamic.fillStyle(color, .045).lineStyle(1.5, color, .65);
    this.dynamic.fillPoints(vertices, true).strokePoints(vertices, true);
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
    if (!prefersReducedMotion()) {
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
      this.drawRange(point, range, 0xffe391);
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
    const frame = prefersReducedMotion() ? 0 : Math.floor(this.sceneClock / ENEMY_ANIMATION_FRAME_MS) % ENEMY_ANIMATION_FRAMES;
    const idKey = `realm-enemy-${enemy.archetype}-${frame}`;
    const key = this.textures.exists(idKey) ? idKey : getLocalGameAssetKey("ff.neutral.enemy") ?? "enemy";
    let sprite = this.entitySprites.get(id);
    if (!sprite) { sprite = this.add.image(center.x, center.y, key); this.entitySprites.set(id, sprite); }
    if (sprite.texture.key !== key) sprite.setTexture(key);
    const assetName = ENEMY_WORLD_ASSET_BY_ARCHETYPE[enemy.archetype];
    const placement = getIsometricPlacement(this.projection, point, currentWorldAssets.manifest, assetName);
    placement.displayWidth = placement.displayHeight = Math.max(24, placement.displayHeight);
    const reducedMotion = prefersReducedMotion();
    const bob = reducedMotion ? 0 : Math.sin(this.sceneClock / 105 + Number.parseInt(id.replace(/\D/g, "") || "0", 10)) * 1.6;
    placeIsometricSprite(sprite, placement).setY(placement.groundScreenY + bob).setFlipX(directionTarget.x < center.x);
    const healthY = center.y - placement.displayHeight * .82;
    this.dynamic.fillStyle(0x251c1c, 1); this.dynamic.fillRoundedRect(center.x - 12, healthY, 24, 5, 2);
    this.dynamic.fillStyle(enemy.archetype === "boss" ? 0xffb464 : 0xb6da70, 1); this.dynamic.fillRoundedRect(center.x - 11, healthY + 1, 22 * Math.max(0, enemy.hp / enemy.maxHp), 3, 1);
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

  private onBoardClick(screenX: number, screenY: number, touch = false): void {
    // Expand touch hit areas without changing MapSpec, legal slots, or core rules.
    const nearestSlot = touch ? currentMap.buildSlots.map(point => ({ point, pixel: this.project(point) }))
      .map(({ point, pixel }) => ({ point, distance: Math.hypot(pixel.x - screenX, pixel.y - screenY) }))
      .filter(candidate => candidate.distance <= 22).sort((a, b) => a.distance - b.distance)[0]?.point : undefined;
    const point = nearestSlot ?? this.projection.cellAt({ x: screenX, y: screenY });
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
    if (selectedArchetype) {
      message = "× 非建造位 · 请选择地图上的＋建造位";
      this.drawTerrain();
      renderHud();
      return;
    }
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

type LocalSettings = { provider: string; model: string; apiKey: string; masterVolume: number; musicVolume: number; effectsVolume: number; muted: boolean; reduceIntenseAudio: boolean; language: string; reducedMotion: boolean; screenShake: boolean };
const settingsKey = "fantasy-frontiers.settings.v1";
const defaultSettings: LocalSettings = { provider: "deepseek", model: "deepseek-chat", apiKey: "", masterVolume: 80, musicVolume: 70, effectsVolume: 85, muted: false, reduceIntenseAudio: false, language: "zh-CN", reducedMotion: false, screenShake: true };

function loadSettings(): LocalSettings {
  try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem(settingsKey) ?? "{}") as Partial<LocalSettings> }; }
  catch { return defaultSettings; }
}

function audioPreferences(value = loadSettings()): AudioPreferences {
  return { masterVolume: value.masterVolume, musicVolume: value.musicVolume, effectsVolume: value.effectsVolume, muted: value.muted, reduceIntenseAudio: value.reduceIntenseAudio };
}

function populateSettings(): void {
  const value = loadSettings();
  (document.querySelector<HTMLSelectElement>("#settings-provider")!).value = value.provider;
  (document.querySelector<HTMLInputElement>("#settings-model")!).value = value.model;
  (document.querySelector<HTMLInputElement>("#settings-api-key")!).value = value.apiKey;
  (document.querySelector<HTMLInputElement>("#settings-master-volume")!).value = String(value.masterVolume);
  (document.querySelector<HTMLInputElement>("#settings-music-volume")!).value = String(value.musicVolume);
  (document.querySelector<HTMLInputElement>("#settings-effects-volume")!).value = String(value.effectsVolume);
  (document.querySelector<HTMLInputElement>("#settings-muted")!).checked = value.muted;
  (document.querySelector<HTMLInputElement>("#settings-reduce-intense-audio")!).checked = value.reduceIntenseAudio;
  (document.querySelector<HTMLSelectElement>("#settings-language")!).value = value.language;
  (document.querySelector<HTMLInputElement>("#settings-reduced-motion")!).checked = value.reducedMotion;
  (document.querySelector<HTMLInputElement>("#settings-screen-shake")!).checked = value.screenShake;
  document.documentElement.classList.toggle("reduce-motion", value.reducedMotion);
}

audioDirector = new AudioDirector(audioPreferences());
const unlockAudio = (): void => {
  void audioDirector?.unlock().then(unlocked => {
    const status = document.querySelector<HTMLElement>("#audio-status");
    if (status) status.textContent = unlocked ? "声音已启用。若浏览器静音，游戏仍保持完整视觉反馈。" : "浏览器未允许声音；游戏将保持静默运行。";
  });
};
document.addEventListener("pointerdown", unlockAudio, { once: true, capture: true });
document.addEventListener("keydown", unlockAudio, { once: true, capture: true });
document.addEventListener("visibilitychange", () => { void audioDirector?.setSuspended(document.hidden); });
document.addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest("button, a.button, .studio-tool-card");
  if (button && !(button as HTMLButtonElement).disabled) void audioDirector?.play("ui-click");
});

document.querySelector(".main-menu-view")!.prepend(createFantasyScene());
document.documentElement.style.setProperty("--fantasy-frame", `url("${getLocalGameAssetUrl("ff.realm.panel")}")`);
populateSettings();

document.querySelectorAll<HTMLButtonElement>("[data-archetype]").forEach(button => {
  button.addEventListener("click", () => {
    const archetype = button.dataset.archetype as TowerArchetype;
    if (selectedArchetype === archetype) {
      selectedArchetype = null;
      message = "已取消部署选择。";
      renderHud(); boardScene?.renderState(); boardScene?.changeMap();
      return;
    }
    selectedArchetype = archetype;
    selectedTowerId = null;
    message = `已选择${button.dataset.label}，点击地图上的建造位进行部署。`;
    advanceGuide("towerSelected");
    void audioDirector?.play("ui-select");
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
document.querySelectorAll<HTMLButtonElement>("[data-prompt-fragment]").forEach(button => {
  button.addEventListener("click", () => {
    const fragment = button.dataset.promptFragment ?? "";
    const current = ui.worldPrompt.value.trim();
    ui.worldPrompt.value = current ? `${current}，${fragment}` : `一个以${fragment}为主题的幻想世界`;
    ui.worldPrompt.focus();
    button.classList.add("selected");
  });
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
    ui.worldCreateButton.textContent = "创造世界";
  }
});
ui.nextWave.addEventListener("click", () => send({ type: "startWave" }));
ui.pause.addEventListener("click", () => send({ type: "pause" }));
ui.pauseResume.addEventListener("click", () => send({ type: "resume" }));
ui.pauseReturn.addEventListener("click", () => { showHubView("play"); renderWorldDetail(currentWorldId); });
ui.speed.addEventListener("click", () => { gameSpeed = gameSpeed === 1 ? 2 : 1; renderHud(); });
ui.upgrade.addEventListener("click", () => { if (selectedTowerId) send({ type: "upgradeTower", towerId: selectedTowerId }); });
ui.sell.addEventListener("click", () => {
  if (!selectedTowerId) return;
  const tower = engine.state.towers.find(candidate => candidate.id === selectedTowerId);
  if (!tower) return;
  const refund = towerRefund(tower);
  if (!window.confirm(`拆除这座塔并返还 ${refund} 金币？`)) return;
  send({ type: "sellTower", towerId: selectedTowerId });
});
ui.guideNext.addEventListener("click", () => advanceGuide("start"));
ui.guideSkip.addEventListener("click", () => { localStorage.setItem(guideKey, "complete"); ui.guide.hidden = true; });
ui.restart.addEventListener("click", () => restart());
ui.replayLevel.addEventListener("click", () => {
  restart();
});
ui.returnLevels.addEventListener("click", () => { if (editorPreviewMode) location.href = appUrl("map-editor.html"); else returnToSelection("levels"); });
ui.returnWorlds.addEventListener("click", () => { if (editorPreviewMode) location.href = appUrl("map-editor.html"); else returnToSelection("world"); });
ui.nextLevel.addEventListener("click", () => {
  const next = currentDifficulty === "easy" ? "medium" : currentDifficulty === "medium" ? "hard" : null;
  if (next) void enterGameplay(currentWorldId, next);
});
ui.playSelectedLevel.addEventListener("click", () => { void enterGameplay(currentWorldId, currentDifficulty); });
ui.leaveGameplay.addEventListener("click", () => {
  if (editorPreviewMode) { location.href = appUrl("map-editor.html"); return; }
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
    muted: document.querySelector<HTMLInputElement>("#settings-muted")!.checked,
    reduceIntenseAudio: document.querySelector<HTMLInputElement>("#settings-reduce-intense-audio")!.checked,
    language: document.querySelector<HTMLSelectElement>("#settings-language")!.value,
    reducedMotion: document.querySelector<HTMLInputElement>("#settings-reduced-motion")!.checked,
    screenShake: document.querySelector<HTMLInputElement>("#settings-screen-shake")!.checked,
  };
  localStorage.setItem(settingsKey, JSON.stringify(value));
  document.documentElement.classList.toggle("reduce-motion", value.reducedMotion);
  audioDirector?.updatePreferences(audioPreferences(value));
  document.querySelector<HTMLElement>("#settings-status")!.textContent = "设置已保存在当前浏览器。";
});
document.querySelectorAll<HTMLInputElement>("#settings-master-volume, #settings-music-volume, #settings-effects-volume, #settings-muted, #settings-reduce-intense-audio").forEach(input => {
  input.addEventListener("input", () => {
    const current = loadSettings();
    audioDirector?.updatePreferences({
      ...audioPreferences(current),
      masterVolume: Number(document.querySelector<HTMLInputElement>("#settings-master-volume")!.value),
      musicVolume: Number(document.querySelector<HTMLInputElement>("#settings-music-volume")!.value),
      effectsVolume: Number(document.querySelector<HTMLInputElement>("#settings-effects-volume")!.value),
      muted: document.querySelector<HTMLInputElement>("#settings-muted")!.checked,
      reduceIntenseAudio: document.querySelector<HTMLInputElement>("#settings-reduce-intense-audio")!.checked,
    });
  });
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
  if (editorPreviewMap) {
    ui.leaveGameplay.setAttribute("aria-label", "返回地图工坊"); ui.returnLevels.textContent = "返回编辑器"; ui.returnWorlds.hidden = true; ui.nextLevel.hidden = true;
    ui.levelLabel.textContent = `${currentLevels[currentDifficulty].name} · ${engine.state.totalWaves} 波`;
    initializeGame(); screenFlow.show("gameplay"); restart();
  }
  else { showHubView("menu"); void refreshWorldLibrary(); }
}
window.addEventListener("pagehide", () => { game?.destroy(true); audioDirector?.destroy(); }, { once: true });
