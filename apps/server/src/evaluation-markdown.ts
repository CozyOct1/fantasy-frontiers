import type { EvaluationRecord, LevelRecord, WorldSpec } from "@fantasy-frontiers/shared";

const recommendationNames = {
  balanced: "平衡表现符合预期",
  needs_tuning: "建议调整",
  needs_more_testing: "需要更多实验",
} as const;
const difficultyNames = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;
const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const number = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(2);
const safeCell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ");

export function latestCompletedEvaluations(records: EvaluationRecord[]): EvaluationRecord[] {
  const latest = new Map<string, EvaluationRecord>();
  for (const record of [...records].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    if (record.status === "completed" && record.report) latest.set(record.levelId, record);
  }
  return [...latest.values()];
}

export function renderEvaluationMarkdown(input: {
  world: WorldSpec;
  levels: LevelRecord[];
  evaluations: EvaluationRecord[];
  evidenceByEvaluationId?: ReadonlyMap<string, unknown>;
  generatedAt?: string;
}): string {
  const completed = latestCompletedEvaluations(input.evaluations);
  const byLevel = new Map(completed.map(record => [record.levelId, record]));
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const lines = [
    `# ${input.world.name} — AI 评测报告`, "",
    `> 世界 ID：\`${input.world.id}\`  `,
    `> 生成时间：${generatedAt}  `,
    `> 评测方法：确定性 Headless Simulator + Metrics Engine + DeepSeek 定性分析`, "",
    "## 执行摘要", "",
  ];
  if (completed.length === 0) lines.push("当前没有已完成且可验证的评测记录。", "");
  else {
    const tuning = completed.filter(record => record.report?.recommendation === "needs_tuning").length;
    lines.push(`已完成 ${completed.length}/${input.levels.length} 个关卡的评测。${tuning > 0 ? `其中 ${tuning} 个关卡建议调整。` : "当前已完成关卡未发现必须调整的问题。"}`, "");
    lines.push("| 难度 | 结论 | 胜率 | 平均剩余生命 | 漏怪率 | 资源利用率 |", "| --- | --- | ---: | ---: | ---: | ---: |");
    for (const level of input.levels) {
      const report = byLevel.get(level.id)?.report;
      if (!report) lines.push(`| ${difficultyNames[level.difficulty]} | 尚未完成 | — | — | — | — |`);
      else lines.push(`| ${difficultyNames[level.difficulty]} | ${recommendationNames[report.recommendation]} | ${percent(report.metrics.winRate)} | ${number(report.metrics.avgRemainingHp)} | ${percent(report.metrics.leakRate)} | ${percent(report.metrics.resourceUtilization)} |`);
    }
    lines.push("");
  }

  for (const level of input.levels) {
    const record = byLevel.get(level.id);
    lines.push(`## ${difficultyNames[level.difficulty]} · ${level.name}`, "");
    if (!record?.report) { lines.push("尚无已完成的评测报告。", ""); continue; }
    const report = record.report;
    lines.push(`**结论：${recommendationNames[report.recommendation]}**`, "", safeCell(report.summary), "", "### 关键发现", "");
    for (const finding of report.findings) lines.push(`- ${finding}`);
    lines.push("", "### 确定性指标", "", "| 指标 | 数值 |", "| --- | ---: |",
      `| 模拟局数 | ${report.metrics.runs} |`, `| 获胜局数 | ${report.metrics.wins} |`, `| 胜率 | ${percent(report.metrics.winRate)} |`,
      `| 平均剩余生命 | ${number(report.metrics.avgRemainingHp)} |`, `| 剩余生命中位数 | ${number(report.metrics.medianRemainingHp)} |`,
      `| 漏怪率 | ${percent(report.metrics.leakRate)} |`, `| 平均失败波次 | ${number(report.metrics.avgFailureWave)} |`,
      `| 平均金币支出 | ${number(report.metrics.avgGoldSpent)} |`, `| 平均金币收入 | ${number(report.metrics.avgGoldEarned)} |`,
      `| 资源利用率 | ${percent(report.metrics.resourceUtilization)} |`, `| 主导塔占比 | ${percent(report.metrics.dominantTowerRatio)} |`,
      `| 平均持续 Tick | ${number(report.metrics.avgDuration)} |`, "", "### 塔使用分布", "");
    const towerEntries = Object.entries(report.metrics.towerUsageDistribution);
    if (towerEntries.length === 0) lines.push("- 无塔攻击记录");
    else for (const [tower, ratio] of towerEntries) lines.push(`- ${tower}: ${percent(ratio)}`);
    lines.push("", "### 实验证据", "", `- Agent 版本：\`${report.agentVersion}\``, `- 策略：${report.policies.map(value => `\`${value}\``).join("、")}`,
      `- Seed：${report.seeds.map(value => `\`${value}\``).join("、")}`, `- Simulation Run：${report.runIds.map(value => `\`${value}\``).join("、")}`,
      `- Game Result：${report.resultIds.map(value => `\`${value}\``).join("、")}`, `- Metrics Snapshot：\`${report.metricsSnapshotId}\``);
    const evidence = input.evidenceByEvaluationId?.get(record.id) as { hypothesis?: unknown; followup?: { policy?: unknown; reason?: unknown } | null } | undefined;
    if (typeof evidence?.hypothesis === "string") lines.push(`- Agent 假设：${safeCell(evidence.hypothesis)}`);
    if (evidence?.followup && typeof evidence.followup.policy === "string") lines.push(`- 追加实验：\`${evidence.followup.policy}\`${typeof evidence.followup.reason === "string" ? ` — ${safeCell(evidence.followup.reason)}` : ""}`);
    lines.push("");
  }
  lines.push("## 证据边界", "", "- 所有数值指标由确定性代码根据 Simulation Run 与 GameResult 计算。", "- DeepSeek 只解释已有证据、形成文字结论，并决定是否请求一次受限的追加实验。", "- 报告不修改 Game Core、关卡规则、经济数值或 Metrics 定义。", "");
  return `${lines.join("\n")}\n`;
}
