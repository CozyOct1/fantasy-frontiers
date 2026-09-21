import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { assetManifestSchema, type AssetManifest } from "../packages/shared/src/index";

// Development-only curation. Sources were found through Asset MCP / OpenGameArt.
// Download archives and extract into the documented source directories first.
const root = "assets/library";
const output = `${root}/realm/runtime`;
await mkdir(output, { recursive: true });
const manifest: AssetManifest = JSON.parse(await readFile(`${root}/ASSET_MANIFEST.json`, "utf8"));
assetManifestSchema.parse(manifest);
const entries: AssetManifest["assets"] = [];
const attribution = {
  craftpix: { spdx: "OGA-BY-3.0", attribution: "CraftPix.net 2D Game Assets — Stone Tower Defense Game Art / Monster Game Sprites; OpenGameArt.org; resized and animation frames sampled. See assets/library/realm/CREDITS.md." },
  kenney: { spdx: "CC0-1.0", attribution: "Kenney — Tower Defense / Fantasy UI Borders; kenney.nl." },
  gleb: { spdx: "CC0-1.0", attribution: "glebster51 — SmallRTS_Pack_vol.1; OpenGameArt.org." },
};
async function emit(name: string, source: string | Buffer, kind: AssetManifest["assets"][number]["kind"], author: keyof typeof attribution, size = 256, trim = true) {
  let input = sharp(source);
  if (trim) input = input.trim();
  await input.resize(size - 16, size - 16, { fit: "contain", background: "#00000000" })
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: "#00000000" })
    .png({ palette: true, quality: 95 }).toFile(`${output}/${name}.png`);
  entries.push({ id: `ff.realm.${name}`, path: `${output}/${name}.png`, kind, tags: ["fantasy", "modular", name], themeFamilies: ["fantasy"], license: attribution[author] });
}
const tower = (n: number) => `${root}/craftpix-source/towers/PNG/${n}.png`;
for (const [name, body, crown] of [["basic", 3, 2], ["aoe", 12, 10], ["slow", 26, 8], ["heavy", 17, 19]] as const) {
  const base = await sharp(tower(body)).trim().resize({ width: 180 }).png().toBuffer();
  const cap = await sharp(tower(crown)).trim().resize({ width: 188 }).png().toBuffer();
  const complete = await sharp({ create: { width: 220, height: 270, channels: 4, background: "#00000000" } })
    .composite([{ input: base, left: 20, top: 42 }, { input: cap, left: 16, top: 24 }]).png().toBuffer();
  await emit(`tower-${name}`, complete, "tower", "craftpix");
}
await emit("castle", `${root}/small-rts-source/PNG/Castle.png`, "decoration", "gleb", 512);
await emit("flame", tower(35), "decoration", "craftpix", 128);
await emit("impact", tower(54), "decoration", "craftpix", 128);
await emit("stone", tower(52), "decoration", "craftpix", 128);
await emit("build-slot", tower(21), "tile", "craftpix", 128);
await emit("tree", `${root}/fantasy-frontiers-td-source/PNG/Details/trees_10.png`, "decoration", "kenney");
await emit("rock", `${root}/fantasy-frontiers-td-source/PNG/Details/rocks_3.png`, "decoration", "kenney", 128);
await emit("crystal", `${root}/fantasy-frontiers-td-source/PNG/Details/crystals_3.png`, "decoration", "kenney");
await emit("panel", `${root}/fantasy-frontiers/PNG/Double/Border/panel-border-008.png`, "frame", "kenney");
await emit("ground", `${root}/small-rts-source/PNG/GroundTexture.png`, "tile", "gleb", 256, false);
for (const [name, variant] of [["normal", 4], ["fast", 1], ["tank", 3], ["boss", 9]] as const) {
  for (let frame = 0; frame < 10; frame++) {
    const source = `${root}/craftpix-source/monsters/PNG/${variant}/${variant}_enemies_1_walk_${String(frame * 2).padStart(3, "0")}.png`;
    // Keep the source canvas across all frames to prevent registration jitter.
    await emit(`enemy-${name}-${frame}`, source, "enemy", "craftpix", 128, false);
  }
}
manifest.assets = [...manifest.assets.filter(asset => !asset.id.startsWith("ff.realm.")), ...entries];
assetManifestSchema.parse(manifest);
await writeFile(`${root}/ASSET_MANIFEST.json`, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Curated ${entries.length} modular local assets.`);
