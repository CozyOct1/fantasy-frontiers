import { existsSync, mkdirSync } from "node:fs";
import { randomInt } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { campaignSpecSchema, enemyThemeSpecSchema, gameRunResultRequestSchema, gameRunStartRequestSchema, gameRunStartSchema, generationJobSchema, levelRecordSchema, mapDraftSchema, playerProgressSchema, towerThemeSpecSchema, worldGenerationRequestSchema, worldSkinSchema, worldSpecSchema } from "@fantasy-frontiers/shared";
import { AppStore } from "./store.js";
import { DeepSeekClient } from "./deepseek.js";
import { CreativeWorkflow } from "./creative-workflow.js";
import { EvaluationWorkflow } from "./evaluation-workflow.js";
import { renderEvaluationMarkdown } from "./evaluation-markdown.js";

const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
const json = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "http://127.0.0.1:5173", "access-control-allow-methods": "GET,POST,PUT,OPTIONS", "access-control-allow-headers": "content-type" });
  response.end(JSON.stringify(body));
};
const markdown = (response: ServerResponse, filename: string, body: string) => {
  response.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store", "access-control-allow-origin": "http://127.0.0.1:5173" });
  response.end(body);
};
async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.byteLength;
    if (length > 1_000_000) throw new Error("request_too_large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createAppServer(store: AppStore, workflow?: CreativeWorkflow, evaluationWorkflow?: EvaluationWorkflow, options: { enableMapEditor?: boolean } = {}): Server {
  const editorEnabled = options.enableMapEditor ?? process.env.ENABLE_MAP_EDITOR === "1";
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    try {
      if (request.method === "OPTIONS") { response.writeHead(204, { "access-control-allow-origin": "http://127.0.0.1:5173", "access-control-allow-methods": "GET,POST,PUT,OPTIONS", "access-control-allow-headers": "content-type" }); return response.end(); }
      if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { status: "ok", service: "fantasy-frontiers-server" });
      if (request.method === "GET" && url.pathname === "/api/worlds") {
        const worlds = store.listWorlds().map(world => worldSpecSchema.parse(world));
        return json(response, 200, { worlds });
      }
      if (request.method === "GET" && url.pathname === "/api/workshop/worlds") {
        return json(response, 200, { worlds: store.listPublishedWorlds().map(world => worldSpecSchema.parse(world)) });
      }
      if (request.method === "GET" && parts[0] === "api" && parts[1] === "workshop" && parts[2] === "worlds" && parts.length === 4) {
        const world = store.getWorld(parts[3]!);
        if (!world || world.status !== "published") return json(response, 404, { error: "published_world_not_found" });
        const levels = store.listLevels(world.id).map(level => levelRecordSchema.parse(level));
        const content = store.getWorldContent(world.id)!;
        return json(response, 200, { world: worldSpecSchema.parse(world), levels,
          ...(content.towerTheme ? { towerTheme: towerThemeSpecSchema.parse(content.towerTheme) } : {}),
          ...(content.enemyTheme ? { enemyTheme: enemyThemeSpecSchema.parse(content.enemyTheme) } : {}),
          ...(content.skin ? { skin: worldSkinSchema.parse(content.skin) } : {}),
        });
      }
      if (request.method === "GET" && parts[0] === "api" && parts[1] === "worlds" && parts.length === 3) {
        const world = store.getWorld(parts[2]!);
        if (!world) return json(response, 404, { error: "world_not_found" });
        const levels = store.listLevels(world.id).map(level => levelRecordSchema.parse(level));
        const content = store.getWorldContent(world.id)!;
        return json(response, 200, {
          world: worldSpecSchema.parse(world), levels,
          ...(content.towerTheme ? { towerTheme: towerThemeSpecSchema.parse(content.towerTheme) } : {}),
          ...(content.enemyTheme ? { enemyTheme: enemyThemeSpecSchema.parse(content.enemyTheme) } : {}),
          ...(content.campaign ? { campaign: campaignSpecSchema.parse(content.campaign) } : {}),
          ...(content.skin ? { skin: worldSkinSchema.parse(content.skin) } : {}),
          evaluations: store.listEvaluations(world.id), readiness: store.getPublishReadiness(world.id),
        });
      }
      if (request.method === "POST" && parts[0] === "api" && parts[1] === "worlds" && parts[3] === "publish" && parts.length === 4) {
        const world = store.publishWorld(parts[2]!);
        if (!world) return json(response, 404, { error: "world_not_found" });
        return json(response, 200, { world: worldSpecSchema.parse(world) });
      }
      if (request.method === "POST" && parts[0] === "api" && parts[1] === "worlds" && parts[3] === "evaluate" && parts.length === 4) {
        if (!evaluationWorkflow) return json(response, 503, { error: "evaluation_workflow_unavailable" });
        const records = evaluationWorkflow.retry(parts[2]!);
        return json(response, 202, { evaluations: records });
      }
      if (request.method === "GET" && parts[0] === "api" && parts[1] === "worlds" && parts[3] === "evaluations" && parts.length === 4) {
        if (!store.getWorld(parts[2]!)) return json(response, 404, { error: "world_not_found" });
        return json(response, 200, { evaluations: store.listEvaluations(parts[2]!) });
      }
      if (request.method === "GET" && parts[0] === "api" && parts[1] === "worlds" && parts[3] === "evaluation-report.md" && parts.length === 4) {
        const world = store.getWorld(parts[2]!);
        if (!world) return json(response, 404, { error: "world_not_found" });
        const evaluations = store.listEvaluations(world.id);
        const completed = evaluations.filter(record => record.status === "completed" && record.report);
        if (completed.length === 0) return json(response, 404, { error: "evaluation_report_not_ready" });
        const evidence = new Map(completed.map(record => [record.id, store.getEvaluationEvidence(record.id)]));
        return markdown(response, `${world.id}-evaluation.md`, renderEvaluationMarkdown({ world, levels: store.listLevels(world.id), evaluations, evidenceByEvaluationId: evidence }));
      }
      if (request.method === "POST" && url.pathname === "/api/worlds/generate") {
        if (!workflow) return json(response, 503, { error: "creative_workflow_unavailable" });
        const input = worldGenerationRequestSchema.parse(await readJson(request));
        const seed = input.seed ?? randomInt(0, 0x1_0000_0000);
        const job = store.createGenerationJob(input.prompt, seed);
        workflow.launch(job.id);
        return json(response, 202, { job: generationJobSchema.parse(job) });
      }
      if (request.method === "GET" && parts[0] === "api" && parts[1] === "generation-jobs" && parts.length === 3) {
        const generation = store.getGeneration(parts[2]!);
        return generation ? json(response, 200, { job: generationJobSchema.parse(generation.job) }) : json(response, 404, { error: "generation_job_not_found" });
      }
      if (request.method === "GET" && url.pathname === "/api/generation-jobs") {
        return json(response, 200, { jobs: store.listGenerations().map(job => generationJobSchema.parse(job)) });
      }
      if (parts[0] === "api" && parts[1] === "editor") {
        if (!editorEnabled) return json(response, 404, { error: "not_found" });
        if (request.method === "GET" && parts[2] === "map-drafts" && parts.length === 3) {
          return json(response, 200, { drafts: store.listMapDrafts() });
        }
        if (request.method === "POST" && parts[2] === "map-drafts" && parts.length === 3) {
          const draft = store.createMapDraft(mapDraftSchema.parse(await readJson(request)));
          return json(response, 201, { draft });
        }
        if (request.method === "GET" && parts[2] === "map-drafts" && parts.length === 4) {
          const draft = store.getMapDraft(parts[3]!); return draft ? json(response, 200, { draft }) : json(response, 404, { error: "draft_not_found" });
        }
        if (request.method === "PUT" && parts[2] === "map-drafts" && parts.length === 4) {
          const body = await readJson(request) as { expectedRevision?: unknown; draft?: unknown };
          if (!Number.isInteger(body.expectedRevision)) return json(response, 400, { error: "invalid_request" });
          const draft = store.saveMapDraft(parts[3]!, body.expectedRevision as number, body.draft);
          return json(response, 200, { draft });
        }
        if (request.method === "POST" && parts[2] === "map-drafts" && parts[4] === "validate" && parts.length === 5) {
          const validation = store.validateMapDraft(parts[3]!); return validation ? json(response, 200, validation) : json(response, 404, { error: "draft_not_found" });
        }
        if (request.method === "POST" && parts[2] === "map-drafts" && parts[4] === "publish" && parts.length === 5) {
          const body = await readJson(request) as { expectedRevision?: unknown };
          if (!Number.isInteger(body.expectedRevision)) return json(response, 400, { error: "invalid_request" });
          return json(response, 201, { revision: store.publishMapDraft(parts[3]!, body.expectedRevision as number) });
        }
      }
      if (request.method === "POST" && parts[0] === "api" && parts[1] === "generation-jobs" && parts[3] === "retry" && parts.length === 4) {
        if (!workflow) return json(response, 503, { error: "creative_workflow_unavailable" });
        const job = workflow.retry(parts[2]!);
        return job ? json(response, 202, { job: generationJobSchema.parse(job) }) : json(response, 404, { error: "generation_job_not_found" });
      }
      if (request.method === "GET" && parts[0] === "api" && parts[1] === "levels" && parts.length === 3) {
        const level = store.getLevel(parts[2]!);
        return level ? json(response, 200, { level: levelRecordSchema.parse(level) }) : json(response, 404, { error: "level_not_found" });
      }
      if (request.method === "POST" && parts[0] === "api" && parts[1] === "levels" && parts[3] === "start" && parts.length === 4) {
        const body = gameRunStartRequestSchema.parse(await readJson(request));
        const started = store.startRun(parts[2]!, body.playerId ?? "local-player", body.seed);
        if (!started) return json(response, 404, { error: "level_not_found" });
        return json(response, 201, gameRunStartSchema.parse({
          runId: started.runId,
          levelId: started.level.id,
          seed: started.seed,
          map: { ...started.level.map, seed: started.seed },
          wavePlan: started.level.wavePlan,
          contentVersion: started.level.contentVersion,
          rulesetVersion: started.level.rulesetVersion,
        }));
      }
      if (request.method === "POST" && parts[0] === "api" && parts[1] === "levels" && parts[3] === "result" && parts.length === 4) {
        const body = gameRunResultRequestSchema.parse(await readJson(request));
        if (body.result.levelId !== parts[2]) return json(response, 400, { error: "result_level_mismatch" });
        const progress = store.saveResult(body.runId, parts[2]!, body.result);
        return progress ? json(response, 200, { progress: playerProgressSchema.parse(progress) }) : json(response, 404, { error: "run_not_active" });
      }
      if (request.method === "GET" && parts[0] === "api" && parts[1] === "progress" && parts.length === 2) {
        const playerId = url.searchParams.get("playerId") ?? "local-player";
        const progress = store.getProgress(playerId).map(entry => playerProgressSchema.parse(entry));
        return json(response, 200, { progress });
      }
      return json(response, 404, { error: "not_found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "internal_error";
      if (message === "request_too_large") return json(response, 413, { error: message });
      if (message === "level_locked") return json(response, 409, { error: message });
      if (message === "run_not_active") return json(response, 404, { error: message });
      if (message === "result_level_mismatch") return json(response, 400, { error: message });
      if (message === "result_seed_mismatch") return json(response, 400, { error: message });
      if (message === "generation_job_not_failed" || message === "generation_retry_limit") return json(response, 409, { error: message });
      if (message.startsWith("publish_gate_failed:")) return json(response, 409, { error: "publish_gate_failed", issues: message.slice("publish_gate_failed:".length).split(",") });
      if (message === "world_already_published") return json(response, 409, { error: message });
      if (message === "evaluation_already_running") return json(response, 409, { error: message });
      if (message === "draft_revision_conflict" || message === "draft_id_mismatch") return json(response, 409, { error: message });
      if (message === "draft_not_found") return json(response, 404, { error: message });
      if (message.startsWith("draft_invalid:")) return json(response, 422, { error: "draft_invalid", issues: message.slice("draft_invalid:".length).split(",") });
      if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) return json(response, 400, { error: "invalid_request", detail: message });
      console.error("API request failed", error);
      return json(response, 500, { error: "internal_error" });
    }
  });
}

export function startServer(options: { port?: number; databasePath?: string } = {}): { server: Server; store: AppStore; workflow: CreativeWorkflow; evaluationWorkflow: EvaluationWorkflow } {
  const port = options.port ?? Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT must be an integer between 1 and 65535; received ${port}`);
  const databasePath = options.databasePath ?? resolve(dirname(envPath), process.env.DATABASE_PATH ?? "data/fantasy-frontiers.sqlite");
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
  const store = new AppStore(databasePath);
  const workflow = new CreativeWorkflow(store, new DeepSeekClient());
  const evaluationWorkflow = new EvaluationWorkflow(store, new DeepSeekClient());
  const server = createAppServer(store, workflow, evaluationWorkflow);
  server.listen(port, "127.0.0.1", () => console.info(`Fantasy Frontiers server listening on http://127.0.0.1:${port}`));
  return { server, store, workflow, evaluationWorkflow };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const { server, store } = startServer();
  const shutdown = () => server.close(() => { store.close(); process.exit(0); });
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
