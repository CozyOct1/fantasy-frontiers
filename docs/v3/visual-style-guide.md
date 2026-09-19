# Border Outpost — V3 Visual Style Guide

## Art direction

An illustrated frontier defense in a temperate forest: weathered pale stone, muted pine and meadow greens, warm sandstone roads, worn red gate cloth, and restrained brass/gold interaction highlights. Shape language stays readable at small screen sizes: broad architectural masses for towers and the keep, pointed silhouettes for hostile creatures, and a violet-red rift that marks danger.

## Palette roles

| Role | Color | Use |
|---|---|---|
| Meadow | `#73935c` / `#344f39` | Terrain and foliage |
| Road | `#9a9076` / `#514e45` | Traversable stone path |
| Keep / ally | `#c9c5a7` / `#686c5a` / `#273b43` | Base and defensive structures |
| Interaction | `#ffe39b` / `#b77c32` | Selection, currency, focus |
| Threat | `#ed9a95` / `#6d344f` | Rift and hostile accent |
| UI | `#111913` / `#354a37` / `#f5ead0` | Battle panels, secondary controls, text |

Color is reinforced by shape, labels, health bars, and focus outlines; it is not the only state cue. The primary light is upper-left. Grounded objects use a soft shadow offset down-right.

## Projection and size contract

- Phaser's current grid is 52×32 logical pixels at scale 1, with projected centers `(anchorX + (x-y)*tileWidth/2, anchorY + (x+y)*tileHeight/2)`.
- Terrain/path source tiles are 128×82, alpha-backed PNGs with the diamond bleed scaled to cover adjacent cells. Their center aligns to the logical cell center.
- Towers use a 128×128 portrait with the ground contact near the lower edge; in-world display is approximately 0.77 tile widths × 1.85 tile heights.
- Enemies share the same center/foot anchor and render 23 px normally, 27 px for tank, and 31 px for boss at scale 1. Health bars remain Core-state overlays.
- The keep and rift remain centered on their MapSpec coordinates. They render at 1.28 tile widths × 2.2 tile heights and 0.9 tile widths × 2.1 tile heights respectively.

## UI and feedback

The battle HUD is one warm stone/iron plate with three separated resource groups. Tower cards put the authored portrait before name and cost. Controls remain in their V2 anchors. Terrain borders are absent in the default state; only a hovered tile or legal selected slot gets an outline. Reduced Motion disables scene tweens and CSS transitions.

Combat projectiles are presentation-only and follow the `towerFired` event position to target position. Hit flash, kill particles, reward text, base damage, wave banner, and result state use existing Core events/state. No animation feeds back into Core timing or results.

## Asset source and fallback

All Border Outpost source illustrations in `assets/library/border-outpost/*.svg` are original, project-authored vector art, dedicated under CC0-1.0. Browser-rasterized PNGs in `assets/library/border-outpost/runtime/` are the shipped runtime copies, included by canonical manifest ID. Existing neutral art remains the fallback. The asset directory's reviewed Kenney border remains separately credited under its bundled CC0 license.

## Reject

- Full-board high-contrast tile lines in normal play.
- Multiple idle build slots glowing at once.
- Dashboard cards as the visual vocabulary for battle resources.
- Unreviewed mixed-style packs, remote URLs, or model-provided paths.
- Ornament/detail that weakens road, enemy, health, or interaction readability.
