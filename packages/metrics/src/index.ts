import { evaluationMetricsSchema, gameResultSchema, simulationRunSchema, type EvaluationMetrics, type GameResult, type SimulationRun } from "@fantasy-frontiers/shared";

export interface MetricsEvidence {
  metrics: EvaluationMetrics;
  sourceRunIds: string[];
  sourceResultIds: string[];
}
export interface TowerUsageMetrics {
  attacks: number;
  towerUsageDistribution: Record<string, number>;
  dominantTowerRatio: number;
  sourceRunIds: string[];
}
export interface WaveMetrics {
  waveIndex: number;
  runs: number;
  completedRuns: number;
  completionRate: number;
  avgStartingHp: number;
  avgRemainingHp: number;
  avgEnemiesSpawned: number;
  avgEnemiesKilled: number;
  avgEnemiesLeaked: number;
  avgGoldSpent: number;
  avgGoldEarned: number;
  sourceRunIds: string[];
}
export interface ResultDistribution {
  runs: number;
  wins: number;
  losses: number;
  winRate: number;
  waveReached: Record<string, number>;
  remainingHpBands: { zero: number; low: number; middle: number; high: number };
  sourceRunIds: string[];
}

const average = (values: readonly number[]): number => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
const normalizedDistribution = (counts: Record<string, number>): Record<string, number> => {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return Object.fromEntries(Object.keys(counts).sort().map(key => [key, total === 0 ? 0 : counts[key]! / total]));
};
const dominantRatio = (distribution: Record<string, number>): number => Math.max(0, ...Object.values(distribution));
const validateRuns = (runs: readonly SimulationRun[]): SimulationRun[] => runs.map(run => simulationRunSchema.parse(run));

/** Deterministically calculates numeric measures from canonical GameResult values. */
export function calculateMetrics(input: readonly GameResult[]): EvaluationMetrics {
  const results = input.map(result => gameResultSchema.parse(result));
  const runs = results.length;
  const wins = results.filter(result => result.win).length;
  const totalSpawned = results.reduce((sum, result) => sum + result.enemiesSpawned, 0);
  const totalLeaked = results.reduce((sum, result) => sum + result.enemiesLeaked, 0);
  const totalGoldSpent = results.reduce((sum, result) => sum + result.goldSpent, 0);
  const totalGoldAvailable = results.reduce((sum, result) => sum + result.startingGold + result.goldEarned, 0);
  const towerUse: Record<string, number> = {};
  for (const result of results) for (const [archetype, attacks] of Object.entries(result.towerUsage)) towerUse[archetype] = (towerUse[archetype] ?? 0) + attacks;
  const towerUsageDistribution = normalizedDistribution(towerUse);
  const metrics = {
    runs,
    wins,
    winRate: runs === 0 ? 0 : wins / runs,
    avgRemainingHp: average(results.map(result => result.remainingHp)),
    medianRemainingHp: median(results.map(result => result.remainingHp)),
    leakRate: totalSpawned === 0 ? 0 : totalLeaked / totalSpawned,
    avgFailureWave: average(results.filter(result => !result.win).map(result => result.waveReached)),
    avgGoldSpent: average(results.map(result => result.goldSpent)),
    avgGoldEarned: average(results.map(result => result.goldEarned)),
    resourceUtilization: totalGoldAvailable === 0 ? 0 : Math.min(1, totalGoldSpent / totalGoldAvailable),
    towerUsageDistribution,
    dominantTowerRatio: dominantRatio(towerUsageDistribution),
    avgDuration: average(results.map(result => result.duration)),
  };
  return evaluationMetricsSchema.parse(metrics);
}

/** Adds immutable run/result references around the numeric snapshot. */
export function calculateMetricsFromRuns(runs: readonly SimulationRun[]): MetricsEvidence {
  const validatedRuns = validateRuns(runs);
  return {
    metrics: calculateMetrics(validatedRuns.map(run => run.result)),
    sourceRunIds: validatedRuns.map(run => run.id),
    sourceResultIds: validatedRuns.map(run => run.resultId),
  };
}

export function inspectTowerUsage(runs: readonly SimulationRun[]): TowerUsageMetrics {
  const validatedRuns = validateRuns(runs);
  const counts: Record<string, number> = {};
  for (const run of validatedRuns) for (const [archetype, attacks] of Object.entries(run.result.towerUsage)) counts[archetype] = (counts[archetype] ?? 0) + attacks;
  const towerUsageDistribution = normalizedDistribution(counts);
  return {
    attacks: Object.values(counts).reduce((sum, count) => sum + count, 0),
    towerUsageDistribution,
    dominantTowerRatio: dominantRatio(towerUsageDistribution),
    sourceRunIds: validatedRuns.map(run => run.id),
  };
}

export function inspectWaveMetrics(runs: readonly SimulationRun[]): WaveMetrics[] {
  const validatedRuns = validateRuns(runs);
  const byWave = new Map<number, Array<{ runId: string; wave: SimulationRun["waves"][number] }>>();
  for (const run of validatedRuns) for (const wave of run.waves) {
    const entries = byWave.get(wave.waveIndex) ?? [];
    entries.push({ runId: run.id, wave });
    byWave.set(wave.waveIndex, entries);
  }
  return [...byWave.entries()].sort(([left], [right]) => left - right).map(([waveIndex, entries]) => ({
    waveIndex,
    runs: entries.length,
    completedRuns: entries.filter(entry => entry.wave.completed).length,
    completionRate: entries.filter(entry => entry.wave.completed).length / entries.length,
    avgStartingHp: average(entries.map(entry => entry.wave.startingHp)),
    avgRemainingHp: average(entries.map(entry => entry.wave.remainingHp)),
    avgEnemiesSpawned: average(entries.map(entry => entry.wave.enemiesSpawned)),
    avgEnemiesKilled: average(entries.map(entry => entry.wave.enemiesKilled)),
    avgEnemiesLeaked: average(entries.map(entry => entry.wave.enemiesLeaked)),
    avgGoldSpent: average(entries.map(entry => entry.wave.goldSpent)),
    avgGoldEarned: average(entries.map(entry => entry.wave.goldEarned)),
    sourceRunIds: [...new Set(entries.map(entry => entry.runId))],
  }));
}

export function inspectResultDistribution(runs: readonly SimulationRun[]): ResultDistribution {
  const validatedRuns = validateRuns(runs);
  const waveReached: Record<string, number> = {};
  const remainingHpBands = { zero: 0, low: 0, middle: 0, high: 0 };
  let wins = 0;
  for (const run of validatedRuns) {
    const result = gameResultSchema.parse(run.result);
    if (result.win) wins++;
    waveReached[String(result.waveReached)] = (waveReached[String(result.waveReached)] ?? 0) + 1;
    const ratio = result.remainingHp / result.maxHp;
    if (ratio <= 0) remainingHpBands.zero++;
    else if (ratio < 1 / 3) remainingHpBands.low++;
    else if (ratio < 2 / 3) remainingHpBands.middle++;
    else remainingHpBands.high++;
  }
  return {
    runs: validatedRuns.length, wins, losses: validatedRuns.length - wins,
    winRate: validatedRuns.length === 0 ? 0 : wins / validatedRuns.length,
    waveReached: Object.fromEntries(Object.entries(waveReached).sort(([left], [right]) => Number(left) - Number(right))),
    remainingHpBands,
    sourceRunIds: validatedRuns.map(run => run.id),
  };
}
