import { describe, expect, it } from "vitest";
import { AppStore } from "../apps/server/src/store.js";
import { renderEvaluationMarkdown } from "../apps/server/src/evaluation-markdown.js";
import { EvaluationWorkflow } from "../apps/server/src/evaluation-workflow.js";
import type { JsonModel } from "../apps/server/src/deepseek.js";

const model: JsonModel = {
  async completeJson() {
    return { hypothesis: "策略对照可以说明关卡表现。", requestFollowup: false, followupPolicy: null, reason: "证据足够。", summary: "防线表现稳定。", findings: ["不同策略形成了可比较的结果。"], recommendation: "balanced" };
  },
};

describe("evaluation Markdown", () => {
  it("exports readable conclusions, deterministic metrics, and trace identifiers", async () => {
    const store = new AppStore(":memory:");
    try {
      const records = store.createEvaluationRecords("frontier-world", ["frontier-easy"], "1.0.0");
      new EvaluationWorkflow(store, model).launch(records);
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && store.listEvaluations("frontier-world").some(record => record.status !== "completed")) await new Promise(resolve => setTimeout(resolve, 10));
      const markdown = renderEvaluationMarkdown({ world: store.getWorld("frontier-world")!, levels: store.listLevels("frontier-world").filter(level => level.id === "frontier-easy"), evaluations: store.listEvaluations("frontier-world"), evidenceByEvaluationId: new Map(records.map(record => [record.id, store.getEvaluationEvidence(record.id)])), generatedAt: "2026-09-20T00:00:00.000Z" });
      expect(markdown).toContain("# 边境哨站 — AI 评测报告");
      expect(markdown).toContain("## Easy");
      expect(markdown).toContain("| 胜率 |");
      expect(markdown).toContain("Simulation Run");
      expect(markdown).toContain("所有数值指标由确定性代码");
    } finally { store.close(); }
  });
});
