import { createGameEngine, type CreateGameOptions, type DispatchResult, type GameEngine, type GameEvent } from "@fantasy-frontiers/core";
import type { GameAction, GameResult, GameState, SimulationActionRecord } from "@fantasy-frontiers/shared";
import { FIXED_TICK_SECONDS } from "@fantasy-frontiers/core";

/** Presentation-facing facade that keeps actions and fixed simulation steps on Game Core. */
export class GameplayController {
  private accumulator = 0;
  private tick = 0;
  private readonly actions: SimulationActionRecord[] = [];

  constructor(private readonly engine: GameEngine) {}

  get state(): GameState { return this.engine.state; }
  dispatch(action: GameAction): DispatchResult {
    const result = this.engine.dispatch(action);
    this.actions.push({ tick: this.tick, action: structuredClone(action), accepted: result.accepted, ...(!result.accepted ? { reason: result.reason } : {}) });
    return result;
  }
  result(): GameResult | null { return this.engine.result(); }
  get actionLog(): readonly SimulationActionRecord[] { return structuredClone(this.actions); }

  advanceFrame(deltaSeconds: number, speed: 1 | 2): GameEvent[] {
    if (this.state.status !== "running") {
      this.accumulator = 0;
      return [];
    }
    this.accumulator += Math.max(0, deltaSeconds) * speed;
    const events: GameEvent[] = [];
    const tickEpsilon = 1e-10;
    while (this.accumulator + tickEpsilon >= FIXED_TICK_SECONDS && this.state.status === "running") {
      events.push(...this.engine.step());
      this.tick++;
      this.accumulator = Math.max(0, this.accumulator - FIXED_TICK_SECONDS);
    }
    if (this.state.status !== "running") this.accumulator = 0;
    return events;
  }
}

export function createGameplayController(options: CreateGameOptions): GameplayController {
  return new GameplayController(createGameEngine(options));
}
