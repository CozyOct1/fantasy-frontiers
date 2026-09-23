import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createAppServer } from "../apps/server/src/server.js";
import { AppStore } from "../apps/server/src/store.js";
import { createBenchmarkContent, draftFromMap } from "../packages/maps/src/index.js";

const openStores: AppStore[] = [];
const servers: ReturnType<typeof createAppServer>[] = [];
const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const store of openStores.splice(0)) { try { store.close(); } catch { /* may already be closed */ } }
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function startApi(databasePath = ":memory:", enableMapEditor = false) {
  const store = new AppStore(databasePath); openStores.push(store);
  const server = createAppServer(store, undefined, undefined, { enableMapEditor }); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { store, base: `http://127.0.0.1:${address.port}` };
}

describe("server SQLite API", () => {
  it("seeds a playable world with three difficulties and validates API boundaries", async () => {
    const { base } = await startApi();
    const worlds = await fetch(`${base}/api/worlds`).then(response => response.json()) as { worlds: { id: string }[] };
    expect(worlds.worlds.map(world => world.id)).toEqual(["frontier-world"]);
    const detail = await fetch(`${base}/api/worlds/frontier-world`).then(response => response.json()) as { levels: { difficulty: string }[] };
    expect(detail.levels.map(level => level.difficulty)).toEqual(["easy", "medium", "hard"]);
    const hardRun = await fetch(`${base}/api/levels/frontier-hard/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerId: "local-player" }) });
    expect(hardRun.status).toBe(201);
    const invalid = await fetch(`${base}/api/levels/frontier-easy/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: "fake", result: {} }) });
    expect(invalid.status).toBe(400);
    const invalidStart = await fetch(`${base}/api/levels/frontier-easy/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerId: "local-player", sql: "DROP TABLE worlds" }) });
    expect(invalidStart.status).toBe(400);
  });

  it("blocks publication until readiness and exposes only published worlds in the Workshop", async () => {
    const { base } = await startApi();
    const blocked = await fetch(`${base}/api/worlds/frontier-world/publish`, { method: "POST" });
    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toMatchObject({ error: "publish_gate_failed", issues: expect.arrayContaining(["all_levels_need_evaluation_reports"]) });
    const workshop = await fetch(`${base}/api/workshop/worlds`).then(response => response.json()) as { worlds: unknown[] };
    expect(workshop.worlds).toEqual([]);
    const hidden = await fetch(`${base}/api/workshop/worlds/frontier-world`);
    expect(hidden.status).toBe(404);
  });

  it("persists run results, best progress and the next unlock across store restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fantasy-frontiers-")); temporaryDirectories.push(directory);
    const dbPath = join(directory, "progress.sqlite");
    const first = await startApi(dbPath);
    const runResponse = await fetch(`${first.base}/api/levels/frontier-easy/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerId: "local-player", seed: 70421 }) });
    const run = await runResponse.json() as { runId: string; seed: number };
    const result = { levelId: "frontier-easy", seed: run.seed, win: true, remainingHp: 24, maxHp: 30, startingGold: 500, remainingGold: 20, waveReached: 6, totalWaves: 6, enemiesSpawned: 60, enemiesKilled: 60, enemiesLeaked: 0, goldEarned: 300, goldSpent: 780, towersBuilt: 5, towerUsage: { basic: 30 }, duration: 120 };
    const saved = await fetch(`${first.base}/api/levels/frontier-easy/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: run.runId, result }) });
    expect(saved.status).toBe(200);
    const duplicate = await fetch(`${first.base}/api/levels/frontier-easy/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: run.runId, result }) });
    expect(duplicate.status).toBe(404);
    first.store.close();
    const restarted = await startApi(dbPath);
    const progress = await fetch(`${restarted.base}/api/progress?playerId=local-player`).then(response => response.json()) as { progress: { levelId: string; completed: boolean; unlocked: boolean; bestRemainingHp: number | null }[] };
    expect(progress.progress.find(entry => entry.levelId === "frontier-easy")).toMatchObject({ completed: true, bestRemainingHp: 24 });
    expect(progress.progress.find(entry => entry.levelId === "frontier-medium")?.unlocked).toBe(true);
  });

  it("keeps editor writes disabled by default and publishes immutable draft revisions when enabled", async () => {
    const closed = await startApi();
    expect((await fetch(`${closed.base}/api/editor/map-drafts/example`)).status).toBe(404);
    const { base } = await startApi(":memory:", true);
    const draft = draftFromMap(createBenchmarkContent("easy").map, "editor-api-test");
    const created = await fetch(`${base}/api/editor/map-drafts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
    expect(created.status).toBe(201);
    const listed = await fetch(`${base}/api/editor/map-drafts`).then(response => response.json()) as { drafts: { id: string }[] };
    expect(listed.drafts.map(item => item.id)).toContain(draft.id);
    const saved = await fetch(`${base}/api/editor/map-drafts/${draft.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: 0, draft: { ...draft, name: "弯道守望" } }) });
    expect(saved.status).toBe(200);
    const conflict = await fetch(`${base}/api/editor/map-drafts/${draft.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: 0, draft }) });
    expect(conflict.status).toBe(409);
    const published = await fetch(`${base}/api/editor/map-drafts/${draft.id}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: 1 }) });
    expect(published.status).toBe(201);
    await expect(published.clone().json()).resolves.toMatchObject({ revision: { wavePlan: { waves: expect.any(Array) } } });
    const replay = await fetch(`${base}/api/editor/map-drafts/${draft.id}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: 1 }) });
    expect(await replay.json()).toEqual(await published.clone().json().catch(() => ({})));
  });
});
