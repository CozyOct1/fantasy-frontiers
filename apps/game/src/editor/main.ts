import {
  GAME_CONFIG, mapDraftSchema,
  type Coordinate, type Difficulty, type EnemyArchetype, type MapDraft,
} from "@fantasy-frontiers/shared";
import { createBenchmarkContent, createWavePlanDraftForMap, draftFromMap } from "@fantasy-frontiers/maps";
import { appUrl } from "../app/app-url";
import { MapEditorSession, createEmptyDraft, type MapEditorTool } from "./map-editor-session";
import "../style.css";

const storageKey = "fantasy-frontiers.map-draft.v1";
const previewKey = "fantasy-frontiers.level-preview.v1";
const apiBase = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? import.meta.env.BASE_URL.replace(/\/$/, "") : "http://127.0.0.1:3001");
const enemyNames: Record<EnemyArchetype, string> = { normal: "普通", fast: "迅捷", tank: "重甲", boss: "首领" };
const $ = <T extends Element>(selector: string): T => document.querySelector<T>(selector)!;

function loadDraft(): MapDraft {
  try { return mapDraftSchema.parse(JSON.parse(localStorage.getItem(storageKey) ?? "null")); }
  catch { return createEmptyDraft(); }
}
const saveLocal = (draft: MapDraft): void => localStorage.setItem(storageKey, JSON.stringify(draft));
let session = new MapEditorSession(loadDraft());
let tool: MapEditorTool = "base";
let selectedWave = 0;
let serverAvailable = false;
let dirty = false;

const grid = $("#editor-grid");
const status = $("#editor-status");
const issues = $<HTMLOListElement>("#editor-issues");
const nameInput = $<HTMLInputElement>("#editor-name");
const difficultyInput = $<HTMLSelectElement>("#editor-difficulty");
const seedInput = $<HTMLInputElement>("#editor-seed");
const notesInput = $<HTMLTextAreaElement>("#editor-notes");
const pathInput = $<HTMLSelectElement>("#editor-path");
const draftList = $<HTMLSelectElement>("#editor-draft-list");
const waveList = $("#editor-wave-list");
const waveForm = $<HTMLElement>("#editor-wave-form");
const waveEmpty = $<HTMLElement>("#editor-wave-empty");
const waveLabel = $<HTMLInputElement>("#editor-wave-label");
const enemyPath = $<HTMLSelectElement>("#editor-enemy-path");

const pointKey = (point: Coordinate): string => `${point.x},${point.y}`;
function syncMeta(): void {
  const draft = session.draft;
  nameInput.value = draft.name; difficultyInput.value = draft.difficulty;
  seedInput.value = String(draft.seed); notesInput.value = draft.notes;
}
function cellLabel(point: Coordinate, draft: MapDraft): { label: string; className: string } {
  if (draft.base && pointKey(draft.base) === pointKey(point)) return { label: "🏰", className: "base" };
  if (draft.spawns.some(item => pointKey(item.position) === pointKey(point))) return { label: "🌀", className: "spawn" };
  if (draft.paths.some(path => path.tiles.some(tile => pointKey(tile) === pointKey(point)))) return { label: "▰", className: "path" };
  if (draft.buildSlots.some(cell => pointKey(cell) === pointKey(point))) return { label: "+", className: "build" };
  if (draft.obstacles.some(cell => pointKey(cell) === pointKey(point))) return { label: "◆", className: "obstacle" };
  return { label: "", className: "empty" };
}
function renderMap(draft: MapDraft): void {
  grid.replaceChildren();
  for (let y = 0; y < draft.height; y++) for (let x = 0; x < draft.width; x++) {
    const point = { x, y }; const state = cellLabel(point, draft); const button = document.createElement("button");
    button.type = "button"; button.className = `editor-cell ${state.className}`; button.textContent = state.label; button.title = `(${x}, ${y})`; button.setAttribute("role", "gridcell");
    button.addEventListener("click", () => { const error = session.apply(tool, point); if (error) render(error); else changed("地图已修改，尚未保存。"); });
    grid.append(button);
  }
  const options = session.pathOptions.map(path => new Option(`${path.id} · ${path.spawnId}`, path.id, false, path.id === session.activePathId));
  pathInput.replaceChildren(...options); pathInput.disabled = options.length === 0;
}
function renderWaves(draft: MapDraft): void {
  const waves = draft.wavePlan?.waves ?? [];
  selectedWave = Math.max(0, Math.min(selectedWave, Math.max(0, waves.length - 1)));
  waveList.replaceChildren(...waves.map((wave, index) => {
    const button = document.createElement("button"); button.type = "button"; button.className = index === selectedWave ? "selected" : "";
    const title = document.createElement("strong"); title.textContent = `第 ${wave.index} 波`;
    const label = document.createElement("span"); label.textContent = wave.label || "未命名";
    const count = document.createElement("small"); count.textContent = `${wave.events.length} 个敌人`;
    button.append(title, label, count); button.addEventListener("click", () => { selectedWave = index; render(); }); return button;
  }));
  const wave = waves[selectedWave]; waveForm.hidden = !wave; waveEmpty.hidden = Boolean(wave);
  enemyPath.replaceChildren(...draft.paths.map(path => new Option(path.id, path.id)));
  if (!wave) return;
  waveLabel.value = wave.label;
  const lastTick = wave.events.at(-1)?.tick ?? 0;
  $("#editor-wave-summary").textContent = `${wave.events.length} 个敌人 · 持续约 ${(lastTick / GAME_CONFIG.simulation.tickRate).toFixed(1)} 秒`;
  $("#editor-wave-events").replaceChildren(...wave.events.map((event, eventIndex) => {
    const row = document.createElement("div"); row.className = "wave-event-row"; row.setAttribute("role", "row");
    for (const value of [`${(event.tick / GAME_CONFIG.simulation.tickRate).toFixed(1)}s`, enemyNames[event.archetype], event.pathId]) { const span = document.createElement("span"); span.textContent = value; row.append(span); }
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "移除"; remove.setAttribute("aria-label", `移除第 ${eventIndex + 1} 个敌人`);
    remove.addEventListener("click", () => { session.removeWaveEvent(selectedWave, eventIndex); changed("敌军事件已移除。"); }); row.append(remove); return row;
  }));
}
function render(message = ""): void {
  const draft = session.draft; renderMap(draft); renderWaves(draft); const validation = session.validate(); issues.replaceChildren();
  if (!validation.ok) for (const issue of validation.issues) { const item = document.createElement("li"); item.textContent = `${issue.message}${issue.path ? ` · ${issue.path}` : ""}`; issues.append(item); }
  status.textContent = message || (validation.ok ? "✓ 关卡地图与波次均合法，可以试玩。" : `尚有 ${validation.issues.length} 个问题。`);
  $<HTMLButtonElement>("#editor-preview").disabled = !validation.ok; $<HTMLButtonElement>("#editor-undo").disabled = !session.canUndo; $<HTMLButtonElement>("#editor-redo").disabled = !session.canRedo;
  $("#editor-save-state").textContent = `${dirty ? "未保存" : "已保存"} · r${draft.revision}`;
}
function changed(message: string): void { dirty = true; render(message); }
function setView(view: "map" | "waves"): void {
  $<HTMLElement>("#editor-map-view").hidden = view !== "map"; $<HTMLElement>("#editor-wave-view").hidden = view !== "waves";
  $<HTMLButtonElement>("#editor-tab-map").classList.toggle("selected", view === "map"); $<HTMLButtonElement>("#editor-tab-waves").classList.toggle("selected", view === "waves");
}
function updateMeta(): void {
  session.updateMeta({ name: nameInput.value || "未命名防线", notes: notesInput.value, difficulty: difficultyInput.value as Difficulty, seed: Math.max(0, Math.trunc(Number(seedInput.value) || 0)) }); changed("关卡资料已修改，尚未保存。");
}
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, init); const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`); return body as T;
}
function setServerMessage(message: string, kind: "ok" | "error" | "muted" = "muted"): void { const node = $("#editor-sync-message"); node.textContent = message; node.className = kind; }
function setServerControls(enabled: boolean): void { for (const selector of ["#editor-load-server", "#editor-save-server", "#editor-validate-server", "#editor-publish"]) $<HTMLButtonElement>(selector).disabled = !enabled; draftList.disabled = !enabled; }
async function refreshServerDrafts(selectId = session.draft.id): Promise<void> {
  const data = await requestJson<{ drafts: MapDraft[] }>("/api/editor/map-drafts"); serverAvailable = true; $("#editor-server-state").textContent = "服务器草稿已连接"; $("#editor-server-state").classList.remove("muted"); setServerControls(true);
  draftList.replaceChildren(new Option("选择服务器草稿", ""), ...data.drafts.map(draft => new Option(`${draft.name} · r${draft.revision}`, draft.id, false, draft.id === selectId)));
}
async function detectServer(): Promise<void> {
  try { await refreshServerDrafts(); setServerMessage("可同步、校验并发布不可变关卡版本。", "ok"); }
  catch { serverAvailable = false; $("#editor-server-state").textContent = "本地模式"; setServerControls(false); setServerMessage("编辑服务未启用；本机保存、JSON 导入导出和试玩仍可使用。启动服务时设置 ENABLE_MAP_EDITOR=1。", "muted"); }
}
async function runServerAction(action: () => Promise<void>): Promise<void> {
  if (!serverAvailable) return;
  try { setServerMessage("处理中…"); await action(); }
  catch (error) { const code = error instanceof Error ? error.message : "unknown_error"; setServerMessage(code === "draft_revision_conflict" ? "同步冲突：服务器已有更新，请先读取最新草稿再合并。" : `操作失败：${code}`, "error"); }
}

document.querySelectorAll<HTMLButtonElement>("[data-editor-tool]").forEach(button => button.addEventListener("click", () => { tool = button.dataset.editorTool as MapEditorTool; document.querySelectorAll("[data-editor-tool]").forEach(item => item.classList.toggle("selected", item === button)); setView("map"); }));
for (const input of [nameInput, difficultyInput, seedInput, notesInput]) input.addEventListener("change", updateMeta);
pathInput.addEventListener("change", () => session.selectPath(pathInput.value));
$("#editor-tab-map").addEventListener("click", () => setView("map")); $("#editor-tab-waves").addEventListener("click", () => setView("waves"));
$("#editor-undo").addEventListener("click", () => { session.undo(); syncMeta(); changed("已撤销。"); }); $("#editor-redo").addEventListener("click", () => { session.redo(); syncMeta(); changed("已重做。"); });
$("#editor-new").addEventListener("click", () => { if (!confirm("新建关卡会替换当前未保存修改，继续？")) return; session = new MapEditorSession(createEmptyDraft(`map-draft-${Date.now()}`)); selectedWave = 0; dirty = true; syncMeta(); render("已创建空白关卡。"); });
$("#editor-template").addEventListener("click", () => { if (!confirm("官方模板会替换当前地图和波次，继续？")) return; const current = session.draft; const content = createBenchmarkContent(current.difficulty, current.id); const replacement = draftFromMap(content.map, current.id, content.wavePlan); session = new MapEditorSession({ ...replacement, revision: current.revision, name: current.name, notes: current.notes, seed: current.seed }); selectedWave = 0; dirty = true; syncMeta(); render("已载入当前难度的官方地图与基准波次。"); });
$("#editor-save").addEventListener("click", () => { saveLocal(session.draft); dirty = false; render("草稿已保存到当前浏览器。"); });
$("#editor-export").addEventListener("click", () => { const blob = new Blob([JSON.stringify(session.draft, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${session.draft.id}.json`; link.click(); URL.revokeObjectURL(link.href); });
$<HTMLInputElement>("#editor-import").addEventListener("change", async event => { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; try { session = new MapEditorSession(mapDraftSchema.parse(JSON.parse(await file.text()))); selectedWave = 0; dirty = true; syncMeta(); render("已导入完整关卡草稿，请校验后保存。"); } catch { render("导入失败：文件不符合 MapDraft v1。"); } });
$("#editor-preview").addEventListener("click", () => { const compiled = session.validate(); if (!compiled.ok) return render("关卡未通过完整校验。"); saveLocal(session.draft); localStorage.setItem(previewKey, JSON.stringify({ map: compiled.map, wavePlan: compiled.wavePlan })); location.href = appUrl("?mapPreview=1"); });
$("#editor-wave-add").addEventListener("click", () => { session.addWave(); selectedWave = (session.draft.wavePlan?.waves.length ?? 1) - 1; changed("已添加空波次，请加入敌军。"); });
$("#editor-wave-delete").addEventListener("click", () => { session.removeWave(selectedWave); selectedWave = Math.max(0, selectedWave - 1); changed("波次已删除。"); });
waveLabel.addEventListener("change", () => { session.updateWaveLabel(selectedWave, waveLabel.value); changed("波次名称已更新。"); });
$("#editor-wave-template").addEventListener("click", () => { const compiled = session.validateMap(); if (!compiled.ok) { setView("map"); render("请先修复地图布局，再生成基准波次。"); return; } session.replaceWavePlan(createWavePlanDraftForMap(compiled.map, `${session.draft.id}-waves`)); selectedWave = 0; changed("已按难度和现有路线生成受控基准波次。"); });
$("#editor-wave-batch-add").addEventListener("click", () => { const ticks = GAME_CONFIG.simulation.tickRate; const error = session.addWaveBatch(selectedWave, { archetype: $<HTMLSelectElement>("#editor-enemy-type").value as EnemyArchetype, pathId: enemyPath.value, count: Math.trunc(Number($<HTMLInputElement>("#editor-enemy-count").value)), startTick: Math.round(Number($<HTMLInputElement>("#editor-enemy-start").value) * ticks), intervalTicks: Math.round(Number($<HTMLInputElement>("#editor-enemy-interval").value) * ticks) }); if (error) render(error); else changed("敌军批次已加入当前波次。"); });
$("#editor-load-server").addEventListener("click", () => runServerAction(async () => { if (!draftList.value) throw new Error("请先选择服务器草稿"); const data = await requestJson<{ draft: MapDraft }>(`/api/editor/map-drafts/${encodeURIComponent(draftList.value)}`); session = new MapEditorSession(mapDraftSchema.parse(data.draft)); selectedWave = 0; dirty = false; saveLocal(session.draft); syncMeta(); render("已读取服务器草稿。"); setServerMessage("服务器草稿已读取。", "ok"); }));
$("#editor-save-server").addEventListener("click", () => runServerAction(async () => { const draft = session.draft; const exists = Array.from(draftList.options).some(option => option.value === draft.id); let saved: { draft: MapDraft }; if (exists) saved = await requestJson(`/api/editor/map-drafts/${encodeURIComponent(draft.id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: draft.revision, draft }) }); else saved = await requestJson("/api/editor/map-drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) }); session = new MapEditorSession(mapDraftSchema.parse(saved.draft)); dirty = false; saveLocal(session.draft); syncMeta(); render("草稿已同步到服务器。"); await refreshServerDrafts(session.draft.id); setServerMessage(`已同步 revision ${session.draft.revision}。`, "ok"); }));
$("#editor-validate-server").addEventListener("click", () => runServerAction(async () => { const result = await requestJson<{ ok: boolean; issues?: { message: string }[] }>(`/api/editor/map-drafts/${encodeURIComponent(session.draft.id)}/validate`, { method: "POST" }); setServerMessage(result.ok ? "服务器校验通过，可发布。" : `服务器校验未通过：${result.issues?.map(issue => issue.message).join("；")}`, result.ok ? "ok" : "error"); }));
$("#editor-publish").addEventListener("click", () => runServerAction(async () => { if (dirty) throw new Error("请先同步最新修改"); if (!confirm("发布后会创建不可变关卡版本，继续？")) return; const result = await requestJson<{ revision: { id: string; revision: number } }>(`/api/editor/map-drafts/${encodeURIComponent(session.draft.id)}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: session.draft.revision }) }); setServerMessage(`发布成功：${result.revision.id}（版本 ${result.revision.revision}）`, "ok"); }));

$("[data-editor-tool='base']").classList.add("selected"); syncMeta(); render(); setView("map"); void detectServer();
