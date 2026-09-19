# V1 Development Skill Usage

Codex Skills are development-time guidance only. The game and server do not load or execute Skill files at runtime.

## Used

| Skill | Upstream source | Use in Fantasy Frontiers | Project-owned adaptation |
|---|---|---|---|
| `game-qa` | [worldwonderer/novel-to-game — `skills/game-qa`](https://github.com/worldwonderer/novel-to-game/tree/main/skills/game-qa) | Used to define and perform evidence-based browser QA for the playable game loop. | The six launch/render/input/coreLoop/outcome/restart checks were recorded in `qa/verification.json`; Playwright exercises the actual Phaser browser game through an Easy result, saved progress reload, and restart. The observed inputs and screenshot are in `qa/evidence/run.json` and `qa/evidence/gameplay-result.png`. These are project-owned test and evidence files; the Skill is not invoked by runtime code. |

The local Skill snapshot consulted for this work is `docs/skills/game-qa/SKILL.md` with its QA contract and test-design references. The upstream project is the source; the local copy is retained as development documentation.

## Not claimed as used

Other Skills present in `docs/skills` or installed in the Codex environment are not listed as adopted project methods unless a development task actually used them. ASSETMCP and Playwright MCP are developer tools, not Skills and not runtime dependencies.
