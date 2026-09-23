import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createBenchmarkContent } from "../packages/maps/src/index.js";
import { calculateMetricsFromRuns, inspectWaveMetrics } from "../packages/metrics/src/index.js";
import { BOT_POLICIES, runBatch } from "../packages/simulator/src/index.js";
import { GAME_CONFIG, GAME_CONFIG_VERSION, type Difficulty } from "../packages/shared/src/index.js";

const seeds = [101, 211, 307, 401, 503];
const difficulties: Difficulty[] = ["easy", "medium", "hard"];
const scenarios = difficulties.flatMap(difficulty => {
  const content = createBenchmarkContent(difficulty);
  return BOT_POLICIES.map(policy => {
    const runs = runBatch({ map: content.map, wavePlan: content.wavePlan, seeds, policy, batchId: `v5-${difficulty}-${policy.id}` });
    return { difficulty, policy: policy.id, policyVersion: policy.version, metrics: calculateMetricsFromRuns(runs).metrics, waves: inspectWaveMetrics(runs) };
  });
});
const towers = Object.entries(GAME_CONFIG.towers).map(([id, value]) => ({
  id, cost: value.cost, rawDps: value.damage * value.attackSpeed,
  rawDpsPer100Gold: value.damage * value.attackSpeed / value.cost * 100,
  range: value.range, splashRadius: value.splashRadius, slowRatio: value.slowRatio,
}));
const report = {
  modelVersion: "v5-balance-1", gameConfigVersion: GAME_CONFIG_VERSION,
  generatedAt: new Date().toISOString(), seeds, trialCountPerScenario: seeds.length,
  assumptions: ["机器人策略是诊断工具，不代表真人技能", "rawDps 不计溅射、减速、过量伤害和路径覆盖", "固定 WavePlan 下 seed 不改变出生表，仅影响 legacy 随机行为"],
  towers, scenarios,
};
const output = resolve("docs/v5/balance-baseline.json");
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Wrote ${output}: ${scenarios.length} scenarios × ${seeds.length} runs`);
