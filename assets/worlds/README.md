# World visual asset protocol

Each world owns one directory named with its lowercase kebab-case world asset ID. Runtime code resolves the directory through `WorldSkin.assetWorldId` when present, otherwise through `WorldSpec.id`, and falls back to `frontier-outpost`.

Required source files:

- `source/world-key-art.png`
- `source/battle-backdrop.png`
- `source/battle-asset-sheet.png`

Run `pnpm assets:process <world-id>` after adding or replacing a sheet. The processor normalizes the sheet to a 4×5 grid of 512×512 cells, preserves meaningful source alpha (or removes the configured chroma background), writes the fixed `processed/` PNG filenames, generates compact WebP derivatives under `runtime/`, and regenerates `manifest.json`.

The PNG files remain the canonical editable/output protocol. Shipped runtime code imports only `runtime/**/*.webp` and the manifest. It never imports or slices `battle-asset-sheet.png`.
