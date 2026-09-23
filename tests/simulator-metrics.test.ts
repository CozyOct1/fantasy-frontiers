import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { generateMap } from "../packages/maps/src/index.js";
import {
  BASELINE_POLICY, BOT_POLICIES, EXPERT_POLICY, NOVICE_POLICY, SimulationError,
  compareRuns, getBotPolicy, replayActionLog, runBatch, runEpisode,
} from "../packages/simulator/src/index.js";
import {
  calculateMetrics, calculateMetricsFromRuns, inspectResultDistribution, inspectTowerUsage, inspectWaveMetrics,
} from "../packages/metrics/src/index.js";
import { GAME_CONFIG, simulationRunSchema, type GameResult } from "../packages/shared/src/index.js";

const generated = generateMap({ difficulty: "easy", seed: 5142 });
if (!generated.ok) throw new Error(generated.message);
const map = generated.map;

const sampleResults: GameResult[] = [
  { levelId: "level-1", seed: 1, win: true, remainingHp: 10, maxHp: 20, startingGold: 100, remainingGold: 0, waveReached: 6, totalWaves: 6, enemiesSpawned: 10, enemiesKilled: 10, enemiesLeaked: 0, goldEarned: 50, goldSpent: 100, towersBuilt: 2, towerUsage: { basic: 8, slow: 2 }, duration: 30 },
  { levelId: "level-1", seed: 2, win: false, remainingHp: 0, maxHp: 20, startingGold: 100, remainingGold: 20, waveReached: 4, totalWaves: 6, enemiesSpawned: 20, enemiesKilled: 10, enemiesLeaked: 10, goldEarned: 30, goldSpent: 80, towersBuilt: 2, towerUsage: { basic: 5, aoe: 5 }, duration: 50 },
];

describe("Headless Simulator and fixed Bot policies", () => {
  it("runs all three named policies through Game Core and validates raw run records", () => {
    expect(BOT_POLICIES.map(policy => policy.id)).toEqual(["novice", "baseline", "expert"]);
    expect(getBotPolicy("baseline")).toBe(BASELINE_POLICY);
    for (const policy of BOT_POLICIES) {
      const run = runEpisode({ map, seed: 99, policy });
      expect(simulationRunSchema.safeParse(run).success).toBe(true);
      expect(run.resultId).toBe(`${run.id}-result`);
      expect(run.map).toEqual(map);
      expect(run.configuration).toEqual(GAME_CONFIG);
      expect(run.configVersion).toBe("v1.0.0");
      expect(run.policyId).toBe(policy.id);
      expect(run.totalTicks).toBeGreaterThan(0);
      expect(run.waves.length).toBeGreaterThan(0);
      expect(run.actions.at(-1)?.action.type).toBe("startWave");
      expect(run.result.waveReached).toBeGreaterThan(0);
      expect(run.waves.reduce((sum, wave) => sum + wave.enemiesSpawned, 0)).toBe(run.result.enemiesSpawned);
      expect(run.waves.reduce((sum, wave) => sum + wave.enemiesKilled, 0)).toBe(run.result.enemiesKilled);
      expect(run.waves.reduce((sum, wave) => sum + wave.enemiesLeaked, 0)).toBe(run.result.enemiesLeaked);
      expect(run.waves.reduce((sum, wave) => sum + wave.goldSpent, 0)).toBe(run.result.goldSpent);
    }
  });

  it("replays one policy and repeated seeds with stable results, traces, and IDs", () => {
    const first = runEpisode({ map, seed: 817, policy: NOVICE_POLICY });
    const replay = runEpisode({ map, seed: 817, policy: NOVICE_POLICY });
    expect(replay).toEqual(first);
    const batch = runBatch({ map, seeds: [817, 818, 817], policy: NOVICE_POLICY, batchId: "replay-check" });
    expect(batch[0]?.result).toEqual(batch[2]?.result);
    expect(batch[0]?.id).not.toBe(batch[2]?.id);
    expect(batch.map(run => run.id)).toEqual(["run-replay-check-0-817", "run-replay-check-1-818", "run-replay-check-2-817"]);
  });

  it("replays a recorded action log through the same Game Core", () => {
    const run = runEpisode({ map, seed: 817, policy: NOVICE_POLICY });
    const replay = replayActionLog({ map, seed: 817, actions: run.actions });
    expect(replay.result).toEqual(run.result);
    expect(replay.totalTicks).toBe(run.totalTicks);
    expect(replay.verifiedActions).toBe(run.actions.length);
  });

  it("uses the same seed set for raw strategy comparisons", () => {
    const left = runBatch({ map, seeds: [9, 10], policy: NOVICE_POLICY, batchId: "compare" });
    const right = runBatch({ map, seeds: [9, 10], policy: BASELINE_POLICY, batchId: "compare" });
    const comparison = compareRuns(left, right);
    expect(comparison).toMatchObject({ leftPolicyId: "novice", rightPolicyId: "baseline", pairs: [{ seed: 9 }, { seed: 10 }] });
    expect(() => compareRuns(left, right.slice(0, 1))).toThrow(RangeError);
    const expert = runEpisode({ map, seed: 9, policy: EXPERT_POLICY });
    expect(expert.policyId).toBe("expert");
  });

  it("rejects invalid maps and policies that do not start a wave", () => {
    const invalidMap = structuredClone(map);
    invalidMap.buildSlots[0] = invalidMap.paths[0]!.tiles[0]!;
    expect(() => runEpisode({ map: invalidMap, seed: 1, policy: NOVICE_POLICY })).toThrow(SimulationError);
    expect(() => runEpisode({ map, seed: 1, policy: { id: "empty", version: "1", decide: () => [] } })).toThrow(/followed by startWave/);
  });

  it("keeps the Simulator free of Phaser and browser DOM dependencies", async () => {
    const manifest = JSON.parse(await readFile(new URL("../packages/simulator/package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> };
    const source = await readFile(new URL("../packages/simulator/src/index.ts", import.meta.url), "utf8");
    expect(Object.keys(manifest.dependencies)).not.toContain("phaser");
    expect(source).not.toMatch(/from ["']phaser["']/i);
    expect(source).not.toMatch(/\b(?:window|document)\b/);
  });
});

describe("deterministic Metrics Engine", () => {
  it("calculates all numeric metrics with documented denominators", () => {
    expect(calculateMetrics(sampleResults)).toEqual({
      runs: 2, wins: 1, winRate: 0.5,
      avgRemainingHp: 5, medianRemainingHp: 5,
      leakRate: 1 / 3, avgFailureWave: 4,
      avgGoldSpent: 90, avgGoldEarned: 40,
      resourceUtilization: 180 / 280,
      towerUsageDistribution: { aoe: 0.25, basic: 0.65, slow: 0.1 },
      dominantTowerRatio: 0.65, avgDuration: 40,
    });
  });

  it("returns zero-safe metrics for empty input and rejects invalid results", () => {
    expect(calculateMetrics([])).toMatchObject({ runs: 0, winRate: 0, leakRate: 0, resourceUtilization: 0, dominantTowerRatio: 0 });
    expect(() => calculateMetrics([{ ...sampleResults[0]!, duration: -1 }])).toThrow();
  });

  it("preserves source run and result IDs and supports evidence drill-downs", () => {
    const runs = runBatch({ map, seeds: [7, 8], policy: NOVICE_POLICY, batchId: "metrics" });
    const evidence = calculateMetricsFromRuns(runs);
    expect(evidence.sourceRunIds).toEqual(runs.map(run => run.id));
    expect(evidence.sourceResultIds).toEqual(runs.map(run => run.resultId));
    expect(evidence.metrics.runs).toBe(2);

    const towers = inspectTowerUsage(runs);
    expect(towers.sourceRunIds).toEqual(runs.map(run => run.id));
    expect(towers.attacks).toBeGreaterThan(0);
    expect(Object.values(towers.towerUsageDistribution).reduce((sum, ratio) => sum + ratio, 0)).toBeCloseTo(1);

    const waves = inspectWaveMetrics(runs);
    expect(waves.length).toBeGreaterThan(0);
    expect(waves[0]).toMatchObject({ waveIndex: 1, runs: 2, sourceRunIds: runs.map(run => run.id) });
    expect(inspectResultDistribution(runs)).toMatchObject({ runs: 2, wins: runs.filter(run => run.result.win).length, sourceRunIds: runs.map(run => run.id) });
  });
});
