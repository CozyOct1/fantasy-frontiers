import { describe, expect, it } from "vitest";
import { DIFFICULTY_PROFILES, SeededRng, gameResultSchema, worldSpecSchema } from "../packages/shared/src/index.js";
import { MAP_TEMPLATES, compileMapDraft, draftFromMap, generateMap, selectMapTemplate, validateMapSpec } from "../packages/maps/src/index.js";

describe("canonical shared schemas and deterministic primitives", () => {
  it("parses the canonical world and result contracts", () => {
    expect(worldSpecSchema.safeParse({ id: "w1", name: "Forest", summary: "", playerFactionName: "Keepers", enemyFactionName: "Blight", visualKeywords: [], themeFamily: "nature", status: "draft" }).success).toBe(true);
    expect(gameResultSchema.safeParse({ levelId: "l1", seed: 2, win: true, remainingHp: 8, maxHp: 10, startingGold: 100, remainingGold: 10, waveReached: 3, totalWaves: 3, enemiesSpawned: 10, enemiesKilled: 10, enemiesLeaked: 0, goldEarned: 20, goldSpent: 10, towersBuilt: 2, towerUsage: { basic: 2 }, duration: 60 }).success).toBe(true);
    expect(gameResultSchema.safeParse({ levelId: "l1", seed: 2, win: true, remainingHp: 8, maxHp: 10, startingGold: 100, remainingGold: 10, waveReached: 3, totalWaves: 3, enemiesSpawned: 10, enemiesKilled: 10, enemiesLeaked: 0, goldEarned: 20, goldSpent: 10, towersBuilt: 2, towerUsage: {}, duration: -1 }).success).toBe(false);
  });

  it("replays seeded integer, pick, and shuffle operations", () => {
    const first = new SeededRng(1234);
    const second = new SeededRng(1234);
    expect(Array.from({ length: 12 }, () => first.nextUint32())).toEqual(Array.from({ length: 12 }, () => second.nextUint32()));
    expect(new SeededRng(17).shuffle([1, 2, 3, 4, 5])).toEqual(new SeededRng(17).shuffle([1, 2, 3, 4, 5]));
    expect(DIFFICULTY_PROFILES.easy.minimumBuildSlots).toBeGreaterThan(DIFFICULTY_PROFILES.hard.minimumBuildSlots);
  });
});

describe("map template pool, generation, and validation", () => {
  it("provides three valid templates for every difficulty", () => {
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      const templates = MAP_TEMPLATES.filter(template => template.difficulty === difficulty);
      expect(templates).toHaveLength(3);
      for (const template of templates) {
        const generated = generateMap({
          difficulty,
          seed: 1,
          previousTemplateIds: templates.filter(candidate => candidate.id !== template.id).map(candidate => candidate.id),
        });
        expect(generated.ok, JSON.stringify({ template: template.id, generated })).toBe(true);
        if (generated.ok) {
          expect(generated.map.templateId).toBe(template.id);
          expect(validateMapSpec(generated.map).valid).toBe(true);
        }
      }
    }
  });

  it("generates byte-for-byte stable maps and avoids previous templates", () => {
    const options = { difficulty: "medium" as const, seed: 9876, preferredTags: ["two-entry"] };
    const first = generateMap(options);
    const replay = generateMap(options);
    expect(first).toEqual(replay);
    const selected = selectMapTemplate({ ...options, previousTemplateIds: first.ok ? [first.map.templateId] : [] });
    expect(selected).toBeDefined();
    expect(selected?.id).not.toBe(first.ok ? first.map.templateId : undefined);
  });

  it("rejects invalid coordinates, broken paths, and conflicting build slots", () => {
    const generated = generateMap({ difficulty: "easy", seed: 22 });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const outOfBounds = structuredClone(generated.map);
    outOfBounds.buildSlots[0] = { x: 99, y: 99 };
    expect(validateMapSpec(outOfBounds).issues.map(issue => issue.code)).toContain("coordinate_out_of_bounds");

    const conflict = structuredClone(generated.map);
    conflict.buildSlots[0] = conflict.paths[0]!.tiles[0]!;
    expect(validateMapSpec(conflict).issues.map(issue => issue.code)).toContain("build_slot_on_path");

    const disconnected = structuredClone(generated.map);
    disconnected.paths[0]!.tiles[1] = { x: 7, y: 7 };
    expect(validateMapSpec(disconnected).issues.map(issue => issue.code)).toContain("path_disconnected");
  });

  it("returns structured failures when templates are exhausted or retry settings are invalid", () => {
    expect(generateMap({ difficulty: "hard", seed: 1, previousTemplateIds: MAP_TEMPLATES.filter(t => t.difficulty === "hard").map(t => t.id) })).toMatchObject({ ok: false, code: "no_template_available", attempts: 0 });
    expect(generateMap({ difficulty: "easy", seed: 1, maxRetries: 0 })).toMatchObject({ ok: false, code: "retry_limit_exceeded" });
  });

  it("compiles incomplete authoring drafts only after runtime validation succeeds", () => {
    const generated = generateMap({ difficulty: "easy", seed: 51 });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const draft = draftFromMap(generated.map, "authoring-test");
    expect(compileMapDraft(draft)).toMatchObject({ ok: true, map: { templateId: "authored-authoring-test" } });
    const incomplete = { ...draft, base: null, paths: [] };
    expect(compileMapDraft(incomplete)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "missing_base" })]) });
    const obstacleConflict = { ...draft, obstacles: [draft.paths[0]!.tiles[1]!] };
    expect(compileMapDraft(obstacleConflict)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "obstacle_on_path" })]) });
  });
});
