import { cp, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { worldAssetManifestSchema } from "../packages/shared/src/index";
import { processWorldAssets } from "../scripts/process-world-assets";
import { chooseRoadVisual, createRoadConnectionMap } from "../apps/game/src/presentation/road-renderer";
import { ENEMY_WORLD_ASSET_BY_ARCHETYPE, TOWER_WORLD_ASSET_BY_ARCHETYPE, selectWorldAssetManifest, selectWorldAssetPath } from "../apps/game/src/presentation/world-asset-contract";
import { getIsometricPlacement, ISOMETRIC_DEPTH } from "../apps/game/src/presentation/isometric-render-contract";
import { createBoardProjection } from "../apps/game/src/game/board-projection";

const projectRoot = path.resolve(import.meta.dirname, "..");
const frontierDirectory = path.join(projectRoot, "assets/worlds/frontier-outpost");

describe("world visual asset protocol", () => {
  test("default manifest validates and runtime fallback resolves", async () => {
    const manifest = worldAssetManifestSchema.parse(JSON.parse(await readFile(path.join(frontierDirectory, "manifest.json"), "utf8")) as unknown);
    expect(manifest.worldId).toBe("frontier-outpost");
    expect(Object.keys(manifest.render).sort()).toEqual(Object.keys(manifest.assets).sort());
    expect(manifest.render.buildSlot).toMatchObject({ footprintWidthTiles: 1, footprintHeightTiles: 1 });
    expect(manifest.render.playerBase.footprintWidthTiles).toBeGreaterThan(1);
    expect(manifest.battlefieldPalette).toMatchObject({ groundPrimary: expect.stringMatching(/^#/), roadPrimary: expect.stringMatching(/^#/) });
    const alternate = { ...manifest, worldId: "alternate-world" };
    const manifests = new Map([[manifest.worldId, manifest], [alternate.worldId, alternate]]);
    expect(selectWorldAssetManifest(manifests, "alternate-world", "frontier-outpost").worldId).toBe("alternate-world");
    expect(selectWorldAssetManifest(manifests, "missing-custom-world", "frontier-outpost").worldId).toBe("frontier-outpost");
    expect(selectWorldAssetPath(alternate, manifest, "towerBasic", () => false)).toEqual({ worldId: "frontier-outpost", relativePath: manifest.assets.towerBasic });
    expect(selectWorldAssetPath(alternate, manifest, "towerBasic", () => true)).toEqual({ worldId: "alternate-world", relativePath: alternate.assets.towerBasic });
    for (const sourcePath of Object.values(manifest.source)) {
      const metadata = await sharp(path.join(frontierDirectory, sourcePath)).metadata();
      expect(metadata.format).toBe("png");
      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
    }
  });

  test("processor deterministically emits the fixed 20-file 512px layout", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "ff-world-assets-"));
    const target = path.join(temporaryRoot, "test-world");
    await cp(path.join(frontierDirectory, "source"), path.join(target, "source"), { recursive: true });
    const manifest = await processWorldAssets(target);
    const relativeFiles: string[] = [];
    for (const category of ["structures", "towers", "enemies", "props", "roads"]) {
      for (const file of await readdir(path.join(target, "processed", category))) relativeFiles.push(`${category}/${file}`);
    }
    expect(relativeFiles.sort()).toEqual(Object.values(manifest.assets).map(value => value.replace("processed/", "")).sort());
    expect(relativeFiles).toHaveLength(20);
    for (const relativeFile of relativeFiles) {
      const metadata = await sharp(path.join(target, "processed", relativeFile)).metadata();
      expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([512, 512, true]);
    }
    for (const runtimePath of Object.values(manifest.runtime.assets)) {
      const metadata = await sharp(path.join(target, runtimePath)).metadata();
      expect([metadata.format, metadata.width, metadata.height]).toEqual(["webp", 256, 256]);
    }
    expect((await sharp(path.join(target, manifest.runtime.worldKeyArt)).metadata()).format).toBe("webp");
    expect((await sharp(path.join(target, manifest.runtime.battleBackdrop)).metadata()).format).toBe("webp");
  }, 15_000);

  test("archetypes and road connectivity map to fixed visual identities", () => {
    expect(TOWER_WORLD_ASSET_BY_ARCHETYPE).toEqual({ basic: "towerBasic", aoe: "towerAoe", slow: "towerSlow", heavy: "towerHeavy" });
    expect(ENEMY_WORLD_ASSET_BY_ARCHETYPE).toEqual({ normal: "enemyNormal", fast: "enemyFast", tank: "enemyTank", boss: "enemyBoss" });
    expect(chooseRoadVisual(["east", "west"])).toEqual({ asset: "roadStraight", rotation: 0 });
    expect(chooseRoadVisual(["east", "south"])).toEqual({ asset: "roadCorner", rotation: 0 });
    expect(chooseRoadVisual(["north"])).toEqual({ asset: "roadEnd", rotation: 270 });
    expect(chooseRoadVisual(["north", "east", "south"])).toEqual({ asset: "roadCross", rotation: 0 });
  });

  test("isometric placement uses the ground contact point and moving screen Y for depth", async () => {
    const manifest = worldAssetManifestSchema.parse(JSON.parse(await readFile(path.join(frontierDirectory, "manifest.json"), "utf8")) as unknown);
    const projection = createBoardProjection(10, 10, 1280, 720, { top: 60, right: 20, bottom: 120, left: 20 });
    const front = getIsometricPlacement(projection, { x: 5, y: 6 }, manifest, "enemyNormal");
    const back = getIsometricPlacement(projection, { x: 2, y: 2 }, manifest, "enemyNormal");
    expect(front.screenX).toBe(projection.project({ x: 5, y: 6 }).x);
    expect(front.groundScreenY).toBe(projection.project({ x: 5, y: 6 }).y);
    expect(front.depth).toBe(ISOMETRIC_DEPTH.objectBase + front.groundScreenY + manifest.render.enemyNormal.depthBias);
    expect(front.depth).toBeGreaterThan(back.depth);
    expect(ISOMETRIC_DEPTH.road).toBeLessThan(back.depth);
  });

  test("road connectors are derived from MapSpec coordinates rather than image geometry", () => {
    const connections = createRoadConnectionMap({
      id: "road-test", templateId: "road-test", width: 3, height: 2, seed: 1, difficulty: "easy", base: { x: 2, y: 1 }, buildSlots: [], obstacles: [], tags: [],
      spawns: [{ id: "spawn", position: { x: 0, y: 0 } }], paths: [{ id: "path", spawnId: "spawn", tiles: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }] }],
    });
    expect(connections.get("1,0")).toEqual(expect.arrayContaining(["west", "south"]));
    expect(connections.get("1,1")).toEqual(expect.arrayContaining(["north", "east"]));
  });
});
