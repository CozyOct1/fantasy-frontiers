import { z } from "zod";

export const difficultySchema = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof difficultySchema>;

export const themeFamilySchema = z.enum([
  "fantasy", "dark_fantasy", "oriental", "nature", "steampunk", "sci_fi", "cyberpunk", "ocean",
]);
export type ThemeFamily = z.infer<typeof themeFamilySchema>;

export const worldStatusSchema = z.enum([
  "draft", "generating", "generated", "evaluating", "ready", "published", "failed",
]);
export const worldSpecSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), summary: z.string(),
  playerFactionName: z.string().min(1), enemyFactionName: z.string().min(1),
  visualKeywords: z.array(z.string()), themeFamily: themeFamilySchema, status: worldStatusSchema,
});
export type WorldSpec = z.infer<typeof worldSpecSchema>;

export const towerArchetypeSchema = z.enum(["basic", "aoe", "slow", "heavy"]);
export type TowerArchetype = z.infer<typeof towerArchetypeSchema>;
export const enemyArchetypeSchema = z.enum(["normal", "fast", "tank", "boss"]);
export type EnemyArchetype = z.infer<typeof enemyArchetypeSchema>;

export const towerThemeEntrySchema = z.object({ archetype: towerArchetypeSchema, name: z.string().min(1), description: z.string() });
export const towerThemeSpecSchema = z.object({ worldId: z.string().min(1), entries: z.array(towerThemeEntrySchema).length(4) }).superRefine((value, context) => {
  const archetypes = value.entries.map(entry => entry.archetype);
  if (new Set(archetypes).size !== archetypes.length) context.addIssue({ code: "custom", message: "Tower archetypes must be unique", path: ["entries"] });
});
export type TowerThemeSpec = z.infer<typeof towerThemeSpecSchema>;
export const enemyThemeEntrySchema = z.object({ archetype: enemyArchetypeSchema, name: z.string().min(1), description: z.string() });
export const enemyThemeSpecSchema = z.object({ worldId: z.string().min(1), entries: z.array(enemyThemeEntrySchema).length(4) }).superRefine((value, context) => {
  const archetypes = value.entries.map(entry => entry.archetype);
  if (new Set(archetypes).size !== archetypes.length) context.addIssue({ code: "custom", message: "Enemy archetypes must be unique", path: ["entries"] });
});
export type EnemyThemeSpec = z.infer<typeof enemyThemeSpecSchema>;

export const levelThemeSpecSchema = z.object({
  id: z.string().min(1), difficulty: difficultySchema, name: z.string().min(1), story: z.string(),
  semanticTags: z.array(z.string()).default([]),
});
export type LevelThemeSpec = z.infer<typeof levelThemeSpecSchema>;
export const campaignSpecSchema = z.object({ id: z.string().min(1), worldId: z.string().min(1), name: z.string().min(1), levels: z.array(levelThemeSpecSchema).min(3) });
export type CampaignSpec = z.infer<typeof campaignSpecSchema>;

export const themeSpecSchema = z.object({
  themeFamily: themeFamilySchema, styleTags: z.array(z.string()), visualKeywords: z.array(z.string()),
  preferredColors: z.array(z.string()).max(5).default([]),
});
export type ThemeSpec = z.infer<typeof themeSpecSchema>;
export const worldSkinSchema = z.object({
  themePackId: z.string().min(1), colors: z.object({ primary: z.string(), secondary: z.string(), accent: z.string(), background: z.string(), text: z.string() }),
  assets: z.object({ backgroundId: z.string().min(1), panelId: z.string().min(1), buttonId: z.string().min(1), frameId: z.string().min(1), decorationIds: z.array(z.string()) }),
});
export type WorldSkin = z.infer<typeof worldSkinSchema>;

const generatedText = (max: number, min = 1) => z.string().min(min).max(max).refine(value => !(/https?:\/\/|file:\/\/|(?:assets|data|src)\/|(?:^|\s)\/\S+/i).test(value), "Generated semantic text cannot contain URLs or file paths");
export const worldIdentityOutputSchema = z.object({
  name: generatedText(48), summary: generatedText(240),
  playerFactionName: generatedText(40), enemyFactionName: generatedText(40),
  visualKeywords: z.array(generatedText(32)).min(2).max(8), themeFamily: themeFamilySchema,
}).strict();
export type WorldIdentityOutput = z.infer<typeof worldIdentityOutputSchema>;
const generatedTowerEntrySchema = z.object({ archetype: towerArchetypeSchema, name: generatedText(40), description: generatedText(180, 0) }).strict();
const generatedEnemyEntrySchema = z.object({ archetype: enemyArchetypeSchema, name: generatedText(40), description: generatedText(180, 0) }).strict();
export const towerThemeOutputSchema = z.object({ entries: z.array(generatedTowerEntrySchema).length(4) }).strict().superRefine((value, context) => {
  if (new Set(value.entries.map(entry => entry.archetype)).size !== value.entries.length) context.addIssue({ code: "custom", message: "Tower archetypes must be unique", path: ["entries"] });
});
export type TowerThemeOutput = z.infer<typeof towerThemeOutputSchema>;
export const enemyThemeOutputSchema = z.object({ entries: z.array(generatedEnemyEntrySchema).length(4) }).strict().superRefine((value, context) => {
  if (new Set(value.entries.map(entry => entry.archetype)).size !== value.entries.length) context.addIssue({ code: "custom", message: "Enemy archetypes must be unique", path: ["entries"] });
});
export type EnemyThemeOutput = z.infer<typeof enemyThemeOutputSchema>;
export const preferredTemplateTagSchema = z.enum(["curve", "single-entry", "straight", "merge", "two-entry", "parallel", "split", "three-entry", "independent", "ring"]);
export const campaignLevelOutputSchema = z.object({ difficulty: difficultySchema, name: generatedText(48), story: generatedText(360, 0), semanticTags: z.array(generatedText(32)).max(8), preferredTemplateTags: z.array(preferredTemplateTagSchema).max(4) }).strict();
export const campaignOutputSchema = z.object({ name: generatedText(64), levels: z.array(campaignLevelOutputSchema).length(3) }).strict().superRefine((value, context) => {
  const difficulties = value.levels.map(level => level.difficulty);
  if (new Set(difficulties).size !== 3 || !(["easy", "medium", "hard"] as const).every(difficulty => difficulties.includes(difficulty))) context.addIssue({ code: "custom", message: "Campaign must have exactly one Easy, Medium and Hard level", path: ["levels"] });
});
export type CampaignOutput = z.infer<typeof campaignOutputSchema>;
export const themeOutputSchema = themeSpecSchema.extend({ styleTags: z.array(generatedText(32)).max(8), visualKeywords: z.array(generatedText(32)).max(8), preferredColors: z.array(z.string()).max(5).default([]) }).strict().superRefine((value, context) => {
  value.preferredColors.forEach((color, index) => { if (!/^#[0-9a-fA-F]{6}$/.test(color)) context.addIssue({ code: "custom", message: "Preferred colors must be six-digit hex values", path: ["preferredColors", index] }); });
});
export type ThemeOutput = z.infer<typeof themeOutputSchema>;
export const worldGenerationRequestSchema = z.object({ prompt: z.string().trim().min(8).max(600), seed: z.number().int().nonnegative().optional() }).strict();
export type WorldGenerationRequest = z.infer<typeof worldGenerationRequestSchema>;
export const generationStepSchema = z.enum(["world_identity", "tower_theme", "enemy_theme", "campaign", "ui_theme", "asset_resolution", "map_generation", "completed"]);
export type GenerationStep = z.infer<typeof generationStepSchema>;
export const generationJobStatusSchema = z.enum(["queued", "running", "failed", "completed"]);
export const generationJobSchema = z.object({
  id: z.string().min(1), worldId: z.string().min(1), inputPrompt: z.string().min(1), seed: z.number().int().nonnegative(),
  status: generationJobStatusSchema, currentStep: generationStepSchema, retries: z.number().int().nonnegative(),
  error: z.string().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type GenerationJob = z.infer<typeof generationJobSchema>;
export const assetRecordSchema = z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9._-]+$/), path: z.string().regex(/^assets\/library\/[a-zA-Z0-9_./-]+$/).refine(path => !path.split("/").includes(".."), "Asset paths cannot traverse parent directories"), kind: z.enum(["background", "panel", "button", "frame", "decoration", "tower", "enemy", "tile"]), tags: z.array(z.string()), themeFamilies: z.array(themeFamilySchema), license: z.object({ spdx: z.string().min(1), attribution: z.string().min(1) }).strict() }).strict();
export const assetManifestSchema = z.object({ version: z.string().min(1), assets: z.array(assetRecordSchema) }).strict().superRefine((value, context) => {
  const ids = value.assets.map(asset => asset.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Asset IDs must be unique", path: ["assets"] });
});
export type AssetManifest = z.infer<typeof assetManifestSchema>;
export const themePresentationAssetSchema = z.object({
  terrainTileIds: z.array(z.string()).min(1), pathTileId: z.string(), buildSlotId: z.string(), spawnId: z.string(), baseId: z.string(),
  towerIds: z.record(towerArchetypeSchema, z.string()), enemyIds: z.record(enemyArchetypeSchema, z.string()),
  hudIconIds: z.record(z.string(), z.string()), decorationIds: z.array(z.string()), worldThumbnailId: z.string(), workshopEmptyId: z.string(),
}).strict();
export const themeAssetPackSchema = z.object({ id: z.string().min(1), themeFamily: themeFamilySchema, similarFamilies: z.array(themeFamilySchema), assets: z.object({ backgroundId: z.string(), panelId: z.string(), buttonId: z.string(), frameId: z.string(), decorationIds: z.array(z.string()) }).strict(), presentationAssets: themePresentationAssetSchema.optional(), colors: z.object({ primary: z.string(), secondary: z.string(), accent: z.string(), background: z.string(), text: z.string() }).strict() }).strict();
export const themeRegistrySchema = z.object({ version: z.string().min(1), packs: z.array(themeAssetPackSchema) }).strict();
export type ThemeRegistry = z.infer<typeof themeRegistrySchema>;

export const coordinateSchema = z.object({ x: z.number().int(), y: z.number().int() });
export type Coordinate = z.infer<typeof coordinateSchema>;
export const mapPathSchema = z.object({ id: z.string().min(1), spawnId: z.string().min(1), tiles: z.array(coordinateSchema).min(2) });
export const mapSpecSchema = z.object({
  id: z.string().min(1), templateId: z.string().min(1), difficulty: difficultySchema,
  width: z.number().int().positive(), height: z.number().int().positive(), seed: z.number().int().nonnegative(),
  spawns: z.array(z.object({ id: z.string().min(1), position: coordinateSchema })).min(1),
  base: coordinateSchema, paths: z.array(mapPathSchema).min(1), buildSlots: z.array(coordinateSchema),
  obstacles: z.array(coordinateSchema).default([]), tags: z.array(z.string()).default([]),
});
export type MapSpec = z.infer<typeof mapSpecSchema>;

export const towerStateSchema = z.object({ id: z.string(), archetype: towerArchetypeSchema, level: z.number().int().positive(), position: coordinateSchema, cooldown: z.number().nonnegative() });
export const enemyStateSchema = z.object({ id: z.string(), archetype: enemyArchetypeSchema, hp: z.number().nonnegative(), maxHp: z.number().positive(), pathId: z.string(), pathProgress: z.number().nonnegative(), slowUntil: z.number().nonnegative() });
export const gameStatusSchema = z.enum(["ready", "running", "paused", "won", "lost"]);
export const gameStatsSchema = z.object({
  enemiesSpawned: z.number().int().nonnegative(), enemiesKilled: z.number().int().nonnegative(), enemiesLeaked: z.number().int().nonnegative(),
  goldEarned: z.number().nonnegative(), goldSpent: z.number().nonnegative(), towersBuilt: z.number().int().nonnegative(),
  towerUsage: z.record(z.string(), z.number().nonnegative()),
});
export const gameStateSchema = z.object({
  levelId: z.string(), status: gameStatusSchema, hp: z.number().nonnegative(), maxHp: z.number().positive(),
  gold: z.number().nonnegative(), waveIndex: z.number().int().nonnegative(), totalWaves: z.number().int().positive(),
  towers: z.array(towerStateSchema), enemies: z.array(enemyStateSchema), elapsedTime: z.number().nonnegative(), seed: z.number().int().nonnegative(),
  activeWaveQueue: z.array(enemyArchetypeSchema), spawnTimer: z.number().nonnegative(), nextEntityId: z.number().int().positive(), stats: gameStatsSchema,
});
export type GameState = z.infer<typeof gameStateSchema>;
export const gameActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("placeTower"), archetype: towerArchetypeSchema, position: coordinateSchema }),
  z.object({ type: z.literal("upgradeTower"), towerId: z.string().min(1) }),
  z.object({ type: z.literal("startWave") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
]);
export type GameAction = z.infer<typeof gameActionSchema>;
export const gameObservationSchema = z.object({
  state: gameStateSchema, map: mapSpecSchema, affordableTowerArchetypes: z.array(towerArchetypeSchema),
  legalBuildSlots: z.array(coordinateSchema), selectedTowerId: z.string().nullable(),
});
export type GameObservation = z.infer<typeof gameObservationSchema>;

export const gameResultSchema = z.object({
  levelId: z.string(), seed: z.number().int().nonnegative(), win: z.boolean(), remainingHp: z.number().nonnegative(), maxHp: z.number().positive(),
  startingGold: z.number().nonnegative(), remainingGold: z.number().nonnegative(),
  waveReached: z.number().int().nonnegative(), totalWaves: z.number().int().positive(), enemiesSpawned: z.number().int().nonnegative(),
  enemiesKilled: z.number().int().nonnegative(), enemiesLeaked: z.number().int().nonnegative(), goldEarned: z.number().nonnegative(),
  goldSpent: z.number().nonnegative(), towersBuilt: z.number().int().nonnegative(), towerUsage: z.record(z.string(), z.number().nonnegative()), duration: z.number().nonnegative(),
});
export type GameResult = z.infer<typeof gameResultSchema>;
export const simulationActionRecordSchema = z.object({ tick: z.number().int().nonnegative(), action: gameActionSchema, accepted: z.boolean(), reason: z.string().optional() });
export const simulationWaveResultSchema = z.object({
  waveIndex: z.number().int().positive(), completed: z.boolean(), startingHp: z.number().nonnegative(), remainingHp: z.number().nonnegative(),
  enemiesSpawned: z.number().int().nonnegative(), enemiesKilled: z.number().int().nonnegative(), enemiesLeaked: z.number().int().nonnegative(),
  goldEarned: z.number().nonnegative(), goldSpent: z.number().nonnegative(), towerUsage: z.record(z.string(), z.number().nonnegative()), ticks: z.number().int().nonnegative(),
});
export const simulationRunSchema = z.object({
  id: z.string().min(1), resultId: z.string().min(1), mapId: z.string().min(1), map: mapSpecSchema,
  seed: z.number().int().nonnegative(), configVersion: z.string().min(1), configuration: z.record(z.string(), z.unknown()),
  policyId: z.string().min(1), policyVersion: z.string().min(1), totalTicks: z.number().int().nonnegative(),
  actions: z.array(simulationActionRecordSchema), waves: z.array(simulationWaveResultSchema), result: gameResultSchema,
});
export type SimulationRun = z.infer<typeof simulationRunSchema>;
export const evaluationMetricsSchema = z.object({
  runs: z.number().int().nonnegative(), wins: z.number().int().nonnegative(), winRate: z.number().min(0).max(1),
  avgRemainingHp: z.number().nonnegative(), medianRemainingHp: z.number().nonnegative(), leakRate: z.number().min(0).max(1), avgFailureWave: z.number().nonnegative(),
  avgGoldSpent: z.number().nonnegative(), avgGoldEarned: z.number().nonnegative(), resourceUtilization: z.number().min(0).max(1),
  towerUsageDistribution: z.record(z.string(), z.number().nonnegative()), dominantTowerRatio: z.number().min(0).max(1), avgDuration: z.number().nonnegative(),
});
export type EvaluationMetrics = z.infer<typeof evaluationMetricsSchema>;
export const evaluationReportSchema = z.object({
  id: z.string().min(1), worldId: z.string().min(1), levelId: z.string().min(1), agentVersion: z.string().min(1),
  summary: z.string(), findings: z.array(z.string()), recommendation: z.enum(["balanced", "needs_tuning", "needs_more_testing"]),
  policies: z.array(z.string().min(1)), seeds: z.array(z.number().int().nonnegative()), runIds: z.array(z.string()), resultIds: z.array(z.string()),
  metricsSnapshotId: z.string().min(1), metrics: evaluationMetricsSchema, createdAt: z.string().datetime(),
});
export type EvaluationReport = z.infer<typeof evaluationReportSchema>;
export const evaluationRecordSchema = z.object({
  id: z.string().min(1), worldId: z.string().min(1), levelId: z.string().min(1), status: z.enum(["queued", "running", "failed", "completed"]),
  agentVersion: z.string().min(1), report: evaluationReportSchema.nullable(), error: z.string().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type EvaluationRecord = z.infer<typeof evaluationRecordSchema>;

// Persistent application/API contracts. These extend the gameplay schemas above without
// introducing a second MapSpec or GameResult definition.
export const levelRecordSchema = z.object({
  id: z.string().min(1), worldId: z.string().min(1), difficulty: difficultySchema,
  name: z.string().min(1), story: z.string(), map: mapSpecSchema,
});
export type LevelRecord = z.infer<typeof levelRecordSchema>;
export const playerProgressSchema = z.object({
  playerId: z.string().min(1), levelId: z.string().min(1), unlocked: z.boolean(), completed: z.boolean(),
  bestWin: z.boolean().nullable(), bestRemainingHp: z.number().nonnegative().nullable(), bestDuration: z.number().nonnegative().nullable(),
  updatedAt: z.string().datetime(),
});
export type PlayerProgress = z.infer<typeof playerProgressSchema>;
export const gameRunStartSchema = z.object({ runId: z.string().min(1), levelId: z.string().min(1), seed: z.number().int().nonnegative(), map: mapSpecSchema });
export type GameRunStart = z.infer<typeof gameRunStartSchema>;
export const gameRunStartRequestSchema = z.object({ playerId: z.string().min(1).optional(), seed: z.number().int().nonnegative().optional() }).strict();
export type GameRunStartRequest = z.infer<typeof gameRunStartRequestSchema>;
export const gameRunResultRequestSchema = z.object({ runId: z.string().min(1), result: gameResultSchema });
export type GameRunResultRequest = z.infer<typeof gameRunResultRequestSchema>;
