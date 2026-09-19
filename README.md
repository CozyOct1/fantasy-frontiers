# Fantasy Frontiers / 幻想防线

Fantasy Frontiers is a 2.5D tower defense game with controlled AI world theming and evidence-based level evaluation. Product and architecture requirements live in [`docs/v1`](docs/v1/).

## Requirements

- Node.js 22.22.2 (see `.node-version`; Node 22.12 or newer is required by this workspace)
- Corepack
- pnpm 12.4.2, pinned by the root `package.json`

## First-time setup

```bash
corepack enable pnpm
pnpm install
pnpm exec playwright install chromium
cp .env.example .env
```

If Corepack cannot write beside the Node.js installation, enable the shim in a user-writable directory instead, for example `corepack enable pnpm --install-directory "$HOME/.local/bin"`, and make sure that directory is on `PATH`.

Edit `.env` only when local configuration is needed. Never commit real API keys or credentials. The Creative Workflow and qualitative Evaluation Agent use DeepSeek through its OpenAI-compatible API (`DEEPSEEK_BASE_URL`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`). The Simulator and Metrics stay deterministic local code; DeepSeek does not provide or alter numeric evaluation results. A key is needed to create or evaluate worlds, but not to play saved worlds. The server and seeded content work without a key.

## Local development

```bash
pnpm dev
```

This starts the Vite game client at <http://127.0.0.1:5173> and the Node server at <http://127.0.0.1:3001>. The server stores local data in `data/fantasy-frontiers.sqlite`, seeds “边境哨站” with Easy / Medium / Hard levels, and exposes world, evaluation, Workshop, level, game-run and progress APIs. In “我的世界”, open “管理详情” to inspect the three levels and reports, start/retry evaluation, and publish once the readiness checks pass. “创意工坊” lists only published worlds. To create or evaluate a world, set `DEEPSEEK_API_KEY` in `.env`; without it, those jobs fail with a retryable configuration error while saved worlds remain playable. The initial local Asset Library contains project placeholder SVGs; ASSETMCP-curated third-party assets are not included yet.

Individual processes can be started with `pnpm dev:game` and `pnpm dev:server`.

## Verification

```bash
pnpm verify
pnpm test:e2e
```

`pnpm verify` runs workspace type checks, Vitest checks, and production builds. `pnpm test:e2e` runs the optional browser smoke flow with the Playwright-managed Chromium build.

## Headless simulation and metrics

The simulator package reuses Game Core directly and exports `runEpisode`, `runBatch`, and `comparePolicies`. Use one shared seed list when comparing policies. Each returned run preserves its map, game configuration snapshot/version, seed, policy version, action trace, per-wave records, and canonical `GameResult`.

```ts
import { generateMap } from "@fantasy-frontiers/maps";
import { calculateMetricsFromRuns } from "@fantasy-frontiers/metrics";
import { runBatch, NOVICE_POLICY, BASELINE_POLICY } from "@fantasy-frontiers/simulator";

const mapResult = generateMap({ difficulty: "easy", seed: 70421 });
if (!mapResult.ok) throw new Error(mapResult.message);
const seeds = [101, 102, 103];
const noviceRuns = runBatch({ map: mapResult.map, seeds, policy: NOVICE_POLICY });
const baselineRuns = runBatch({ map: mapResult.map, seeds, policy: BASELINE_POLICY });
const noviceEvidence = calculateMetricsFromRuns(noviceRuns);
```

Metrics are calculated from recorded GameResults. `calculateMetricsFromRuns` also returns source run/result IDs; wave, tower-usage, and outcome-distribution drill-downs are available from the Metrics package.

## Development tools

Codex is the project's AI development tool. ASSETMCP, Playwright MCP, and Context7 MCP are developer tools only. ASSETMCP may be used to discover and review licensed assets during development; accepted runtime assets and their metadata belong in the project's local `assets/library`. The game and server must not require an MCP server to run.

See [`AGENTS.md`](AGENTS.md) for project-wide implementation rules and [`docs/v1/plan.md`](docs/v1/plan.md) for the implementation roadmap.
