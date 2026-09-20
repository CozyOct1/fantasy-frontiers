import type { EnemyArchetype, TowerArchetype, WorldAssetManifest } from "@fantasy-frontiers/shared";

export type WorldAssetName = keyof WorldAssetManifest["assets"];
export const TOWER_WORLD_ASSET_BY_ARCHETYPE: Record<TowerArchetype, WorldAssetName> = { basic: "towerBasic", aoe: "towerAoe", slow: "towerSlow", heavy: "towerHeavy" };
export const ENEMY_WORLD_ASSET_BY_ARCHETYPE: Record<EnemyArchetype, WorldAssetName> = { normal: "enemyNormal", fast: "enemyFast", tank: "enemyTank", boss: "enemyBoss" };

export function selectWorldAssetManifest(manifests: ReadonlyMap<string, WorldAssetManifest>, worldId: string, fallbackId: string): WorldAssetManifest {
  const fallback = manifests.get(fallbackId);
  if (!fallback) throw new Error(`Default world asset manifest '${fallbackId}' is unavailable.`);
  return manifests.get(worldId) ?? fallback;
}

export function selectWorldAssetPath(
  requested: WorldAssetManifest,
  fallback: WorldAssetManifest,
  name: WorldAssetName,
  exists: (worldId: string, relativePath: string) => boolean,
): { worldId: string; relativePath: string } {
  const requestedPath = requested.assets[name];
  if (exists(requested.worldId, requestedPath)) return { worldId: requested.worldId, relativePath: requestedPath };
  return { worldId: fallback.worldId, relativePath: fallback.assets[name] };
}
