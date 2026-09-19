import type { Coordinate, MapSpec } from "@fantasy-frontiers/shared";

export type DecorationPlacement = { id: string; position: Coordinate; variant: number };

/** Cosmetic prop positions are derived independently from the gameplay RNG and avoid all logic cells. */
export function createDecorationPlacements(map: MapSpec, desiredCount = 12): DecorationPlacement[] {
  const blocked = new Set<string>();
  for (const path of map.paths) for (const point of path.tiles) blocked.add(`${point.x},${point.y}`);
  for (const point of map.buildSlots) blocked.add(`${point.x},${point.y}`);
  for (const spawn of map.spawns) blocked.add(`${spawn.position.x},${spawn.position.y}`);
  blocked.add(`${map.base.x},${map.base.y}`);
  for (const spawn of map.spawns) for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) blocked.add(`${spawn.position.x + dx},${spawn.position.y + dy}`);
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) blocked.add(`${map.base.x + dx},${map.base.y + dy}`);

  let state = map.seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  const candidates: Coordinate[] = [];
  for (let y = 0; y < map.height; y += 1) for (let x = 0; x < map.width; x += 1) if (!blocked.has(`${x},${y}`)) candidates.push({ x, y });
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swap]] = [candidates[swap]!, candidates[index]!];
  }
  return candidates.slice(0, Math.min(desiredCount, candidates.length)).map((position, index) => ({ id: `prop-${index}`, position, variant: Math.floor(random() * 4) }));
}
