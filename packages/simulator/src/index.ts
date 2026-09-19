import { createGameEngine, FIXED_TICK_SECONDS, type GameEngine } from "@fantasy-frontiers/core";
import { validateMapSpec } from "@fantasy-frontiers/maps";
import {
  BOT_CONFIG, DIFFICULTY_PROFILES, GAME_CONFIG, GAME_CONFIG_VERSION, SIMULATOR_CONFIG, simulationRunSchema,
  type Coordinate, type GameAction, type GameObservation, type GameResult, type MapSpec, type SimulationRun,
} from "@fantasy-frontiers/shared";

export interface LookaheadResult {
  ticks: number;
  killed: number;
  leaked: number;
  remainingHp: number;
  remainingEnemyHp: number;
  remainingEnemies: number;
  remainingGold: number;
  won: boolean;
  lost: boolean;
}
export interface BotDecisionContext {
  observation: GameObservation;
  /** Bounded deterministic branch on the same Game Core rules, available to expert policies. */
  lookAhead: (action: GameAction, ticks?: number) => LookaheadResult;
}
export interface BotPolicy { readonly id: string; readonly version: string; decide(context: BotDecisionContext): GameAction[] }
export class SimulationError extends Error {
  constructor(readonly code: "invalid_map" | "invalid_policy_plan" | "rejected_bot_action" | "tick_limit" | "invalid_result", message: string) {
    super(message);
    this.name = "SimulationError";
  }
}

type BuildAction = Extract<GameAction, { type: "placeTower" }>;
type UpgradeAction = Extract<GameAction, { type: "upgradeTower" }>;
type EconomicAction = BuildAction | UpgradeAction;

function positionCoverage(map: MapSpec, position: Coordinate, range: number): number {
  let total = 0;
  let covered = 0;
  for (const path of map.paths) {
    for (let index = 0; index < path.tiles.length; index++) {
      const tile = path.tiles[index]!;
      total++;
      if (Math.hypot(tile.x - position.x, tile.y - position.y) <= range) {
        covered += 0.6 + 0.4 * index / Math.max(1, path.tiles.length - 1);
      }
    }
  }
  return total === 0 ? 0 : covered / total;
}

function towerEfficiency(map: MapSpec, position: Coordinate, archetype: keyof typeof GAME_CONFIG.towers): number {
  const tower = GAME_CONFIG.towers[archetype];
  const mix = DIFFICULTY_PROFILES[map.difficulty].enemyComposition;
  const expectedDps = tower.damage * tower.attackSpeed
    + tower.splashRadius * 5 * (1 + (mix.fast ?? 0) + (mix.normal ?? 0))
    + tower.slowRatio * 8 * ((mix.fast ?? 0) + (mix.tank ?? 0));
  return expectedDps * positionCoverage(map, position, tower.range) / tower.cost;
}

function novicePolicy(): BotPolicy {
  return {
    id: "novice", version: "1.0.0",
    decide({ observation }) {
      const actions: GameAction[] = [];
      let gold = observation.state.gold;
      const occupied = new Set(observation.state.towers.map(tower => `${tower.position.x},${tower.position.y}`));
      const cost = GAME_CONFIG.towers.basic.cost;
      for (const position of observation.map.buildSlots) {
        if (gold < cost) break;
        if (occupied.has(`${position.x},${position.y}`)) continue;
        actions.push({ type: "placeTower", archetype: "basic", position });
        gold -= cost;
      }
      actions.push({ type: "startWave" });
      return actions;
    },
  };
}

function baselinePolicy(): BotPolicy {
  return {
    id: "baseline", version: "1.0.0",
    decide({ observation }) {
      const { map, state } = observation;
      const reserve = Math.floor(state.gold * BOT_CONFIG.baselineReserveRatio);
      let gold = state.gold;
      const maxSpend = state.gold - reserve;
      const occupied = new Set(state.towers.map(tower => `${tower.position.x},${tower.position.y}`));
      const levels = new Map(state.towers.map(tower => [tower.id, { archetype: tower.archetype, level: tower.level, position: tower.position }]));
      const actions: GameAction[] = [];
      let spent = 0;

      for (let decision = 0; decision < BOT_CONFIG.baselineMaxActionsPerWave; decision++) {
        const candidates: Array<{ action: EconomicAction; cost: number; score: number; order: string }> = [];
        for (const position of map.buildSlots) {
          if (occupied.has(`${position.x},${position.y}`)) continue;
          for (const archetype of ["basic", "aoe", "slow", "heavy"] as const) {
            const cost = GAME_CONFIG.towers[archetype].cost;
            if (cost > gold) continue;
            candidates.push({
              action: { type: "placeTower", archetype, position }, cost,
              score: towerEfficiency(map, position, archetype), order: `0-${position.y}-${position.x}-${archetype}`,
            });
          }
        }
        for (const [towerId, tower] of levels) {
          if (tower.level >= GAME_CONFIG.economy.maximumTowerLevel) continue;
          const definition = GAME_CONFIG.towers[tower.archetype];
          const cost = Math.ceil(definition.upgradeCost * definition.upgradeMultiplier ** (tower.level - 1));
          if (cost > gold) continue;
          const gain = definition.damage * definition.attackSpeed * (definition.upgradeMultiplier - 1) * definition.upgradeMultiplier ** (tower.level - 1);
          candidates.push({ action: { type: "upgradeTower", towerId }, cost, score: gain * positionCoverage(map, tower.position, definition.range) / cost, order: `1-${towerId}` });
        }
        candidates.sort((a, b) => b.score - a.score || a.order.localeCompare(b.order));
        const selected = candidates.find(candidate => spent + candidate.cost <= maxSpend && candidate.score > 0);
        if (!selected) break;
        actions.push(selected.action);
        gold -= selected.cost;
        spent += selected.cost;
        if (selected.action.type === "placeTower") occupied.add(`${selected.action.position.x},${selected.action.position.y}`);
        else {
          const level = levels.get(selected.action.towerId);
          if (level) level.level++;
        }
      }
      actions.push({ type: "startWave" });
      return actions;
    },
  };
}

function expertPolicy(): BotPolicy {
  return {
    id: "expert", version: "1.0.0",
    decide({ observation, lookAhead }) {
      const { map, state } = observation;
      const horizon = BOT_CONFIG.expertLookaheadTicks;
      const baseline = lookAhead({ type: "startWave" }, horizon);
      const baselineValue = forecastValue(baseline);
      const positions = observation.legalBuildSlots
        .map(position => ({ position, coverage: Math.max(...(["basic", "aoe", "slow", "heavy"] as const).map(type => positionCoverage(map, position, GAME_CONFIG.towers[type].range))) }))
        .sort((a, b) => b.coverage - a.coverage || a.position.y - b.position.y || a.position.x - b.position.x)
        .slice(0, BOT_CONFIG.expertCandidateSlots);
      const actions: EconomicAction[] = [];
      for (const { position } of positions) {
        for (const archetype of ["basic", "aoe", "slow", "heavy"] as const) {
          if (state.gold >= GAME_CONFIG.towers[archetype].cost) actions.push({ type: "placeTower", archetype, position });
        }
      }
      for (const tower of state.towers) {
        if (tower.level >= GAME_CONFIG.economy.maximumTowerLevel) continue;
        const definition = GAME_CONFIG.towers[tower.archetype];
        const cost = Math.ceil(definition.upgradeCost * definition.upgradeMultiplier ** (tower.level - 1));
        if (state.gold >= cost) actions.push({ type: "upgradeTower", towerId: tower.id });
      }
      let best: { action: EconomicAction; value: number } | undefined;
      for (const action of actions) {
        const forecast = lookAhead(action, horizon);
        const value = forecastValue(forecast);
        if (!best || value > best.value) best = { action, value };
      }
      if (!best || best.value <= baselineValue + BOT_CONFIG.expertActionThreshold) return [{ type: "startWave" }];
      return [best.action, { type: "startWave" }];
    },
  };
}

function forecastValue(forecast: LookaheadResult): number {
  return forecast.killed * 12 - forecast.leaked * 18 + forecast.remainingHp * 0.8
    - forecast.remainingEnemyHp * 0.16 - forecast.remainingEnemies * 0.75 + forecast.remainingGold * 0.025
    + (forecast.won ? 1000 : 0) - (forecast.lost ? 1000 : 0);
}

export const NOVICE_POLICY = novicePolicy();
export const BASELINE_POLICY = baselinePolicy();
export const EXPERT_POLICY = expertPolicy();
export const BOT_POLICIES: readonly BotPolicy[] = [NOVICE_POLICY, BASELINE_POLICY, EXPERT_POLICY];
export function getBotPolicy(id: BotPolicy["id"]): BotPolicy {
  const policy = BOT_POLICIES.find(candidate => candidate.id === id);
  if (!policy) throw new RangeError(`Unknown bot policy: ${id}`);
  return policy;
}

function lookAhead(engine: GameEngine, action: GameAction, horizon: number): LookaheadResult {
  if (!Number.isSafeInteger(horizon) || horizon < 0 || horizon > BOT_CONFIG.maxLookaheadTicks) {
    throw new RangeError(`Look-ahead ticks must be between 0 and ${BOT_CONFIG.maxLookaheadTicks}`);
  }
  const branch = engine.fork();
  if (action.type !== "startWave") {
    const accepted = branch.dispatch(action).accepted;
    if (!accepted) return { ticks: 0, killed: 0, leaked: 0, remainingHp: branch.state.hp, remainingEnemyHp: Infinity, remainingEnemies: Infinity, remainingGold: branch.state.gold, won: false, lost: true };
    branch.dispatch({ type: "startWave" });
  } else branch.dispatch(action);
  const startKills = branch.state.stats.enemiesKilled;
  const startLeaks = branch.state.stats.enemiesLeaked;
  let ticks = 0;
  for (; ticks < horizon && branch.state.status === "running"; ticks++) branch.step();
  const state = branch.state;
  return {
    ticks, killed: state.stats.enemiesKilled - startKills, leaked: state.stats.enemiesLeaked - startLeaks,
    remainingHp: state.hp, remainingEnemyHp: state.enemies.reduce((sum, enemy) => sum + enemy.hp, 0),
    remainingEnemies: state.enemies.length + state.activeWaveQueue.length, remainingGold: state.gold,
    won: state.status === "won", lost: state.status === "lost",
  };
}

export interface RunEpisodeOptions { map: MapSpec; seed?: number; policy: BotPolicy; runId?: string; maxTicks?: number }
export interface RunBatchOptions { map: MapSpec; seeds: readonly number[]; policy: BotPolicy; batchId?: string; maxTicks?: number }

interface WaveStartSnapshot { waveIndex: number; hp: number; gold: number; stats: GameEngine["state"]["stats"]; }
function makeWaveResult(start: WaveStartSnapshot, end: GameEngine["state"], completed: boolean, ticks: number) {
  const types = new Set([...Object.keys(start.stats.towerUsage), ...Object.keys(end.stats.towerUsage)]);
  const towerUsage = Object.fromEntries([...types].sort().map(type => [type, (end.stats.towerUsage[type] ?? 0) - (start.stats.towerUsage[type] ?? 0)]));
  return {
    waveIndex: start.waveIndex, completed, startingHp: start.hp, remainingHp: end.hp,
    enemiesSpawned: end.stats.enemiesSpawned - start.stats.enemiesSpawned,
    enemiesKilled: end.stats.enemiesKilled - start.stats.enemiesKilled,
    enemiesLeaked: end.stats.enemiesLeaked - start.stats.enemiesLeaked,
    goldEarned: end.stats.goldEarned - start.stats.goldEarned,
    goldSpent: end.stats.goldSpent - start.stats.goldSpent,
    towerUsage, ticks,
  };
}

export function runEpisode(options: RunEpisodeOptions): SimulationRun {
  const validation = validateMapSpec(options.map);
  if (!validation.valid) throw new SimulationError("invalid_map", `Simulator requires a valid MapSpec: ${validation.issues.map(issue => issue.code).join(", ")}`);
  const engine = createGameEngine({ map: options.map, seed: options.seed ?? options.map.seed });
  const normalizedSeed = engine.state.seed;
  const maxTicks = options.maxTicks ?? SIMULATOR_CONFIG.maxTicksPerRun;
  if (!Number.isSafeInteger(maxTicks) || maxTicks <= 0) throw new RangeError("maxTicks must be a positive safe integer");
  const id = options.runId ?? `run-${options.policy.id}-${options.map.id}-${normalizedSeed}`;
  const actions: SimulationRun["actions"] = [];
  const waves: SimulationRun["waves"] = [];
  let totalTicks = 0;
  let waveStart: WaveStartSnapshot | undefined;
  let waveTicks = 0;

  const forecast = (action: GameAction, ticks?: number) => lookAhead(engine, action, ticks ?? BOT_CONFIG.expertLookaheadTicks);
  while (!engine.result()) {
    const current = engine.state;
    if (current.status === "ready") {
      const planned = options.policy.decide({ observation: engine.observe(), lookAhead: forecast });
      if (planned.length === 0 || planned.at(-1)?.type !== "startWave" || planned.slice(0, -1).some(action => action.type === "startWave")) {
        throw new SimulationError("invalid_policy_plan", `${options.policy.id} must return zero or more deployment actions followed by startWave`);
      }
      for (const action of planned) {
        const outcome = engine.dispatch(action);
        actions.push({ tick: totalTicks, action, accepted: outcome.accepted, ...(!outcome.accepted ? { reason: outcome.reason } : {}) });
        if (!outcome.accepted) throw new SimulationError("rejected_bot_action", `${options.policy.id} action was rejected: ${outcome.reason}`);
        if (action.type === "startWave") {
          waveStart = { waveIndex: engine.state.waveIndex, hp: current.hp, gold: current.gold, stats: current.stats };
          waveTicks = 0;
        }
      }
      continue;
    }
    if (current.status !== "running") throw new SimulationError("invalid_policy_plan", `Unexpected game status during simulation: ${current.status}`);
    if (totalTicks >= maxTicks) throw new SimulationError("tick_limit", `Simulation exceeded maxTicks=${maxTicks}`);
    const events = engine.step();
    totalTicks++;
    waveTicks++;
    const state = engine.state;
    if (state.status !== "running") {
      if (!waveStart) throw new SimulationError("invalid_policy_plan", "Wave ended without a start snapshot");
      waves.push(makeWaveResult(waveStart, state, events.some(event => event.type === "waveCompleted"), waveTicks));
      waveStart = undefined;
    }
  }

  const result = engine.result();
  if (!result) throw new SimulationError("invalid_result", "Game Core ended without a GameResult");
  const run = {
    id,
    resultId: `${id}-result`,
    mapId: options.map.id,
    map: engine.map,
    seed: normalizedSeed,
    configVersion: GAME_CONFIG_VERSION,
    configuration: structuredClone(GAME_CONFIG),
    policyId: options.policy.id,
    policyVersion: options.policy.version,
    totalTicks,
    actions,
    waves,
    result,
  };
  return simulationRunSchema.parse(run);
}

export function runBatch(options: RunBatchOptions): SimulationRun[] {
  return options.seeds.map((seed, index) => runEpisode({
    map: options.map,
    seed,
    policy: options.policy,
    runId: `run-${options.batchId ?? `${options.map.id}-${options.policy.id}`}-${index}-${seed >>> 0}`,
    ...(options.maxTicks === undefined ? {} : { maxTicks: options.maxTicks }),
  }));
}

export interface RunPairComparison {
  seed: number;
  leftRunId: string;
  rightRunId: string;
  leftWin: boolean;
  rightWin: boolean;
  remainingHpDelta: number;
  enemiesKilledDelta: number;
  enemiesLeakedDelta: number;
  goldSpentDelta: number;
}
export interface RunComparison { leftPolicyId: string; rightPolicyId: string; pairs: RunPairComparison[] }

export function compareRuns(leftRuns: readonly SimulationRun[], rightRuns: readonly SimulationRun[]): RunComparison {
  if (leftRuns.length !== rightRuns.length) throw new RangeError("Compared run batches must contain the same number of runs");
  const leftPolicyId = leftRuns[0]?.policyId ?? "";
  const rightPolicyId = rightRuns[0]?.policyId ?? "";
  if (leftRuns.some(run => run.policyId !== leftPolicyId) || rightRuns.some(run => run.policyId !== rightPolicyId)) {
    throw new RangeError("Each compared batch must contain one policy version");
  }
  const pairs = leftRuns.map((left, index) => {
    const right = rightRuns[index]!;
    if (left.seed !== right.seed || left.mapId !== right.mapId || left.configVersion !== right.configVersion
      || JSON.stringify(left.map) !== JSON.stringify(right.map) || JSON.stringify(left.configuration) !== JSON.stringify(right.configuration)) {
      throw new RangeError("Compared runs must use matching maps, configurations, and seeds in the same order");
    }
    return {
      seed: left.seed, leftRunId: left.id, rightRunId: right.id,
      leftWin: left.result.win, rightWin: right.result.win,
      remainingHpDelta: left.result.remainingHp - right.result.remainingHp,
      enemiesKilledDelta: left.result.enemiesKilled - right.result.enemiesKilled,
      enemiesLeakedDelta: left.result.enemiesLeaked - right.result.enemiesLeaked,
      goldSpentDelta: left.result.goldSpent - right.result.goldSpent,
    };
  });
  return { leftPolicyId: leftRuns[0]?.policyId ?? "", rightPolicyId: rightRuns[0]?.policyId ?? "", pairs };
}

export interface PolicyComparisonOptions { map: MapSpec; seeds: readonly number[]; policies?: readonly BotPolicy[]; batchId?: string; maxTicks?: number }
export function comparePolicies(options: PolicyComparisonOptions): { runsByPolicy: Record<string, SimulationRun[]>; comparisons: RunComparison[] } {
  const policies = options.policies ?? BOT_POLICIES;
  if (new Set(policies.map(policy => policy.id)).size !== policies.length) throw new RangeError("Policy IDs must be unique in a comparison");
  const runsByPolicy = Object.fromEntries(policies.map(policy => [policy.id, runBatch({
    map: options.map, seeds: options.seeds, policy, batchId: options.batchId, ...(options.maxTicks === undefined ? {} : { maxTicks: options.maxTicks }),
  })]));
  const comparisons = policies.slice(1).map(policy => compareRuns(runsByPolicy[policies[0]!.id]!, runsByPolicy[policy.id]!));
  return { runsByPolicy, comparisons };
}

export const SIMULATION_TICK_SECONDS = FIXED_TICK_SECONDS;
export type { GameResult };
