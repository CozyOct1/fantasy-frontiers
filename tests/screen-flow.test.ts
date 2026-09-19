import { describe, expect, it, vi } from "vitest";
import { ScreenFlow } from "../apps/game/src/app/screen-flow";

describe("ScreenFlow", () => {
  it("starts in the Hub and emits explicit screen transitions", () => {
    const onChange = vi.fn();
    const flow = new ScreenFlow(onChange);

    expect(flow.current).toBe("hub");
    expect(onChange).toHaveBeenNthCalledWith(1, "hub");

    flow.show("gameplay");
    flow.show("result");
    flow.show("hub");

    expect(flow.current).toBe("hub");
    expect(onChange.mock.calls.map(([screen]) => screen)).toEqual(["hub", "gameplay", "result", "hub"]);
  });

  it("does not emit redundant changes for the active screen", () => {
    const onChange = vi.fn();
    const flow = new ScreenFlow(onChange, "gameplay");

    flow.show("gameplay");

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
