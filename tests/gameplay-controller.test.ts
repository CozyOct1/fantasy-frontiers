import { describe, expect, it } from "vitest";
import { generateMap } from "../packages/maps/src/index";
import { createGameplayController } from "../apps/game/src/game/gameplay-controller";

const createController = () => {
  const generated = generateMap({ difficulty: "easy", seed: 62481 });
  if (!generated.ok) throw new Error(generated.message);
  const map = generated.map;
  return createGameplayController({ map, levelId: "controller-test", seed: map.seed });
};

describe("GameplayController", () => {
  it("keeps fixed simulation outcomes stable across render frame rates", () => {
    const sixty = createController();
    const thirty = createController();
    for (const controller of [sixty, thirty]) controller.dispatch({ type: "startWave" });

    for (let frame = 0; frame < 60; frame += 1) sixty.advanceFrame(1 / 60, 1);
    for (let frame = 0; frame < 30; frame += 1) thirty.advanceFrame(1 / 30, 1);

    expect(sixty.state).toEqual(thirty.state);
  });

  it("changes elapsed game time at 2x while preserving each core tick", () => {
    const normal = createController();
    const fast = createController();
    normal.dispatch({ type: "startWave" });
    fast.dispatch({ type: "startWave" });
    normal.advanceFrame(0.1, 1);
    fast.advanceFrame(0.1, 2);

    expect(normal.state.elapsedTime).toBeCloseTo(0.1);
    expect(fast.state.elapsedTime).toBeCloseTo(0.2);
    expect(fast.state.seed).toBe(normal.state.seed);
  });
});
