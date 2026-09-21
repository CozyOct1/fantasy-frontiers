import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { assetManifestSchema } from "../packages/shared/src/index";
import { ENEMY_ANIMATION_FRAMES, FANTASY_ASSET_IDS } from "../apps/game/src/presentation/fantasy-asset-config";

describe("curated modular fantasy presentation", () => {
  test("every visual role resolves to a local licensed alpha texture within the pack budget", async () => {
    const manifest = assetManifestSchema.parse(JSON.parse(await readFile("assets/library/ASSET_MANIFEST.json", "utf8")));
    const assets = manifest.assets.filter(asset => asset.id.startsWith("ff.realm."));
    const ids = new Set(assets.map(asset => asset.id));
    for (const name of Object.values(FANTASY_ASSET_IDS)) expect(ids.has(`ff.realm.${name}`)).toBe(true);
    let bytes = 0;
    for (const asset of assets) {
      expect(asset.path).toMatch(/^assets\/library\/realm\/runtime\/[a-z0-9-]+\.png$/);
      expect(["CC0-1.0", "OGA-BY-3.0"]).toContain(asset.license.spdx);
      expect(asset.license.attribution).toBeTruthy();
      const metadata = await sharp(asset.path).metadata();
      expect(metadata.width).toBeLessThanOrEqual(512);
      expect(metadata.hasAlpha).toBe(true);
      bytes += (await stat(asset.path)).size;
    }
    expect(bytes).toBeLessThan(1_000_000);
  });

  test("all fixed enemy archetypes have complete, consistently registered walk frames", async () => {
    for (const archetype of ["normal", "fast", "tank", "boss"]) {
      for (let frame = 0; frame < ENEMY_ANIMATION_FRAMES; frame++) {
        const metadata = await sharp(`assets/library/realm/runtime/enemy-${archetype}-${frame}.png`).metadata();
        expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([128, 128, true]);
      }
    }
  });
});
