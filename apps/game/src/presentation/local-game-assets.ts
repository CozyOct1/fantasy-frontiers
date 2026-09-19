import { assetManifestSchema } from "@fantasy-frontiers/shared";
import { themeRegistrySchema } from "@fantasy-frontiers/shared";
import manifestData from "../../../../assets/library/ASSET_MANIFEST.json";
import registryData from "../../../../assets/library/THEME_REGISTRY.json";

const manifest = assetManifestSchema.parse(manifestData);
const registry = themeRegistrySchema.parse(registryData);
const files = import.meta.glob(["../../../../assets/library/border-outpost/runtime/*.png", "../../../../assets/library/neutral/runtime/*.png"], { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const byPath = new Map(Object.entries(files).map(([path, url]) => [path.slice(path.indexOf("assets/library/")), url]));
const byId = new Map(manifest.assets.map(asset => [asset.id, byPath.get(asset.path)]));

/** Returns only a schema-approved, bundled local asset URL. */
export function getLocalGameAssetUrl(assetId: string): string | undefined {
  return byId.get(assetId);
}

export function getLocalGameAssetKey(assetId: string): string | undefined {
  const asset = manifest.assets.find(candidate => candidate.id === assetId);
  return asset ? asset.path.split("/").at(-1)?.replace(/\.(?:svg|png)$/, "") : undefined;
}

export function getLocalAssetManifestIds(): string[] {
  return manifest.assets.filter(asset => asset.path.includes("/border-outpost/")).map(asset => asset.id);
}

export function getPresentationAssets(packId: string) {
  return registry.packs.find(pack => pack.id === packId)?.presentationAssets;
}
