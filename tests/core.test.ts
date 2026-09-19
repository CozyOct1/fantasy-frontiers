import { describe, expect, it } from "vitest";
import { createGameEngine } from "../packages/core/src/index.js";
import { generateMap } from "../packages/maps/src/index.js";
import { GAME_CONFIG, gameActionSchema, gameResultSchema, type Coordinate } from "../packages/shared/src/index.js";

const mapResult = generateMap({ difficulty: "easy", seed: 7319 });
if (!mapResult.ok) throw new Error(mapResult.message);
const map = mapResult.map;

function runToEnd(defend: boolean) {
  const engine = createGameEngine({ map, levelId: "easy-core-test", seed: 991 });
  const actionTrace: unknown[] = [];
  if (defend) {
    for (const position of map.buildSlots) {
      const result = engine.dispatch({ type: "placeTower", archetype: "basic", position });
      actionTrace.push({ action: { type: "placeTower", archetype: "basic", position }, accepted: result.accepted });
    }
  }
  let ticks = 0;
  while (!engine.result() && ticks < 200_000) {
    if (engine.state.status === "ready") {
      actionTrace.push({ action: { type: "startWave" }, accepted: engine.dispatch({ type: "startWave" }).accepted });
    } else if (engine.state.status === "running") {
      engine.step();
      ticks++;
    }
  }
  return { engine, ticks, actionTrace };
}

describe("pure deterministic Game Core", () => {
  it("validates shared player and bot actions and rejects illegal placements", () => {
    expect(gameActionSchema.safeParse({ type: "placeTower", archetype: "basic", position: map.buildSlots[0] }).success).toBe(true);
    expect(gameActionSchema.safeParse({ type: "placeTower", archetype: "wizard", position: map.buildSlots[0] }).success).toBe(false);
    const engine = createGameEngine({ map, seed: 1 });
    const road = map.paths[0]!.tiles[1]!;
    const badSlot = engine.dispatch({ type: "placeTower", archetype: "basic", position: road });
    expect(badSlot).toMatchObject({ accepted: false, reason: "Choose a legal build slot" });
    const position = map.buildSlots[0]!;
    expect(engine.dispatch({ type: "placeTower", archetype: "basic", position }).accepted).toBe(true);
    expect(engine.dispatch({ type: "placeTower", archetype: "basic", position })).toMatchObject({ accepted: false, reason: "A tower already occupies this slot" });
  });

  it("applies configured costs and upgrades through Game Core actions", () => {
    const engine = createGameEngine({ map, seed: 2 });
    const position = map.buildSlots[0]!;
    const placed = engine.dispatch({ type: "placeTower", archetype: "heavy", position });
    expect(placed.accepted).toBe(true);
    if (!placed.accepted) return;
    expect(engine.state.gold).toBe(GAME_CONFIG.difficulty.easy.startingGold - GAME_CONFIG.towers.heavy.cost);
    expect(engine.dispatch({ type: "upgradeTower", towerId: "missing" }).accepted).toBe(false);
    expect(engine.dispatch({ type: "upgradeTower", towerId: placed.events[0]!.type === "towerPlaced" ? placed.events[0].towerId : "" }).accepted).toBe(true);
    expect(engine.state.towers[0]?.level).toBe(2);
  });

  it("uses a fixed tick and pause does not advance the simulation", () => {
    const engine = createGameEngine({ map, seed: 3 });
    engine.dispatch({ type: "startWave" });
    engine.step();
    const beforePause = engine.state;
    expect(engine.dispatch({ type: "pause" }).accepted).toBe(true);
    for (let i = 0; i < 100; i++) engine.step();
    expect(engine.state.elapsedTime).toBe(beforePause.elapsedTime);
    expect(engine.dispatch({ type: "resume" }).accepted).toBe(true);
    engine.step();
    expect(engine.state.elapsedTime).toBeGreaterThan(beforePause.elapsedTime);
  });

  it("replays the same seed, actions, and fixed ticks to identical results", () => {
    const first = runToEnd(true);
    const second = runToEnd(true);
    expect(first.ticks).toBeLessThan(200_000);
    expect(first.engine.result()?.win).toBe(true);
    expect(first.actionTrace).toEqual(second.actionTrace);
    expect(first.engine.state).toEqual(second.engine.state);
    expect(first.engine.result()).toEqual(second.engine.result());
    if (first.engine.result()) expect(gameResultSchema.safeParse(first.engine.result()).success).toBe(true);
  });

  it("produces a genuine defeat result when the base is overwhelmed", () => {
    const { engine, ticks } = runToEnd(false);
    expect(ticks).toBeLessThan(200_000);
    expect(engine.state.status).toBe("lost");
    expect(engine.result()).toMatchObject({ win: false, remainingHp: 0, enemiesLeaked: expect.any(Number) });
    expect(gameResultSchema.safeParse(engine.result()).success).toBe(true);
  });
});
