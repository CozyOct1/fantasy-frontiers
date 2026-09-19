import { describe, expect, it } from "vitest";
import { createBoardProjection } from "../apps/game/src/game/board-projection";

describe("board projection", () => {
  it.each([
    [1440, 900, { top: 72, right: 16, bottom: 205, left: 16 }],
    [390, 844, { top: 64, right: 10, bottom: 365, left: 10 }],
    [844, 390, { top: 50, right: 10, bottom: 185, left: 10 }],
  ])("fits and round-trips grid positions at %ix%i", (width, height, insets) => {
    const projection = createBoardProjection(12, 8, width, height, insets);

    for (let y = 0; y < projection.mapHeight; y++) {
      for (let x = 0; x < projection.mapWidth; x++) {
        const cell = { x, y };
        expect(projection.cellAt(projection.project(cell))).toEqual(cell);
      }
    }

    const corners = [
      projection.project({ x: 0, y: 0 }),
      projection.project({ x: projection.mapWidth - 1, y: 0 }),
      projection.project({ x: 0, y: projection.mapHeight - 1 }),
      projection.project({ x: projection.mapWidth - 1, y: projection.mapHeight - 1 }),
    ];
    expect(Math.min(...corners.map(point => point.x)) - projection.tileWidth / 2).toBeGreaterThanOrEqual(insets.left - 1);
    expect(Math.max(...corners.map(point => point.x)) + projection.tileWidth / 2).toBeLessThanOrEqual(width - insets.right + 1);
    expect(Math.min(...corners.map(point => point.y)) - projection.tileHeight / 2).toBeGreaterThanOrEqual(insets.top - 1);
    expect(Math.max(...corners.map(point => point.y)) + projection.tileHeight / 2).toBeLessThanOrEqual(height - insets.bottom + 1);
  });
});
