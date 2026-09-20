import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AppStore } from "../apps/server/src/store.js";
import { DeepSeekClient } from "../apps/server/src/deepseek.js";
import { EvaluationWorkflow } from "../apps/server/src/evaluation-workflow.js";
import { renderEvaluationMarkdown } from "../apps/server/src/evaluation-markdown.js";

const worldId = process.argv[2] ?? "frontier-world";
const databasePath = resolve(process.argv[3] ?? process.env.DATABASE_PATH ?? "data/fantasy-frontiers.sqlite");
const outputPath = resolve(process.argv[4] ?? `reports/evaluations/${worldId}.md`);
const store = new AppStore(databasePath);

try {
  const world = store.getWorld(worldId);
  if (!world) throw new Error(`World not found: ${worldId}`);
  const workflow = new EvaluationWorkflow(store, new DeepSeekClient());
  const started = workflow.retry(worldId);
  const startedIds = new Set(started.map(record => record.id));
  const deadline = Date.now() + 180_000;
  let records = store.listEvaluations(worldId).filter(record => startedIds.has(record.id));
  while (Date.now() < deadline && records.some(record => record.status === "queued" || record.status === "running")) {
    await new Promise(resolveDelay => setTimeout(resolveDelay, 500));
    records = store.listEvaluations(worldId).filter(record => startedIds.has(record.id));
  }
  const failed = records.filter(record => record.status !== "completed");
  if (failed.length > 0) throw new Error(`Evaluation failed: ${failed.map(record => `${record.levelId}=${record.status}:${record.error ?? "timeout"}`).join(", ")}`);
  const evidence = new Map(records.map(record => [record.id, store.getEvaluationEvidence(record.id)]));
  const markdown = renderEvaluationMarkdown({ world, levels: store.listLevels(worldId), evaluations: records, evidenceByEvaluationId: evidence });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  process.stdout.write(`${outputPath}\n`);
} finally {
  store.close();
}
