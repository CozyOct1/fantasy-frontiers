import { DIFFICULTY_PROFILES, GAME_CONFIG, SeededRng, mapDraftSchema, mapSpecSchema, wavePlanSchema, type Coordinate, type Difficulty, type EnemyArchetype, type MapDraft, type MapSpec, type WavePlan, type WavePlanDraft } from "@fantasy-frontiers/shared";

export const MAP_VALIDATOR_VERSION = "v2.0.0";

export interface MapTemplate {
  readonly id: string;
  readonly difficulty: Difficulty;
  readonly tags: readonly string[];
  readonly paths: readonly (readonly Coordinate[])[];
}

const line = (from: Coordinate, to: Coordinate): Coordinate[] => {
  const points: Coordinate[] = [];
  let x = from.x;
  let y = from.y;
  points.push({ x, y });
  while (x !== to.x) { x += Math.sign(to.x - x); points.push({ x, y }); }
  while (y !== to.y) { y += Math.sign(to.y - y); points.push({ x, y }); }
  return points;
};
const route = (...points: Coordinate[]): Coordinate[] => points.slice(1).reduce<Coordinate[]>((path, point) => [...path, ...line(path.at(-1)!, point).slice(1)], [points[0]!]);

const pathData = {
  easy_s_curve: [route({ x: 0, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 6 }, { x: 11, y: 6 })],
  easy_long_lane: [route({ x: 0, y: 4 }, { x: 11, y: 4 })],
  easy_early_merge: [route({ x: 0, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 11, y: 4 }), route({ x: 0, y: 7 }, { x: 4, y: 7 }, { x: 4, y: 4 }, { x: 11, y: 4 })],
  medium_dual_merge: [route({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 3 }, { x: 11, y: 3 }), route({ x: 0, y: 7 }, { x: 5, y: 7 }, { x: 5, y: 3 }, { x: 11, y: 3 })],
  medium_parallel: [route({ x: 0, y: 1 }, { x: 11, y: 1 }, { x: 11, y: 4 }), route({ x: 0, y: 6 }, { x: 11, y: 6 }, { x: 11, y: 4 })],
  medium_split_merge: [route({ x: 0, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 11, y: 4 }), route({ x: 0, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 4 }, { x: 11, y: 4 })],
  hard_three_entry: [route({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 11, y: 4 }), route({ x: 0, y: 4 }, { x: 5, y: 4 }, { x: 11, y: 4 }), route({ x: 0, y: 7 }, { x: 5, y: 7 }, { x: 5, y: 4 }, { x: 11, y: 4 })],
  hard_independent_lanes: [route({ x: 0, y: 1 }, { x: 11, y: 1 }, { x: 11, y: 4 }), route({ x: 0, y: 6 }, { x: 11, y: 6 }, { x: 11, y: 4 })],
  hard_ring_pressure: [route({ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 5 }, { x: 3, y: 5 }, { x: 3, y: 7 }, { x: 11, y: 7 })],
} satisfies Record<string, Coordinate[][]>;

const benchmarkPaths = {
  easy: [route({ x: 0, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 6 }, { x: 11, y: 6 })],
  medium: [route({ x: 0, y: 1 }, { x: 7, y: 1 }, { x: 7, y: 4 }, { x: 11, y: 4 }), route({ x: 0, y: 7 }, { x: 7, y: 7 }, { x: 7, y: 4 }, { x: 11, y: 4 })],
  hard: [route({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 5 }, { x: 11, y: 5 }), route({ x: 0, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 5 }, { x: 11, y: 5 })],
} satisfies Record<Difficulty, Coordinate[][]>;

const benchmarkSlots: Record<Difficulty, Coordinate[]> = {
  easy: [{ x: 2, y: 0 }, { x: 4, y: 2 }, { x: 7, y: 2 }, { x: 9, y: 2 }, { x: 6, y: 4 }, { x: 9, y: 5 }, { x: 7, y: 7 }, { x: 10, y: 7 }, { x: 3, y: 4 }, { x: 1, y: 3 }],
  medium: [{ x: 2, y: 0 }, { x: 4, y: 2 }, { x: 6, y: 3 }, { x: 8, y: 3 }, { x: 9, y: 5 }, { x: 6, y: 6 }, { x: 3, y: 6 }, { x: 10, y: 2 }],
  hard: [{ x: 2, y: 1 }, { x: 3, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 6 }, { x: 9, y: 4 }, { x: 10, y: 6 }],
};

const benchmarkSequence: Record<Difficulty, readonly EnemyArchetype[]> = {
  easy: ["normal", "normal", "fast", "normal", "fast", "tank"],
  medium: ["normal", "fast", "normal", "tank", "fast", "tank", "normal", "tank"],
  hard: ["fast", "normal", "tank", "fast", "tank", "normal", "tank", "fast", "tank", "boss"],
};

function buildAuthoredWavePlan(difficulty: Difficulty, paths: readonly { id: string }[], id: string): WavePlan {
  const profile = GAME_CONFIG.difficulty[difficulty];
  const waves = benchmarkSequence[difficulty].map((focus, waveIndex) => {
    const count = profile.waveSizeBase + waveIndex * profile.waveSizeGrowth;
    const support: EnemyArchetype = focus === "boss" ? "tank" : focus === "tank" ? "normal" : focus;
    const events = Array.from({ length: count }, (_, enemyIndex) => ({
      tick: enemyIndex * Math.max(8, Math.round(profile.spawnInterval * GAME_CONFIG.simulation.tickRate)),
      archetype: enemyIndex % 3 === 2 ? support : focus,
      pathId: paths[enemyIndex % paths.length]!.id,
    }));
    if (focus === "boss") events[events.length - 1] = { ...events[events.length - 1]!, archetype: "boss" };
    return { index: waveIndex + 1, label: focus === "fast" ? "迅捷突袭" : focus === "tank" ? "重甲推进" : focus === "boss" ? "裂隙领主" : "前线试探", events };
  });
  return wavePlanSchema.parse({ version: 1, id, tickRate: GAME_CONFIG.simulation.tickRate, waves });
}

/** V5 authored content candidates: fixed positions and explicit waves, never LLM coordinates. */
export function createBenchmarkContent(difficulty: Difficulty, id = `benchmark-${difficulty}`): { map: MapSpec; wavePlan: WavePlan } {
  const paths = benchmarkPaths[difficulty].map((tiles, index) => ({ id: `path-${index + 1}`, spawnId: `spawn-${index + 1}`, tiles: cloneCoordinates(tiles) }));
  const map = mapSpecSchema.parse({
    id, templateId: `v5-${difficulty}-authored`, difficulty, width: 12, height: 8, seed: { easy: 70421, medium: 70422, hard: 70423 }[difficulty],
    spawns: paths.map((path, index) => ({ id: `spawn-${index + 1}`, position: { ...path.tiles[0]! } })), base: { ...paths[0]!.tiles.at(-1)! },
    paths, buildSlots: benchmarkSlots[difficulty], obstacles: [], tags: ["authored", difficulty, difficulty === "easy" ? "curve" : "two-entry"],
  });
  const validation = validateMapSpec(map);
  if (!validation.valid) throw new Error(`Invalid benchmark map: ${validation.issues.map(issue => issue.code).join(",")}`);
  return { map, wavePlan: buildAuthoredWavePlan(difficulty, paths, `${id}-waves`) };
}

function cloneCoordinates(points: readonly Coordinate[]): Coordinate[] { return points.map(point => ({ ...point })); }

export const MAP_TEMPLATES: readonly MapTemplate[] = [
  { id: "easy_s_curve", difficulty: "easy", tags: ["curve", "single-entry"], paths: pathData.easy_s_curve },
  { id: "easy_long_lane", difficulty: "easy", tags: ["straight", "single-entry"], paths: pathData.easy_long_lane },
  { id: "easy_early_merge", difficulty: "easy", tags: ["merge", "two-entry"], paths: pathData.easy_early_merge },
  { id: "medium_dual_merge", difficulty: "medium", tags: ["merge", "two-entry"], paths: pathData.medium_dual_merge },
  { id: "medium_parallel", difficulty: "medium", tags: ["parallel", "two-entry"], paths: pathData.medium_parallel },
  { id: "medium_split_merge", difficulty: "medium", tags: ["split", "merge", "two-entry"], paths: pathData.medium_split_merge },
  { id: "hard_three_entry", difficulty: "hard", tags: ["three-entry", "merge"], paths: pathData.hard_three_entry },
  { id: "hard_independent_lanes", difficulty: "hard", tags: ["independent", "two-entry"], paths: pathData.hard_independent_lanes },
  { id: "hard_ring_pressure", difficulty: "hard", tags: ["ring", "single-entry"], paths: pathData.hard_ring_pressure },
];

export type MapValidationCode = "schema_invalid" | "missing_spawn" | "missing_base" | "path_missing" | "path_disconnected" | "spawn_mismatch" | "coordinate_out_of_bounds" | "duplicate_occupancy" | "build_slot_on_path" | "build_slot_on_obstacle" | "obstacle_on_path" | "landmark_conflict" | "insufficient_build_slots";
export interface MapValidationIssue { code: MapValidationCode; message: string; path?: string }
export interface MapValidationResult { valid: boolean; issues: MapValidationIssue[] }

const key = ({ x, y }: Coordinate): string => `${x},${y}`;
const inBounds = (point: Coordinate, map: MapSpec): boolean => point.x >= 0 && point.y >= 0 && point.x < map.width && point.y < map.height;

export function validateMapSpec(input: unknown): MapValidationResult {
  const parsed = mapSpecSchema.safeParse(input);
  if (!parsed.success) return { valid: false, issues: [{ code: "schema_invalid", message: parsed.error.message }] };
  const map = parsed.data;
  const issues: MapValidationIssue[] = [];
  const add = (code: MapValidationCode, message: string, path?: string) => issues.push({ code, message, ...(path ? { path } : {}) });
  if (map.spawns.length === 0) add("missing_spawn", "At least one spawn is required", "spawns");
  if (!map.base) add("missing_base", "A base coordinate is required", "base");
  if (map.paths.length === 0) add("path_missing", "At least one path is required", "paths");

  for (const [name, positions] of [["spawn", map.spawns.map(s => s.position)], ["base", [map.base]], ["path", map.paths.flatMap(p => p.tiles)], ["buildSlot", map.buildSlots], ["obstacle", map.obstacles]] as const) {
    positions.forEach((point, index) => { if (!inBounds(point, map)) add("coordinate_out_of_bounds", `${name} coordinate is outside the map`, `${name}[${index}]`); });
  }
  const spawnById = new Map(map.spawns.map(spawn => [spawn.id, spawn]));
  if (spawnById.size !== map.spawns.length) add("duplicate_occupancy", "Spawn ids must be unique", "spawns");
  if (new Set(map.spawns.map(spawn => key(spawn.position))).size !== map.spawns.length) add("duplicate_occupancy", "Spawns cannot occupy the same coordinate", "spawns");
  const pathIds = new Set<string>();
  for (const [index, path] of map.paths.entries()) {
    if (pathIds.has(path.id)) add("duplicate_occupancy", `Duplicate path id: ${path.id}`, `paths[${index}].id`);
    pathIds.add(path.id);
    const spawn = spawnById.get(path.spawnId);
    if (!spawn) { add("missing_spawn", `Path references unknown spawn: ${path.spawnId}`, `paths[${index}].spawnId`); continue; }
    if (key(path.tiles[0]!) !== key(spawn.position)) add("spawn_mismatch", `Path ${path.id} must start at its spawn`, `paths[${index}].tiles[0]`);
    if (key(path.tiles.at(-1)!) !== key(map.base)) add("path_disconnected", `Path ${path.id} does not reach the base`, `paths[${index}].tiles`);
    for (let tileIndex = 1; tileIndex < path.tiles.length; tileIndex++) {
      const a = path.tiles[tileIndex - 1]!; const b = path.tiles[tileIndex]!;
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) add("path_disconnected", `Path ${path.id} has non-adjacent tiles`, `paths[${index}].tiles[${tileIndex}]`);
    }
    const uniqueTiles = new Set(path.tiles.map(key));
    if (uniqueTiles.size !== path.tiles.length) add("duplicate_occupancy", `Path ${path.id} visits a tile more than once`, `paths[${index}].tiles`);
  }
  for (const spawn of map.spawns) if (!map.paths.some(path => path.spawnId === spawn.id)) add("path_missing", `Spawn ${spawn.id} has no path`, "paths");
  const pathCells = new Set(map.paths.flatMap(path => path.tiles.map(key)));
  const slotCells = map.buildSlots.map(key);
  if (new Set(slotCells).size !== slotCells.length) add("duplicate_occupancy", "Build slots contain duplicate coordinates", "buildSlots");
  map.buildSlots.forEach((slot, index) => {
    if (pathCells.has(key(slot))) add("build_slot_on_path", "Build slot overlaps a path", `buildSlots[${index}]`);
    if (map.obstacles.some(obstacle => key(obstacle) === key(slot))) add("build_slot_on_obstacle", "Build slot overlaps an obstacle", `buildSlots[${index}]`);
  });
  if (new Set(map.obstacles.map(key)).size !== map.obstacles.length) add("duplicate_occupancy", "Obstacles contain duplicate coordinates", "obstacles");
  map.obstacles.forEach((obstacle, index) => {
    if (pathCells.has(key(obstacle))) add("obstacle_on_path", "Obstacle overlaps a path", `obstacles[${index}]`);
    if (key(obstacle) === key(map.base) || map.spawns.some(spawn => key(spawn.position) === key(obstacle))) add("landmark_conflict", "Obstacle overlaps a base or spawn", `obstacles[${index}]`);
  });
  if (map.spawns.some(spawn => key(spawn.position) === key(map.base))) add("landmark_conflict", "Base and spawn cannot share a coordinate", "base");
  if (map.buildSlots.length < DIFFICULTY_PROFILES[map.difficulty].minimumBuildSlots) add("insufficient_build_slots", "Map has fewer build slots than its difficulty minimum", "buildSlots");
  return { valid: issues.length === 0, issues };
}

export type CompileMapDraftResult = { ok: true; map: MapSpec } | { ok: false; issues: MapValidationIssue[] };

export type LevelDraftValidationCode = MapValidationCode | "missing_wave_plan" | "missing_wave" | "empty_wave" | "wave_index_invalid" | "wave_tick_rate_invalid" | "wave_path_missing";
export interface LevelDraftValidationIssue { code: LevelDraftValidationCode; message: string; path?: string }
export type CompileLevelDraftResult = { ok: true; map: MapSpec; wavePlan: WavePlan } | { ok: false; issues: LevelDraftValidationIssue[] };

/** Compiles authoring state into the one canonical runtime MapSpec. */
export function compileMapDraft(input: unknown): CompileMapDraftResult {
  const parsed = mapDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: [{ code: "schema_invalid", message: parsed.error.message }] };
  const draft = parsed.data;
  const early: MapValidationIssue[] = [];
  if (!draft.base) early.push({ code: "missing_base", message: "Place a base before playtesting", path: "base" });
  if (draft.spawns.length === 0) early.push({ code: "missing_spawn", message: "Place at least one spawn", path: "spawns" });
  if (draft.paths.length === 0) early.push({ code: "path_missing", message: "Draw a path from every spawn to the base", path: "paths" });
  if (early.length > 0 || !draft.base) return { ok: false, issues: early };
  const map = mapSpecSchema.parse({
    id: `${draft.id}-preview-r${draft.revision}`, templateId: `authored-${draft.id}`, difficulty: draft.difficulty,
    width: draft.width, height: draft.height, seed: draft.seed, spawns: draft.spawns, base: draft.base,
    paths: draft.paths, buildSlots: draft.buildSlots, obstacles: draft.obstacles, tags: [...draft.tags, "authored"],
  });
  const validation = validateMapSpec(map);
  return validation.valid ? { ok: true, map } : { ok: false, issues: validation.issues };
}

/** Produces a controlled starting plan which designers may edit; it never changes tower/enemy stats. */
export function createWavePlanDraftForMap(map: MapSpec, id = `${map.id}-waves`): WavePlanDraft {
  return buildAuthoredWavePlan(map.difficulty, map.paths, id);
}

/** Compiles the complete authoring source into canonical runtime map and wave data. */
export function compileLevelDraft(input: unknown): CompileLevelDraftResult {
  const parsed = mapDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: [{ code: "schema_invalid", message: parsed.error.message }] };
  const mapResult = compileMapDraft(parsed.data);
  if (!mapResult.ok) return mapResult;
  const source = parsed.data.wavePlan;
  if (!source) return { ok: false, issues: [{ code: "missing_wave_plan", message: "Create or import an enemy wave plan before playtesting", path: "wavePlan" }] };
  const issues: LevelDraftValidationIssue[] = [];
  if (source.tickRate !== GAME_CONFIG.simulation.tickRate) issues.push({ code: "wave_tick_rate_invalid", message: `Wave tick rate must be ${GAME_CONFIG.simulation.tickRate}`, path: "wavePlan.tickRate" });
  if (source.waves.length === 0) issues.push({ code: "missing_wave", message: "Add at least one wave", path: "wavePlan.waves" });
  const pathIds = new Set(mapResult.map.paths.map(path => path.id));
  source.waves.forEach((wave, waveIndex) => {
    if (wave.index !== waveIndex + 1) issues.push({ code: "wave_index_invalid", message: "Wave indices must be continuous and start at 1", path: `wavePlan.waves[${waveIndex}].index` });
    if (wave.events.length === 0) issues.push({ code: "empty_wave", message: `Wave ${waveIndex + 1} has no enemies`, path: `wavePlan.waves[${waveIndex}].events` });
    wave.events.forEach((event, eventIndex) => {
      if (!pathIds.has(event.pathId)) issues.push({ code: "wave_path_missing", message: `Wave ${waveIndex + 1} references missing path ${event.pathId}`, path: `wavePlan.waves[${waveIndex}].events[${eventIndex}].pathId` });
    });
  });
  if (issues.length > 0) return { ok: false, issues };
  const wavePlan = wavePlanSchema.parse({ ...source, waves: source.waves.map((wave, index) => ({ ...wave, index: index + 1, events: [...wave.events].sort((a, b) => a.tick - b.tick) })) });
  return { ok: true, map: mapResult.map, wavePlan };
}

export function draftFromMap(map: MapSpec, id = `draft-${map.id}`, wavePlan: WavePlanDraft = createWavePlanDraftForMap(map, `${id}-waves`)): MapDraft {
  return mapDraftSchema.parse({
    id, schemaVersion: 1, revision: 0, name: map.id, notes: "", difficulty: map.difficulty,
    width: map.width, height: map.height, seed: map.seed, base: map.base, spawns: map.spawns,
    paths: map.paths, buildSlots: map.buildSlots, obstacles: map.obstacles, tags: map.tags, wavePlan,
  });
}

export interface GenerateMapOptions {
  difficulty: Difficulty; seed: number; preferredTags?: readonly string[]; previousTemplateIds?: readonly string[]; maxRetries?: number;
}
export type GenerateMapResult =
  | { ok: true; map: MapSpec; attempts: number }
  | { ok: false; code: "no_template_available" | "invalid_generated_map" | "retry_limit_exceeded"; message: string; attempts: number; issues: MapValidationIssue[] };

export function selectMapTemplate(options: Pick<GenerateMapOptions, "difficulty" | "seed" | "preferredTags" | "previousTemplateIds">): MapTemplate | undefined {
  const used = new Set(options.previousTemplateIds ?? []);
  let candidates = MAP_TEMPLATES.filter(template => template.difficulty === options.difficulty && !used.has(template.id));
  if (candidates.length === 0) return undefined;
  const preferred = options.preferredTags ?? [];
  if (preferred.length > 0) {
    const matching = candidates.filter(template => template.tags.some(tag => preferred.includes(tag)));
    if (matching.length > 0) candidates = matching;
  }
  return new SeededRng(options.seed).pick(candidates);
}

function parameterize(template: MapTemplate, seed: number, attempt: number): MapSpec {
  const rng = new SeededRng(seed + attempt);
  const width = 12; const height = 8;
  const mirror = rng.int(0, 1) === 1;
  const basePaths = template.paths.map(path => path.map(point => ({ x: mirror ? width - 1 - point.x : point.x, y: point.y })));
  const base = basePaths[0]!.at(-1)!;
  const spawns = basePaths.map((path, index) => ({ id: `spawn-${index + 1}`, position: path[0]! }));
  const paths = basePaths.map((tiles, index) => ({ id: `path-${index + 1}`, spawnId: spawns[index]!.id, tiles }));
  const occupied = new Set(basePaths.flatMap(path => path.map(key)));
  const free: Coordinate[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (!occupied.has(`${x},${y}`)) free.push({ x, y });
  const [minimum, maximum] = DIFFICULTY_PROFILES[template.difficulty].buildSlotRange;
  const slotCount = Math.min(rng.int(minimum, maximum), free.length);
  const buildSlots = rng.shuffle(free).slice(0, slotCount);
  return {
    id: `${template.id}-${seed >>> 0}`, templateId: template.id, difficulty: template.difficulty, width, height,
    seed: seed >>> 0, spawns, base, paths, buildSlots, obstacles: [], tags: [...template.tags],
  };
}

export function generateMap(options: GenerateMapOptions): GenerateMapResult {
  const maxRetries = options.maxRetries ?? 3;
  if (!Number.isSafeInteger(options.seed) || options.seed < 0) return { ok: false, code: "invalid_generated_map", message: "Seed must be a non-negative safe integer", attempts: 0, issues: [] };
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 1 || maxRetries > 10) return { ok: false, code: "retry_limit_exceeded", message: "maxRetries must be between 1 and 10", attempts: 0, issues: [] };
  const used = new Set(options.previousTemplateIds ?? []);
  const eligible = MAP_TEMPLATES.filter(template => template.difficulty === options.difficulty && !used.has(template.id));
  if (eligible.length === 0) return { ok: false, code: "no_template_available", message: `No unused ${options.difficulty} map template is available`, attempts: 0, issues: [] };
  const template = selectMapTemplate(options);
  if (!template) return { ok: false, code: "no_template_available", message: `No unused ${options.difficulty} map template is available`, attempts: 0, issues: [] };
  let issues: MapValidationIssue[] = [];
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const map = parameterize(template, options.seed, attempt);
    const validation = validateMapSpec(map);
    if (validation.valid) return { ok: true, map, attempts: attempt + 1 };
    issues = validation.issues;
  }
  return { ok: false, code: issues.length ? "retry_limit_exceeded" : "invalid_generated_map", message: `Could not generate a valid ${options.difficulty} map within ${maxRetries} attempts`, attempts: maxRetries, issues };
}
