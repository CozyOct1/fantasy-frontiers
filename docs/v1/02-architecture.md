# Fantasy Frontiers / 幻想防线
## 02 Architecture

**Document Status:** Architecture Baseline  
**Project:** Fantasy Frontiers / 幻想防线  
**Target Submission:** September 20, 2026  
**Primary Language:** TypeScript  
**Runtime:** Browser + Node.js  
**Game Framework:** Phaser  
**Database:** SQLite  
**AI Development Tool:** Codex  
**AI Runtime Pattern:** Structured Workflow + Evaluation Agent

---

# 1. Architecture Goals

本架构的目标是保证《幻想防线》在较短开发周期内具备以下能力：

1. 保持一个稳定、完整的塔防 Game Core。
2. 允许不同“世界”复用同一套核心玩法，只变化主题、名称、剧情和视觉皮肤。
3. Creative 侧使用后端固定 Workflow，避免 LLM 自主工具调用导致不稳定。
4. Evaluation 侧保留真正 Agentic 行为，使 Agent 可以根据实验结果自主追加测试。
5. 玩家正常游玩的游戏与自动评测使用同一套 Game Core。
6. LLM 不直接控制数据库、素材路径、地图坐标或核心玩法数值。
7. 所有跨模块数据都通过明确 Schema 传递。
8. 世界、关卡、游戏进度和评测记录可以持久化。
9. 允许未来扩展创意工坊，但 MVP 不依赖复杂在线服务。

---

# 2. Architecture Principles

## 2.1 Game First

《幻想防线》首先是一款塔防游戏。

AI 系统不能成为 Game Core 的必要依赖。

即使 LLM API 暂时不可用：

- 已有世界仍然可以游玩。
- 已有进度仍然可以读取。
- 官方关卡仍然可以正常运行。
- 已生成世界仍然可以继续游玩。

---

## 2.2 LLM Handles Semantics, Code Handles Reality

LLM 负责：

- 世界命名。
- 世界描述。
- 阵营命名。
- 防御塔主题名称与文本。
- 敌人主题名称与文本。
- Campaign 文本。
- 关卡剧情。
- UI Theme 语义标签。
- Evaluation Agent 的实验分析与报告解释。

程序负责：

- 游戏规则。
- 塔属性。
- 敌人属性。
- 地图模板。
- 地图生成。
- 地图合法性。
- 素材真实路径。
- 数据库写入。
- 游戏模拟。
- 指标计算。
- 胜负结果。

---

## 2.3 Creative Is Workflow, Evaluation Is Agent

Creative 侧：

```text
Backend Orchestrated Workflow
```

特点：

- DAG 固定。
- 每一步职责明确。
- 每一步使用严格 JSON Schema。
- LLM 不决定下一步是什么。
- 后端负责读写数据库和推进状态。

Evaluation 侧：

```text
Agentic Workflow
```

特点：

- Agent 可以观察结果。
- Agent 可以决定是否追加实验。
- Agent 可以选择下一种测试策略。
- Agent 通过工具获取真实证据。
- Agent 不允许编造指标。

---

## 2.4 One Game Core, Two Consumers

```text
               Game Core
                  │
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
   Phaser Runtime    Headless Simulator
         │                 │
       Player            Bot Policies
```

玩家和评测系统必须运行同一套规则。

禁止为 Evaluation Agent 单独实现一套简化版“假游戏逻辑”。

---

# 3. High-Level System Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                         Client                              │
│                                                             │
│  Main Menu                                                  │
│  World Select                                               │
│  Level Select                                               │
│  Phaser Game                                                │
│  My Worlds                                                  │
│  Creative Workshop                                          │
│  Evaluation Report                                          │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / Local API
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Application Server                     │
│                                                             │
│  World API                                                  │
│  Progress API                                               │
│  Generation API                                             │
│  Evaluation API                                             │
│                                                             │
│  ┌──────────────────────┐   ┌────────────────────────────┐  │
│  │ Creative Workflow    │   │ Evaluation Agent           │  │
│  │ Orchestrator         │   │                            │  │
│  └──────────┬───────────┘   └─────────────┬──────────────┘  │
│             │                              │                 │
│             ▼                              ▼                 │
│    Structured LLM Calls             Evaluation Tools        │
│             │                              │                 │
│             ▼                              ▼                 │
│      Theme / Campaign                Simulator / Metrics     │
│                                                             │
│  Theme Resolver                                            │
│  Template Resolver                                         │
│  Asset Resolver                                            │
│  Map Builder                                               │
│  Map Validator                                             │
└───────────────────────┬───────────────────────┬─────────────┘
                        │                       │
                        ▼                       ▼
               ┌────────────────┐      ┌──────────────────┐
               │     SQLite     │      │    Game Core     │
               │                │      │                  │
               │ worlds         │      │ Towers           │
               │ levels         │      │ Enemies          │
               │ progress       │      │ Waves            │
               │ runs           │      │ Economy          │
               │ evaluations    │      │ Combat           │
               └────────────────┘      └──────────────────┘
```

---

# 4. Monorepo Structure

Recommended:

```text
fantasy-frontiers/
│
├── apps/
│   ├── game/
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── phaser/
│   │   │   ├── ui/
│   │   │   └── api/
│   │   └── public/
│   │
│   └── server/
│       └── src/
│           ├── routes/
│           ├── generation/
│           ├── evaluation/
│           ├── theme/
│           ├── assets/
│           ├── db/
│           └── llm/
│
├── packages/
│   ├── shared/
│   │   ├── schemas/
│   │   ├── types/
│   │   └── constants/
│   │
│   ├── core/
│   │   ├── GameEngine.ts
│   │   ├── GameState.ts
│   │   ├── systems/
│   │   └── rng/
│   │
│   ├── maps/
│   │   ├── templates/
│   │   ├── generator/
│   │   └── validator/
│   │
│   ├── simulator/
│   │   ├── Simulator.ts
│   │   └── policies/
│   │
│   └── metrics/
│       └── MetricsEngine.ts
│
├── prompts/
│   ├── world-identity.prompt.md
│   ├── tower-theme.prompt.md
│   ├── enemy-theme.prompt.md
│   ├── campaign-narrative.prompt.md
│   ├── ui-theme.prompt.md
│   └── evaluation-agent.prompt.md
│
├── assets/
│   ├── library/
│   ├── themes/
│   └── manifest/
│
├── data/
│   └── fantasy-frontiers.db
│
├── docs/
│   ├── 01-brief-design.md
│   └── 02-architecture.md
│
├── AGENTS.md
├── package.json
└── pnpm-workspace.yaml
```

---

# 5. Dependency Direction

Allowed dependency direction:

```text
shared
  ↑
core
  ↑
maps
  ↑
simulator
  ↑
metrics

game-ui ───────────────→ shared / core / maps
server-generation ─────→ shared / maps / db / llm
server-evaluation ─────→ shared / simulator / metrics / db / llm
```

Forbidden:

```text
core -> Phaser
core -> LLM
core -> database
core -> evaluation-agent
simulator -> browser UI
metrics -> LLM
LLM -> raw database client
LLM -> filesystem asset paths
```

---

# 6. Shared Schema Layer

所有跨模块数据必须由 `packages/shared` 定义。

Canonical schemas:

- WorldSpec
- TowerThemeSpec
- EnemyThemeSpec
- CampaignSpec
- LevelThemeSpec
- ThemeSpec
- WorldSkin
- MapTemplateRef
- MapSpec
- GameState
- GameResult
- EvaluationMetrics
- EvaluationReport

禁止多个模块分别定义同义类型。

---

# 7. World Domain Model

## 7.1 WorldSpec

```ts
interface WorldSpec {
  id: string;
  name: string;
  summary: string;

  playerFactionName: string;
  enemyFactionName: string;

  visualKeywords: string[];
  themeFamily: ThemeFamily;

  status:
    | "draft"
    | "generating"
    | "generated"
    | "evaluating"
    | "ready"
    | "published"
    | "failed";
}
```

---

## 7.2 TowerThemeSpec

底层 Tower Archetype 固定：

```ts
type TowerArchetype =
  | "basic"
  | "aoe"
  | "slow"
  | "heavy";
```

主题层：

```ts
interface TowerThemeEntry {
  archetype: TowerArchetype;
  name: string;
  description: string;
}
```

LLM 不生成：

- damage
- range
- attack speed
- cost

---

## 7.3 EnemyThemeSpec

底层 Enemy Archetype 固定：

```ts
type EnemyArchetype =
  | "normal"
  | "fast"
  | "tank"
  | "boss";
```

主题层：

```ts
interface EnemyThemeEntry {
  archetype: EnemyArchetype;
  name: string;
  description: string;
}
```

LLM 不生成：

- hp
- speed
- reward
- leak damage

---

# 8. Creative Workflow Architecture

Creative Workflow 是后端固定 DAG。

```text
User Prompt
    ↓
Create Generation Job
    ↓
Generate World Identity
    ↓
Validate
    ↓
Persist
    ↓
Generate Tower Theme
    ↓
Validate
    ↓
Persist
    ↓
Generate Enemy Theme
    ↓
Validate
    ↓
Persist
    ↓
Generate Campaign Narrative
    ↓
Validate
    ↓
Persist
    ↓
Generate UI ThemeSpec
    ↓
Validate
    ↓
Theme / Asset Resolver (exact → similar → neutral)
    ↓
Select templates and build MapSpecs in application code
    ↓
Map Validator
    ↓
Persist canonical world, themes, campaign, skin and three levels
    ↓
World Status = generated
```

The Evaluation Agent runs in the later Evaluation phase; Creative Workflow does not claim a world is `ready` or publishable.

---

# 9. Creative Workflow Step Contract

每个 Step 必须满足：

1. 输入只包含当前任务必要上下文。
2. 输出必须满足对应 Zod Schema；通过验证的中间输出先保存在 Generation Job 阶段快照中。
3. 不允许 Markdown 自由文本输出。
4. 不允许 LLM 访问数据库。
5. 不允许 LLM 决定下一步。
6. 不允许 LLM 返回文件路径。
7. 不允许 LLM 修改游戏数值。
8. 失败最多自动重试有限次数。
9. 重试失败后 Generation Job 标记 `failed`。

---

# 10. Creative Workflow Context Strategy

## Step A — World Identity

Input:

```text
User World Prompt
```

Output:

```text
World Identity JSON
```

---

## Step B — Tower Theme

Input:

```text
World Summary
Fixed Tower Archetypes
```

Output:

```text
TowerThemeSpec[]
```

---

## Step C — Enemy Theme

Input:

```text
World Summary
Tower Theme Summary
Fixed Enemy Archetypes
```

Output:

```text
EnemyThemeSpec[]
```

---

## Step D — Campaign Narrative

Input:

```text
World Summary
Tower Names
Enemy Names
Fixed Difficulty Structure
```

Output:

```text
Campaign Name
Easy Level Name + Story
Medium Level Name + Story
Hard Level Name + Story
```

---

## Step E — UI Theme

Input:

```text
World Summary
Visual Keywords
```

Output:

```text
ThemeSpec
```

---

# 11. Prompt Module Architecture

运行时不会加载 Codex Skill。

Runtime prompt modules:

```text
prompts/
├── world-identity.prompt.md
├── tower-theme.prompt.md
├── enemy-theme.prompt.md
├── campaign-narrative.prompt.md
├── ui-theme.prompt.md
└── evaluation-agent.prompt.md
```

每个 Prompt 文件负责一个任务。

Prompt 与 JSON Schema 解耦：

```text
System Prompt
+
Current Context
+
Structured Output Schema
=
LLM Request
```

V1 Creative Workflow provider is DeepSeek via its OpenAI-compatible API. Keep the endpoint, model name, and key in server environment configuration (`DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `DEEPSEEK_API_KEY`). The key must never be sent to the browser. Model output still passes the project-owned Zod schema before persistence; existing worlds and gameplay do not require this provider.

---

# 12. Development-Time Skill Boundary

外部开源 Skill 只用于 Codex 开发过程。

```text
External Open-Source Skill
        ↓
       Codex
        ↓
Architecture / Prompt Design / Implementation Guidance
        ↓
Project-Owned Code & Prompt Modules
```

运行时：

```text
NO Skill Loading
NO Skill Invocation
```

游戏运行期只使用项目自有 Prompt 与代码。

---

# 13. Theme Resolver Architecture

Creative Workflow 输出：

```ts
interface ThemeSpec {
  themeFamily: ThemeFamily;
  styleTags: string[];
  preferredColors: string[];
  visualKeywords: string[];
}
```

Theme Resolver：

```text
ThemeSpec
    ↓
Normalize Tags
    ↓
Query Local Theme Registry
    ↓
Rank Candidate Theme Packs
    ↓
Select Best Match
    ↓
Fallback if needed
    ↓
WorldSkin
```

---

# 14. WorldSkin

```ts
interface WorldSkin {
  themePackId: string;

  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };

  assets: {
    backgroundId: string;
    panelId: string;
    buttonId: string;
    frameId: string;
    decorationIds: string[];
  };
}
```

WorldSkin 只引用合法 Asset IDs。

---

# 15. Asset Library Architecture

## 15.1 AssetRecord

```ts
interface AssetRecord {
  id: string;

  type:
    | "background"
    | "panel"
    | "button"
    | "frame"
    | "decoration"
    | "tile"
    | "sprite";

  themeTags: string[];
  styleTags: string[];

  license: string;
  source: string;
  localPath: string;
}
```

---

## 15.2 Asset Selection Flow

```text
ThemeSpec
    ↓
Backend Asset Query
    ↓
Top-K Candidate IDs
    ↓
Rule-Based Ranking
    ↓
Optional LLM Choice Within IDs
    ↓
Backend ID Validation
    ↓
WorldSkin
```

LLM 绝不能返回任意路径或 URL。

---

## 15.3 Fallback Strategy

```text
Exact Theme Match
    ↓ fail
Similar Theme Match
    ↓ fail
Neutral Theme Pack
```

世界生成不能因为找不到完美素材而失败。

---

# 16. Map Architecture

## 16.1 Difficulty Profile

固定：

```text
Easy
Medium
Hard
```

Difficulty Profile 定义：

- starting gold
- starting hp
- wave count
- enemy budget
- build slot range
- enemy mix
- boss presence

---

## 16.2 Template Pool

Easy:

- `easy_s_curve`
- `easy_long_lane`
- `easy_early_merge`

Medium:

- `medium_dual_merge`
- `medium_parallel`
- `medium_split_merge`

Hard:

- `hard_three_entry`
- `hard_independent_lanes`
- `hard_ring_pressure`

---

## 16.3 Template Resolver

Creative LLM 不生成坐标。

它最多产生：

```text
Level Theme
Difficulty
Optional Semantic Tags
```

Template Resolver：

```text
Difficulty
+
Semantic Tags
+
Previous Level Templates
    ↓
Candidate Pool
    ↓
Avoid Duplicate Topology
    ↓
Select Template
```

---

## 16.4 Map Generator

Input:

```text
MapTemplate
DifficultyProfile
Seed
```

Output:

```text
MapSpec
```

---

## 16.5 Map Validator

必须验证：

- spawn exists
- base exists
- all spawns reach base
- paths are continuous
- build slots do not overlap paths
- all coordinates are inside bounds
- minimum build slot count
- no invalid duplicate occupancy

失败后：

```text
Regenerate with new seed
```

超过最大次数：

```text
generation job failed
```

---

# 17. Game Core Architecture

Game Core 是纯 TypeScript。

不得依赖：

- Phaser
- DOM
- LLM
- SQLite
- Network

Core systems:

```text
GameEngine
├── TowerSystem
├── EnemySystem
├── WaveSystem
├── CombatSystem
├── EconomySystem
├── PathSystem
└── WinLoseSystem
```

---

# 18. Deterministic Simulation

所有随机行为必须来自统一 Seeded RNG。

禁止：

```ts
Math.random()
```

游戏状态必须可以通过：

```text
MapSpec + Config + Seed + Actions
```

复现。

这保证：

- Bug 可复现。
- Evaluation 可验证。
- Bot 对比公平。
- 同一 Run 可重放。

---

# 19. Phaser Runtime Architecture

Phaser 负责：

- Isometric rendering
- sprites
- camera
- animations
- particles
- input
- visual feedback

Phaser 不负责：

- tower damage
- enemy hp
- gold calculation
- win / lose
- path validity

阶段 2 的首个实现提供 `GameEngine.dispatch(GameAction)` 和单步 `GameEngine.step()`；`FIXED_TICK_SECONDS` 来自 shared simulation config。客户端通过 Phaser 的时间累积器请求固定步进，游戏速度只调整请求步数，不更改单步规则。Map、seed、action 顺序和固定 tick 序列相同时，Core 状态和最终 GameResult 必须一致。

---

# 20. Headless Simulator Architecture

Simulator 直接调用 Game Core。

```text
Simulator
    ↓
Create GameEngine
    ↓
Load MapSpec
    ↓
Apply Bot Actions
    ↓
Advance Fixed Tick
    ↓
Collect GameResult
```

不创建 Phaser Scene。

---

# 21. Bot Policy Architecture

```ts
interface BotPolicy {
  id: string;

  decide(context: BotDecisionContext): GameAction[];
}
```

Policies:

```text
NovicePolicy
BaselinePolicy
ExpertPolicy
```

Bot 不调用 LLM。

每条 `SimulationRun` 都保留不可变 run ID / result ID、完整 MapSpec、配置版本与配置快照、seed、Bot policy ID/version、动作轨迹、固定 tick 总数、逐波结果和 canonical GameResult。相同输入可重放；不同策略的批量对比使用相同地图与 seed 顺序。

Expert Bot 只可通过公共 `GameObservation` 和限 tick 的 Game Core 分支前瞻比较候选部署/升级；分支直接复用 Game Core，不维护第二套伤害或移动逻辑。

---

# 22. Evaluation Agent Architecture

Evaluation Agent 是唯一需要 Agentic Decision Making 的运行时 AI 模块。

```text
Evaluation Request
      ↓
Evaluation Agent
      ↓
inspect_level
      ↓
Form Hypothesis
      ↓
Choose Experiment
      ↓
run_batch
      ↓
calculate_metrics
      ↓
Analyze
      ↓
Enough Evidence?
   /              \
 yes              no
  │                │
  │         choose additional test
  │                │
  └────────────────┘
      ↓
Final Report
```

---

# 23. Evaluation Tool Boundary

Tools:

```text
inspect_level
run_episode
run_batch
calculate_metrics
inspect_wave_metrics
inspect_tower_usage
compare_runs
```

Evaluation Agent 不直接访问：

- SQLite tables
- GameEngine internals
- Raw mutable GameState
- Filesystem
- Tower stats mutation
- Enemy stats mutation

---

# 24. Evaluation Evidence Model

Agent 的结论必须引用 Tool 返回的事实。

Example:

```text
Claim:
Hard level places strong pressure on baseline players.

Evidence:
- baseline win rate = 31%
- average remaining HP = 13.4
- median failure wave = 12 / 15
```

如果证据不足：

```text
Agent must request more experiments.
```

---

# 25. Metrics Engine Architecture

Metrics Engine 是确定性程序模块。

Input:

```text
GameResult[]
```

Output:

```ts
interface EvaluationMetrics {
  runs: number;
  wins: number;
  winRate: number;

  avgRemainingHp: number;
  medianRemainingHp: number;

  leakRate: number;
  avgFailureWave: number;

  avgGoldSpent: number;
  avgGoldEarned: number;
  resourceUtilization: number;

  towerUsageDistribution: Record<string, number>;
  dominantTowerRatio: number;

  avgDuration: number;
}
```

LLM 不计算这些字段。

计算约定：`leakRate = sum(enemiesLeaked) / sum(enemiesSpawned)`；`avgFailureWave` 只对失败 run 求平均；`resourceUtilization = sum(goldSpent) / sum(startingGold + goldEarned)`；`towerUsageDistribution` 按所有 run 的塔攻击次数归一化。无样本或分母为零时对应比例/均值为 0。Metrics snapshot 同时返回原始 run ID 和 result ID 引用。

---

# 26. Evaluation Storage Model

Evaluation lifecycle:

```text
evaluation_runs
    ↓
simulation_runs
    ↓
metrics snapshot
    ↓
agent report
```

建议保留：

- evaluation id
- level id
- agent version
- bot policy
- seeds
- raw GameResult IDs
- metrics JSON
- final report
- created_at

---

# 27. Database Architecture

Recommended tables:

```text
worlds
world_tower_themes
world_enemy_themes
campaigns
levels
world_skins
generation_jobs
player_progress
game_runs
evaluation_runs
evaluation_metrics
published_worlds
```

---

# 28. Database Responsibilities

## worlds

保存：

- id
- owner
- name
- summary
- theme_family
- status
- created_at

## world_tower_themes

保存：

- world_id
- archetype
- name
- description

## world_enemy_themes

保存：

- world_id
- archetype
- name
- description

## campaigns

保存：

- world_id
- campaign_name

## levels

保存：

- world_id
- difficulty
- name
- story
- template_id
- seed
- map_spec_json

## world_skins

保存：

- theme spec
- selected pack id
- selected asset ids
- colors

## generation_jobs

保存：

- world_id
- status
- current_step
- error
- started_at
- completed_at

## player_progress

保存：

- world_id
- level_id
- unlocked
- completed
- best_hp
- best_time

## game_runs

保存：

- level_id
- source: player / simulator
- policy
- seed
- result_json

## evaluation_runs

保存：

- level_id
- status
- summary
- created_at

---

# 29. Generation Job State Machine

```text
queued → running(world_identity → tower_theme → enemy_theme → campaign
    → ui_theme → asset_resolution → map_generation) → completed
```

`current_step` is persisted after every validated stage. Evaluation and `ready` state belong to the later Evaluation phase.

Failure from any step:

```text
failed
```

UI 根据该状态展示进度。

---

# 30. Publishing Architecture

发布前检查：

```text
World Status = ready
AND
3 levels exist
AND
Easy / Medium / Hard exist
AND
all maps validated
AND
all levels evaluated
```

Then:

```text
published_worlds.status = published
```

MVP 可以使用本地数据库模拟创意工坊。

---

# 31. API Boundary

Recommended API groups:

```text
/api/worlds
/api/worlds/:id
/api/worlds/:id/generate
/api/worlds/:id/evaluate
/api/worlds/:id/publish

/api/levels/:id
/api/levels/:id/start
/api/levels/:id/result

/api/workshop
/api/progress
```

---

# 32. Failure Handling

## LLM Failure

- retry limited times
- preserve generation job state
- record validation error
- do not write invalid JSON to canonical tables

## Asset Resolution Failure

- fallback to similar theme
- fallback to neutral theme

## Map Generation Failure

- retry new seed
- limited attempts
- mark generation failed after threshold

## Evaluation Failure

- preserve generated world
- world may remain `generated`
- user can retry evaluation
- world cannot publish until evaluation succeeds

---

# 33. Security / Safety Boundary

MVP assumes trusted local user, but still:

- LLM output never becomes executable code.
- LLM output never becomes raw SQL.
- LLM output never controls filesystem paths.
- All IDs must be validated against local registries.
- All JSON must pass schema validation.
- Prompt input length must be bounded.
- Generated text must be stored as text only.

---

# 34. AI Development Environment

Development AI:

```text
Codex only
```

Codex reads:

```text
AGENTS.md
Project Docs
Repository Code
External Open-Source Skill
```

External Skill is a development-time capability.

Runtime never loads that Skill.

---

# 35. Codex Rules Expected by Architecture

AGENTS.md should enforce at minimum:

```text
Game Core must not import Phaser.

Game Core must not import LLM clients.

All gameplay randomness must use SeededRandom.

Creative Workflow must be backend orchestrated.

LLM must not write database records directly.

All LLM structured output must be schema validated.

Evaluation Agent must call simulation tools before final report.

Metrics must never be calculated by LLM.

Runtime must not load development Skills.

Do not create duplicate canonical schemas.

Run pnpm verify before completing code tasks.
```

---

# 36. Verification Architecture

Unified command:

```bash
pnpm verify
```

Recommended contents:

```text
typecheck
unit tests
schema tests
map validation tests
simulator smoke tests
build
```

Optional:

```text
Playwright E2E
```

for:

- open game
- select world
- enter level
- build tower
- start wave
- reach result screen

---

# 37. MVP End-to-End Flow

Final required end-to-end path:

```text
1. User opens My Worlds

2. User enters:
   "A floating steampunk kingdom under attack..."

3. Backend creates generation job

4. LLM generates World Identity

5. LLM generates Tower Names

6. LLM generates Enemy Names

7. LLM generates Campaign Narrative

8. LLM generates ThemeSpec

9. Backend selects Theme Pack

10. Backend assigns 3 map templates

11. Backend generates 3 MapSpecs

12. Validator passes all maps

13. Evaluation Agent starts

14. Agent inspects Easy

15. Agent runs simulation batch

16. Metrics Engine calculates results

17. Agent may request additional experiment

18. Same for Medium / Hard

19. World becomes ready

20. User can play

21. User can publish

22. Published world appears in Creative Workshop
```

---

# 38. Architecture Acceptance Criteria

Architecture is considered correctly implemented if:

1. Game Core can run without Phaser.
2. Simulator can run without browser rendering.
3. Player gameplay and simulator use the same core rules.
4. Creative Workflow order is controlled by backend code.
5. Runtime LLM has no direct DB access.
6. Runtime LLM never creates asset paths.
7. All Creative outputs are schema validated.
8. World Theme can change without changing gameplay rules.
9. Theme Resolver can always fall back to a safe theme.
10. Each world contains Easy / Medium / Hard.
11. Each difficulty can select from a template pool.
12. Map generation is deterministic by seed.
13. All maps must pass validation.
14. Evaluation Agent can call multiple tools.
15. Agent can perform an additional experiment based on prior results.
16. Metrics are calculated by deterministic code.
17. Evaluation Report cites measured evidence.
18. World generation and player progress persist in SQLite.
19. Development Skill is not required by runtime.
20. `pnpm verify` passes.

---

# 39. Final Architecture Statement

《幻想防线》的架构核心不是“让 LLM 自动生成一整个游戏”，而是将 AI 放在它最适合的位置。

Creative 侧采用受控 Workflow：

**LLM 负责世界语义、命名、剧情和主题标签；后端负责流程、模板、素材、地图和数据。**

Evaluation 侧采用真正 Agent：

**Agent 负责提出问题、设计实验、调用真实模拟工具、观察结果并决定是否继续测试；程序负责产生事实和统计数据。**

所有世界最终都运行在同一个稳定的 Game Core 上。

因此整个系统可以概括为：

```text
Stable Tower Defense Core
        +
Structured AI World Workflow
        +
Controlled Theme / Map / Asset System
        +
Evidence-Based Evaluation Agent
        =
Fantasy Frontiers
```
