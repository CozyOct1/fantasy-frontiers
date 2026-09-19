import type { Difficulty, EnemyArchetype, TowerArchetype } from "./schemas.js";

export const TOWER_ARCHETYPES: readonly TowerArchetype[] = ["basic", "aoe", "slow", "heavy"];
export const ENEMY_ARCHETYPES: readonly EnemyArchetype[] = ["normal", "fast", "tank", "boss"];

export interface TowerStats {
  cost: number; damage: number; attackSpeed: number; range: number; splashRadius: number;
  slowRatio: number; upgradeCost: number; upgradeMultiplier: number;
}
export interface EnemyStats { hp: number; speed: number; reward: number; leakDamage: number }
export interface DifficultyProfile {
  startingGold: number; startingHp: number; waveCount: number; waveBudget: number;
  buildSlotRange: readonly [number, number]; spawnInterval: number;
  waveSizeBase: number; waveSizeGrowth: number;
  enemyComposition: Readonly<Partial<Record<EnemyArchetype, number>>>;
  minimumBuildSlots: number;
}

// Initial tuning baselines. Balance changes belong here, never in engine logic.
export const GAME_CONFIG = {
  towers: {
    basic: { cost: 80, damage: 12, attackSpeed: 1, range: 3, splashRadius: 0, slowRatio: 0, upgradeCost: 60, upgradeMultiplier: 1.5 },
    aoe: { cost: 120, damage: 8, attackSpeed: 0.8, range: 2.5, splashRadius: 1, slowRatio: 0, upgradeCost: 90, upgradeMultiplier: 1.45 },
    slow: { cost: 100, damage: 4, attackSpeed: 1, range: 3, splashRadius: 0, slowRatio: 0.45, upgradeCost: 75, upgradeMultiplier: 1.4 },
    heavy: { cost: 160, damage: 35, attackSpeed: 0.45, range: 4, splashRadius: 0, slowRatio: 0, upgradeCost: 120, upgradeMultiplier: 1.6 },
  } satisfies Readonly<Record<TowerArchetype, TowerStats>>,
  enemies: {
    normal: { hp: 45, speed: 1, reward: 8, leakDamage: 1 },
    fast: { hp: 28, speed: 1.7, reward: 7, leakDamage: 1 },
    tank: { hp: 130, speed: 0.65, reward: 18, leakDamage: 3 },
    boss: { hp: 500, speed: 0.5, reward: 80, leakDamage: 10 },
  } satisfies Readonly<Record<EnemyArchetype, EnemyStats>>,
  economy: { killRewardMultiplier: 1, sellRatio: 0.5, maximumTowerLevel: 3 },
  simulation: { tickRate: 20 },
  simulator: { maxTicksPerRun: 50_000 },
  bots: {
    baselineReserveRatio: 0.2,
    baselineMaxActionsPerWave: 3,
    expertLookaheadTicks: 160,
    maxLookaheadTicks: 200,
    expertCandidateSlots: 6,
    expertActionThreshold: 0.5,
  },
  difficulty: {
    easy: { startingGold: 500, startingHp: 30, waveCount: 6, waveBudget: 60, buildSlotRange: [12, 16], spawnInterval: 1.2, waveSizeBase: 4, waveSizeGrowth: 2, enemyComposition: { normal: 0.8, fast: 0.2 }, minimumBuildSlots: 8 },
    medium: { startingGold: 400, startingHp: 25, waveCount: 8, waveBudget: 100, buildSlotRange: [9, 13], spawnInterval: 1, waveSizeBase: 6, waveSizeGrowth: 3, enemyComposition: { normal: 0.55, fast: 0.25, tank: 0.2 }, minimumBuildSlots: 7 },
    hard: { startingGold: 300, startingHp: 20, waveCount: 10, waveBudget: 150, buildSlotRange: [6, 10], spawnInterval: 0.8, waveSizeBase: 8, waveSizeGrowth: 4, enemyComposition: { normal: 0.4, fast: 0.25, tank: 0.3, boss: 0.05 }, minimumBuildSlots: 5 },
  } satisfies Readonly<Record<Difficulty, DifficultyProfile>>,
} as const;

export const DIFFICULTY_PROFILES: Readonly<Record<Difficulty, DifficultyProfile>> = GAME_CONFIG.difficulty;
export const GAME_CONFIG_VERSION = "v1.0.0";
export const SIMULATOR_CONFIG = GAME_CONFIG.simulator;
export const BOT_CONFIG = GAME_CONFIG.bots;
