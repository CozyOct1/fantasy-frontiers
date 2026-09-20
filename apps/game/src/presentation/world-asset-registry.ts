import { worldAssetManifestSchema, type WorldAssetManifest } from "@fantasy-frontiers/shared";
import { selectWorldAssetManifest, type WorldAssetName } from "./world-asset-contract";
export { ENEMY_WORLD_ASSET_BY_ARCHETYPE, TOWER_WORLD_ASSET_BY_ARCHETYPE, type WorldAssetName } from "./world-asset-contract";

const manifestModules = import.meta.glob("../../../../assets/worlds/*/manifest.json", { eager: true, import: "default" }) as Record<string, unknown>;
const imageModules = import.meta.glob([
  "../../../../assets/worlds/*/runtime/**/*.webp",
], { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const manifests = new Map<string, WorldAssetManifest>();
const imageUrls = new Map<string, string>();

for (const value of Object.values(manifestModules)) {
  const parsed = worldAssetManifestSchema.safeParse(value);
  if (parsed.success) manifests.set(parsed.data.worldId, parsed.data);
}
for (const [modulePath, url] of Object.entries(imageModules)) {
  const marker = "assets/worlds/";
  const offset = modulePath.indexOf(marker);
  if (offset >= 0) imageUrls.set(modulePath.slice(offset + marker.length), url);
}

export const DEFAULT_WORLD_ASSET_ID = "frontier-outpost";
export type ResolvedWorldAssets = {
  requestedWorldId: string;
  resolvedWorldId: string;
  manifest: WorldAssetManifest;
  worldKeyArtUrl: string;
  battleBackdropUrl: string;
  assetUrl(name: WorldAssetName): string;
  textureKey(name: WorldAssetName): string;
};

function urlFor(worldId: string, relativePath: string): string | undefined {
  return imageUrls.get(`${worldId}/${relativePath}`);
}

export function resolveWorldAssets(worldId: string): ResolvedWorldAssets {
  const fallback = selectWorldAssetManifest(manifests, DEFAULT_WORLD_ASSET_ID, DEFAULT_WORLD_ASSET_ID);
  const manifest = selectWorldAssetManifest(manifests, worldId, DEFAULT_WORLD_ASSET_ID);
  const resolvedWorldId = manifest.worldId;
  const requiredUrl = (relativePath: string, fallbackPath: string): string => {
    const url = urlFor(resolvedWorldId, relativePath) ?? urlFor(fallback.worldId, fallbackPath);
    if (!url) throw new Error(`World asset '${relativePath}' and its fallback are unavailable.`);
    return url;
  };
  return {
    requestedWorldId: worldId,
    resolvedWorldId,
    manifest,
    worldKeyArtUrl: requiredUrl(manifest.runtime.worldKeyArt, fallback.runtime.worldKeyArt),
    battleBackdropUrl: requiredUrl(manifest.runtime.battleBackdrop, fallback.runtime.battleBackdrop),
    assetUrl: name => {
      return requiredUrl(manifest.runtime.assets[name], fallback.runtime.assets[name]);
    },
    textureKey: name => `world-${resolvedWorldId}-${name}`,
  };
}

export function listWorldAssetManifestIds(): string[] {
  return [...manifests.keys()].sort();
}
