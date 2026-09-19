import {
  DIFFICULTY_PROFILES,
  ENEMY_ARCHETYPES,
  GAME_CONFIG,
  SeededRng,
  gameActionSchema,
  gameStateSchema,
  mapSpecSchema,
  type Coordinate,
  type EnemyArchetype,
  type GameAction,
  type GameObservation,
  type GameResult,
  type GameState,
  type MapSpec,
  type TowerArchetype,
} from "@fantasy-frontiers/shared";

export const FIXED_TICK_SECONDS = 1 / GAME_CONFIG.simulation.tickRate;

export interface CreateGameOptions { map: MapSpec; levelId?: string; seed?: number }
export type GameEvent =
  | { type: "towerPlaced"; towerId: string; archetype: TowerArchetype; position: Coordinate }
  | { type: "towerUpgraded"; towerId: string; level: number }
  | { type: "enemySpawned"; enemyId: string; archetype: EnemyArchetype; pathId: string }
  | { type: "towerFired"; towerId: string; targetId: string; position: Coordinate; targetPosition: Coordinate; archetype: TowerArchetype }
  | { type: "enemyKilled"; enemyId: string; position: Coordinate; reward: number }
  | { type: "enemyLeaked"; enemyId: string; position: Coordinate; damage: number }
  | { type: "waveCompleted"; waveIndex: number }
  | { type: "statusChanged"; status: GameState["status"] };
export type DispatchResult =
  | { accepted: true; state: GameState; events: GameEvent[] }
  | { accepted: false; state: GameState; reason: string; events: [] };

const clone = <T>(value: T): T => structuredClone(value);
const pointKey = (point: Coordinate): string => `${point.x},${point.y}`;
const entityId = (state: GameState): string => `entity-${state.nextEntityId}`;

function pointOnPath(path: readonly Coordinate[], progress: number): Coordinate {
  const index = Math.min(Math.floor(progress), path.length - 1);
  const fraction = progress - index;
  const current = path[index]!;
  const next = path[Math.min(index + 1, path.length - 1)]!;
  return { x: current.x + (next.x - current.x) * fraction, y: current.y + (next.y - current.y) * fraction };
}

function buildWave(seed: number, waveIndex: number, difficulty: MapSpec["difficulty"]): EnemyArchetype[] {
  const profile = DIFFICULTY_PROFILES[difficulty];
  const count = profile.waveSizeBase + (waveIndex - 1) * profile.waveSizeGrowth;
  const archetypes = ENEMY_ARCHETYPES.filter(archetype => (profile.enemyComposition[archetype] ?? 0) > 0);
  const weights = archetypes.map(archetype => profile.enemyComposition[archetype] ?? 0);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const rng = new SeededRng((seed + Math.imul(waveIndex, 0x9e3779b9)) >>> 0);
  return Array.from({ length: count }, () => {
    let roll = rng.nextFloat() * totalWeight;
    for (let index = 0; index < archetypes.length; index++) {
      roll -= weights[index]!;
      if (roll < 0) return archetypes[index]!;
    }
    return archetypes.at(-1)!;
  });
}

export class GameEngine {
  readonly map: MapSpec;
  private currentState: GameState;

  constructor(options: CreateGameOptions) {
    const map = mapSpecSchema.parse(options.map);
    const seed = options.seed ?? map.seed;
    if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError("Game seed must be a non-negative safe integer");
    const profile = DIFFICULTY_PROFILES[map.difficulty];
    this.map = map;
    this.currentState = gameStateSchema.parse({
      levelId: options.levelId ?? map.id,
      status: "ready",
      hp: profile.startingHp,
      maxHp: profile.startingHp,
      gold: profile.startingGold,
      waveIndex: 0,
      totalWaves: profile.waveCount,
      towers: [],
      enemies: [],
      elapsedTime: 0,
      seed: seed >>> 0,
      activeWaveQueue: [],
      spawnTimer: 0,
      nextEntityId: 1,
      stats: { enemiesSpawned: 0, enemiesKilled: 0, enemiesLeaked: 0, goldEarned: 0, goldSpent: 0, towersBuilt: 0, towerUsage: {} },
    });
  }

  get state(): GameState { return clone(this.currentState); }
  get status(): GameState["status"] { return this.currentState.status; }

  /** Creates an isolated deterministic branch for bounded bot look-ahead. */
  fork(): GameEngine {
    const branch = new GameEngine({ map: this.map, levelId: this.currentState.levelId, seed: this.currentState.seed });
    branch.currentState = clone(this.currentState);
    return branch;
  }

  observe(selectedTowerId: string | null = null): GameObservation {
    const state = this.state;
    return {
      state,
      map: clone(this.map),
      affordableTowerArchetypes: (Object.keys(GAME_CONFIG.towers) as TowerArchetype[]).filter(type => GAME_CONFIG.towers[type].cost <= state.gold),
      legalBuildSlots: this.map.buildSlots.filter(slot => !state.towers.some(tower => pointKey(tower.position) === pointKey(slot))),
      selectedTowerId: selectedTowerId && state.towers.some(tower => tower.id === selectedTowerId) ? selectedTowerId : null,
    };
  }

  dispatch(input: GameAction | unknown): DispatchResult {
    const parsed = gameActionSchema.safeParse(input);
    if (!parsed.success) return this.reject("Invalid game action");
    const action = parsed.data;
    switch (action.type) {
      case "placeTower": return this.placeTower(action);
      case "upgradeTower": return this.upgradeTower(action.towerId);
      case "startWave": return this.startWave();
      case "pause": return this.changePause("paused");
      case "resume": return this.changePause("running");
    }
  }

  /** Advances exactly one fixed simulation tick. Phaser frame timing never changes rule time. */
  step(): GameEvent[] {
    if (this.currentState.status !== "running") return [];
    const state = this.currentState;
    const profile = DIFFICULTY_PROFILES[this.map.difficulty];
    const dt = FIXED_TICK_SECONDS;
    const events: GameEvent[] = [];
    state.elapsedTime += dt;
    state.spawnTimer = Math.max(0, state.spawnTimer - dt);

    if (state.activeWaveQueue.length > 0 && state.spawnTimer <= Number.EPSILON) {
      const archetype = state.activeWaveQueue.shift()!;
      const rng = new SeededRng((state.seed + state.stats.enemiesSpawned * 0x85ebca6b) >>> 0);
      const path = this.map.paths[rng.int(0, this.map.paths.length - 1)]!;
      const enemyId = entityId(state);
      state.nextEntityId++;
      const enemyStats = GAME_CONFIG.enemies[archetype];
      state.enemies.push({ id: enemyId, archetype, hp: enemyStats.hp, maxHp: enemyStats.hp, pathId: path.id, pathProgress: 0, slowUntil: 0 });
      state.stats.enemiesSpawned++;
      state.spawnTimer = profile.spawnInterval;
      events.push({ type: "enemySpawned", enemyId, archetype, pathId: path.id });
    }

    for (const enemy of [...state.enemies]) {
      const enemyStats = GAME_CONFIG.enemies[enemy.archetype];
      const speedMultiplier = state.elapsedTime < enemy.slowUntil ? 1 - GAME_CONFIG.towers.slow.slowRatio : 1;
      enemy.pathProgress += enemyStats.speed * speedMultiplier * dt;
      const path = this.map.paths.find(candidate => candidate.id === enemy.pathId)!;
      if (enemy.pathProgress >= path.tiles.length - 1) {
        const position = { ...this.map.base };
        state.enemies = state.enemies.filter(candidate => candidate.id !== enemy.id);
        state.hp = Math.max(0, state.hp - enemyStats.leakDamage);
        state.stats.enemiesLeaked++;
        events.push({ type: "enemyLeaked", enemyId: enemy.id, position, damage: enemyStats.leakDamage });
      }
    }

    for (const tower of state.towers) {
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      if (tower.cooldown > Number.EPSILON) continue;
      const stats = GAME_CONFIG.towers[tower.archetype];
      const eligible = state.enemies
        .map(enemy => ({ enemy, position: this.enemyPosition(enemy) }))
        .filter(candidate => Math.hypot(candidate.position.x - tower.position.x, candidate.position.y - tower.position.y) <= stats.range)
        .sort((a, b) => b.enemy.pathProgress - a.enemy.pathProgress || a.enemy.id.localeCompare(b.enemy.id));
      const target = eligible[0];
      if (!target) continue;
      tower.cooldown = 1 / stats.attackSpeed;
      const targets = stats.splashRadius > 0
        ? eligible.filter(candidate => Math.hypot(candidate.position.x - target.position.x, candidate.position.y - target.position.y) <= stats.splashRadius)
        : [target];
      const damage = Math.round(stats.damage * GAME_CONFIG.towers[tower.archetype].upgradeMultiplier ** (tower.level - 1));
      for (const candidate of targets) {
        candidate.enemy.hp -= damage;
        if (tower.archetype === "slow") candidate.enemy.slowUntil = Math.max(candidate.enemy.slowUntil, state.elapsedTime + 1.25);
      }
      const targetId = target.enemy.id;
      state.stats.towerUsage[tower.archetype] = (state.stats.towerUsage[tower.archetype] ?? 0) + 1;
      events.push({ type: "towerFired", towerId: tower.id, targetId, position: { ...tower.position }, targetPosition: target.position, archetype: tower.archetype });
      for (const candidate of targets) {
        if (candidate.enemy.hp > 0) continue;
        state.enemies = state.enemies.filter(enemy => enemy.id !== candidate.enemy.id);
        const reward = Math.round(GAME_CONFIG.enemies[candidate.enemy.archetype].reward * GAME_CONFIG.economy.killRewardMultiplier);
        state.gold += reward;
        state.stats.goldEarned += reward;
        state.stats.enemiesKilled++;
        events.push({ type: "enemyKilled", enemyId: candidate.enemy.id, position: candidate.position, reward });
      }
    }

    if (state.hp <= 0) {
      state.status = "lost";
      events.push({ type: "statusChanged", status: "lost" });
    } else if (state.activeWaveQueue.length === 0 && state.enemies.length === 0) {
      events.push({ type: "waveCompleted", waveIndex: state.waveIndex });
      state.status = state.waveIndex >= state.totalWaves ? "won" : "ready";
      if (state.status === "won") events.push({ type: "statusChanged", status: "won" });
      else events.push({ type: "statusChanged", status: "ready" });
    }
    return events;
  }

  result(): GameResult | null {
    const state = this.currentState;
    if (state.status !== "won" && state.status !== "lost") return null;
    return {
      levelId: state.levelId, seed: state.seed, win: state.status === "won", remainingHp: state.hp, maxHp: state.maxHp,
      startingGold: DIFFICULTY_PROFILES[this.map.difficulty].startingGold, remainingGold: state.gold,
      waveReached: state.waveIndex, totalWaves: state.totalWaves, ...clone(state.stats), duration: state.elapsedTime,
    };
  }

  private placeTower(action: Extract<GameAction, { type: "placeTower" }>): DispatchResult {
    const state = this.currentState;
    if (state.status === "won" || state.status === "lost") return this.reject("The game has ended");
    if (!this.map.buildSlots.some(slot => pointKey(slot) === pointKey(action.position))) return this.reject("Choose a legal build slot");
    if (state.towers.some(tower => pointKey(tower.position) === pointKey(action.position))) return this.reject("A tower already occupies this slot");
    const cost = GAME_CONFIG.towers[action.archetype].cost;
    if (state.gold < cost) return this.reject("Not enough gold");
    const towerId = entityId(state);
    state.nextEntityId++;
    state.gold -= cost;
    state.stats.goldSpent += cost;
    state.stats.towersBuilt++;
    state.towers.push({ id: towerId, archetype: action.archetype, level: 1, position: { ...action.position }, cooldown: 0 });
    return this.accept([{ type: "towerPlaced", towerId, archetype: action.archetype, position: { ...action.position } }]);
  }

  private upgradeTower(towerId: string): DispatchResult {
    const state = this.currentState;
    if (state.status === "won" || state.status === "lost") return this.reject("The game has ended");
    const tower = state.towers.find(candidate => candidate.id === towerId);
    if (!tower) return this.reject("Tower not found");
    if (tower.level >= GAME_CONFIG.economy.maximumTowerLevel) return this.reject("Tower is at maximum level");
    const cost = Math.ceil(GAME_CONFIG.towers[tower.archetype].upgradeCost * GAME_CONFIG.towers[tower.archetype].upgradeMultiplier ** (tower.level - 1));
    if (state.gold < cost) return this.reject("Not enough gold");
    state.gold -= cost;
    state.stats.goldSpent += cost;
    tower.level++;
    return this.accept([{ type: "towerUpgraded", towerId, level: tower.level }]);
  }

  private startWave(): DispatchResult {
    const state = this.currentState;
    if (state.status !== "ready") return this.reject("A wave can only start between waves");
    if (state.waveIndex >= state.totalWaves) return this.reject("All waves are complete");
    state.waveIndex++;
    state.activeWaveQueue = buildWave(state.seed, state.waveIndex, this.map.difficulty);
    state.spawnTimer = 0;
    state.status = "running";
    return this.accept([{ type: "statusChanged", status: "running" }]);
  }

  private changePause(status: "paused" | "running"): DispatchResult {
    const expected = status === "paused" ? "running" : "paused";
    if (this.currentState.status !== expected) return this.reject(status === "paused" ? "No active wave to pause" : "Game is not paused");
    this.currentState.status = status;
    return this.accept([{ type: "statusChanged", status }]);
  }

  private enemyPosition(enemy: GameState["enemies"][number]): Coordinate {
    const path = this.map.paths.find(candidate => candidate.id === enemy.pathId);
    if (!path) throw new Error(`Game state references unknown path ${enemy.pathId}`);
    return pointOnPath(path.tiles, enemy.pathProgress);
  }

  private accept(events: GameEvent[]): DispatchResult { return { accepted: true, state: this.state, events }; }
  private reject(reason: string): DispatchResult { return { accepted: false, state: this.state, reason, events: [] }; }
}

export function createGameEngine(options: CreateGameOptions): GameEngine { return new GameEngine(options); }
