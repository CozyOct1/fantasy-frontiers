import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { generateMap, validateMapSpec } from "@fantasy-frontiers/maps";
import { campaignSpecSchema, evaluationRecordSchema, evaluationReportSchema, gameResultSchema, generationJobSchema, mapSpecSchema, type CampaignSpec, type EnemyThemeSpec, type EvaluationRecord, type EvaluationReport, type GenerationJob, type LevelRecord, type PlayerProgress, type TowerThemeSpec, type WorldSkin, type WorldSpec } from "@fantasy-frontiers/shared";

const now = () => new Date().toISOString();
export class AppStore {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
    this.migrate();
    this.seed();
  }
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS worlds(id TEXT PRIMARY KEY, spec_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS world_tower_themes(world_id TEXT PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE, spec_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS world_enemy_themes(world_id TEXT PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE, spec_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE, spec_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS levels(id TEXT PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE, difficulty TEXT NOT NULL, spec_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS world_skins(world_id TEXT PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE, spec_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS generation_jobs(id TEXT PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE, status TEXT NOT NULL, current_step TEXT NOT NULL, error_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS player_progress(player_id TEXT NOT NULL, level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE, unlocked INTEGER NOT NULL, completed INTEGER NOT NULL, best_win INTEGER, best_remaining_hp REAL, best_duration REAL, updated_at TEXT NOT NULL, PRIMARY KEY(player_id, level_id));
      CREATE TABLE IF NOT EXISTS game_runs(id TEXT PRIMARY KEY, player_id TEXT NOT NULL, level_id TEXT NOT NULL REFERENCES levels(id), seed INTEGER NOT NULL, status TEXT NOT NULL, result_json TEXT, started_at TEXT NOT NULL, completed_at TEXT);
      CREATE TABLE IF NOT EXISTS evaluation_runs(id TEXT PRIMARY KEY, level_id TEXT NOT NULL REFERENCES levels(id), status TEXT NOT NULL, report_json TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, '${now()}');
    `);
    const columns = new Set((this.db.prepare("PRAGMA table_info(generation_jobs)").all() as { name: string }[]).map(column => column.name));
    if (!columns.has("input_prompt")) this.db.exec("ALTER TABLE generation_jobs ADD COLUMN input_prompt TEXT NOT NULL DEFAULT ''");
    if (!columns.has("seed")) this.db.exec("ALTER TABLE generation_jobs ADD COLUMN seed INTEGER NOT NULL DEFAULT 0");
    if (!columns.has("stage_json")) this.db.exec("ALTER TABLE generation_jobs ADD COLUMN stage_json TEXT NOT NULL DEFAULT '{}'");
    if (!columns.has("retries")) this.db.exec("ALTER TABLE generation_jobs ADD COLUMN retries INTEGER NOT NULL DEFAULT 0");
    this.db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(2, ?)").run(now());
    const evaluationColumns = new Set((this.db.prepare("PRAGMA table_info(evaluation_runs)").all() as { name: string }[]).map(column => column.name));
    if (!evaluationColumns.has("world_id")) this.db.exec("ALTER TABLE evaluation_runs ADD COLUMN world_id TEXT NOT NULL DEFAULT ''");
    if (!evaluationColumns.has("agent_version")) this.db.exec("ALTER TABLE evaluation_runs ADD COLUMN agent_version TEXT NOT NULL DEFAULT 'legacy'");
    if (!evaluationColumns.has("evidence_json")) this.db.exec("ALTER TABLE evaluation_runs ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '{}'");
    if (!evaluationColumns.has("error_json")) this.db.exec("ALTER TABLE evaluation_runs ADD COLUMN error_json TEXT");
    if (!evaluationColumns.has("updated_at")) this.db.exec("ALTER TABLE evaluation_runs ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
    this.db.exec("UPDATE evaluation_runs SET world_id=(SELECT world_id FROM levels WHERE levels.id=evaluation_runs.level_id) WHERE world_id=''");
    this.db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(3, ?)").run(now());
    this.recoverInterruptedJobs();
  }
  private seed(): void {
    const worldId = "frontier-world";
    const existing = this.db.prepare("SELECT id FROM worlds WHERE id=?").get(worldId);
    if (existing) {
      const levels = this.listLevels(worldId);
      if (levels.length === 3) {
        const campaign: CampaignSpec = campaignSpecSchema.parse({ id: "frontier-campaign", worldId, name: "边境战役", levels: levels.map(({ id, difficulty, name, story }) => ({ id, difficulty, name, story, semanticTags: [] })) });
        this.db.prepare("INSERT INTO campaigns(id,world_id,spec_json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET spec_json=excluded.spec_json").run(campaign.id, worldId, JSON.stringify(campaign));
        const seedProgress = this.db.prepare("INSERT OR IGNORE INTO player_progress(player_id,level_id,unlocked,completed,updated_at) VALUES('local-player',?,?,0,?)");
        for (const level of levels) seedProgress.run(level.id, 1, now());
      }
      return;
    }
    const world: WorldSpec = { id: worldId, name: "边境哨站", summary: "守住通往王国腹地的最后一道防线。", playerFactionName: "边境守军", enemyFactionName: "荒野军团", visualKeywords: ["边境", "森林", "石堡"], themeFamily: "fantasy", status: "ready" };
    const insertWorld = this.db.prepare("INSERT INTO worlds(id,spec_json,created_at) VALUES(?,?,?)");
    const insertLevel = this.db.prepare("INSERT INTO levels(id,world_id,difficulty,spec_json) VALUES(?,?,?,?)");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      insertWorld.run(world.id, JSON.stringify(world), now());
      const seededLevels: LevelRecord[] = [];
      for (const [index, difficulty] of (["easy", "medium", "hard"] as const).entries()) {
        const id = `frontier-${difficulty}`;
        const generated = generateMap({ difficulty, seed: [70421, 70422, 70423][index]! });
        if (!generated.ok) throw new Error(`Unable to create built-in ${difficulty} map: ${generated.message}`);
        const level: LevelRecord = { id, worldId, difficulty, name: `${world.name} · ${difficulty.toUpperCase()}`, story: "守住防线，迎接下一场考验。", map: { ...generated.map, id } };
        insertLevel.run(id, worldId, difficulty, JSON.stringify(level));
        seededLevels.push(level);
      }
      const campaign: CampaignSpec = campaignSpecSchema.parse({ id: "frontier-campaign", worldId, name: "边境战役", levels: seededLevels.map(({ id, difficulty, name, story }) => ({ id, difficulty, name, story, semanticTags: [] })) });
      this.db.prepare("INSERT INTO campaigns(id,world_id,spec_json) VALUES(?,?,?)").run(campaign.id, worldId, JSON.stringify(campaign));
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    const seedProgress = this.db.prepare("INSERT OR IGNORE INTO player_progress(player_id,level_id,unlocked,completed,updated_at) VALUES('local-player',?,?,0,?)");
    for (const difficulty of ["easy", "medium", "hard"] as const) seedProgress.run(`frontier-${difficulty}`, 1, now());
  }
  listWorlds(): WorldSpec[] {
    return (this.db.prepare("SELECT spec_json FROM worlds ORDER BY created_at DESC").all() as { spec_json: string }[]).map(row => JSON.parse(row.spec_json) as WorldSpec);
  }
  getWorld(id: string): WorldSpec | undefined {
    const row = this.db.prepare("SELECT spec_json FROM worlds WHERE id=?").get(id) as { spec_json: string } | undefined;
    return row ? JSON.parse(row.spec_json) as WorldSpec : undefined;
  }
  listPublishedWorlds(): WorldSpec[] { return this.listWorlds().filter(world => world.status === "published"); }
  getPublishReadiness(worldId: string): { ready: boolean; issues: string[] } | undefined {
    const world = this.getWorld(worldId);
    if (!world) return undefined;
    const issues: string[] = [];
    const levels = this.listLevels(worldId);
    if (levels.length !== 3 || new Set(levels.map(level => level.difficulty)).size !== 3 || !(["easy", "medium", "hard"] as const).every(difficulty => levels.some(level => level.difficulty === difficulty))) issues.push("campaign_must_have_easy_medium_hard");
    for (const level of levels) {
      const map = mapSpecSchema.safeParse(level.map);
      if (!map.success || !validateMapSpec(map.data).valid) issues.push(`invalid_map:${level.id}`);
    }
    if (world.status !== "ready" && world.status !== "published") issues.push("world_not_ready");
    const reports = this.db.prepare("SELECT level_id,status,report_json FROM evaluation_runs WHERE world_id=? ORDER BY created_at DESC,id DESC").all(worldId) as { level_id: string; status: string; report_json: string }[];
    const evaluated = new Set<string>();
    const latestByLevel = new Map<string, typeof reports[number]>();
    for (const row of reports) if (!latestByLevel.has(row.level_id)) latestByLevel.set(row.level_id, row);
    for (const level of levels) {
      const row = latestByLevel.get(level.id);
      if (!row || row.status !== "completed") continue;
      try {
        const report = evaluationReportSchema.parse(JSON.parse(row.report_json));
        if (report.worldId === worldId && report.levelId === row.level_id && report.runIds.length > 0 && report.metrics.runs > 0) evaluated.add(row.level_id);
      } catch { /* Invalid persisted reports never satisfy the publish gate. */ }
    }
    if (levels.some(level => !evaluated.has(level.id))) issues.push("all_levels_need_evaluation_reports");
    return { ready: issues.length === 0, issues };
  }
  publishWorld(worldId: string): WorldSpec | undefined {
    const world = this.getWorld(worldId);
    if (!world) return undefined;
    const readiness = this.getPublishReadiness(worldId);
    if (!readiness?.ready) throw new Error(`publish_gate_failed:${readiness?.issues.join(",") ?? "unknown"}`);
    const published = { ...world, status: "published" as const };
    this.db.prepare("UPDATE worlds SET spec_json=? WHERE id=?").run(JSON.stringify(published), worldId);
    return published;
  }
  getWorldContent(id: string): { towerTheme?: unknown; enemyTheme?: unknown; campaign?: unknown; skin?: unknown } | undefined {
    if (!this.getWorld(id)) return undefined;
    const read = (sql: string) => (this.db.prepare(sql).get(id) as { spec_json: string } | undefined)?.spec_json;
    const towerTheme = read("SELECT spec_json FROM world_tower_themes WHERE world_id=?");
    const enemyTheme = read("SELECT spec_json FROM world_enemy_themes WHERE world_id=?");
    const campaign = read("SELECT spec_json FROM campaigns WHERE world_id=?");
    const skin = read("SELECT spec_json FROM world_skins WHERE world_id=?");
    return { ...(towerTheme ? { towerTheme: JSON.parse(towerTheme) as unknown } : {}), ...(enemyTheme ? { enemyTheme: JSON.parse(enemyTheme) as unknown } : {}), ...(campaign ? { campaign: JSON.parse(campaign) as unknown } : {}), ...(skin ? { skin: JSON.parse(skin) as unknown } : {}) };
  }
  listLevels(worldId: string): LevelRecord[] {
    return (this.db.prepare("SELECT spec_json FROM levels WHERE world_id=? ORDER BY CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END").all(worldId) as { spec_json: string }[]).map(row => JSON.parse(row.spec_json) as LevelRecord);
  }
  getLevel(id: string): LevelRecord | undefined {
    const row = this.db.prepare("SELECT spec_json FROM levels WHERE id=?").get(id) as { spec_json: string } | undefined;
    return row ? JSON.parse(row.spec_json) as LevelRecord : undefined;
  }
  getProgress(playerId: string): PlayerProgress[] {
    return (this.db.prepare("SELECT p.*,l.id AS level_id FROM player_progress p JOIN levels l ON l.id=p.level_id WHERE player_id=? ORDER BY l.world_id,l.difficulty").all(playerId) as { player_id: string; level_id: string; unlocked: number; completed: number; best_win: number | null; best_remaining_hp: number | null; best_duration: number | null; updated_at: string }[]).map(row => ({ playerId: row.player_id, levelId: row.level_id, unlocked: Boolean(row.unlocked), completed: Boolean(row.completed), bestWin: row.best_win === null ? null : Boolean(row.best_win), bestRemainingHp: row.best_remaining_hp, bestDuration: row.best_duration, updatedAt: row.updated_at }));
  }
  createGenerationJob(prompt: string, seed: number): GenerationJob {
    const worldId = `world-${randomUUID()}`;
    const jobId = `generation-${randomUUID()}`;
    const timestamp = now();
    const initialWorld: WorldSpec = { id: worldId, name: "正在生成的新世界", summary: prompt.slice(0, 240), playerFactionName: "守护者", enemyFactionName: "入侵者", visualKeywords: [], themeFamily: "fantasy", status: "generating" };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO worlds(id,spec_json,created_at) VALUES(?,?,?)").run(worldId, JSON.stringify(initialWorld), timestamp);
      this.db.prepare("INSERT INTO generation_jobs(id,world_id,status,current_step,error_json,created_at,updated_at,input_prompt,seed,stage_json,retries) VALUES(?,?,'queued','world_identity',NULL,?,?,?,?,'{}',0)").run(jobId, worldId, timestamp, timestamp, prompt, seed);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return this.getGeneration(jobId)!.job;
  }
  getGeneration(id: string): { job: GenerationJob; stages: Record<string, unknown> } | undefined {
    const row = this.db.prepare("SELECT id,world_id,status,current_step,input_prompt,seed,retries,error_json,created_at,updated_at,stage_json FROM generation_jobs WHERE id=?").get(id) as {
      id: string; world_id: string; status: string; current_step: string; input_prompt: string; seed: number; retries: number; error_json: string | null; created_at: string; updated_at: string; stage_json: string;
    } | undefined;
    if (!row) return undefined;
    const errorRecord = row.error_json ? JSON.parse(row.error_json) as { message?: string } : null;
    return {
      job: generationJobSchema.parse({ id: row.id, worldId: row.world_id, status: row.status, currentStep: row.current_step, inputPrompt: row.input_prompt, seed: row.seed, retries: row.retries, error: errorRecord?.message ?? null, createdAt: row.created_at, updatedAt: row.updated_at }),
      stages: JSON.parse(row.stage_json) as Record<string, unknown>,
    };
  }
  listGenerations(limit = 12): GenerationJob[] {
    const ids = (this.db.prepare("SELECT id FROM generation_jobs ORDER BY created_at DESC LIMIT ?").all(Math.min(Math.max(limit, 1), 50)) as { id: string }[]).map(row => row.id);
    return ids.flatMap(id => { const generation = this.getGeneration(id); return generation ? [generation.job] : []; });
  }
  updateGenerationStage(id: string, nextStep: string, stages: Record<string, unknown>): void {
    const updated = this.db.prepare("UPDATE generation_jobs SET status='running',current_step=?,stage_json=?,updated_at=? WHERE id=? AND status='running'").run(nextStep, JSON.stringify(stages), now(), id);
    if (Number(updated.changes) !== 1) throw new Error("generation_job_not_running");
  }
  startGeneration(id: string): void {
    const updated = this.db.prepare("UPDATE generation_jobs SET status='running',error_json=NULL,updated_at=? WHERE id=? AND status='queued'").run(now(), id);
    if (Number(updated.changes) !== 1) throw new Error("generation_job_not_queued");
  }
  failGeneration(id: string, message: string): void {
    const row = this.getGeneration(id);
    if (!row) return;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE generation_jobs SET status='failed',error_json=?,updated_at=? WHERE id=?").run(JSON.stringify({ message }), now(), id);
      const world = this.getWorld(row.job.worldId);
      if (world) this.db.prepare("UPDATE worlds SET spec_json=? WHERE id=?").run(JSON.stringify({ ...world, status: "failed" }), world.id);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  retryGeneration(id: string, maximumRetries = 3): GenerationJob | undefined {
    const current = this.getGeneration(id);
    if (!current) return undefined;
    if (current.job.status !== "failed") throw new Error("generation_job_not_failed");
    if (current.job.retries >= maximumRetries) throw new Error("generation_retry_limit");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE generation_jobs SET status='queued',error_json=NULL,retries=retries+1,updated_at=? WHERE id=?").run(now(), id);
      const world = this.getWorld(current.job.worldId);
      if (world) this.db.prepare("UPDATE worlds SET spec_json=? WHERE id=?").run(JSON.stringify({ ...world, status: "generating" }), world.id);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return this.getGeneration(id)?.job;
  }
  recoverInterruptedJobs(): void {
    const timestamp = now();
    this.db.prepare("UPDATE generation_jobs SET status='failed',error_json=?,updated_at=? WHERE status IN ('queued','running')")
      .run(JSON.stringify({ message: "Generation was interrupted by a server restart; retry to continue." }), timestamp);
    this.db.prepare("UPDATE worlds SET spec_json=json_set(spec_json,'$.status','failed') WHERE id IN (SELECT world_id FROM generation_jobs WHERE status='failed')").run();
    this.db.prepare("UPDATE evaluation_runs SET status='failed',error_json=?,updated_at=? WHERE status IN ('queued','running')")
      .run(JSON.stringify({ message: "Evaluation was interrupted by a server restart; retry evaluation." }), timestamp);
    this.db.prepare("UPDATE worlds SET spec_json=json_set(spec_json,'$.status','generated') WHERE json_extract(spec_json,'$.status')='evaluating'").run();
  }
  completeGeneration(input: { jobId: string; world: WorldSpec; towerTheme: TowerThemeSpec; enemyTheme: EnemyThemeSpec; campaign: CampaignSpec; skin: WorldSkin; levels: LevelRecord[]; stages: Record<string, unknown> }): void {
    const completedAt = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE worlds SET spec_json=? WHERE id=?").run(JSON.stringify(input.world), input.world.id);
      this.db.prepare("INSERT INTO world_tower_themes(world_id,spec_json) VALUES(?,?) ON CONFLICT(world_id) DO UPDATE SET spec_json=excluded.spec_json").run(input.world.id, JSON.stringify(input.towerTheme));
      this.db.prepare("INSERT INTO world_enemy_themes(world_id,spec_json) VALUES(?,?) ON CONFLICT(world_id) DO UPDATE SET spec_json=excluded.spec_json").run(input.world.id, JSON.stringify(input.enemyTheme));
      this.db.prepare("INSERT INTO campaigns(id,world_id,spec_json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET spec_json=excluded.spec_json").run(input.campaign.id, input.world.id, JSON.stringify(input.campaign));
      this.db.prepare("INSERT INTO world_skins(world_id,spec_json) VALUES(?,?) ON CONFLICT(world_id) DO UPDATE SET spec_json=excluded.spec_json").run(input.world.id, JSON.stringify(input.skin));
      const removeLevels = this.db.prepare("DELETE FROM levels WHERE world_id=?"); removeLevels.run(input.world.id);
      const insertLevel = this.db.prepare("INSERT INTO levels(id,world_id,difficulty,spec_json) VALUES(?,?,?,?)");
      const insertProgress = this.db.prepare("INSERT INTO player_progress(player_id,level_id,unlocked,completed,updated_at) VALUES('local-player',?,?,0,?)");
      for (const level of input.levels) { insertLevel.run(level.id, level.worldId, level.difficulty, JSON.stringify(level)); insertProgress.run(level.id, 1, completedAt); }
      this.db.prepare("UPDATE generation_jobs SET status='completed',current_step='completed',error_json=NULL,stage_json=?,updated_at=? WHERE id=?").run(JSON.stringify(input.stages), completedAt, input.jobId);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  createEvaluationRecords(worldId: string, levelIds: string[], agentVersion: string): EvaluationRecord[] {
    const world = this.getWorld(worldId);
    if (!world) throw new Error("world_not_found");
    if (world.status === "published") throw new Error("world_already_published");
    const previous = this.db.prepare("SELECT MAX(created_at) AS timestamp FROM evaluation_runs WHERE world_id=?").get(worldId) as { timestamp: string | null };
    const firstTimestamp = Math.max(Date.now(), previous.timestamp ? Date.parse(previous.timestamp) + 1 : 0);
    const records: EvaluationRecord[] = levelIds.map((levelId, index) => {
      const timestamp = new Date(firstTimestamp + index).toISOString();
      return { id: `evaluation-${randomUUID()}`, worldId, levelId, status: "queued", agentVersion, report: null, error: null, createdAt: timestamp, updatedAt: timestamp };
    });
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const insert = this.db.prepare("INSERT INTO evaluation_runs(id,level_id,status,report_json,created_at,world_id,agent_version,evidence_json,error_json,updated_at) VALUES(?,?,'queued','{}',?,?,?,'{}',NULL,?)");
      for (const record of records) insert.run(record.id, record.levelId, record.createdAt, worldId, agentVersion, record.updatedAt);
      this.db.prepare("UPDATE worlds SET spec_json=? WHERE id=?").run(JSON.stringify({ ...world, status: "evaluating" }), worldId);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return records;
  }
  startEvaluation(id: string): void {
    const result = this.db.prepare("UPDATE evaluation_runs SET status='running',updated_at=? WHERE id=? AND status='queued'").run(now(), id);
    if (Number(result.changes) !== 1) throw new Error("evaluation_not_queued");
  }
  completeEvaluation(id: string, report: EvaluationReport, evidence: unknown): void {
    const parsed = evaluationReportSchema.parse(report);
    const result = this.db.prepare("UPDATE evaluation_runs SET status='completed',report_json=?,evidence_json=?,error_json=NULL,updated_at=? WHERE id=? AND status='running'").run(JSON.stringify(parsed), JSON.stringify(evidence), now(), id);
    if (Number(result.changes) !== 1) throw new Error("evaluation_not_running");
    this.refreshWorldReadiness(parsed.worldId);
  }
  failEvaluation(id: string, message: string, evidence: unknown): void {
    const row = this.db.prepare("SELECT world_id FROM evaluation_runs WHERE id=?").get(id) as { world_id: string } | undefined;
    if (!row) return;
    this.db.prepare("UPDATE evaluation_runs SET status='failed',error_json=?,evidence_json=?,updated_at=? WHERE id=?").run(JSON.stringify({ message: message.slice(0, 320) }), JSON.stringify(evidence), now(), id);
    const world = this.getWorld(row.world_id);
    if (world && world.status === "evaluating") this.db.prepare("UPDATE worlds SET spec_json=? WHERE id=?").run(JSON.stringify({ ...world, status: "generated" }), world.id);
  }
  private refreshWorldReadiness(worldId: string): void {
    const world = this.getWorld(worldId);
    if (!world || world.status === "published") return;
    const levels = this.listLevels(worldId);
    const latestByLevel = new Map<string, string>();
    const evaluations = this.db.prepare("SELECT level_id,status FROM evaluation_runs WHERE world_id=? ORDER BY created_at DESC,id DESC").all(worldId) as { level_id: string; status: string }[];
    for (const evaluation of evaluations) if (!latestByLevel.has(evaluation.level_id)) latestByLevel.set(evaluation.level_id, evaluation.status);
    const pending = evaluations.some(evaluation => evaluation.status === "queued" || evaluation.status === "running");
    const ready = !pending && levels.length === 3 && levels.every(level => latestByLevel.get(level.id) === "completed");
    const status = ready ? "ready" : pending ? "evaluating" : "generated";
    this.db.prepare("UPDATE worlds SET spec_json=? WHERE id=?").run(JSON.stringify({ ...world, status }), worldId);
  }
  listEvaluations(worldId: string): EvaluationRecord[] {
    const rows = this.db.prepare("SELECT id,world_id,level_id,status,agent_version,report_json,error_json,created_at,updated_at FROM evaluation_runs WHERE world_id=? ORDER BY created_at,id").all(worldId) as { id: string; world_id: string; level_id: string; status: string; agent_version: string; report_json: string; error_json: string | null; created_at: string; updated_at: string }[];
    return rows.map(row => evaluationRecordSchema.parse({ id: row.id, worldId: row.world_id, levelId: row.level_id, status: row.status, agentVersion: row.agent_version, report: row.status === "completed" ? JSON.parse(row.report_json) : null, error: row.error_json ? (JSON.parse(row.error_json) as { message?: string }).message ?? "evaluation_failed" : null, createdAt: row.created_at, updatedAt: row.updated_at }));
  }
  getEvaluationEvidence(id: string): unknown | undefined {
    const row = this.db.prepare("SELECT evidence_json FROM evaluation_runs WHERE id=?").get(id) as { evidence_json: string } | undefined;
    return row ? JSON.parse(row.evidence_json) as unknown : undefined;
  }
  startRun(levelId: string, playerId: string, seed?: number): { runId: string; level: LevelRecord; seed: number } | undefined {
    const level = this.getLevel(levelId);
    if (!level) return undefined;
    const progress = this.db.prepare("SELECT unlocked FROM player_progress WHERE player_id=? AND level_id=?").get(playerId, levelId) as { unlocked: number } | undefined;
    if (progress?.unlocked !== 1) throw new Error("level_locked");
    const runSeed = seed ?? level.map.seed;
    const runId = randomUUID();
    this.db.prepare("INSERT INTO game_runs(id,player_id,level_id,seed,status,started_at) VALUES(?,?,?,?,'running',?)").run(runId, playerId, levelId, runSeed, now());
    return { runId, level, seed: runSeed };
  }
  saveResult(runId: string, levelId: string, resultInput: unknown): PlayerProgress | undefined {
    const result = gameResultSchema.parse(resultInput);
    if (result.levelId !== levelId) throw new Error("result_level_mismatch");
    const run = this.db.prepare("SELECT player_id,level_id,seed,status FROM game_runs WHERE id=?").get(runId) as { player_id: string; level_id: string; seed: number; status: string } | undefined;
    if (!run || run.level_id !== levelId || run.status !== "running") throw new Error("run_not_active");
    if (result.seed !== run.seed) throw new Error("result_seed_mismatch");
    const level = this.getLevel(levelId)!;
    const completedAt = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE game_runs SET status='completed',result_json=?,completed_at=? WHERE id=?").run(JSON.stringify(result), completedAt, runId);
      const previous = this.db.prepare("SELECT best_win,best_remaining_hp,best_duration FROM player_progress WHERE player_id=? AND level_id=?").get(run.player_id, levelId) as { best_win: number | null; best_remaining_hp: number | null; best_duration: number | null } | undefined;
      const isBetter = !previous || (result.win && !previous.best_win) || (result.win === Boolean(previous.best_win) && result.remainingHp > (previous.best_remaining_hp ?? -1)) || (result.win === Boolean(previous.best_win) && result.remainingHp === previous.best_remaining_hp && result.duration < (previous.best_duration ?? Infinity));
      const best = isBetter ? result : undefined;
      this.db.prepare(`INSERT INTO player_progress(player_id,level_id,unlocked,completed,best_win,best_remaining_hp,best_duration,updated_at)
        VALUES(?,?,1,?,?,?, ?,?) ON CONFLICT(player_id,level_id) DO UPDATE SET completed=MAX(completed,excluded.completed),
        best_win=excluded.best_win,best_remaining_hp=excluded.best_remaining_hp,best_duration=excluded.best_duration,updated_at=excluded.updated_at`)
        .run(run.player_id, levelId, Number(result.win), Number(best ? result.win : Boolean(previous?.best_win)), best?.remainingHp ?? previous?.best_remaining_hp ?? result.remainingHp, best?.duration ?? previous?.best_duration ?? result.duration, completedAt);
      if (result.win) {
        const next = (this.listLevels(level.worldId).findIndex(candidate => candidate.id === levelId)) + 1;
        const nextLevel = this.listLevels(level.worldId)[next];
        if (nextLevel) this.db.prepare("INSERT INTO player_progress(player_id,level_id,unlocked,completed,updated_at) VALUES(?,?,1,0,?) ON CONFLICT(player_id,level_id) DO UPDATE SET unlocked=1,updated_at=excluded.updated_at").run(run.player_id, nextLevel.id, completedAt);
      }
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return this.getProgress(run.player_id).find(progress => progress.levelId === levelId);
  }
  close(): void { this.db.close(); }
}
