import type { Coordinate } from "@fantasy-frontiers/shared";

export type BoardInsets = { top: number; right: number; bottom: number; left: number };
export type BoardProjection = {
  anchorX: number;
  anchorY: number;
  tileWidth: number;
  tileHeight: number;
  mapWidth: number;
  mapHeight: number;
  project(point: Coordinate): { x: number; y: number };
  cellAt(pixel: Coordinate): Coordinate | null;
};

/** Fits the complete isometric grid inside the unobstructed part of the battle viewport. */
export function createBoardProjection(
  mapWidth: number,
  mapHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  insets: BoardInsets = { top: 72, right: 16, bottom: 220, left: 16 },
  zoom = 1,
): BoardProjection {
  const columns = Math.max(1, mapWidth);
  const rows = Math.max(1, mapHeight);
  const viewWidth = Math.max(1, viewportWidth);
  const viewHeight = Math.max(1, viewportHeight);
  const availableWidth = Math.max(1, viewWidth - insets.left - insets.right);
  const availableHeight = Math.max(1, viewHeight - insets.top - insets.bottom);
  const scale = Math.max(0.1, Math.min(availableWidth / ((columns + rows) * 26), availableHeight / ((columns + rows) * 16)) * zoom);
  const tileWidth = 52 * scale;
  const tileHeight = 32 * scale;
  const anchorX = insets.left + availableWidth / 2 - ((columns - rows) * tileWidth) / 4;
  const anchorY = insets.top + availableHeight / 2 - ((columns + rows - 2) * tileHeight) / 4;

  const project = (point: Coordinate) => ({
    x: anchorX + (point.x - point.y) * tileWidth / 2,
    y: anchorY + (point.x + point.y) * tileHeight / 2,
  });

  return {
    anchorX,
    anchorY,
    tileWidth,
    tileHeight,
    mapWidth: columns,
    mapHeight: rows,
    project,
    cellAt(pixel) {
      const dx = pixel.x - anchorX;
      const dy = pixel.y - anchorY;
      const x = Math.round(dx / tileWidth + dy / tileHeight) || 0;
      const y = Math.round(dy / tileHeight - dx / tileWidth) || 0;
      return x >= 0 && y >= 0 && x < columns && y < rows ? { x, y } : null;
    },
  };
}
