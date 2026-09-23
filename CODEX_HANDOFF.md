# CODEX_HANDOFF

## Latest pass — complete map workshop and production path repair (2026-09-22)

- Phase: production internal authoring tool. Fixed the workshop navigation defect: links, preview entry and preview return now resolve through the Vite base path, so `/fantasy-frontiers/` deployments no longer escape to the domain root/another application.
- Expanded the workshop from spatial editing into a complete level-authoring loop: 12×8 map tools, per-route drawing, metadata, undo/redo, wave list, wave labels, enemy batch scheduling by type/route/count/start/interval, controlled baseline-wave generation, and full map + wave validation.
- Preview serializes canonical `MapSpec + WavePlan` and runs the same Game Core used by campaign play. It stays isolated from campaign start/result writes.
- Added local persistence and JSON round-trip. When `ENABLE_MAP_EDITOR=1`, the UI also supports server draft listing/loading/sync, optimistic revision conflicts, server validation, and idempotent immutable publication; otherwise it clearly falls back to local mode.
- Shared/server contracts now include editable wave-plan data and published revisions retain the validated wave plan. LLM output still cannot author coordinates, stats, economy, or legality rules.
- Verification: `pnpm verify` passed (18 Vitest files / 68 tests); full Playwright with one worker and trace off passed (16 passed, production-only smoke skipped); explicit production smoke passed and verified home → workshop → return under `/fantasy-frontiers/`; focused editor, mobile-touch and storybook reruns passed. One parallel Playwright run hit trace-artifact ENOENT; the serial no-trace run is the final browser verdict.
- Remaining boundary: this is an internal desktop-first authoring tool, not public UGC. Collaborative editing, arbitrary scripts/stats, direct publication into campaign catalogs, and human balance approval remain out of scope.

## Latest pass — V6 playable UI / gameplay / audio slice (2026-09-22)

- Phase: production candidate. V6's automated technical slice is complete; human fun/balance and physical-device release gates remain open.
- Added an event-driven Easy onboarding, real WavePlan threat brief, config/state-backed tower role panel, and factual result recap. The non-modal guide was corrected to pass map touches through during action steps.
- Added canonical between-wave `sellTower` behavior with Core-owned refund calculation, player UI confirmation, events, tests and same-Core Simulator action-log replay.
- Added `AudioDirector`: browser gesture unlock, local-only lazy loading, lobby/battle scene loops, music ducking, master/music/effects preferences, mute/reduced-intensity settings, priority/cooldown controls, 24-voice cap, suspend/resume and silent fallback.
- Added 19 controlled runtime audio assets plus source/license manifests under `assets/library/audio/`; UI continues using the controlled Kenney Fantasy UI border asset.
- Verification: `pnpm verify` passed (18 Vitest files / 66 tests, typecheck, production build). Full Playwright passed with 16 tests and the existing production-preview-only smoke test skipped. All 19 audio files passed `ffprobe` decoding.
- Evidence boundary: no five-person/two-round playtest, physical mobile audio/performance pass, Medium two-strategy proof, or Hard human/action-replay win exists yet. Do not claim commercial balance or completed V6 release gates.
- Next safest task: conduct the first five-person Easy/Medium/Hard playtest and record action logs; use those results to decide whether sell/refund stays and to build the first reproducible Hard-winning replay before changing numbers.

## Latest pass — V6 UI / gameplay / audio plan (2026-09-22)

- Phase: production-readiness planning only; no runtime behavior, balance, assets, APIs or database data changed.
- Added `docs/v6/plan.md`, a phased vertical-slice plan integrating UI readability, decision quality and semantic audio feedback around one player loop.
- Confirmed current audio sliders only persist settings; there is no runtime music/SFX system. V6 therefore starts with browser audio unlock, lifecycle, buses, priority/voice limits and silent fallback before asset expansion.
- Gameplay scope remains four towers/four enemies. The plan prioritizes authored encounter decisions, onboarding, deterministic action replay and evidence-based failure recap; sell/refund is only a gated prototype candidate.
- UI scope consolidates the battle HUD, adds contextual threat/tower/result information, and requires physical mobile readability/touch evidence without introducing a new frontend framework.
- Remaining first gate: five-person baseline playtest, Hard human/action-replay solvability evidence, UI audit and licensed audio cue inventory.

## Latest pass — V5 playable authoring vertical slice (2026-09-22)

- Phase: production vertical slice. The former V5 planning-only state is superseded by a runnable implementation; human playtest gates remain open.
- Added canonical `MapDraft`, immutable template revision and explicit `WavePlan` contracts. Game Core, player runtime, Simulator and Evaluation Workflow consume the same deterministic wave data.
- Added three fixed-layout benchmark levels, next-wave briefing, reproducible `pnpm balance:v5` evidence and `docs/v5/balance-design.md`. Current automation warns that Easy/Medium are permissive for some bots while Hard defeats all current bots; this is not a human balance verdict.
- Added `/map-editor.html`: desktop grid authoring for base, up to three entrances, selectable ordered paths, build slots and obstacles; undo/redo, local save, JSON import/export, live validation and isolated Phaser preview. Preview never starts/saves a campaign run.
- Added default-off editor APIs (`ENABLE_MAP_EDITOR=1`), optimistic draft revisions, validated/idempotent immutable publish, additive SQLite migration, and run content/ruleset snapshots.
- Creative Workflow now selects controlled authored layouts/waves and only applies semantic tags; the LLM does not set coordinates, stats or spawn timing.
- Verification: `pnpm verify` passed (17 files / 62 tests, typecheck, production build). Full Playwright passed: 14 tests, with the production-deployment-only smoke test skipped by its existing environment gate.
- Remaining gates: two rounds of target-player tests, physical mobile-device verification, Hard human action replay, and evidence-based final number tuning. Do not claim commercial balance or fun before these are complete.

## Latest pass — V5 gameplay and authoring plan (2026-09-21)

- Phase: discovery / vertical-slice planning only. User priority moved from art polish to playability, map authoring and numerical design.
- Added `docs/v5/plan.md`: source-backed audit, one-level proof before tooling, internal desktop map editor, immutable template/level revisions, preview isolation, controlled wave plans, balance experiments, three-level campaign and AI reuse gates.
- Existing foundations are retained: controlled templates, centralized stats, pure deterministic Core and shared Simulator/Metrics. Key gaps: shuffled free-cell build slots, sampled wave composition, absent editor, and player runs without complete content snapshots.
- No gameplay, configuration, API, database, asset or test changes in this pass. Existing uncommitted presentation work was preserved.
- Verification: documentation references and scoped diff reviewed; no new runtime tests, balance runs, player tests or `pnpm verify` executed for this documentation-only task. All V5 implementation milestones remain pending.
- Next safest task: approve P0 and author one fixed-layout greybox encounter using existing rules; collect strategic-choice and authoring-cost evidence before implementing the editor. Earlier art-first next steps below are historical, not the current priority.

## Latest pass — storybook feedback implementation

- Phase: presentation polish / vertical-slice iteration; no gameplay, persistence or AI workflow rules changed.
- Added `storybook-realms.ts`: controlled forest/crystal/rift profiles, floating-city composition detection, cosmetic channel selection and config-derived tower descriptions.
- Lobby now reports real campaign completion, fully completed worlds and available tower archetype count. No invented XP, stars, unlock rewards, or auto-wave timers.
- World covers use different focal assets/geography, with satellite-island layout for floating cities; saved enemy names appear on cards. Battlefield palettes and decorative river/bridges/props use the same semantic profile.
- Selected towers reveal actual damage/range/rate in the existing message area. Hover shows legal/insufficient/invalid feedback and projected core-distance range. Unaffordable towers can be inspected; core still rejects unaffordable placement. Re-click cancels selection.
- Verification: final `pnpm verify` exit 0 (56 unit tests, types, build); full `pnpm test:e2e --workers=2` exit 0 (13 passed, 1 production-only skipped). Following two CSS visibility corrections, `pnpm exec playwright test tests/e2e/storybook.spec.ts --workers=1` passed. Initial theme test lacked confirmation-dialog handling; test fixed, game exit behavior unchanged. Screenshot review caught and corrected cropped card focal objects and desktop hint/entrance-label overlap.
- Risks: stock-art stylistic mismatch, no physical device performance evidence, same-family worlds share approved art, bridges are cosmetic only. No external services or production data mutated.
- Next: inspect final three-biome screenshots and physical-device readability; replace mismatched art before claiming commercial finish.

## Current handoff — 2026-09-21 modular fantasy presentation

- Scope: lobby, battle rendering, shared UI and responsive input; no core mechanics, server workflows, stats, dependencies, or production deployment changed.
- Lobby: independently animated clouds, castle light, banners, torches, magic and particles; two main actions and upper-right settings.
- World cards: modular covers, Chinese difficulty badges, actual campaign progress. Generation/evaluation navigation preserved.
- Battle: no baked backdrop; MapSpec roads, visible fixed slots, labelled entrances/base, independent sprites, ten-frame walk cycles, upgrade/hit/reward feedback. Touch gets a nearest-slot 22px tolerance; legal placement stays in Game Core.
- Resources: 54 curated local PNGs (about 388 KB on disk), Asset MCP / OpenGameArt provenance, CraftPix OGA-BY attribution in Settings and `assets/library/realm/CREDITS.md`; no runtime MCP or external asset fetches.
- Important files: `fantasy-scene.ts`, `fantasy-asset-config.ts`, `world-asset-registry.ts`, `main.ts`, `style.css`, `scripts/import-fantasy-assets.ts`, `docs/v1/03-fantasy-presentation.md`.
- Verification: `pnpm verify` passed (52 tests, typecheck, production build). `pnpm test:e2e --workers=2`: 12 passed, 1 production-preview test skipped. Six-wave victory, persisted result, reload, restart, reduced motion, viewport sizes and emulated touch checked. Earlier parallel verification timed out from resource contention; separate reruns passed without loosening limits. See `qa/verification.json`.
- Known limitations: stock castle/vegetation and outlined combat art are not yet a fully bespoke unified hand-painted set; world covers share one composition; no physical-device performance certification, new audio, commercial-release certification, or live AI call made in this pass. Existing Phaser bundle warning remains (~1.59 MB JS uncompressed).
- Next safest work: evaluate the captured lobby/battle frames with the user, curate a coherent dedicated castle/vegetation family, then profile on physical low-end mobile hardware. Do not add systems to mask remaining art-direction work.

The sections below are historical context from earlier passes and do not supersede this dated handoff.

## Project Goal

Keep deterministic gameplay intact while loading replaceable world visuals through a fixed per-world asset protocol.

## Current Phase

- Phase: V3 top-level information architecture
- Status: game-first main menu, play flow, Creation Studio, evaluation entry, and local settings implemented

## Latest Completed Work

- Completed a real DeepSeek-backed evaluation of Border Outpost across Easy, Medium, and Hard. Each level ran deterministic novice, baseline, and expert simulations; the completed records and evidence are stored in the production SQLite database.
- Added readable Markdown evaluation export with an overall summary, per-level conclusions, deterministic metric tables, tower usage, policy/seed/run/result references, and evidence boundaries.
- Added `GET /api/worlds/:worldId/evaluation-report.md` plus a Download Markdown action in the AI Evaluation workspace.
- Added a repeatable `scripts/run-world-evaluation.ts` command for running a real world evaluation and writing `reports/evaluations/<world-id>.md`.
- Corrected the Evaluation Agent's initial/final JSON contracts, added bounded structured-output retries, and required Simplified Chinese qualitative prose.
- Configured the production service to use DeepSeek through a gitignored mode-600 `.env`; no credential is stored in source, reports, tests, or handoff files.
- Replaced the management-dashboard landing screen with a full-screen world-key-art main menu containing only Start Game, Creation Studio, and Settings.
- Split the Hub into explicit subviews: world selection → level selection, Creation Studio → world generation / AI evaluation, and global settings. Gameplay and result screens retain the existing shared runtime.
- Removed the published-world market and publish action from the visible product flow. Creation Studio now presents only the two currently supported tools.
- Added a dedicated Evaluation Agent workspace that selects a world, starts the existing deterministic three-level evaluation workflow, and renders report summaries.
- Added masked local DeepSeek provider/model/API-key settings plus audio, language, reduced-motion, and fullscreen controls. Settings remain browser-local and do not alter Game Core.
- Added a focused Playwright navigation test covering the new menu, play, creation, and settings paths.
- Added a two-tier world asset pipeline: canonical source/processed PNGs remain unchanged, while `pnpm assets:process` emits optimized runtime WebP derivatives and records them in the manifest.
- Runtime key art/backdrop are 1280×720 WebP; battlefield sprites are 256×256 WebP while preserving the same transparent canvas, origin, footprint, and screen sizing contract. The runtime world pack dropped from 6.4 MB of processed PNGs to about 564 KB.
- Vite now imports only `runtime/**/*.webp` for world visuals. Public Nginx serves hashed `/fantasy-frontiers/assets/` files with one-year immutable caching and gzip remains active for JS.
- Completed Battle Visual Polish: tower scales now have a clear Basic/AOE/Slow/Heavy hierarchy, while Base and Spawn were reduced so moving combat units regain visual priority.
- Widened procedural roads by about 12%, added themed edge bands, stone slab seams, and explicit intersection paving without changing MapSpec geometry.
- BuildSlots now expose idle, hover, selected, affordable, unaffordable, and occupied visual states, including a restrained affordable pulse and footprint ring.
- Strengthened existing battle feedback with enemy sprite hit flash and a Spawn activation ring at wave start; the persistent running-status badge now recedes after the wave banner.
- Completed the battlefield Visual Integration Pass: removed checkerboard ground tiles, added a single palette-driven isometric plateau with cliff face and shadow, dimmed/tinted the distant backdrop, reduced prop density, and reduced Base/Spawn/BuildSlot visual scale.
- Road geometry is now generated entirely from MapSpec adjacency with one fixed connector width and tile footprint. Runtime no longer loads or renders the four AI road-shape PNGs; those files remain only for protocol compatibility and calibration reference.
- Added per-world `battlefieldPalette` values (`groundPrimary`, `groundSecondary`, `roadPrimary`, `roadEdge`, `cliff`, `ambientTint`) so another WorldSkin can integrate its battlefield by editing the manifest.
- Implemented a manifest-driven Isometric Render Contract. Every battlefield asset now owns `originX`, `originY`, `scale`, `depthBias`, and tile footprint metadata; Phaser placement uses projected ground contact points instead of per-sprite offsets.
- Ground, road, and build-slot layers use fixed depths. Base, spawn, towers, enemies, landmarks, and props share `objectBase + groundScreenY + depthBias`; moving enemies recalculate this every frame.
- Road sprites always render at projection `tileWidth × tileHeight` and use footprint-preserving mirrors for direction variants.
- Added `/fantasy-frontiers/dev/assets?world=frontier-outpost` AssetCalibrationScene and `?debugRender=1` Gameplay diagnostics for tile coordinates, sprite bounds, anchors, footprint, ground Y, scale/origin, and calculated depth.
- Fixed the public Gameplay blank-loading regression. World pack PNGs are now loaded after the Phaser Scene renders its deterministic fallback board, so a slow connection no longer leaves a transparent canvas for 30–40 seconds.
- Removed the extra board projection zoom that could push edge gameplay markers outside the usable viewport.
- Added `WorldAssetManifest` schema and optional `WorldSkin.assetWorldId` linkage.
- Added deterministic `pnpm assets:process <world-id>` processing with Sharp: normalize to 2048×2560, fixed 4×5 crops, 20 stable 512×512 RGBA outputs, alpha/chroma handling, and manifest generation.
- Moved the supplied Frontier Outpost sources into `assets/worlds/frontier-outpost/source/` and generated the complete `processed/` tree plus `manifest.json`.
- Added build-time world registry with per-file fallback to `frontier-outpost`; the runtime imports key art, backdrop, manifest, and processed PNGs but excludes the source sheet.
- Connected key art to My Worlds, Workshop, and World Detail; connected battle backdrop as Phaser depth layer 0.
- Added centralized origins/render scales, fixed archetype mappings, deterministic prop use, and MapSpec-driven road straight/corner/cross/end rendering.
- Game Core, map topology, combat/economy values, Simulator, Metrics, Creative Workflow, and Evaluation Agent were unchanged.

## Important Modified Files

- `apps/game/src/main.ts`
- `apps/game/src/style.css`
- `apps/game/src/game/board-projection.ts`
- `apps/game/index.html`
- `apps/game/src/presentation/world-asset-contract.ts`
- `apps/game/src/presentation/world-asset-registry.ts`
- `apps/game/src/presentation/world-asset-render-config.ts`
- `apps/game/src/presentation/road-renderer.ts`
- `packages/shared/src/schemas.ts`
- `scripts/process-world-assets.ts`
- `assets/worlds/frontier-outpost/**`
- `assets/worlds/README.md`
- `tests/world-assets.test.ts`
- `tests/e2e/bootstrap.spec.ts`
- `tests/e2e/complete-playthrough.spec.ts`

## Verification

- `pnpm verify`: PASS; typecheck, 50 Vitest tests, and production build succeeded.
- Real DeepSeek evaluation: PASS; three latest records completed with three Simulator runs each.
- Public Markdown endpoint: PASS; returns HTTP 200 with `text/markdown; charset=utf-8`.
- `pnpm exec playwright test tests/e2e/main-menu.spec.ts --project=chromium`: PASS; 1 focused browser flow passed.
- The previous full `pnpm test:e2e` result predates the Hub navigation change; legacy E2E selectors still need migration to the new Start Game flow.
- AssetCalibrationScene and Gameplay debug render were visually inspected in Chromium with no page or request errors.
- The integrated plateau, procedural road connectors, reduced prop density, backdrop tint, and resized landmarks were visually inspected at 1280×720 in Chromium with no page errors.
- Public Nginx URL smoke check: PASS; the current hashed bundle loads, a Gameplay canvas is visible, and the fallback battlefield renders within 3 seconds with no page, request, or HTTP errors while themed assets continue loading.
- `pnpm test:e2e`: PASS; 10 passed, 1 production-only smoke skipped by design. Includes source asset network loading, Easy/Medium/Hard, and complete Easy playthrough/persistence/restart.
- Asset inspection: source key art/backdrop decode at 1672×941; processed sample is 512×512 RGBA with a fully transparent border.

## Known Risks / Untested Areas

- The real evaluation currently uses one deterministic seed per policy and level. The report states this evidence limitation; broader statistical confidence would require explicitly increasing the bounded seed policy in a future task.
- Legacy bootstrap/full-playthrough E2E specs still reference the removed dashboard labels (`管理详情`, `试玩关卡`, and the old published Workshop). The new focused navigation spec passes, but the full legacy E2E suite was not rerun as a passing suite.
- AI provider/model/API-key settings are stored locally for the product settings surface; the server continues to obtain DeepSeek credentials from its existing server-side environment configuration.
- The supplied sheet is 1122×1402 rather than protocol-native 2048×2560; processing performs a deterministic near-proportional normalization before fixed cropping.
- The supplied sheet contains meaningful partial alpha and visible color fringe in some edge pixels; the processor preserves source alpha as explicitly required.
- The Phaser/Vite JS chunk remains about 1.40 MB (about 383 KB gzip) and triggers Vite's 500 KB warning.
- Canonical PNG sources remain large on disk by design, but they are no longer shipped or requested by Gameplay.
- The public connection is bandwidth constrained at roughly 45–50 KB/s. Optimized visual responses measured about 526 KB total for the tested hub-to-game flow, down from about 963 KB; the remaining first-load bottleneck is the 389 KB gzipped Phaser/application bundle.

## Next Safest Task

Migrate the legacy Playwright bootstrap and full-playthrough selectors to the Start Game → world → level flow, then rerun the full browser suite.
