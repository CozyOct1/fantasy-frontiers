import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assetManifestSchema, themeRegistrySchema, worldSkinSchema, type AssetManifest, type ThemeOutput, type ThemeRegistry, type WorldSkin } from "@fantasy-frontiers/shared";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
export function loadAssetLibrary(): { manifest: AssetManifest; registry: ThemeRegistry } {
  const manifest = assetManifestSchema.parse(JSON.parse(readFileSync(resolve(projectRoot, "assets/library/ASSET_MANIFEST.json"), "utf8")) as unknown);
  const registry = themeRegistrySchema.parse(JSON.parse(readFileSync(resolve(projectRoot, "assets/library/THEME_REGISTRY.json"), "utf8")) as unknown);
  return { manifest, registry };
}

export type ThemeResolution = { skin: WorldSkin; match: "exact" | "similar" | "neutral"; packId: string };
export function resolveWorldTheme(
  theme: ThemeOutput,
  manifest: AssetManifest,
  registry: ThemeRegistry,
  fileExists: (path: string) => boolean = path => existsSync(resolve(projectRoot, path)),
): ThemeResolution {
  const assets = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const valid = (pack: ThemeRegistry["packs"][number]) => {
    const ids = [pack.assets.backgroundId, pack.assets.panelId, pack.assets.buttonId, pack.assets.frameId, ...pack.assets.decorationIds];
    return ids.every(id => { const asset = assets.get(id); return asset !== undefined && fileExists(asset.path); });
  };
  const exact = registry.packs.find(pack => pack.themeFamily === theme.themeFamily && valid(pack));
  const similar = registry.packs.find(pack => pack.similarFamilies.includes(theme.themeFamily) && valid(pack));
  const neutral = registry.packs.find(pack => (pack.id === "ff-neutral" || pack.id === "neutral") && valid(pack));
  const chosen = exact ? { pack: exact, match: "exact" as const } : similar ? { pack: similar, match: "similar" as const } : neutral ? { pack: neutral, match: "neutral" as const } : undefined;
  if (!chosen) throw new Error("Asset library has no usable theme pack or neutral fallback");
  const colors = { ...chosen.pack.colors };
  if (theme.preferredColors[0] && /^#[0-9a-fA-F]{6}$/.test(theme.preferredColors[0])) colors.primary = theme.preferredColors[0];
  if (theme.preferredColors[1] && /^#[0-9a-fA-F]{6}$/.test(theme.preferredColors[1])) colors.accent = theme.preferredColors[1];
  const skin = worldSkinSchema.parse({ themePackId: chosen.pack.id, colors, assets: chosen.pack.assets });
  return { skin, match: chosen.match, packId: chosen.pack.id };
}
