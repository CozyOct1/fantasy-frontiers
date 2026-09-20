import type { Coordinate, MapSpec } from "@fantasy-frontiers/shared";
import type { WorldAssetName } from "./world-asset-contract";

export type Direction = "north" | "east" | "south" | "west";
export type RoadVisual = { asset: Extract<WorldAssetName, "roadStraight" | "roadCorner" | "roadCross" | "roadEnd">; rotation: number };

const directions: { name: Direction; dx: number; dy: number }[] = [
  { name: "north", dx: 0, dy: -1 }, { name: "east", dx: 1, dy: 0 }, { name: "south", dx: 0, dy: 1 }, { name: "west", dx: -1, dy: 0 },
];

export function createRoadVisualMap(map: MapSpec): Map<string, RoadVisual> {
  const cells = new Set(map.paths.flatMap(path => path.tiles.map(point => `${point.x},${point.y}`)));
  const result = new Map<string, RoadVisual>();
  for (const key of cells) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const neighbors = directions.filter(direction => cells.has(`${x + direction.dx},${y + direction.dy}`)).map(direction => direction.name);
    result.set(key, chooseRoadVisual(neighbors));
  }
  return result;
}

/** MapSpec remains the sole source of road geometry; theme images never decide connectors. */
export function createRoadConnectionMap(map: MapSpec): Map<string, Direction[]> {
  const cells = new Set(map.paths.flatMap(path => path.tiles.map(point => `${point.x},${point.y}`)));
  return new Map([...cells].map(key => {
    const [x, y] = key.split(",").map(Number) as [number, number];
    return [key, directions.filter(direction => cells.has(`${x + direction.dx},${y + direction.dy}`)).map(direction => direction.name)];
  }));
}

export const ROAD_DIRECTION_OFFSETS: Record<Direction, Coordinate> = {
  north: { x: 0, y: -1 }, east: { x: 1, y: 0 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 },
};

export function chooseRoadVisual(neighbors: Direction[]): RoadVisual {
  if (neighbors.length >= 3) return { asset: "roadCross", rotation: 0 };
  if (neighbors.length <= 1) {
    const rotations: Record<Direction, number> = { east: 0, south: 90, west: 180, north: 270 };
    return { asset: "roadEnd", rotation: rotations[neighbors[0] ?? "east"] };
  }
  const set = new Set(neighbors);
  if (set.has("east") && set.has("west")) return { asset: "roadStraight", rotation: 0 };
  if (set.has("north") && set.has("south")) return { asset: "roadStraight", rotation: 90 };
  if (set.has("east") && set.has("south")) return { asset: "roadCorner", rotation: 0 };
  if (set.has("south") && set.has("west")) return { asset: "roadCorner", rotation: 90 };
  if (set.has("west") && set.has("north")) return { asset: "roadCorner", rotation: 180 };
  return { asset: "roadCorner", rotation: 270 };
}

export function roadKey(point: Coordinate): string { return `${point.x},${point.y}`; }
