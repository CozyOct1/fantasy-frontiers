import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mapSpecSchema, type ThemeOutput } from "../packages/shared/src/index.js";
import { createAppServer } from "../apps/server/src/server.js";
import { AppStore } from "../apps/server/src/store.js";
import { CreativeWorkflow } from "../apps/server/src/creative-workflow.js";
import { EvaluationWorkflow } from "../apps/server/src/evaluation-workflow.js";
import { loadAssetLibrary, resolveWorldTheme } from "../apps/server/src/theme-resolver.js";
import { DeepSeekClient, DeepSeekError, type JsonCompletionRequest, type JsonModel } from "../apps/server/src/deepseek.js";

const responses: unknown[] = [
  { name: "星汐群岛", summary: "漂浮群岛上的星象守卫抵挡虚空生物。", playerFactionName: "星灯守望者", enemyFactionName: "虚空浪潮", visualKeywords: ["群岛", "星象", "深海"], themeFamily: "ocean" },
  { entries: [{ archetype: "basic", name: "潮汐弩", description: "精准守卫" }, { archetype: "aoe", name: "星爆灯", description: "范围照亮" }, { archetype: "slow", name: "寒雾钟", description: "减缓敌军" }, { archetype: "heavy", name: "深海炮", description: "重击目标" }] },
  { entries: [{ archetype: "normal", name: "漂流者", description: "普通敌军" }, { archetype: "fast", name: "疾潮", description: "快速敌军" }, { archetype: "tank", name: "礁甲兽", description: "坚韧敌军" }, { archetype: "boss", name: "虚空鲸王", description: "首领敌军" }] },
  { name: "星汐防线", levels: [
    { difficulty: "easy", name: "浅滩灯火", story: "点亮浅滩上的第一座守望灯。", semanticTags: ["浅滩"], preferredTemplateTags: ["curve"] },
    { difficulty: "medium", name: "群岛回廊", story: "守住穿过群岛的航道。", semanticTags: ["航道"], preferredTemplateTags: ["merge"] },
    { difficulty: "hard", name: "深渊潮门", story: "抵挡来自深渊的最后一潮。", semanticTags: ["深渊"], preferredTemplateTags: ["ring"] },
  ] },
  { themeFamily: "ocean", styleTags: ["celestial", "tidal"], visualKeywords: ["星灯", "海雾"], preferredColors: ["#327c91", "#efbd69"] },
];

class QueueModel implements JsonModel {
  readonly requests: JsonCompletionRequest[] = [];
  constructor(private queue: unknown[]) {}
  async completeJson(request: JsonCompletionRequest): Promise<unknown> {
    this.requests.push(request);
    if (this.queue.length === 0) throw new Error("No mock response configured");
    return this.queue.shift();
  }
  append(items: unknown[]): void { this.queue.push(...items); }
}

class AutoEvaluationModel implements JsonModel {
  async completeJson(request: JsonCompletionRequest): Promise<unknown> {
    if ((request.userInput as { phase?: string }).phase === "final_report") return { summary: "额外实验支持当前结论。", findings: ["不同策略呈现出不同的防守方式。"], recommendation: "balanced" };
    return { hypothesis: "规则策略在相同地图上可形成有效对照。", requestFollowup: false, followupPolicy: null, reason: "首轮结果足以形成当前判断。", summary: "对照实验形成了可检查的评测记录。", findings: ["策略结果均由模拟器生成。"], recommendation: "balanced" };
  }
}

const stores: AppStore[] = [];
const servers: ReturnType<typeof createAppServer>[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const server of servers.splice(0)) server.close();
  for (const store of stores.splice(0)) { try { store.close(); } catch { /* already closed */ } }
});

async function eventually<T>(read: () => T | undefined, timeoutMs = 2_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for background workflow");
}

describe("Creative Workflow", () => {
  it("uses DeepSeek JSON Output and never includes API credentials in prompts", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DeepSeekClient({ apiKey: "test-secret", baseUrl: "https://api.deepseek.com/", model: "deepseek-flash" });
    await expect(client.completeJson({ systemPrompt: "Return JSON", userInput: { theme: "forest" } })).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer test-secret");
    const body = JSON.parse(String(init?.body)) as { response_format: { type: string }; model: string; messages: { content: string }[] };
    expect(body).toMatchObject({ model: "deepseek-flash", response_format: { type: "json_object" } });
    expect(JSON.stringify(body)).not.toContain("test-secret");
    await expect(new DeepSeekClient({ apiKey: "" }).completeJson({ systemPrompt: "json", userInput: {} })).rejects.toBeInstanceOf(DeepSeekError);
  });

  it("resolves exact, similar and neutral themes from the local manifest", () => {
    const { manifest, registry } = loadAssetLibrary();
    const theme: ThemeOutput = { themeFamily: "fantasy", styleTags: [], visualKeywords: [], preferredColors: ["#123456"] };
    expect(resolveWorldTheme(theme, manifest, registry).match).toBe("exact");
    expect(resolveWorldTheme({ ...theme, themeFamily: "cyberpunk" }, manifest, registry).match).toBe("similar");
    const damagedExact = { ...registry, packs: [{ ...registry.packs[0]!, assets: { ...registry.packs[0]!.assets, backgroundId: "missing.background" } }, { ...registry.packs[1]!, similarFamilies: ["fantasy" as const] }] };
    expect(resolveWorldTheme(theme, manifest, damagedExact).match).toBe("similar");
    const noSimilar = { ...registry, packs: registry.packs.map(pack => ({ ...pack, similarFamilies: [] })) };
    expect(resolveWorldTheme({ ...theme, themeFamily: "cyberpunk" }, manifest, noSimilar).match).toBe("neutral");
    expect(() => resolveWorldTheme(theme, manifest, noSimilar, () => false)).toThrow(/fallback/);
  });

  it("generates a persisted three-level world through ordered API workflow stages", async () => {
    const store = new AppStore(":memory:"); stores.push(store);
    const workflow = new CreativeWorkflow(store, new QueueModel([...responses]));
    const evaluationWorkflow = new EvaluationWorkflow(store, new AutoEvaluationModel());
    const server = createAppServer(store, workflow, evaluationWorkflow); servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;
    const invalid = await fetch(`${base}/api/worlds/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "tiny" }) });
    expect(invalid.status).toBe(400);
    const accepted = await fetch(`${base}/api/worlds/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "浮空群岛由星象守卫抵挡虚空海潮", seed: 8675309 }) });
    expect(accepted.status).toBe(202);
    const { job: initial } = await accepted.json() as { job: { id: string; worldId: string } };
    const job = await eventually(() => {
      const record = store.getGeneration(initial.id)?.job;
      return record && (record.status === "completed" || record.status === "failed") ? record : undefined;
    });
    expect(job.status).toBe("completed");
    expect((await fetch(`${base}/api/generation-jobs/${initial.id}`).then(response => response.json()) as { job: { currentStep: string } }).job.currentStep).toBe("completed");
    const detail = await fetch(`${base}/api/worlds/${initial.worldId}`).then(response => response.json()) as { world: { status: string }; levels: { difficulty: string; map: unknown }[]; towerTheme: unknown; enemyTheme: unknown; skin: { themePackId: string; colors: { primary: string } } };
    expect(detail.world.status).toBe("generated");
    expect(detail.levels.map(level => level.difficulty)).toEqual(["easy", "medium", "hard"]);
    expect(detail.levels.every(level => mapSpecSchema.safeParse(level.map).success)).toBe(true);
    expect(detail.skin.themePackId).toBe("ff-ocean");
    expect(detail.skin.colors.primary).toBe("#327c91");
    expect(detail.towerTheme).toBeDefined();
    expect(detail.enemyTheme).toBeDefined();
    expect(store.getProgress("local-player").filter(entry => entry.levelId.startsWith(initial.worldId)).length).toBe(3);
    const evaluationStarted = await fetch(`${base}/api/worlds/${initial.worldId}/evaluate`, { method: "POST" });
    expect(evaluationStarted.status).toBe(202);
    const evaluations = await eventually(() => {
      const records = store.listEvaluations(initial.worldId);
      return records.length === 3 && records.every(record => record.status === "completed") ? records : undefined;
    }, 30_000);
    expect(evaluations.every(record => record.report?.runIds.length === 2)).toBe(true);
    const published = await fetch(`${base}/api/worlds/${initial.worldId}/publish`, { method: "POST" });
    expect(published.status).toBe(200);
    const workshop = await fetch(`${base}/api/workshop/worlds`).then(response => response.json()) as { worlds: { id: string }[] };
    expect(workshop.worlds.map(world => world.id)).toContain(initial.worldId);
    const workshopDetail = await fetch(`${base}/api/workshop/worlds/${initial.worldId}`).then(response => response.json()) as { levels: { difficulty: string }[] };
    expect(workshopDetail.levels.map(level => level.difficulty)).toEqual(["easy", "medium", "hard"]);
  });

  it("records schema failure and resumes the failed stage with bounded manual retry", async () => {
    const store = new AppStore(":memory:"); stores.push(store);
    const model = new QueueModel([{}, {}]);
    const workflow = new CreativeWorkflow(store, model);
    const job = store.createGenerationJob("一座雾海中的远古灯塔", 8128);
    workflow.launch(job.id);
    const failed = await eventually(() => {
      const record = store.getGeneration(job.id)?.job;
      return record?.status === "failed" ? record : undefined;
    });
    expect(failed.currentStep).toBe("world_identity");
    model.append([...responses]);
    expect(workflow.retry(job.id)?.retries).toBe(1);
    const complete = await eventually(() => {
      const record = store.getGeneration(job.id)?.job;
      return record?.status === "completed" ? record : undefined;
    });
    expect(complete.retries).toBe(1);
  });

  it("keeps existing playable worlds intact when DeepSeek is not configured", async () => {
    const store = new AppStore(":memory:"); stores.push(store);
    const workflow = new CreativeWorkflow(store, new DeepSeekClient({ apiKey: "" }));
    const job = store.createGenerationJob("水晶森林中的守夜人抵抗机械虫群", 7193);
    workflow.launch(job.id);
    const failed = await eventually(() => {
      const record = store.getGeneration(job.id)?.job;
      return record?.status === "failed" ? record : undefined;
    });
    expect(failed.error).toContain("key is not configured");
    expect(store.getWorld("frontier-world")?.status).toBe("ready");
    expect(store.listLevels("frontier-world")).toHaveLength(3);
  });
});
