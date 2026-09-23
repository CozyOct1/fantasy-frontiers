import { describe, expect, it } from "vitest";
import { MapEditorSession, createEmptyDraft } from "../apps/game/src/editor/map-editor-session.js";
import { createBenchmarkContent, draftFromMap } from "../packages/maps/src/index.js";

describe("map editor session", () => {
  it("keeps incomplete drafts editable and supports undo/redo transactions", () => {
    const session = new MapEditorSession(createEmptyDraft("draft-test"));
    expect(session.validate().ok).toBe(false);
    expect(session.apply("base", { x: 11, y: 4 })).toBeNull();
    expect(session.apply("spawn", { x: 0, y: 4 })).toBeNull();
    expect(session.apply("path", { x: 1, y: 4 })).toBeNull();
    expect(session.draft.paths[0]?.tiles).toHaveLength(2);
    session.undo(); expect(session.draft.paths[0]?.tiles).toHaveLength(1);
    session.redo(); expect(session.draft.paths[0]?.tiles).toHaveLength(2);
  });

  it("rejects non-adjacent path drawing and keeps the draft unchanged", () => {
    const session = new MapEditorSession(createEmptyDraft("draft-test"));
    session.apply("spawn", { x: 0, y: 0 });
    expect(session.apply("path", { x: 2, y: 0 })).toContain("相邻格");
    expect(session.draft.paths[0]?.tiles).toEqual([{ x: 0, y: 0 }]);
  });

  it("draws onto the selected entrance path", () => {
    const session = new MapEditorSession(createEmptyDraft("draft-multi"));
    session.apply("spawn", { x: 0, y: 0 });
    session.apply("spawn", { x: 0, y: 7 });
    session.selectPath("path-1");
    expect(session.apply("path", { x: 1, y: 0 })).toBeNull();
    expect(session.draft.paths.find(path => path.id === "path-1")?.tiles).toHaveLength(2);
    expect(session.draft.paths.find(path => path.id === "path-2")?.tiles).toHaveLength(1);
  });

  it("compiles authored waves with the map through the shared level validator", () => {
    const content = createBenchmarkContent("medium", "editor-wave-test");
    const session = new MapEditorSession(draftFromMap(content.map, "editor-wave-draft", content.wavePlan));
    const compiled = session.validate();
    expect(compiled.ok).toBe(true);
    if (compiled.ok) expect(compiled.wavePlan.waves).toHaveLength(content.wavePlan.waves.length);
  });

  it("supports wave batches and rejects events that reference a removed route", () => {
    const content = createBenchmarkContent("easy", "editor-batch-test");
    const source = draftFromMap(content.map, "editor-batch-draft", { ...content.wavePlan, waves: [{ index: 1, label: "测试波", events: [] }] });
    const session = new MapEditorSession(source);
    expect(session.addWaveBatch(0, { archetype: "fast", pathId: "path-1", count: 3, startTick: 0, intervalTicks: 15 })).toBeNull();
    expect(session.draft.wavePlan?.waves[0]?.events.map(event => event.tick)).toEqual([0, 15, 30]);
    session.apply("erase", content.map.spawns[0]!.position);
    expect(session.validate().ok).toBe(false);
  });
});
