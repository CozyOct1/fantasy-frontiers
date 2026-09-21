import type { WorldAssetName } from "./world-asset-contract";

/** Controlled semantic mapping. AI never supplies resource paths or texture IDs. */
export const FANTASY_ASSET_IDS: Record<WorldAssetName, string> = {
  playerBase: "castle", enemySpawn: "crystal", buildSlot: "build-slot", battlefieldLandmark: "crystal",
  towerBasic: "tower-basic", towerAoe: "tower-aoe", towerSlow: "tower-slow", towerHeavy: "tower-heavy",
  enemyNormal: "enemy-normal-0", enemyFast: "enemy-fast-0", enemyTank: "enemy-tank-0", enemyBoss: "enemy-boss-0",
  propTree: "tree", propRock: "rock", propCrate: "rock", propDecoration: "crystal",
  roadStraight: "ground", roadCorner: "ground", roadCross: "ground", roadEnd: "ground",
};
export const FANTASY_RENDER_SCALE: Partial<Record<WorldAssetName, number>> = {
  playerBase: 2.2, enemySpawn: 1.5, towerBasic: 1.8, towerAoe: 1.8, towerSlow: 1.65, towerHeavy: 2,
  enemyNormal: 1.5, enemyFast: 1.35, enemyTank: 1.7, enemyBoss: 2.1, propTree: 1.9,
};
export const ENEMY_ANIMATION_FRAMES = 10;
export const ENEMY_ANIMATION_FRAME_MS = 85;
