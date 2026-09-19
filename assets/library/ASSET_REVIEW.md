# Third-Party Asset Review (V1-061a)

ASSETMCP was used during development to search, inspect, verify licensing, download, and preview candidates. Runtime resolution remains limited to `ASSET_MANIFEST.json` and the local library.

## Imported

- **Kenney — Fantasy UI Borders**: selected one transparent panel border PNG for the fantasy frame theme. The included `License.txt` identifies CC0 and permits commercial use; attribution is optional. The original archive is retained at `assets/library/third-party-kenney/kenney_fantasy-ui-borders.zip`; the selected runtime file and a copy of its license are under `assets/library/third-party/kenney/fantasy-ui-borders/`.
- SHA-256 of the source archive: `59532da3bd61195a425585455b40baa6cbf1eda8227c42adcef31a535a737769`.
- The asset uses manifest ID `ff.kenney.fantasy-ui.border` and is referenced by the fantasy theme pack. Its image preview was inspected before selection.

## Reviewed but not imported

- **Kenney searches** covered tower, fantasy, UI, dungeon, isometric, tile, enemy, and roguelike terms. The fantasy UI pack was a suitable 2D candidate. Search results for tower/dungeon were 3D kits, which do not fit the current Phaser 2D art pipeline. No suitable map/tile or enemy result was found in those searches.
- **OpenGameArt search** for fantasy tower assets returned candidates without clear license metadata. They were rejected rather than imported with uncertain rights.
- No third-party map, tower, or enemy asset was added. The project-authored CC0 placeholders remain the fallback for those categories.

## Resolution and provenance

`ASSET_MANIFEST.json` is the project canonical Zod schema. The ASSETMCP-generated provenance entry did not match this schema, so it was reconciled into the canonical asset record and source/credit details were retained here and in `CREDITS.md`. Do not replace the project manifest with ASSETMCP's generic manifest format.

## V3 Border Outpost visual pack

- ASSETMCP was re-run for `2D isometric fantasy tower defense sprite tiles enemies towers` against Kenney, OpenGameArt, and itch.io with a commercial-use license policy. It returned no usable candidates; no external art was imported.
- V3 P0 art is an original project-authored set of 26 SVG illustrations, stored as source under `assets/library/border-outpost/`. It covers two meadow tile variants, stone road, build plinth, rift, keep, four fixed tower archetypes, four fixed enemy archetypes, six HUD controls/resources, four environment props, a world thumbnail, and workshop empty-state mark.
- Runtime files are PNG rasterizations made from these SVG sources using the project's pinned Playwright/Chromium browser. The canonical manifest points only at the local runtime PNGs. The original SVGs remain for review/editing.
- All project-authored art is dedicated under CC0-1.0; each manifest record says `Fantasy Frontiers project-authored SVG art`. Raster copies do not change the source license.
- Visual review used the actual 780×493 local gameplay viewport. The current screenshot is `qa/evidence/v3-local-gameplay.png`; additional responsive captures and the full E2E flow remain release-gate evidence.
- Retained known limitation: these are authored illustrated sprites, not externally sourced commercial art. They establish a coherent first-pass art direction, but they are intentionally compact/simple and should be refined only after screenshot review.
