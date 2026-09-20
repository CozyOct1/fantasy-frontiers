import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";
import { worldAssetManifestSchema, type WorldAssetManifest } from "../packages/shared/src/index";

export const WORLD_SHEET_COLUMNS = 4 as const;
export const WORLD_SHEET_ROWS = 5 as const;
export const WORLD_ASSET_CELL_SIZE = 512 as const;

const assetCells = [
  ["structures/player-base.png", "playerBase"], ["structures/enemy-spawn.png", "enemySpawn"], ["structures/build-slot.png", "buildSlot"], ["structures/battlefield-landmark.png", "battlefieldLandmark"],
  ["towers/tower-basic.png", "towerBasic"], ["towers/tower-aoe.png", "towerAoe"], ["towers/tower-slow.png", "towerSlow"], ["towers/tower-heavy.png", "towerHeavy"],
  ["enemies/enemy-normal.png", "enemyNormal"], ["enemies/enemy-fast.png", "enemyFast"], ["enemies/enemy-tank.png", "enemyTank"], ["enemies/enemy-boss.png", "enemyBoss"],
  ["props/prop-tree.png", "propTree"], ["props/prop-rock.png", "propRock"], ["props/prop-crate.png", "propCrate"], ["props/prop-decoration.png", "propDecoration"],
  ["roads/road-straight.png", "roadStraight"], ["roads/road-corner.png", "roadCorner"], ["roads/road-cross.png", "roadCross"], ["roads/road-end.png", "roadEnd"],
] as const;

type ProcessOptions = { backgroundColor?: string; backgroundTolerance?: number };

const object = (scale: number, depthBias = 0, footprintWidthTiles = 1, footprintHeightTiles = 1, originY = 0.94) => ({
  originX: 0.5, originY, scale, depthBias, footprintWidthTiles, footprintHeightTiles,
});
const renderMetadata: WorldAssetManifest["render"] = {
  playerBase: object(2.7, 8, 2, 2, 0.93),
  enemySpawn: object(1.8, 4, 1, 1, 0.92),
  buildSlot: object(0.5, -20, 1, 1, 0.5),
  battlefieldLandmark: object(1.45, 2),
  towerBasic: object(1.7, 3), towerAoe: object(1.85, 3), towerSlow: object(1.8, 3), towerHeavy: object(1.95, 3),
  enemyNormal: object(1.15, 6), enemyFast: object(1.15, 6), enemyTank: object(1.15, 6), enemyBoss: object(1.55, 8),
  propTree: object(1.55, 0), propRock: object(1.05, 0), propCrate: object(0.9, 0), propDecoration: object(1.1, 0),
  roadStraight: object(1, 0, 1, 1, 0.5), roadCorner: object(1, 0, 1, 1, 0.5),
  roadCross: object(1, 0, 1, 1, 0.5), roadEnd: object(1, 0, 1, 1, 0.5),
};

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}

async function applyChromaWhenOpaque(input: Buffer, backgroundColor: string, tolerance: number): Promise<Buffer> {
  const image = sharp(input).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let hasTransparency = false;
  for (let index = 3; index < data.length; index += 4) if (data[index]! < 250) { hasTransparency = true; break; }
  if (!hasTransparency) {
    const [red, green, blue] = parseHex(backgroundColor);
    for (let index = 0; index < data.length; index += 4) {
      const distance = Math.max(Math.abs(data[index]! - red), Math.abs(data[index + 1]! - green), Math.abs(data[index + 2]! - blue));
      if (distance <= tolerance) data[index + 3] = Math.round(255 * distance / Math.max(1, tolerance));
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

export async function processWorldAssets(worldDirectory: string, options: ProcessOptions = {}): Promise<WorldAssetManifest> {
  const worldId = path.basename(worldDirectory);
  const sourceDirectory = path.join(worldDirectory, "source");
  const outputDirectory = path.join(worldDirectory, "processed");
  const sheetPath = path.join(sourceDirectory, "battle-asset-sheet.png");
  const sourceSheet = await readFile(sheetPath);
  const metadata = await sharp(sourceSheet).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Unable to read battle asset sheet dimensions.");
  const normalizedSheet = await sharp(sourceSheet)
    .resize(WORLD_SHEET_COLUMNS * WORLD_ASSET_CELL_SIZE, WORLD_SHEET_ROWS * WORLD_ASSET_CELL_SIZE, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const backgroundColor = options.backgroundColor ?? "#697a8c";
  const backgroundTolerance = options.backgroundTolerance ?? 24;
  const assets = {} as WorldAssetManifest["assets"];
  const runtimeAssets = {} as WorldAssetManifest["runtime"]["assets"];

  await Promise.all(assetCells.map(async ([relativeOutput, manifestKey], index) => {
    const row = Math.floor(index / WORLD_SHEET_COLUMNS);
    const column = index % WORLD_SHEET_COLUMNS;
    const cropped = await sharp(normalizedSheet).extract({
      left: column * WORLD_ASSET_CELL_SIZE, top: row * WORLD_ASSET_CELL_SIZE,
      width: WORLD_ASSET_CELL_SIZE, height: WORLD_ASSET_CELL_SIZE,
    }).png().toBuffer();
    const transparent = await applyChromaWhenOpaque(cropped, backgroundColor, backgroundTolerance);
    const target = path.join(outputDirectory, relativeOutput);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, transparent);
    assets[manifestKey] = `processed/${relativeOutput}`;
    const runtimeRelative = relativeOutput.replace(/\.png$/, ".webp");
    const runtimeTarget = path.join(worldDirectory, "runtime", runtimeRelative);
    await mkdir(path.dirname(runtimeTarget), { recursive: true });
    await sharp(transparent).resize(256, 256, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .webp({ quality: 76, alphaQuality: 88, effort: 6, smartSubsample: true }).toFile(runtimeTarget);
    runtimeAssets[manifestKey] = `runtime/${runtimeRelative}`;
  }));

  await mkdir(path.join(worldDirectory, "runtime"), { recursive: true });
  await Promise.all([
    sharp(path.join(sourceDirectory, "world-key-art.png")).resize(1280, 720, { fit: "cover", kernel: sharp.kernel.lanczos3 }).webp({ quality: 68, effort: 6, smartSubsample: true }).toFile(path.join(worldDirectory, "runtime/world-key-art.webp")),
    sharp(path.join(sourceDirectory, "battle-backdrop.png")).resize(1280, 720, { fit: "cover", kernel: sharp.kernel.lanczos3 }).webp({ quality: 68, effort: 6, smartSubsample: true }).toFile(path.join(worldDirectory, "runtime/battle-backdrop.webp")),
  ]);

  const manifest = worldAssetManifestSchema.parse({
    version: 1,
    worldId,
    source: { worldKeyArt: "source/world-key-art.png", battleBackdrop: "source/battle-backdrop.png", battleAssetSheet: "source/battle-asset-sheet.png" },
    keyArt: { focalX: 0.5, focalY: 0.5 },
    battlefieldPalette: { groundPrimary: "#66784f", groundSecondary: "#71815a", roadPrimary: "#8a806b", roadEdge: "#5f5749", cliff: "#394534", ambientTint: "#53675b" },
    processing: { columns: 4, rows: 5, cellWidth: 512, cellHeight: 512, sourceWidth: metadata.width, sourceHeight: metadata.height, backgroundColor, backgroundTolerance },
    assets,
    runtime: { worldKeyArt: "runtime/world-key-art.webp", battleBackdrop: "runtime/battle-backdrop.webp", assets: runtimeAssets },
    render: renderMetadata,
  });
  await writeFile(path.join(worldDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Processed ${worldId}: ${metadata.width}x${metadata.height} -> 20 assets at 512x512.\n`);
  return manifest;
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  const worldId = process.argv[2] ?? "frontier-outpost";
  const worldDirectory = path.resolve("assets/worlds", worldId);
  await processWorldAssets(worldDirectory);
}
