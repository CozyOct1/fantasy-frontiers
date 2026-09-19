# Fantasy Frontiers / 幻想防线
## 01 Brief & Design Spec

**Document Status:** Scope Freeze Candidate  
**Target Submission:** September 20, 2026  
**Primary Language:** TypeScript  
**Game Framework:** Phaser  
**Project Type:** 2.5D Tower Defense + AI World Creation Workflow + AI Evaluation Agent

---

# 1. Project Brief

## 1.1 Project Name

**中文名：** 幻想防线  
**英文名：** Fantasy Frontiers

## 1.2 Project Summary

《幻想防线》是一款以传统塔防玩法为核心、结合 AI 世界观生成与自动化评测能力的 2.5D 塔防游戏。

玩家可以进入已有“世界”并选择关卡进行塔防游戏。每个世界至少包含三个关卡，分别对应 Easy、Medium、Hard，三个关卡使用不同的地图模板和不同的难度参数，但核心玩法保持一致。

除了正常游玩外，玩家可以进入“我的世界”工作台，通过自然语言输入一个世界观。后端使用结构化 LLM Workflow，依次生成世界名称、世界背景、防御塔主题名称、敌人主题名称、关卡剧情、视觉主题等文本内容，并将这些结果映射到预先定义好的塔防玩法模板、地图模板和素材库中。

世界生成完成后，系统自动启动 Evaluation Agent。Evaluation Agent 不直接给出胜率、剩余生命值或难度结论，而是主动检查关卡、设计测试实验、调用 Headless Simulator 和规则 Bot 进行真实自动试玩，再基于确定性 Metrics Engine 产生的数据进行分析。必要时，Agent 可以追加实验，最终形成基于证据的难度与可玩性报告。

玩家可以将完成生成和评测的世界保存到“我的世界”，并选择发布到“创意工坊”，供其他玩家查看和游玩。

---

## 1.3 Product Principle

本项目始终遵循以下四个原则：

0. **开发工具统一使用 Codex。**  
   Codex 是唯一的 AI 开发工具，用于代码生成、重构、测试、文档维护和工程自动化。外部开源 Skill 仅作为 Codex 开发过程中的能力扩展或开发方法参考，不作为游戏运行时依赖。


1. **首先是一款塔防游戏。**  
   AI 是塔防游戏的特色能力，而不是让游戏退化成一个 AI Demo。

2. **LLM 负责文本与语义，程序负责规则与事实。**  
   LLM 不参与核心玩法设计，不直接修改塔属性、敌人属性、地图合法性规则、经济系统和胜负条件。

3. **所有评测结论必须建立在真实模拟结果之上。**  
   胜率、剩余生命值、漏怪率、失败波次等数值必须由 Game Core + Simulator + Metrics Engine 计算。

4. **运行期 LLM 不直接加载 Codex Skill。**  
   世界生成阶段使用的是后端编排的结构化 Prompt Workflow。外部开源 Skill 中有价值的设计思想会被整理、拆分并转化成系统提示词模块，例如世界观提炼、命名约束、Campaign 文本生成、主题映射等，但不会在游戏运行时以 Skill 形式直接导入或执行。

---

# 2. Rubric Mapping Matrix

| 题目要求 | 项目实现 | 验证方式 |
|---|---|---|
| AI 版本塔防游戏 | 传统塔防 + AI 世界创建 + AI 自动评测 | 主流程演示 |
| 至少 3 个关卡 | 每个世界固定包含 Easy / Medium / Hard 三关 | 世界详情页 / 关卡选择页 |
| 三种难度 | 固定 Difficulty Profile | 配置文件 + 实测数据 |
| 每关不同地图 | 每个难度拥有独立模板池，生成时选择不同模板 | MapSpec / 画面展示 |
| AI 评测 Agent | 独立 Evaluation Agent | Agent Trace |
| 难易程度评测 | Agent 基于多轮真实模拟分析 | Evaluation Report |
| 可玩性评测 | 策略多样性、塔使用分布、资源利用等证据 | Metrics + Agent Analysis |
| 胜率评测 | Metrics Engine 确定性计算 | Simulation Results |
| 剩余生命值评测 | 每场 GameResult 记录并统计 | Evaluation Report |
| 不让模型直接给结果 | 数值由程序计算，Agent 仅分析 | Agent Tool Trace |
| Agent 有可行分析链路 | Inspect → Experiment → Observe → Analyze → Additional Test → Report | Agent Trace |
| 使用主流 AI 工具 | **仅使用 Codex** 作为 AI 开发工具 | 开发记录 / README |
| 外部开源 Skill | 在 Codex 开发过程中使用一个具体外部开源 Skill | Skill 来源、Codex 使用记录、README |
| Skill 用在重要模块 | Skill 用于指导 / 加速世界生成 Workflow、结构化提示词设计或核心工程实现 | Codex 开发记录 |
| 2.5D | Phaser Isometric 等距投影 | 游戏画面 |
| 技术栈不限 | TypeScript + Phaser + Node.js | Repository |
| 可使用本地数据库 | SQLite | DB 文件 / Schema |
| 游戏进度可存储 | player_progress 表 | 重新启动后进度保留 |
| 作品提交 9 月 20 日 | Scope Freeze，优先实现核心闭环 | Release Checklist |

---

# 3. One-Pager / High Concept

## 3.1 High Concept

**输入一个世界观，让 AI 把它包装成一套可玩的塔防世界，再由 AI 自动试玩并验证这个世界的难度。**

## 3.2 Player Fantasy

玩家不仅是塔防关卡的挑战者，也是世界的创造者。

玩家可以：

- 挑战官方或已有世界。
- 用一句世界观创建自己的塔防世界。
- 看到同一套稳定塔防规则被重新包装成不同题材。
- 查看 AI 对生成世界的真实自动试玩评测。
- 将自己的世界发布到创意工坊。

## 3.3 Product Pillars

### Pillar A — Stable Tower Defense

玩法固定、规则稳定、容易理解。

### Pillar B — AI World Theming

AI 负责将玩家的世界观转换成主题文本、命名、剧情和视觉标签，而不是重新设计玩法。

### Pillar C — Controlled Variety

通过地图模板池、参数变体和受控素材库提供世界差异，而不是让 LLM 自由生成游戏机制。

### Pillar D — Evidence-Based Evaluation

Evaluation Agent 必须通过真实模拟和工具调用获得证据后才能形成结论。

### Pillar E — UGC Loop

“我的世界”负责创建与管理，“创意工坊”负责发布与发现。

---

# 4. Scope Statement / Non-Goals / Scope Freeze

## 4.1 In Scope — Must Have

### Game

- 2.5D 等距视角塔防。
- 基础建塔、升级、金币、波次、生命值、胜负。
- 3–4 种固定塔类型。
- 4 种固定敌人类型。
- Easy / Medium / Hard 三种 Difficulty Profile。
- 每种难度至少 3 个地图基础模板。
- 世界选择与关卡选择。
- 游戏进度持久化。

### AI World Workflow

- 用户输入世界观。
- 后端固定 Workflow 编排。
- 结构化 LLM JSON 输出。
- 世界基础信息生成。
- 塔名称与描述生成。
- 敌人名称与描述生成。
- Campaign 名称与三关剧情生成。
- ThemeSpec 生成。
- 本地 Asset Library / Theme Resolver。
- 生成世界写入 SQLite。

### Evaluation Agent

- inspect_level
- run_episode
- run_batch
- calculate_metrics
- inspect_wave_metrics
- inspect_tower_usage
- compare_runs
- Novice / Baseline / Expert 规则 Bot
- 真实 Headless Simulation
- Agent 自主追加实验
- Evaluation Report

### UGC

- 我的世界：创建、查看、试玩、评测、保存、发布。
- 创意工坊：第一版允许展示已发布世界并进入游玩。
- 发布前必须完成地图校验和 AI 评测。

---

## 4.2 Nice to Have

- AI 生成主题图片。
- 自动素材搜索与导入。
- 在线排行榜。
- 世界收藏。
- 玩家评分。
- 世界评论。
- 自动重新平衡。
- 更复杂 Expert Bot。
- 更多地图模板。
- 更多塔和敌人。
- 真正多人在线社区。

---

## 4.3 Non-Goals

以下内容不进入本次 MVP：

- 强化学习训练。
- 模型微调。
- 自定义训练模型。
- LLM 实时控制塔防操作。
- LLM 自由创建新游戏机制。
- LLM 修改塔属性或敌人属性。
- 每个世界生成独立代码。
- 完全自由地图生成。
- 复杂账号权限系统。
- 多人合作或 PvP。
- 大型剧情动画。
- 技能树。
- 装备系统。
- 抽卡系统。

---

## 4.4 Scope Freeze Rule

从核心 Game Core、Creative Workflow 和 Evaluation Agent 三条链路跑通后：

- 不新增新的核心系统。
- 不新增新的玩法类型。
- 不更换技术栈。
- 不进行与提交无关的重构。
- 优先修复 Bug、平衡数值、完善演示和文档。

---

# 5. Game Design Spec (GDD Lite)

## 5.1 Genre

Tower Defense / 2.5D Isometric / AI-Assisted UGC

## 5.2 Target Session

单关目标时长：

- Easy：3–5 分钟
- Medium：5–7 分钟
- Hard：6–9 分钟

## 5.3 Base Tower Archetypes

### Basic Tower

定位：低成本、快速单体输出。

固定玩法身份不变。

世界主题仅改变：

- 名称
- 描述
- 图标 / 素材
- UI 文本

### AOE Tower

定位：范围伤害，对群体敌人有效。

### Slow Tower

定位：控制与减速。

### Heavy Tower

定位：高单体伤害，对高生命敌人有效。

---

## 5.4 Base Enemy Archetypes

### Normal

标准生命、标准速度。

### Fast

较低生命、高速度。

### Tank

高生命、低速度。

### Boss

高生命，Hard 关卡末段出现。

---

## 5.5 Theme Mapping Example

底层：

- `basic`
- `aoe`
- `slow`
- `heavy`

Dark Fantasy 世界：

- 圣银弩塔
- 炼金火炮
- 寒霜祭坛
- 圣光塔

Steampunk 世界：

- 黄铜机枪塔
- 震荡蒸汽炮
- 凝霜压力阀
- 雷霆线圈塔

底层属性不发生变化。

---

# 6. Core Loop Spec

## 6.1 Normal Play Loop

选择世界  
→ 选择关卡  
→ 查看初始资源和地图  
→ 建造防御塔  
→ 开始波次  
→ 防御塔攻击敌人  
→ 获得金币  
→ 建造 / 升级  
→ 继续下一波  
→ 胜利 / 失败  
→ 保存关卡进度

---

## 6.2 World Creation Loop

进入“我的世界”  
→ 创建新世界  
→ 输入世界观  
→ Creative Workflow  
→ 生成 WorldTheme / Campaign Text / ThemeSpec  
→ 后端选择地图模板和素材  
→ 创建 Easy / Medium / Hard  
→ 自动 Evaluation  
→ 查看世界工作台  
→ 试玩  
→ 保存  
→ 发布到创意工坊

---

## 6.3 Community Loop

创意工坊  
→ 浏览世界  
→ 查看世界详情和 AI 评测  
→ 开始游玩  
→ 返回创意工坊

---

# 7. Mechanics / Dynamics / Aesthetics

## 7.1 Mechanics

- 在合法建造位放置塔。
- 消耗金币建造和升级。
- 敌人沿固定路径移动。
- 塔在攻击范围内自动攻击。
- 敌人到达基地时减少生命。
- 击杀敌人获得金币。
- 完成所有波次且生命 > 0 时胜利。

## 7.2 Dynamics

- 玩家需要决定金币投入到新塔还是升级。
- 不同地图模板改变覆盖效率。
- 多入口地图制造资源分配压力。
- 不同敌人组合要求调整塔的组合。
- Hard 通过有限建造位、更多入口和更高波次压力制造挑战。

## 7.3 Aesthetics

目标体验：

- 容易理解。
- 快速进入战斗。
- 不同世界拥有明显不同的视觉与文本风格。
- 生成世界时有“创造属于自己的世界”的满足感。
- AI 评测过程有“这个世界真的被测试过”的可信感。

---

# 8. Input Mapping

## 8.1 Mouse / Touch

| 输入 | 行为 |
|---|---|
| 点击建造位 | 打开塔选择 |
| 点击塔按钮 | 建造塔 |
| 点击已有塔 | 打开塔信息 / 升级 |
| 点击开始波次 | 开始下一波 |
| 点击速度按钮 | 切换 1x / 2x |
| 点击暂停 | 暂停 |

## 8.2 Optional Keyboard

| 输入 | 行为 |
|---|---|
| Space | 开始波次 / 暂停 |
| 1 / 2 / 3 / 4 | 选择塔 |
| Esc | 关闭当前面板 |

Keyboard 非核心要求，Mouse / Touch 必须完整可玩。

---

# 9. Game State

核心 GameState：

```ts
interface GameState {
  levelId: string;
  status: "ready" | "running" | "paused" | "won" | "lost";
  hp: number;
  maxHp: number;
  gold: number;
  waveIndex: number;
  totalWaves: number;
  towers: TowerState[];
  enemies: EnemyState[];
  elapsedTime: number;
  seed: number;
  activeWaveQueue: EnemyArchetype[];
  spawnTimer: number;
  nextEntityId: number;
  stats: {
    enemiesSpawned: number;
    enemiesKilled: number;
    enemiesLeaked: number;
    goldEarned: number;
    goldSpent: number;
    towersBuilt: number;
    towerUsage: Record<string, number>;
  };
}
```

玩家和 Bot 共用同一个结构化动作契约：

```ts
type GameAction =
  | { type: "placeTower"; archetype: TowerArchetype; position: Coordinate }
  | { type: "upgradeTower"; towerId: string }
  | { type: "startWave" }
  | { type: "pause" }
  | { type: "resume" };
```

Game Core 使用固定 tick（默认 20 ticks/second）；调用方每次只能推进一个完整 tick，渲染帧率和播放速度不参与规则计算。波次中的待生成敌人队列、计时器、实体序号与结果统计都保存在可序列化 GameState 中。

所有游戏结果必须从 GameState 派生。

Phaser Renderer 只能读取或通过 Game Core Action 修改状态，不能自行决定游戏结果。

---

# 10. Win / Lose Condition

## Win

同时满足：

- 所有波次已完成。
- 所有敌人已被消灭或离开场景。
- Base HP > 0。

## Lose

满足：

- Base HP <= 0。

## GameResult

```ts
interface GameResult {
  levelId: string;
  seed: number;
  win: boolean;
  remainingHp: number;
  maxHp: number;
  startingGold: number;
  remainingGold: number;
  waveReached: number;
  totalWaves: number;
  enemiesSpawned: number;
  enemiesKilled: number;
  enemiesLeaked: number;
  goldEarned: number;
  goldSpent: number;
  towersBuilt: number;
  towerUsage: Record<string, number>;
  duration: number;
}
```

---

# 11. Level Spec

## 11.1 Difficulty Philosophy

难度不应仅通过敌人 HP 倍率变化实现。

难度主要来自：

- 地图拓扑。
- 入口数量。
- 路线数量。
- 建造位密度。
- 资源压力。
- 敌人组合。
- 波次数量。
- Boss。

---

## 11.2 Easy Profile

目标：

让第一次接触游戏的玩家能够理解规则并有较高通关概率。

约束：

- 1–2 个入口。
- 路线清晰。
- 建造位较多。
- 初始金币较高。
- 波次较少。
- 以 Normal 为主。
- 少量 Fast。

模板池示例：

- `easy_s_curve`
- `easy_long_lane`
- `easy_early_merge`

---

## 11.3 Medium Profile

目标：

要求玩家开始考虑资源分配和塔组合。

约束：

- 2 个入口。
- 路线可能汇合或平行。
- 建造位适中。
- 初始资源正常。
- 增加 Fast / Tank。
- 中后期波次压力明显。

模板池示例：

- `medium_dual_merge`
- `medium_parallel`
- `medium_split_merge`

---

## 11.4 Hard Profile

目标：

对建造规划、塔组合和资源使用形成明显压力。

约束：

- 2–3 个入口。
- 路线可能独立或多路汇合。
- 建造位较少。
- 资源紧张。
- Normal / Fast / Tank 混合。
- Boss。
- 后期波次压力高。

模板池示例：

- `hard_three_entry`
- `hard_independent_lanes`
- `hard_ring_pressure`

---

## 11.5 Template Variation Parameters

每个模板允许有限参数化：

- `pathLength`
- `buildDensity`
- `obstacleDensity`
- `mirror`
- `spawnLayout`
- `mergePosition`
- `seed`

程序负责生成 MapSpec。

LLM 不负责最终坐标。

---

# 12. UI Spec

## 12.1 Main Navigation

主页：

- 开始游戏
- 我的世界
- 创意工坊
- 设置

---

## 12.2 Start Game

世界选择：

- 官方世界
- 自己创建的世界
- 已发布 / 已保存世界

进入世界后：

- 世界介绍
- Easy
- Medium
- Hard

---

## 12.3 Gameplay HUD

固定布局：

Top HUD：

- HP
- Gold
- Wave

Game View：

- Isometric Map
- Enemies
- Towers
- Projectiles

Side / Bottom Controls：

- Tower Selection
- Upgrade
- Start Wave
- Pause
- Speed

不同世界只改变：

- 颜色
- Panel Skin
- Button Skin
- Background
- 装饰
- 文本名称
- 关卡剧情
- 地图主题素材

UI Layout 不随世界变化。

---

## 12.4 My Worlds

显示：

- 创建新世界
- 世界名称
- 生成状态
- 评测状态
- 发布状态

世界工作台操作：

- 试玩
- 查看三关
- 查看 AI 评测
- 重新生成文本内容
- 重新评测
- 发布

---

## 12.5 Creative Workshop

第一版功能：

- 浏览已发布世界
- 世界详情
- 作者
- 世界观简介
- 三个关卡
- AI 评测摘要
- 开始游戏

在线社交能力不是 MVP 强制项。

---

## 12.6 World Generation Progress

生成过程必须可视化：

1. 世界设定
2. 防御塔主题
3. 敌人主题
4. Campaign
5. UI Theme
6. 地图创建
7. AI 自动评测
8. 完成

后端 `generation_jobs.current_step` 驱动状态展示。

---

# 13. Creative Workflow Spec

Creative 侧不是自由 Agent，而是后端固定 Workflow。

## 13.1 Runtime LLM Boundary

游戏运行时的 Creative Workflow **不会加载或调用 Codex Skill**。

外部开源 Skill 属于开发期资产，其作用是帮助 Codex 在开发阶段形成更好的世界设计方法、提示词结构、Schema 设计和 Workflow 拆分方式。

运行期真正提供给世界生成 LLM 的内容，是项目自身维护的系统提示词模块，例如：

- `world-identity.prompt.md`
- `tower-theme.prompt.md`
- `enemy-theme.prompt.md`
- `campaign-narrative.prompt.md`
- `ui-theme.prompt.md`

这些 Prompt 可以吸收外部开源 Skill 中适合本项目的世界设计理念，但必须经过项目自己的裁剪和结构化，不能把外部 Skill 当作运行时依赖直接导入。

因此：

**开发期：Codex + External Open-Source Skill**

**运行期：Backend Workflow + System Prompt Modules + Structured LLM Output**

推荐 DAG：

```text
User World Prompt
        ↓
Generate World Identity
        ↓
Generate Tower Theme
        ↓
Generate Enemy Theme
        ↓
Generate Campaign Narrative
        ↓
Generate ThemeSpec
        ↓
Template Resolver
        ↓
Asset Resolver
        ↓
Create Levels
        ↓
Evaluation
```

每个 LLM Step：

- 只有一个明确任务。
- 只获得当前必要上下文。
- 必须返回结构化 JSON。
- 必须经过 JSON Schema / Zod 校验。
- LLM 不直接操作数据库。
- 后端验证后写数据库。

---

# 14. Theme / Asset Spec

## 14.1 Fixed UI, Variable Skin

每个世界使用相同 UI 布局。

变化来自：

- CSS variables
- Theme Pack
- Background
- Panel
- Button
- Frame
- Decoration
- Map environment skin

---

## 14.2 ThemeSpec

示意：

```ts
interface ThemeSpec {
  themeFamily:
    | "fantasy"
    | "dark_fantasy"
    | "oriental"
    | "nature"
    | "steampunk"
    | "sci_fi"
    | "cyberpunk"
    | "ocean";

  styleTags: string[];
  preferredColors: string[];
  visualKeywords: string[];
}
```

---

## 14.3 Asset Library

素材必须来自本地受控 Asset Library。

Asset metadata：

```ts
interface AssetRecord {
  id: string;
  type: "background" | "panel" | "button" | "frame" | "decoration" | "tile" | "sprite";
  themeTags: string[];
  styleTags: string[];
  license: string;
  path: string;
}
```

LLM 不生成真实路径。

流程：

ThemeSpec  
→ Backend Search / Resolver  
→ Candidate Asset IDs  
→ Optional LLM Candidate Selection  
→ Backend Validation  
→ WorldSkin

必须提供 fallback：

Exact Match  
→ Similar Theme  
→ Neutral Theme

---

# 15. Evaluation Agent Spec

## 15.1 Responsibility

Evaluation Agent 是真正的 Agentic Workflow。

它负责：

- 理解评测任务。
- 检查关卡结构。
- 形成测试假设。
- 决定需要执行哪些实验。
- 调用 Simulator。
- 根据结果判断是否需要追加实验。
- 综合证据形成最终分析。

---

## 15.2 Prohibited Behavior

Agent 不允许：

- 自己编造 GameResult。
- 自己计算胜率。
- 修改模拟结果。
- 直接修改游戏规则。
- 未调用真实模拟工具就输出最终评测。

---

## 15.3 Tool Set

- `inspect_level`
- `run_episode`
- `run_batch`
- `calculate_metrics`
- `inspect_wave_metrics`
- `inspect_tower_usage`
- `compare_runs`

---

## 15.4 Evaluation Flow

Inspect  
→ Hypothesis  
→ Experiment  
→ Observation  
→ Analysis  
→ Sufficient Evidence?

如果 No：

→ Additional Experiment

如果 Yes：

→ Report

---

# 16. Bot Policies

## Novice

特点：

- 偏好低价塔。
- 建造点选择较简单。
- 低升级倾向。
- 不针对敌人类型优化。

## Baseline

特点：

- 使用 DPS / Cost。
- 考虑路径覆盖率。
- 考虑当前敌人组合。
- 使用简单资源管理。

## Expert

特点：

- 生成多个候选动作。
- 对候选方案进行有限 Lookahead Simulation。
- 比较预计收益。
- 选择较优动作。

所有 Bot 都是代码规则，不训练模型。

---

# 17. Evaluation Metrics

程序确定性计算：

- Runs
- Wins
- Win Rate
- Average Remaining HP
- Median Remaining HP
- Leak Rate
- Average Failure Wave
- Gold Earned
- Gold Spent
- Resource Utilization
- Tower Usage Distribution
- Dominant Tower Ratio
- Duration

Agent 可基于这些指标分析：

- 难度表现。
- 数值压力与策略压力。
- 策略空间。
- 单一优势塔。
- 波次节奏。
- 可玩性风险。

“可玩性”不强制输出单一 0–100 分数。

优先输出：

- 策略多样性：Low / Medium / High
- 资源压力：Low / Medium / High
- 策略空间：Low / Medium / High
- 波次节奏：Stable / Spiky / Imbalanced

并附带证据。

---

# 18. Tuning Parameters

以下参数必须配置化，不硬编码在 LLM 输出中。

## Tower

- cost
- damage
- attackSpeed
- range
- splashRadius
- slowRatio
- upgradeCost
- upgradeMultiplier

## Enemy

- hp
- speed
- reward
- leakDamage

## Economy

- startingGold
- killRewardMultiplier
- sellRatio

## Level

- startingHp
- waveCount
- buildSlotCount
- enemyComposition
- spawnInterval
- waveBudget

## Difficulty

Easy / Medium / Hard 分别维护独立配置。

所有数值调整必须通过配置文件完成。

---

# 19. Progress Persistence

SQLite 至少包含：

- `worlds`
- `world_tower_themes`
- `world_enemy_themes`
- `campaigns`
- `levels`
- `generation_jobs`
- `player_progress`
- `game_runs`
- `evaluation_runs`

需要持久化：

- 玩家解锁状态。
- 最佳成绩。
- AI 生成世界。
- 世界生成进度。
- 地图模板选择。
- AI 评测记录。
- 发布状态。

---

# 20. AI Development Environment

## 20.1 Development Tool

本项目 AI 开发工具统一使用：

**Codex**

Codex 用于：

- 初始化项目结构。
- 编写和修改 TypeScript / Phaser / Node.js 代码。
- 编写测试。
- 执行 `pnpm verify`。
- 维护 AGENTS.md。
- 调用 MCP 工具。
- 使用外部开源 Skill 辅助开发。
- 维护项目文档。

本项目不以 Claude Code、Cursor 等作为正式开发工具，以减少环境和规则差异。

## 20.2 External Open-Source Skill

题目要求的外部开源 Skill 属于 **Codex 开发环境的一部分**。

其用途是：

- 为 Codex 提供特定领域开发方法。
- 指导重要模块实现。
- 帮助设计 Creative Workflow、Prompt 模块或游戏开发架构。
- 形成可追溯的开发证据。

它不属于玩家运行游戏时的 Runtime Dependency。

## 20.3 Skill-to-Prompt Adaptation

如果外部 Skill 中包含适合世界设计的工作方法，可以在开发阶段由 Codex 将其思想拆分成项目自身的 System Prompt Modules。

例如：

```text
External Skill
      ↓
Codex 理解 / 提炼
      ↓
项目自有 Prompt Modules
      ↓
Runtime Creative Workflow
```

运行期 LLM 只接收项目维护的提示词和当前必要上下文，不直接读取 Skill 文件。

---

# 21. Acceptance Criteria

本项目 MVP 被视为完成，需要同时满足：

1. 可以正常进入一局塔防并完整胜利 / 失败。
2. 至少存在 Easy / Medium / Hard 三种关卡。
3. 三关使用不同地图模板。
4. 2.5D Isometric 场景可正常运行。
5. 游戏进度可以持久化。
6. 用户可以输入世界观创建一个新世界。
7. LLM 只生成受 Schema 约束的主题 / 剧情文本。
8. 新世界可以生成三个对应难度的关卡。
9. Evaluation Agent 可以调用真实 Simulator。
10. Agent 至少能够根据第一次实验结果决定是否追加一种测试。
11. 胜率和剩余生命值来自程序计算。
12. 最终评测报告包含真实数据证据。
13. 使用并记录一个具体外部开源 Skill。
14. AI 生成世界可以被保存并进入正常世界选择。
15. 世界可以进入“发布”状态并在创意工坊列表中出现。

---

# 22. Final Product Statement

《幻想防线》是一款 AI 驱动的 2.5D 塔防游戏。

玩家可以进入不同世界挑战固定规则下的塔防关卡，也可以在“我的世界”中输入一个世界观。系统通过结构化 AI Workflow 生成这个世界的名称、剧情、防御塔主题、敌人主题、关卡叙事和视觉主题，再将它们映射到预先定义好的塔防玩法、地图模板和素材库中。

生成完成后，独立的 Evaluation Agent 会通过真实自动试玩对 Easy、Medium、Hard 三个关卡进行评测。Agent 不直接产生胜率或剩余生命值，而是调用 Simulator 和规则 Bot 获得真实数据，并根据数据动态决定是否追加实验，最终输出基于证据的难度与可玩性分析。

完成生成和评测的世界可以保存到“我的世界”，并发布到“创意工坊”供其他玩家挑战。

**核心理念：玩家负责想象世界，AI 负责为世界赋予主题与故事，而稳定的游戏系统负责让这些世界真正可以被游玩、验证和分享。**
