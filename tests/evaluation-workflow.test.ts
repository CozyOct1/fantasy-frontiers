import { afterEach, describe, expect, it } from "vitest";
import { AppStore } from "../apps/server/src/store.js";
import { EvaluationWorkflow } from "../apps/server/src/evaluation-workflow.js";
import type { JsonCompletionRequest, JsonModel } from "../apps/server/src/deepseek.js";

class EvaluationModel implements JsonModel {
  readonly requests: JsonCompletionRequest[] = [];
  constructor(private readonly followup = false) {}
  async completeJson(request: JsonCompletionRequest): Promise<unknown> {
    this.requests.push(request);
    if (request.userInput && typeof request.userInput === "object" && "phase" in request.userInput && request.userInput.phase === "final_report") {
      return { summary: "追加实验补充了策略间的对照证据。", findings: ["额外策略提供了不同的防守行为样本。"], recommendation: "balanced" };
    }
    if (this.followup) return { hypothesis: "更复杂的部署策略可能改变关卡结果。", requestFollowup: true, followupPolicy: "expert", reason: "需要观察另一种策略的防守表现。", summary: "现有策略表现存在差异。", findings: ["当前证据尚未覆盖更多策略。"], recommendation: "needs_more_testing" };
    return { hypothesis: "两种部署策略在相同地图上的表现可以形成有效对照。", requestFollowup: false, followupPolicy: null, reason: "现有对照已能回答当前问题。", summary: "现有策略呈现出可解释的防线表现。", findings: ["不同策略的结果为关卡表现提供了对照证据。"], recommendation: "balanced" };
  }
}

const stores: AppStore[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

describe("EvaluationWorkflow", () => {
  it("simulates through bounded tools, stores traceable metrics, and readies only after all three levels", async () => {
    const store = new AppStore(":memory:"); stores.push(store);
    const model = new EvaluationModel();
    const workflow = new EvaluationWorkflow(store, model);
    const levels = store.listLevels("frontier-world");
    const records = store.createEvaluationRecords("frontier-world", levels.map(level => level.id), "1.0.0");
    workflow.launch(records);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && store.listEvaluations("frontier-world").some(record => record.status === "queued" || record.status === "running")) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const completed = store.listEvaluations("frontier-world");
    expect(completed.map(record => record.status)).toEqual(["completed", "completed", "completed"]);
    expect(completed.every(record => record.report?.runIds.length === 2)).toBe(true);
    expect(completed.every(record => record.report?.resultIds.length === 2 && record.report.metrics.runs === 2)).toBe(true);
    expect(completed.every(record => record.report?.policies.includes("novice@1.0.0") && record.report.policies.includes("baseline@1.0.0"))).toBe(true);
    expect(completed.every(record => Array.isArray((store.getEvaluationEvidence(record.id) as { runs?: unknown[] }).runs))).toBe(true);
    expect(model.requests).toHaveLength(3);
    expect(store.getWorld("frontier-world")?.status).toBe("ready");
    expect(store.getPublishReadiness("frontier-world")).toMatchObject({ ready: true, issues: [] });
    expect(store.publishWorld("frontier-world")?.status).toBe("published");
    expect(store.listPublishedWorlds().map(world => world.id)).toContain("frontier-world");
  }, 35_000);

  it("uses first-round evidence to request at most one extra strategy and includes its run in the final report", async () => {
    const store = new AppStore(":memory:"); stores.push(store);
    const model = new EvaluationModel(true);
    const workflow = new EvaluationWorkflow(store, model);
    const record = store.createEvaluationRecords("frontier-world", ["frontier-easy"], "1.0.0")[0]!;
    workflow.launch([record]);
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && store.listEvaluations("frontier-world").find(item => item.id === record.id)?.status !== "completed") {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const result = store.listEvaluations("frontier-world").find(item => item.id === record.id)!;
    expect(result.status).toBe("completed");
    expect(result.report?.policies).toHaveLength(3);
    expect(result.report?.runIds).toHaveLength(3);
    expect(result.report?.metrics.runs).toBe(3);
    expect(model.requests.map(request => (request.userInput as { phase: string }).phase)).toEqual(["initial_evidence", "final_report"]);
    expect((store.getEvaluationEvidence(record.id) as { followup: { policy: string } }).followup.policy).toBe("expert");
  }, 25_000);
});
