import { worldAssetManifestSchema, type WorldAssetManifest } from "@fantasy-frontiers/shared";
import { selectWorldAssetManifest, type WorldAssetName } from "./world-asset-contract";
import { getLocalGameAssetUrl } from "./local-game-assets";
import { FANTASY_ASSET_IDS, FANTASY_RENDER_SCALE } from "./fantasy-asset-config";
export { ENEMY_WORLD_ASSET_BY_ARCHETYPE, TOWER_WORLD_ASSET_BY_ARCHETYPE, type WorldAssetName } from "./world-asset-contract";

const manifestModules = import.meta.glob("../../../../assets/worlds/*/manifest.json", { eager: true, import: "default" }) as Record<string, unknown>;
const manifests = new Map<string, WorldAssetManifest>();

for (const value of Object.values(manifestModules)) {
  const parsed = worldAssetManifestSchema.safeParse(value);
  if (parsed.success) manifests.set(parsed.data.worldId, parsed.data);
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

export function resolveWorldAssets(worldId: string): ResolvedWorldAssets {
  const manifest = structuredClone(selectWorldAssetManifest(manifests, worldId, DEFAULT_WORLD_ASSET_ID));
  // Retain the canonical placement contract while replacing the retired sheet artwork.
  for (const name of Object.keys(manifest.render) as WorldAssetName[]) {
    if (name !== "buildSlot") manifest.render[name].originY = .93;
    manifest.render[name].scale = FANTASY_RENDER_SCALE[name] ?? manifest.render[name].scale;
  }
  manifest.battlefieldPalette = { groundPrimary: "#80975d", groundSecondary: "#9bab6d", roadPrimary: "#d2b278", roadEdge: "#886d43", cliff: "#526449", ambientTint: "#78946d" };
  const resolvedWorldId = manifest.worldId;
  const requiredUrl = (name: string): string => {
    const url = getLocalGameAssetUrl(`ff.realm.${name}`);
    if (!url) throw new Error(`Approved fantasy asset '${name}' is unavailable.`);
    return url;
  };
  return {
    requestedWorldId: worldId,
    resolvedWorldId,
    manifest,
    worldKeyArtUrl: requiredUrl("castle"),
    battleBackdropUrl: requiredUrl("ground"),
    assetUrl: name => {
      return requiredUrl(FANTASY_ASSET_IDS[name]);
    },
    textureKey: name => `world-${resolvedWorldId}-${name}`,
  };
}

export function listWorldAssetManifestIds(): string[] {
  return [...manifests.keys()].sort();
}
