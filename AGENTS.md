# AGENTS.md — Fantasy Frontiers

This file defines project constraints for Codex and other coding agents working in this repository. Keep durable rules here, tunable values in configuration, and the rationale/design detail in `docs/v1/01-brief-design.md` and `docs/v1/02-architecture.md`.

## 1. Project identity and product goals

- Fantasy Frontiers is a tower defense game. AI provides world theming and evidence-based evaluation; it is not the product's core gameplay or a required dependency for playing existing worlds.
- Players can browse/select worlds and play their levels. Every world has at least three campaign levels: Easy, Medium, and Hard.
- All worlds use the same core rules. World differences are limited to setting, narrative, names, UI theme, and visual asset skin. Do not let generated worlds introduce new core mechanics.
- **My Worlds** is where players create and manage worlds. **Creative Workshop** is where players discover and play published worlds.
- Preserve the MVP scope and non-goals in the design brief. Do not add multiplayer, leaderboards, skill trees, equipment, gacha, reinforcement learning, model training, or complex account systems unless a task explicitly changes scope.

## 2. Fixed technology stack

Use the following stack unless the user explicitly approves a change:

- TypeScript for frontend, game logic, shared packages, and backend application code.
- Phaser for the playable game runtime and rendering; Vite for frontend development and builds.
- Node.js for backend/runtime services.
- pnpm as the sole package manager and workspace tool.
- SQLite as the application database.
- Zod for runtime schema validation and parsing.
- Vitest for unit tests; Playwright for browser automation and end-to-end verification.
- Codex as the only AI development tool.

Do not introduce Godot, Unity, Python backend services, another database, another package manager, or another frontend framework unless explicitly requested. Python scripts may only be used for narrowly scoped development tooling when a task requires them; they must not become runtime services or replace the TypeScript application stack. Do not upgrade or replace dependencies as incidental cleanup.

## 3. Architecture boundaries and dependency direction

- `Game Core` is pure TypeScript. It must not depend on Phaser, browser DOM APIs, UI code, database code, network services, or LLM integrations.
- Phaser is an adapter for rendering and player input. It reads core state and sends player actions to the core; rendering state must never decide game rules or outcomes.
- `Headless Simulator` must execute the same Game Core rules used by the Phaser runtime. Never create separate or simplified gameplay logic for evaluation.
- Keep a one-way dependency direction: shared schemas/types → Game Core → Simulator → Metrics. UI and server/application layers may depend on lower-level packages through their public interfaces; core packages must not depend upward on UI, server orchestration, LLM, or persistence.
- Database access belongs in the server/persistence layer. LLM calls belong behind server-side workflow/agent adapters. Neither may leak into Game Core.
- Define shared cross-module contracts once in the canonical shared schema/type package. Do not recreate local variants of types such as `GameResult` or `MapSpec`.

## 4. Game core invariants

- All random behavior that affects gameplay or simulation must use the shared seeded RNG and be reproducible from a recorded seed. Never use `Math.random()` in core gameplay or simulation logic.
- Player play and automated evaluation must use the same deterministic rules and outcome calculation.
- Store adjustable gameplay numbers in configuration/data files, not scattered literals. Keep tower and enemy archetypes fixed and controlled by project code/configuration.
- LLM output must not create or change tower/enemy mechanics, stats, economy, win/loss rules, or map legality rules.
- Game outcomes are computed from Game Core state transitions, never inferred from Phaser visuals, animation timing, or UI state.

## 5. Creative Workflow

Creative Workflow is a fixed backend orchestration pipeline, not an autonomous agent. Keep its stages explicit and ordered, following the architecture/design documents (world identity → tower theme → enemy theme → campaign → UI/theme data, with template/asset resolution and validation in application code).

- Each stage has one defined responsibility and a narrow input/output contract.
- Every LLM response must be structured JSON and pass its Zod schema before downstream stages can consume it or it can be persisted.
- The backend controls stage order, retries, validation, persistence, and state transitions. LLMs cannot call the database, write SQL, create files/paths, select arbitrary network resources, or invoke tools that bypass the workflow.
- LLMs may generate semantic content such as text, names, narrative, tags, and visual keywords. They must not set gameplay stats, economy, map coordinates, map rules, or asset paths/URLs.
- Keep prompt modules focused and versionable. Runtime code must not load or execute Codex Skill files.

## 6. Evaluation Agent

Evaluation is the agentic part of the product. The Evaluation Agent may inspect a level, request simulator runs, compare bot policies, decide whether more experiments are needed, interpret metrics, and produce a report.

- The Agent must obtain run evidence through the Headless Simulator and numeric measurements through the deterministic Metrics Engine before giving a final evaluation.
- The Agent must not fabricate `GameResult`, directly calculate or alter metric values, modify Metrics Engine outputs, or change game rules/configuration during evaluation.
- Numeric measures—including win rate, remaining base health, leak rate, failure wave, resource use, and tower usage—must be computed by deterministic code from recorded simulation results.
- The Agent explains what the measurements mean and whether more experiments are needed. Preserve traces linking its conclusions to experiments and metrics.

## 7. Maps, templates, and validation

- Maps come from controlled template pools. Maintain pools by difficulty; each generated campaign level must resolve to a valid map template and appropriate difficulty parameters.
- LLMs may suggest semantic tags or preferred template categories only. Backend code selects templates, applies allowed parameters, generates coordinates, and validates the result.
- Every generated map must pass the map validator before saving or play. Validate legal coordinates, required spawn(s) and base, path connectivity from every entrance to the base, and that build locations do not conflict with roads or other forbidden cells.
- Reject invalid results with structured errors or use a defined fallback. Never trust model-provided coordinates or skip validation for convenience.

## 8. Assets and visual themes

- Runtime assets must resolve from the controlled local Asset Library and manifest.
- LLM output is limited to semantic hints such as `themeFamily`, `styleTags`, color preferences, and visual keywords. It must not return arbitrary image URLs, network addresses, filesystem paths, or unvalidated asset IDs.
- Application code resolves semantic hints to approved Asset IDs. Provide deterministic fallbacks: closest matching theme, then neutral theme, so a missing match cannot block world creation or gameplay.
- Keep gameplay behavior independent of whether a particular theme asset exists.

## 9. Canonical schemas and data models

Treat these as canonical cross-module concepts and extend their single authoritative definitions instead of creating duplicates:

`WorldSpec`, `TowerThemeSpec`, `EnemyThemeSpec`, `CampaignSpec`, `LevelThemeSpec`, `ThemeSpec`, `WorldSkin`, `MapSpec`, `GameState`, `GameResult`, and `EvaluationMetrics`.

- Before adding a type/schema, search the repository for an existing definition and its consumers.
- Use Zod schemas at external boundaries (LLM responses, API requests/responses, persisted JSON, and package boundaries where data is untrusted). Infer TypeScript types from schemas where practical.
- Keep persistence models, API DTOs, and gameplay domain models distinct where their responsibilities differ, and map between them explicitly. Do not silently fork canonical domain semantics.

## 10. Coding scope and change discipline

- Inspect relevant code and docs before editing. Make the smallest complete change that satisfies the task.
- Reuse existing modules, schemas, and helpers. Search before adding a type or utility to avoid duplicate definitions.
- Do not perform unrelated refactors, reorganize directories, add unsolicited features, or change architecture/stack as part of a focused task.
- Keep new behavior inside the relevant layer and preserve the dependency boundaries above.
- When requirements conflict, follow the user's latest explicit direction; update this file or the design documents only when the task calls for a durable policy change.

## 11. Task execution and verification

For implementation tasks:

1. Inspect the relevant code, existing tests, package scripts, and applicable design docs.
2. Identify the smallest change surface and implement a complete solution.
3. Add or update focused tests for changed behavior.
4. Run relevant tests, type checking, and build commands available in the repository.
5. Run `pnpm verify` as the final project verification command when it is defined. If it is missing or fails, report that accurately; do not claim verification succeeded.
6. Review the final diff for unrelated changes and architecture violations.
7. Summarize changed files, behavior, verification performed and results, and any remaining limitation.

Never claim a task is complete when required checks failed or were not run. Do not add or run tests when the user explicitly asks not to verify or test; report that constraint clearly.

## 12. Skills and MCP boundaries

- Codex Skills, including external open-source Skills, are development-time guidance for Codex only. They are not game runtime dependencies and must not be loaded/executed by the shipped game or server.
- Useful Skill methods may be deliberately adapted into project-owned, reviewed prompt modules or code, but do not copy entire Skill runtimes into the product.
- MCP tools are development tools. Playwright may support development-time browser verification; asset MCP tools may help curate/import assets into the controlled library. The running game must not require an MCP server or developer tool.

## Definition of Done

A code task is done when the requested behavior is implemented, focused checks and applicable type/build checks pass, `pnpm verify` passes when available, architecture invariants remain intact, and the diff contains no unrelated changes. If a check cannot be run, state why and leave the task's verification status explicit.
