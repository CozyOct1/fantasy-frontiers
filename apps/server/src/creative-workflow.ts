import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SeededRng, campaignOutputSchema, campaignSpecSchema, enemyThemeOutputSchema, enemyThemeSpecSchema, mapSpecSchema, themeOutputSchema, towerThemeOutputSchema, towerThemeSpecSchema, worldIdentityOutputSchema, worldSkinSchema, worldSpecSchema, type CampaignSpec, type Difficulty, type EnemyThemeSpec, type GenerationStep, type LevelRecord, type TowerThemeSpec, type WorldSpec } from "@fantasy-frontiers/shared";
import { generateMap, validateMapSpec } from "@fantasy-frontiers/maps";
import { DeepSeekError, type JsonModel } from "./deepseek.js";
import { AppStore } from "./store.js";
import { loadAssetLibrary, resolveWorldTheme } from "./theme-resolver.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const prompt = (name: string) => readFileSync(resolve(root, "prompts", name), "utf8");
const MAX_STAGE_ATTEMPTS = 2;
const MAX_MANUAL_RETRIES = 3;
const stageOrder: readonly GenerationStep[] = ["world_identity", "tower_theme", "enemy_theme", "campaign", "ui_theme", "asset_resolution", "map_generation", "completed"];
const next = (step: GenerationStep) => stageOrder[stageOrder.indexOf(step) + 1]!;
const parseStored = <T>(stages: Record<string, unknown>, key: string, schema: { parse(value: unknown): T }): T => schema.parse(stages[key]);

export class CreativeWorkflow {
  private readonly active = new Map<string, Promise<void>>();
  constructor(private readonly store: AppStore, private readonly model: JsonModel) {}

  launch(jobId: string): void {
    if (this.active.has(jobId)) return;
    const task = this.run(jobId).finally(() => this.active.delete(jobId));
    this.active.set(jobId, task);
  }

  retry(jobId: string) {
    const job = this.store.retryGeneration(jobId, MAX_MANUAL_RETRIES);
    if (job) this.launch(jobId);
    return job;
  }

  private async generate<T>(systemPrompt: string, input: unknown, schema: { parse(value: unknown): T }, stage: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_STAGE_ATTEMPTS; attempt++) {
      try { return schema.parse(await this.model.completeJson({ systemPrompt, userInput: input })); }
      catch (error) {
        lastError = error;
        if (error instanceof DeepSeekError && !error.retryable) break;
      }
    }
    const reason = lastError instanceof DeepSeekError ? lastError.message : "model output did not pass the stage schema";
    throw new Error(`${stage}: ${reason}`);
  }

  private async run(jobId: string): Promise<void> {
    try {
      let stored = this.store.getGeneration(jobId);
      if (!stored) return;
      if (stored.job.status === "queued") this.store.startGeneration(jobId);
      else if (stored.job.status !== "running") return;
      stored = this.store.getGeneration(jobId)!;
      const { job } = stored;
      const stages = stored.stages;
      let step = job.currentStep;
      while (step !== "completed") {
        if (step === "world_identity") {
          stages.world_identity = await this.generate(prompt("world-identity.prompt.md"), { concept: job.inputPrompt }, worldIdentityOutputSchema, step);
        } else if (step === "tower_theme") {
          stages.tower_theme = await this.generate(prompt("tower-theme.prompt.md"), { concept: job.inputPrompt, world: stages.world_identity }, towerThemeOutputSchema, step);
        } else if (step === "enemy_theme") {
          stages.enemy_theme = await this.generate(prompt("enemy-theme.prompt.md"), { concept: job.inputPrompt, world: stages.world_identity }, enemyThemeOutputSchema, step);
        } else if (step === "campaign") {
          stages.campaign = await this.generate(prompt("campaign.prompt.md"), { concept: job.inputPrompt, world: stages.world_identity }, campaignOutputSchema, step);
        } else if (step === "ui_theme") {
          stages.ui_theme = await this.generate(prompt("ui-theme.prompt.md"), { world: stages.world_identity, campaign: stages.campaign }, themeOutputSchema, step);
        } else if (step === "asset_resolution") {
          const library = loadAssetLibrary();
          const resolution = resolveWorldTheme(parseStored(stages, "ui_theme", themeOutputSchema), library.manifest, library.registry);
          stages.asset_resolution = { match: resolution.match, packId: resolution.packId, skin: resolution.skin };
        } else if (step === "map_generation") {
          const artifacts = this.buildArtifacts(job.worldId, job.seed, stages);
          stages.generated_artifacts = artifacts;
          this.store.completeGeneration({ jobId, ...artifacts, stages });
          return;
        }
        const following = next(step);
        this.store.updateGenerationStage(jobId, following, stages);
        step = following;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 320) : "Generation failed";
      this.store.failGeneration(jobId, message);
    }
  }

  private buildArtifacts(worldId: string, seed: number, stages: Record<string, unknown>): {
    world: WorldSpec; towerTheme: TowerThemeSpec; enemyTheme: EnemyThemeSpec; campaign: CampaignSpec; skin: import("@fantasy-frontiers/shared").WorldSkin; levels: LevelRecord[];
  } {
    const identity = parseStored(stages, "world_identity", worldIdentityOutputSchema);
    const towerOutput = parseStored(stages, "tower_theme", towerThemeOutputSchema);
    const enemyOutput = parseStored(stages, "enemy_theme", enemyThemeOutputSchema);
    const campaignOutput = parseStored(stages, "campaign", campaignOutputSchema);
    parseStored(stages, "ui_theme", themeOutputSchema);
    const resolved = stages.asset_resolution as { skin?: unknown } | undefined;
    if (!resolved?.skin) throw new Error("Theme/asset resolution was not completed");
    const skin = importWorldSkin(resolved.skin);
    const world = worldSpecSchema.parse({ id: worldId, ...identity, status: "generated" });
    const towerTheme = towerThemeSpecSchema.parse({ worldId, entries: towerOutput.entries });
    const enemyTheme = enemyThemeSpecSchema.parse({ worldId, entries: enemyOutput.entries });
    const levels: LevelRecord[] = [];
    const campaign = campaignSpecSchema.parse({ id: `${worldId}-campaign`, worldId, name: campaignOutput.name, levels: campaignOutput.levels.map(entry => ({
      id: `${worldId}-${entry.difficulty}`, difficulty: entry.difficulty, name: entry.name, story: entry.story, semanticTags: entry.semanticTags,
    })) });
    let templateSeed = new SeededRng(seed);
    const selectedTemplates: string[] = [];
    for (const difficulty of ["easy", "medium", "hard"] as const satisfies readonly Difficulty[]) {
      const narrative = campaignOutput.levels.find(entry => entry.difficulty === difficulty)!;
      const mapSeed = templateSeed.nextUint32();
      const generated = generateMap({ difficulty, seed: mapSeed, preferredTags: narrative.preferredTemplateTags, previousTemplateIds: selectedTemplates });
      if (!generated.ok) throw new Error(`Map generation failed for ${difficulty}: ${generated.code}`);
      const map = mapSpecSchema.parse({ ...generated.map, id: `${worldId}-${difficulty}` });
      const validation = validateMapSpec(map);
      if (!validation.valid) throw new Error(`Map validation failed for ${difficulty}: ${validation.issues.map(issue => issue.code).join(",")}`);
      selectedTemplates.push(map.templateId);
      levels.push({ id: `${worldId}-${difficulty}`, worldId, difficulty, name: narrative.name, story: narrative.story, map });
    }
    if (new Set(levels.map(level => level.map.templateId)).size !== 3) throw new Error("Campaign maps must use three distinct templates");
    return { world, towerTheme, enemyTheme, campaign, skin, levels };
  }
}

function importWorldSkin(value: unknown) {
  // Re-parse the trusted resolver output at the persistence boundary.
    return worldSkinSchema.parse(value);
}
