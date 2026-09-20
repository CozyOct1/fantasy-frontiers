import type Phaser from "phaser";
import type { Coordinate, WorldAssetManifest, WorldAssetRenderMetadata } from "@fantasy-frontiers/shared";
import type { BoardProjection } from "../game/board-projection";
import type { WorldAssetName } from "./world-asset-contract";

export const ISOMETRIC_DEPTH = {
  backdrop: -1000, ground: 0, road: 10, buildSlot: 20,
  objectBase: 1000, projectile: 20_000, indicator: 30_000, debug: 40_000,
} as const;

export type IsometricPlacement = {
  screenX: number; groundScreenY: number; displayWidth: number; displayHeight: number;
  depth: number; worldX: number; worldY: number; asset: WorldAssetName; metadata: WorldAssetRenderMetadata;
};

export function getIsometricPlacement(projection: BoardProjection, point: Coordinate, manifest: WorldAssetManifest, asset: WorldAssetName): IsometricPlacement {
  const ground = projection.project(point);
  const metadata = manifest.render[asset];
  const displayHeight = projection.tileHeight * metadata.scale;
  return { screenX: ground.x, groundScreenY: ground.y, displayWidth: displayHeight, displayHeight, depth: ISOMETRIC_DEPTH.objectBase + ground.y + metadata.depthBias, worldX: point.x, worldY: point.y, asset, metadata };
}

export function placeIsometricSprite(sprite: Phaser.GameObjects.Image, placement: IsometricPlacement): Phaser.GameObjects.Image {
  sprite.setData("isometricPlacement", placement);
  return sprite.setOrigin(placement.metadata.originX, placement.metadata.originY)
    .setPosition(placement.screenX, placement.groundScreenY)
    .setDisplaySize(placement.displayWidth, placement.displayHeight).setDepth(placement.depth);
}

export function footprintDiamond(projection: BoardProjection, point: Coordinate, metadata: WorldAssetRenderMetadata): { x: number; y: number }[] {
  const halfW = metadata.footprintWidthTiles / 2; const halfH = metadata.footprintHeightTiles / 2;
  return [
    projection.project({ x: point.x - halfW, y: point.y - halfH }), projection.project({ x: point.x + halfW, y: point.y - halfH }),
    projection.project({ x: point.x + halfW, y: point.y + halfH }), projection.project({ x: point.x - halfW, y: point.y + halfH }),
  ];
}
