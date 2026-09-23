import { GAME_CONFIG, type WorldSpec, type TowerArchetype, type WorldAssetManifest, type MapSpec } from "@fantasy-frontiers/shared";

export const STORYBOOK_REALMS = [
  { id: "forest", name: "森林浮岛", variant: 0, prop: "tree", water: 0x719e9a, accent: 0xb2c986,
    palette: { groundPrimary: "#879f68", groundSecondary: "#b2bc80", roadPrimary: "#debf87", roadEdge: "#907551", cliff: "#566c4a", ambientTint: "#779374" } },
  { id: "crystal", name: "水晶荒原", variant: 1, prop: "crystal", water: 0x777ac0, accent: 0xc6b5f0,
    palette: { groundPrimary: "#777f9d", groundSecondary: "#a4a5c4", roadPrimary: "#ddd0b0", roadEdge: "#7d7590", cliff: "#50566f", ambientTint: "#839bbb" } },
  { id: "rift", name: "黑暗裂隙", variant: 2, prop: "rock", water: 0xa45444, accent: 0xdb9b6e,
    palette: { groundPrimary: "#777365", groundSecondary: "#9e9171", roadPrimary: "#d4b68a", roadEdge: "#876958", cliff: "#51494a", ambientTint: "#9e7568" } },
] as const satisfies readonly { id: string; name: string; variant: number; prop: string; water: number; accent: number; palette: WorldAssetManifest["battlefieldPalette"] }[];

/** Semantic hints select approved local art, never paths or gameplay parameters. */
export function resolveStorybookRealm(world?: Pick<WorldSpec, "id" | "name" | "themeFamily" | "visualKeywords">) {
  if (!world) return STORYBOOK_REALMS[0];
  const hints = `${world.name} ${world.visualKeywords.join(" ")}`.toLowerCase();
  if (world.themeFamily === "dark_fantasy" || /裂隙|黑暗|熔|火山|rift|dark|lava/.test(hints)) return STORYBOOK_REALMS[2];
  if (["sci_fi", "cyberpunk", "ocean"].includes(world.themeFamily) || /水晶|晶矿|星辉|crystal|skyward|arcane/.test(hints)) return STORYBOOK_REALMS[1];
  return STORYBOOK_REALMS[0];
}

export function hasFloatingComposition(world: Pick<WorldSpec, "name" | "visualKeywords">): boolean {
  return /skyward|floating|浮岛/i.test(`${world.name} ${world.visualKeywords.join(" ")}`);
}

/** Prefer a continuous scenic channel with few crossings and no tower pads. */
export function scenicChannelColumn(map: MapSpec): number {
  const protectedPoints = [...map.buildSlots, ...map.spawns.map(spawn => spawn.position), map.base];
  const roadCells = new Set(map.paths.flatMap(path => path.tiles.map(point => `${point.x},${point.y}`)));
  const score = (x: number) => protectedPoints.filter(point => point.x === x).length * 100
    + [...roadCells].filter(key => Number(key.split(",")[0]) === x).length * 3 + Math.abs(x - map.width / 2);
  return Array.from({ length: Math.max(1, map.width - 4) }, (_, index) => Math.min(map.width - 1, index + 2))
    .sort((a, b) => score(a) - score(b) || a - b)[0]!;
}

export const TOWER_ROLES: Record<TowerArchetype, string> = { basic: "快速单体", aoe: "范围爆破", slow: "减速控制", heavy: "远程重击" };
export function towerBrief(archetype: TowerArchetype): string {
  const stats = GAME_CONFIG.towers[archetype];
  const effect = archetype === "slow" ? ` · 减速 ${Math.round(stats.slowRatio * 100)}%` : archetype === "aoe" ? ` · 爆破半径 ${stats.splashRadius} 格` : "";
  return `${TOWER_ROLES[archetype]} · 伤害 ${stats.damage} · 射程 ${stats.range} 格 · ${stats.attackSpeed} 次/秒${effect}`;
}
