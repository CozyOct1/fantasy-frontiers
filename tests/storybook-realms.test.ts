import { describe, expect, test } from "vitest";
import { GAME_CONFIG, type WorldSpec } from "../packages/shared/src/index";
import { resolveStorybookRealm, STORYBOOK_REALMS, towerBrief, hasFloatingComposition, scenicChannelColumn } from "../apps/game/src/presentation/storybook-realms";
import { generateMap } from "../packages/maps/src/index";

const world = (name: string, themeFamily: WorldSpec["themeFamily"] = "fantasy") => ({ id: "saved-world", name, themeFamily, visualKeywords: [] });
describe("controlled storybook presentation", () => {
  test("semantic themes resolve consistently to three distinct local compositions", () => {
    expect(resolveStorybookRealm(world("森林浮岛")).id).toBe("forest");
    expect(resolveStorybookRealm(world("水晶荒原")).id).toBe("crystal");
    expect(resolveStorybookRealm(world("黑暗裂隙")).id).toBe("rift");
    expect(resolveStorybookRealm(world("未知世界"))).toEqual(resolveStorybookRealm());
    expect(new Set(STORYBOOK_REALMS.map(realm => realm.palette.groundPrimary)).size).toBe(3);
  });
  test("AI hints cannot introduce external resource paths", () => {
    expect(STORYBOOK_REALMS).toContain(resolveStorybookRealm({ ...world("https://example.invalid/image.png"), visualKeywords: ["../../secret"] }));
  });
  test("floating cities use a distinct composition and scenic rivers avoid pads when possible", () => {
    expect(hasFloatingComposition(world("Skyward Bastion"))).toBe(true);
    expect(hasFloatingComposition(world("星辉守望"))).toBe(false);
    const generated = generateMap({ difficulty: "easy", seed: 70421 });
    if (!generated.ok) throw new Error("Fixture map failed");
    const before = JSON.stringify(generated.map);
    const column = scenicChannelColumn(generated.map);
    expect(generated.map.buildSlots.some(slot => slot.x === column)).toBe(false);
    expect(scenicChannelColumn(generated.map)).toBe(column);
    expect(JSON.stringify(generated.map)).toBe(before);
  });
  test("tower comparisons display real configuration rather than invented ratings", () => {
    for (const archetype of ["basic", "aoe", "slow", "heavy"] as const) {
      expect(towerBrief(archetype)).toContain(`伤害 ${GAME_CONFIG.towers[archetype].damage}`);
      expect(towerBrief(archetype)).toContain(`${GAME_CONFIG.towers[archetype].attackSpeed} 次/秒`);
    }
    expect(towerBrief("slow")).toContain("45%");
  });
});
