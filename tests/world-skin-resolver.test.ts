import { describe, expect, it } from "vitest";
import { type ThemeFamily } from "../packages/shared/src/index";
import { resolveWorldSkin } from "../apps/game/src/presentation/world-skin-resolver";

describe("WorldSkin resolver", () => {
  it("selects the exact local theme pack when available", () => {
    const resolved = resolveWorldSkin("ocean");
    expect(resolved.packId).toBe("ff-ocean");
    expect(resolved.fallback).toBe("exact");
    expect(resolved.skin.assets.backgroundId).toBe("ff.neutral.background");
  });

  it("falls back to a registered similar family for missing exact themes", () => {
    const resolved = resolveWorldSkin("cyberpunk");
    expect(resolved.packId).toBe("ff-fantasy");
    expect(resolved.fallback).toBe("similar");
  });

  it("rejects unapproved IDs in a saved skin and uses a local registered pack", () => {
    const resolved = resolveWorldSkin("nature", {
      themePackId: "ff-nature",
      colors: { primary: "#fff", secondary: "#000", accent: "#fff", background: "#000", text: "#fff" },
      assets: { backgroundId: "https://example.invalid/image.png", panelId: "ff.neutral.panel", buttonId: "ff.neutral.button", frameId: "ff.neutral.frame", decorationIds: [] },
    });
    expect(resolved.packId).toBe("ff-nature");
    expect(resolved.skin.assets.backgroundId).toBe("ff.neutral.background");
  });

  it("uses the neutral pack if no family fallback exists", () => {
    const resolved = resolveWorldSkin("unknown-family" as ThemeFamily, {
      themePackId: "missing-pack",
      colors: { primary: "#fff", secondary: "#000", accent: "#fff", background: "#000", text: "#fff" },
      assets: { backgroundId: "missing", panelId: "missing", buttonId: "missing", frameId: "missing", decorationIds: [] },
    });
    expect(resolved.packId).toBe("ff-neutral");
  });
});
