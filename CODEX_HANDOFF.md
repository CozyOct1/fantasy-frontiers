# CODEX_HANDOFF

## Project Goal

Keep the V4 tower-defense build playable while presenting every screen inside a landscape phone frame.

## Current Phase

- Phase: landscape phone presentation polish
- Status: landscape phone frame implemented

## Latest Completed Work

- Switched the presentation baseline to a 932×430 landscape mobile screen; actual landscape mobile viewports use the full viewport with no nested device bezel.
- Reworked Gameplay into a battle-first screen: compact overlay HUD, icon controls, 58px tower slots, prominent wave CTA, and a 22% larger map extending beneath HUD overlays.
- Added deployment path arrows, actionable BuildSlot highlighting, and a visible isometric attack range when a tower is selected.
- Reworked the Hub around one large illustrated world card, shorter action language, and lightweight floating creation/workshop controls.
- Preserved deterministic Game Core behavior and updated pointer-coordinate browser helpers for the enlarged projection.

## Important Modified Files

- `apps/game/src/main.ts`
- `apps/game/src/style.css`
- `apps/game/src/game/board-projection.ts`
- `apps/game/index.html`
- `tests/e2e/bootstrap.spec.ts`
- `tests/e2e/complete-playthrough.spec.ts`

## Verification

- `pnpm verify`: PASS; typecheck, 44 Vitest tests, and production build succeeded.
- `pnpm test:e2e`: PASS; 10 passed, 1 production-only smoke skipped by design. Includes a complete Easy six-wave playthrough, persistence, reload, and restart.

## Known Risks / Untested Areas

- Portrait browsers display a proportionally scaled 932×430 screen; device landscape orientation is the intended playable mode.
- World-detail and Workshop overlays may scroll internally when their content exceeds the fixed frame; the outer page remains fixed.
- The Phaser/Vite JS chunk remains about 1.40 MB (about 383 KB gzip) and triggers Vite's 500 KB warning.

## Next Safest Task

Review the 932×430 layout on a physical landscape phone and tune touch-target size only if a target device reports missed taps.
