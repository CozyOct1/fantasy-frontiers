import { DIFFICULTY_PROFILES, SeededRng, mapSpecSchema, type Coordinate, type Difficulty, type MapSpec } from "@fantasy-frontiers/shared";

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

export type MapValidationCode = "schema_invalid" | "missing_spawn" | "missing_base" | "path_missing" | "path_disconnected" | "spawn_mismatch" | "coordinate_out_of_bounds" | "duplicate_occupancy" | "build_slot_on_path" | "build_slot_on_obstacle" | "insufficient_build_slots";
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
  if (map.buildSlots.length < DIFFICULTY_PROFILES[map.difficulty].minimumBuildSlots) add("insufficient_build_slots", "Map has fewer build slots than its difficulty minimum", "buildSlots");
  return { valid: issues.length === 0, issues };
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
