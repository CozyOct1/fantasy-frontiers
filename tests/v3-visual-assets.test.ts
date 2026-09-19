import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assetManifestSchema, themeRegistrySchema } from "../packages/shared/src/index.js";
import manifestJson from "../assets/library/ASSET_MANIFEST.json";
import registryJson from "../assets/library/THEME_REGISTRY.json";
import { generateMap } from "../packages/maps/src/index.js";
import { createDecorationPlacements } from "../apps/game/src/presentation/deterministic-decoration.js";

const manifest = assetManifestSchema.parse(manifestJson);
const registry = themeRegistrySchema.parse(registryJson);

describe("V3 local presentation assets", () => {
  it("maps every Border Outpost presentation asset to an approved local file", () => {
    const pack = registry.packs.find(candidate => candidate.id === "ff-fantasy");
    expect(pack?.presentationAssets).toBeDefined();
    const ids = Object.values(pack!.presentationAssets!).flatMap(value => typeof value === "string" ? [value] : Array.isArray(value) ? value : Object.values(value));
    for (const id of ids) {
      const record = manifest.assets.find(asset => asset.id === id);
      expect(record, `missing manifest record: ${String(id)}`).toBeDefined();
      expect(existsSync(record!.path), `missing local file: ${record!.path}`).toBe(true);
      expect(record!.license.spdx).toBe("CC0-1.0");
    }
  });
});

describe("deterministic cosmetic decorations", () => {
  it("repeats stable positions and never decorates logical or landmark cells", () => {
    const generated = generateMap({ difficulty: "easy", seed: 70421 });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const map = generated.map;
    const first = createDecorationPlacements(map);
    expect(createDecorationPlacements(map)).toEqual(first);
    const blocked = new Set([
      ...map.paths.flatMap(path => path.tiles.map(point => `${point.x},${point.y}`)),
      ...map.buildSlots.map(point => `${point.x},${point.y}`),
      ...map.spawns.map(spawn => `${spawn.position.x},${spawn.position.y}`),
      `${map.base.x},${map.base.y}`,
    ]);
    for (const prop of first) {
      expect(blocked.has(`${prop.position.x},${prop.position.y}`)).toBe(false);
      for (const spawn of map.spawns) expect(Math.abs(spawn.position.x - prop.position.x) > 1 || Math.abs(spawn.position.y - prop.position.y) > 1).toBe(true);
      expect(Math.abs(map.base.x - prop.position.x) > 1 || Math.abs(map.base.y - prop.position.y) > 1).toBe(true);
    }
  });
});
