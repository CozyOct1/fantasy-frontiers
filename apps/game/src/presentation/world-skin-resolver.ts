import { assetManifestSchema, themeRegistrySchema, worldSkinSchema, type ThemeFamily, type WorldSkin } from "@fantasy-frontiers/shared";
import manifestData from "../../../../assets/library/ASSET_MANIFEST.json";
import registryData from "../../../../assets/library/THEME_REGISTRY.json";

const manifest = assetManifestSchema.parse(manifestData);
const registry = themeRegistrySchema.parse(registryData);
const availableAssetIds = new Set(manifest.assets.map(asset => asset.id));

export type ResolvedWorldSkin = { packId: string; family: ThemeFamily; skin: WorldSkin; fallback: "exact" | "similar" | "neutral" };

function hasAvailableAssets(pack: (typeof registry.packs)[number]): boolean {
  const presentation = pack.presentationAssets;
  const presentationIds = presentation ? [
    ...presentation.terrainTileIds, presentation.pathTileId, presentation.buildSlotId, presentation.spawnId, presentation.baseId,
    ...Object.values(presentation.towerIds), ...Object.values(presentation.enemyIds), ...Object.values(presentation.hudIconIds),
    ...presentation.decorationIds, presentation.worldThumbnailId, presentation.workshopEmptyId,
  ] : [];
  return [pack.assets.backgroundId, pack.assets.panelId, pack.assets.buttonId, pack.assets.frameId, ...pack.assets.decorationIds, ...presentationIds]
    .every(id => availableAssetIds.has(id));
}

function skinAssetsAvailable(skin: WorldSkin): boolean {
  return [skin.assets.backgroundId, skin.assets.panelId, skin.assets.buttonId, skin.assets.frameId, ...skin.assets.decorationIds]
    .every(id => availableAssetIds.has(id));
}

function safePalette(skin: WorldSkin): boolean {
  return Object.values(skin.colors).every(color => /^#[\da-f]{6}$/i.test(color));
}

export function resolveWorldSkin(family: ThemeFamily, candidate?: WorldSkin): ResolvedWorldSkin {
  const requestedPack = candidate ? registry.packs.find(pack => pack.id === candidate.themePackId) : undefined;
  if (requestedPack && requestedPack.themeFamily === family && hasAvailableAssets(requestedPack)) {
    const parsed = worldSkinSchema.safeParse(candidate);
    if (parsed.success && skinAssetsAvailable(parsed.data) && safePalette(parsed.data)) return { packId: requestedPack.id, family, skin: parsed.data, fallback: "exact" };
  }

  const exact = registry.packs.find(pack => pack.themeFamily === family && hasAvailableAssets(pack));
  const similar = exact ?? registry.packs.find(pack => pack.similarFamilies.includes(family) && hasAvailableAssets(pack));
  const neutral = registry.packs.find(pack => pack.id === "ff-neutral" && hasAvailableAssets(pack));
  const selected = exact ?? similar ?? neutral;
  if (!selected) throw new Error("Theme registry has no usable neutral asset pack.");
  const fallback = exact ? "exact" : similar ? "similar" : "neutral";
  return {
    packId: selected.id,
    family,
    fallback,
    skin: {
      themePackId: selected.id,
      colors: selected.colors,
      assets: selected.assets,
    },
  };
}
