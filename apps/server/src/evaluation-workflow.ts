import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateMetricsFromRuns, inspectResultDistribution, inspectTowerUsage, inspectWaveMetrics } from "@fantasy-frontiers/metrics";
import { evaluationReportSchema, type EvaluationRecord, type EvaluationReport, type SimulationRun } from "@fantasy-frontiers/shared";
import { compareRuns, getBotPolicy, runBatch } from "@fantasy-frontiers/simulator";
import { validateMapSpec } from "@fantasy-frontiers/maps";
import { z } from "zod";
import { AppStore } from "./store.js";
import { type JsonModel } from "./deepseek.js";

export const EVALUATION_AGENT_VERSION = "1.0.0";
export const MAX_EXPERIMENT_SEEDS = 3;
export const ALLOWED_POLICIES = ["novice", "baseline", "expert"] as const;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const systemPrompt = readFileSync(resolve(root, "prompts", "evaluation-agent.prompt.md"), "utf8");
const qualitative = (max: number, min = 1) => z.string().min(min).max(max).refine(value => !/[0-9０-９%％]/.test(value), "Agent text cannot contain numeric claims");

const decisionSchema = z.object({
  hypothesis: qualitative(400), requestFollowup: z.boolean(), followupPolicy: z.enum(ALLOWED_POLICIES).nullable(), reason: qualitative(400, 0),
  summary: qualitative(600), findings: z.array(qualitative(400)).min(1).max(8), recommendation: z.enum(["balanced", "needs_tuning", "needs_more_testing"]),
}).strict().superRefine((value, context) => {
  if (value.requestFollowup !== (value.followupPolicy !== null)) context.addIssue({ code: "custom", message: "followupPolicy must be set exactly when follow-up is requested" });
  if (value.recommendation === "needs_more_testing" && !value.requestFollowup) context.addIssue({ code: "custom", message: "Insufficient evidence requires a bounded follow-up experiment" });
});
const finalSchema = z.object({
  summary: qualitative(600), findings: z.array(qualitative(400)).min(1).max(8), recommendation: z.enum(["balanced", "needs_tuning"]),
}).strict();
type QualitativeReport = { summary: string; findings: string[]; recommendation: "balanced" | "needs_tuning" | "needs_more_testing" };

export interface EvaluationTools {
  inspect_level: (levelId: string) => unknown;
  run_episode: (levelId: string, policyId: typeof ALLOWED_POLICIES[number], seed: number) => SimulationRun;
  run_batch: (levelId: string, policyId: typeof ALLOWED_POLICIES[number], seeds: number[]) => SimulationRun[];
  calculate_metrics: (runIds: string[]) => ReturnType<typeof calculateMetricsFromRuns>;
  inspect_wave_metrics: (runIds: string[]) => ReturnType<typeof inspectWaveMetrics>;
  inspect_tower_usage: (runIds: string[]) => ReturnType<typeof inspectTowerUsage>;
  compare_runs: (leftRunIds: string[], rightRunIds: string[]) => ReturnType<typeof compareRuns>;
}

class ReadOnlyEvaluationTools implements EvaluationTools {
  private readonly runs = new Map<string, SimulationRun>();
  constructor(private readonly store: AppStore, private readonly evaluationId: string) {}
  inspect_level(levelId: string) {
    const level = this.store.getLevel(levelId);
    if (!level) throw new Error("level_not_found");
    const validation = validateMapSpec(level.map);
    return { levelId: level.id, worldId: level.worldId, difficulty: level.difficulty, name: level.name, story: level.story, map: level.map, validation };
  }
  run_episode(levelId: string, policyId: typeof ALLOWED_POLICIES[number], seed: number): SimulationRun {
    return this.run_batch(levelId, policyId, [seed])[0]!;
  }
  run_batch(levelId: string, policyId: typeof ALLOWED_POLICIES[number], seeds: number[]): SimulationRun[] {
    if (!(ALLOWED_POLICIES as readonly string[]).includes(policyId)) throw new Error("evaluation_policy_not_allowed");
    if (seeds.length < 1 || seeds.length > MAX_EXPERIMENT_SEEDS || seeds.some(seed => !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff)) throw new Error("evaluation_seed_limit");
    if (new Set(seeds).size !== seeds.length) throw new Error("evaluation_seeds_must_be_unique");
    const level = this.store.getLevel(levelId);
    if (!level) throw new Error("level_not_found");
    const validation = validateMapSpec(level.map);
    if (!validation.valid) throw new Error("evaluation_map_invalid");
    const result = runBatch({
      map: level.map,
      seeds,
      policy: getBotPolicy(policyId),
      batchId: `${this.evaluationId}-${policyId}`,
      ...(level.wavePlan ? { wavePlan: level.wavePlan } : {}),
    });
    for (const run of result) this.runs.set(run.id, run);
    return result;
  }
  private resolve(runIds: string[]) {
    if (runIds.length < 1 || runIds.length > MAX_EXPERIMENT_SEEDS * ALLOWED_POLICIES.length) throw new Error("evaluation_run_limit");
    const runs = runIds.map(id => this.runs.get(id));
    if (runs.some(run => !run)) throw new Error("evaluation_run_not_found");
    return runs as SimulationRun[];
  }
  calculate_metrics(runIds: string[]) { return calculateMetricsFromRuns(this.resolve(runIds)); }
  inspect_wave_metrics(runIds: string[]) { return inspectWaveMetrics(this.resolve(runIds)); }
  inspect_tower_usage(runIds: string[]) { return inspectTowerUsage(this.resolve(runIds)); }
  compare_runs(leftRunIds: string[], rightRunIds: string[]) { return compareRuns(this.resolve(leftRunIds), this.resolve(rightRunIds)); }
  inspect_distribution(runIds: string[]) { return inspectResultDistribution(this.resolve(runIds)); }
  allRuns(): SimulationRun[] { return [...this.runs.values()]; }
}

export class EvaluationWorkflow {
  private readonly active = new Map<string, Promise<void>>();
  constructor(private readonly store: AppStore, private readonly model: JsonModel) {}
  launch(records: EvaluationRecord[]): void {
    for (const record of records) {
      if (this.active.has(record.id)) continue;
      const task = this.evaluate(record).finally(() => this.active.delete(record.id));
      this.active.set(record.id, task);
    }
  }
  retry(worldId: string): EvaluationRecord[] {
    const world = this.store.getWorld(worldId);
    if (!world) throw new Error("world_not_found");
    if (world.status === "published") throw new Error("world_already_published");
    if (world.status === "evaluating") throw new Error("evaluation_already_running");
    const levels = this.store.listLevels(worldId);
    if (levels.length !== 3 || new Set(levels.map(level => level.difficulty)).size !== 3) throw new Error("world_campaign_incomplete");
    const created = this.store.createEvaluationRecords(worldId, levels.map(level => level.id), EVALUATION_AGENT_VERSION);
    this.launch(created);
    return created;
  }
  private async ask<T>(input: unknown, schema: { parse(value: unknown): T }): Promise<T> {
    let validationFeedback = "";
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await this.model.completeJson({
          systemPrompt: validationFeedback ? `${systemPrompt}\n\nThe previous response failed schema validation. Return a shorter response with every required field and no extra fields. Validation feedback: ${validationFeedback}` : systemPrompt,
          userInput: input,
          maxTokens: 1400,
        });
        return schema.parse(result);
      } catch (error) {
        lastError = error;
        validationFeedback = error instanceof Error ? error.message.slice(0, 600) : "invalid structured response";
      }
    }
    throw lastError;
  }
  private async evaluate(record: EvaluationRecord): Promise<void> {
    const tools = new ReadOnlyEvaluationTools(this.store, record.id);
    try {
      this.store.startEvaluation(record.id);
      const inspection = tools.inspect_level(record.levelId) as { map: { seed: number } };
      const seeds = [inspection.map.seed >>> 0];
      const novice = tools.run_batch(record.levelId, "novice", seeds);
      const baseline = tools.run_batch(record.levelId, "baseline", seeds);
      const noviceMetrics = tools.calculate_metrics(novice.map(run => run.id));
      const baselineMetrics = tools.calculate_metrics(baseline.map(run => run.id));
      const comparison = tools.compare_runs(novice.map(run => run.id), baseline.map(run => run.id));
      const first = await this.ask({ phase: "initial_evidence", inspection, policies: { novice: noviceMetrics, baseline: baselineMetrics }, comparison, waves: tools.inspect_wave_metrics([...novice, ...baseline].map(run => run.id)), towerUsage: tools.inspect_tower_usage([...novice, ...baseline].map(run => run.id)) }, decisionSchema);
      let reportText: QualitativeReport = first;
      if (first.requestFollowup) {
        const followup = tools.run_batch(record.levelId, first.followupPolicy!, seeds);
        const followupMetrics = tools.calculate_metrics(followup.map(run => run.id));
        const followupComparison = tools.compare_runs(baseline.map(run => run.id), followup.map(run => run.id));
        reportText = await this.ask({ phase: "final_report", initial: first, followupPolicy: first.followupPolicy, followup: followupMetrics, comparison: followupComparison, distribution: tools.inspect_distribution(followup.map(run => run.id)) }, finalSchema);
      }
      const runs = tools.allRuns();
      const combined = tools.calculate_metrics(runs.map(run => run.id));
      const createdAt = new Date().toISOString();
      const report: EvaluationReport = evaluationReportSchema.parse({
        id: `report-${record.id}`, worldId: record.worldId, levelId: record.levelId, agentVersion: EVALUATION_AGENT_VERSION,
        summary: reportText.summary, findings: reportText.findings, recommendation: reportText.recommendation,
        policies: [...new Set(runs.map(run => `${run.policyId}@${run.policyVersion}`))], seeds: [...new Set(runs.map(run => run.seed))],
        runIds: combined.sourceRunIds, resultIds: combined.sourceResultIds, metricsSnapshotId: `metrics-${record.id}`, metrics: combined.metrics, createdAt,
      });
      this.store.completeEvaluation(record.id, report, { inspection, hypothesis: first.hypothesis, runs, metrics: combined.metrics, sourceRunIds: combined.sourceRunIds, sourceResultIds: combined.sourceResultIds, followup: first.requestFollowup ? { policy: first.followupPolicy, reason: first.reason } : null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "evaluation_failed";
      this.store.failEvaluation(record.id, message, { runIds: tools.allRuns().map(run => run.id), runs: tools.allRuns() });
    }
  }
}
