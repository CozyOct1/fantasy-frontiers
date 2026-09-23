import { GAME_CONFIG, mapDraftSchema, type Coordinate, type Difficulty, type EnemyArchetype, type MapDraft, type WavePlanDraft } from "@fantasy-frontiers/shared";
import { compileLevelDraft, compileMapDraft, type CompileLevelDraftResult, type CompileMapDraftResult } from "@fantasy-frontiers/maps";

export type MapEditorTool = "base" | "spawn" | "path" | "build" | "obstacle" | "erase";

const clone = <T>(value: T): T => structuredClone(value);
const same = (a: Coordinate, b: Coordinate): boolean => a.x === b.x && a.y === b.y;
const adjacent = (a: Coordinate, b: Coordinate): boolean => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

export function createEmptyDraft(id = "map-draft-1", difficulty: Difficulty = "easy"): MapDraft {
  return mapDraftSchema.parse({
    id, schemaVersion: 1, revision: 0, name: "未命名防线", notes: "", difficulty,
    width: 12, height: 8, seed: 70421, base: null, spawns: [], paths: [], buildSlots: [], obstacles: [], tags: ["authored"],
    wavePlan: { version: 1, id: `${id}-waves`, tickRate: GAME_CONFIG.simulation.tickRate, waves: [] },
  });
}

export class MapEditorSession {
  private current: MapDraft;
  private undoStack: MapDraft[] = [];
  private redoStack: MapDraft[] = [];
  private selectedPathId: string | null = null;

  constructor(draft: MapDraft = createEmptyDraft()) {
    this.current = mapDraftSchema.parse(clone(draft));
    this.selectedPathId = this.current.paths[0]?.id ?? null;
  }

  get draft(): MapDraft { return clone(this.current); }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get pathOptions(): readonly { id: string; spawnId: string }[] { return this.current.paths.map(({ id, spawnId }) => ({ id, spawnId })); }
  get activePathId(): string | null { return this.selectedPathId; }
  selectPath(pathId: string): void { if (this.current.paths.some(path => path.id === pathId)) this.selectedPathId = pathId; }
  validateMap(): CompileMapDraftResult { return compileMapDraft(this.current); }
  validate(): CompileLevelDraftResult { return compileLevelDraft(this.current); }

  replace(draft: MapDraft): void { this.commit(mapDraftSchema.parse(clone(draft))); }

  updateMeta(input: Pick<MapDraft, "name" | "notes" | "difficulty" | "seed">): void {
    this.commit(mapDraftSchema.parse({ ...this.current, ...input }));
  }

  replaceWavePlan(wavePlan: WavePlanDraft): void {
    this.commit(mapDraftSchema.parse({ ...this.current, wavePlan }));
  }

  addWave(label = `第 ${(this.current.wavePlan?.waves.length ?? 0) + 1} 波`): void {
    const wavePlan = clone(this.current.wavePlan ?? { version: 1 as const, id: `${this.current.id}-waves`, tickRate: GAME_CONFIG.simulation.tickRate, waves: [] });
    if (wavePlan.waves.length >= 20) return;
    wavePlan.waves.push({ index: wavePlan.waves.length + 1, label, events: [] });
    this.replaceWavePlan(wavePlan);
  }

  removeWave(waveIndex: number): void {
    const wavePlan = clone(this.current.wavePlan); if (!wavePlan) return;
    wavePlan.waves.splice(waveIndex, 1);
    wavePlan.waves = wavePlan.waves.map((wave, index) => ({ ...wave, index: index + 1 }));
    this.replaceWavePlan(wavePlan);
  }

  updateWaveLabel(waveIndex: number, label: string): void {
    const wavePlan = clone(this.current.wavePlan); const wave = wavePlan?.waves[waveIndex]; if (!wavePlan || !wave) return;
    wave.label = label.slice(0, 80);
    this.replaceWavePlan(wavePlan);
  }

  addWaveBatch(waveIndex: number, input: { archetype: EnemyArchetype; pathId: string; count: number; startTick: number; intervalTicks: number }): string | null {
    const wavePlan = clone(this.current.wavePlan); const wave = wavePlan?.waves[waveIndex];
    if (!wavePlan || !wave) return "先添加波次";
    if (!this.current.paths.some(path => path.id === input.pathId)) return "请选择现有入口路线";
    if (!Number.isInteger(input.count) || input.count < 1 || input.count > 40) return "单批敌人数量必须为 1–40";
    if (!Number.isInteger(input.startTick) || input.startTick < 0 || !Number.isInteger(input.intervalTicks) || input.intervalTicks < 1) return "生成时间必须是合法的非负时间";
    if (wave.events.length + input.count > 160) return "单波最多 160 个敌人";
    for (let index = 0; index < input.count; index++) wave.events.push({ tick: input.startTick + index * input.intervalTicks, archetype: input.archetype, pathId: input.pathId });
    wave.events.sort((a, b) => a.tick - b.tick);
    this.replaceWavePlan(wavePlan);
    return null;
  }

  removeWaveEvent(waveIndex: number, eventIndex: number): void {
    const wavePlan = clone(this.current.wavePlan); const wave = wavePlan?.waves[waveIndex]; if (!wavePlan || !wave) return;
    wave.events.splice(eventIndex, 1);
    this.replaceWavePlan(wavePlan);
  }

  apply(tool: MapEditorTool, point: Coordinate): string | null {
    if (point.x < 0 || point.y < 0 || point.x >= this.current.width || point.y >= this.current.height) return "坐标超出地图";
    const next = clone(this.current);
    const removePoint = () => {
      if (next.base && same(next.base, point)) next.base = null;
      const removedSpawnIds = next.spawns.filter(spawn => same(spawn.position, point)).map(spawn => spawn.id);
      next.spawns = next.spawns.filter(spawn => !same(spawn.position, point));
      next.paths = next.paths.filter(path => !removedSpawnIds.includes(path.spawnId)).map(path => ({ ...path, tiles: path.tiles.filter(tile => !same(tile, point)) }));
      next.buildSlots = next.buildSlots.filter(cell => !same(cell, point));
      next.obstacles = next.obstacles.filter(cell => !same(cell, point));
    };
    if (tool === "erase") removePoint();
    else if (tool === "base") { removePoint(); next.base = point; }
    else if (tool === "spawn") {
      if (next.spawns.length >= 3) return "最多三个入口";
      removePoint();
      const index = next.spawns.length + 1; const spawnId = `spawn-${index}`;
      next.spawns.push({ id: spawnId, position: point }); next.paths.push({ id: `path-${index}`, spawnId, tiles: [point] });
      this.selectedPathId = `path-${index}`;
    } else if (tool === "build" || tool === "obstacle") {
      removePoint(); (tool === "build" ? next.buildSlots : next.obstacles).push(point);
    } else {
      const path = next.paths.find(candidate => candidate.id === this.selectedPathId) ?? next.paths.at(-1);
      if (!path) return "先放置入口";
      const last = path.tiles.at(-1)!;
      if (same(last, point)) return null;
      if (!adjacent(last, point)) return "路径只能绘制到相邻格";
      if (path.tiles.some(tile => same(tile, point))) return "同一路径不能重复经过一个格子";
      next.buildSlots = next.buildSlots.filter(cell => !same(cell, point));
      next.obstacles = next.obstacles.filter(cell => !same(cell, point));
      path.tiles.push(point);
    }
    this.commit(mapDraftSchema.parse(next));
    if (this.selectedPathId && !this.current.paths.some(path => path.id === this.selectedPathId)) this.selectedPathId = this.current.paths[0]?.id ?? null;
    return null;
  }

  undo(): void {
    const previous = this.undoStack.pop(); if (!previous) return;
    this.redoStack.push(clone(this.current)); this.current = previous;
  }

  redo(): void {
    const next = this.redoStack.pop(); if (!next) return;
    this.undoStack.push(clone(this.current)); this.current = next;
  }

  private commit(next: MapDraft): void {
    if (JSON.stringify(next) === JSON.stringify(this.current)) return;
    this.undoStack.push(clone(this.current));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.current = next;
  }
}
