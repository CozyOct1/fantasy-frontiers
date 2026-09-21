# Fantasy Frontiers modular art

All runtime files are bundled locally. No external asset URL is used by the game.

| Files | Author / source | License | Changes |
| --- | --- | --- | --- |
| tower-*, flame, impact, stone, build-slot | [CraftPix.net 2D Game Assets — Stone Tower Defense Game Art](https://opengameart.org/content/stone-tower-defense-game-art) | [OGA-BY 3.0](https://static.opengameart.org/OGA-BY-3.0.txt) | Body/crown composition, transparent padding, resizing, PNG optimization |
| enemy-* | [CraftPix.net 2D Game Assets — Monster Game Sprites](https://opengameart.org/content/monster-game-sprites) | [OGA-BY 3.0](https://static.opengameart.org/OGA-BY-3.0.txt) | Walk animation sampled to 10 registered frames; resized, PNG optimized |
| castle, ground | [glebster51 — SmallRTS_Pack_vol.1](https://opengameart.org/content/smallrtspackvol1) | CC0 1.0 | Transparent padding, resizing, PNG optimization |
| tree, rock, crystal | [Kenney — Tower Defense](https://opengameart.org/content/tower-defense-2) | CC0 1.0 | Transparent padding, resizing, PNG optimization |
| panel | [Kenney — Fantasy UI Borders](https://kenney.nl/assets/fantasy-ui-borders) | CC0 1.0 | Resizing, PNG optimization |

Source pages and license declarations verified 2026-09-21. CraftPix credits are also visible in game Settings.
OGA-BY assets retain their license; no claim of exclusive authorship is made.

Reproduction: download the archives from the source pages, extract their PNG directories to
`assets/library/craftpix-source/towers`, `assets/library/craftpix-source/monsters`,
`assets/library/small-rts-source`, `assets/library/fantasy-frontiers-td-source`,
and the Kenney UI pack to `assets/library/fantasy-frontiers`.
Run `pnpm exec tsx scripts/import-fantasy-assets.ts`.
Only the selected runtime PNGs and canonical asset manifest are shipped, not the archives,
PSD/FLA source files, sample scenes, or download tools.
