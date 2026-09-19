# Fantasy Frontiers V1 实施计划

**状态：** 阶段 0–7 已完成；所有 V1 TODO 已关闭
**计划范围：** V1 MVP  
**目标提交日期：** 2026-09-20（见设计基线；本计划不把该日期视为已确认的工期承诺）  
**权威设计：** [01 Brief & Design Spec](./01-brief-design.md)  
**权威架构：** [02 Architecture](./02-architecture.md)  
**工程约束：** 仓库根目录 [AGENTS.md](../../AGENTS.md)

**任务标记：** `[ ] TODO` 待开始；`[~] DOING` 进行中；`[!] BLOCKED` 受阻；`[x] DONE` 已完成。完成项必须满足对应阶段完成门；受阻项要写明阻塞原因和解除条件。

本计划把已确定的 V1 需求拆成可交付阶段、依赖关系和验收门。它不替代设计与架构文档；出现细节冲突时，以设计文档和用户最新明确决定为准，并更新本计划中的受影响项。

## 1. V1 目标

交付一款可运行、可演示的 2.5D 等距塔防游戏，包含完整的玩家闭环：

```text
选择世界 → 选择 Easy / Medium / Hard 关卡 → 游玩 → 胜负结算 → 进度保存
                         ↓
输入世界观 → 结构化世界生成 → 地图校验 → 自动评测 → 保存到我的世界
                         ↓
                   发布到创意工坊
```

V1 的核心产品约束：

- 所有世界共享同一套塔防规则；世界只改变题材文本、名称、剧情、UI 主题和素材皮肤。
- 每个世界至少有 Easy、Medium、Hard 三关，并使用不同的有效地图模板。
- Phaser 只负责显示和接收输入；玩家游玩和 Headless Simulator 通过同一套纯 TypeScript Game Core 运行规则。
- Creative Workflow 是后端控制顺序的结构化流程；Evaluation Agent 才负责根据模拟证据决定是否追加实验。
- 胜率、剩余生命、漏怪、资源利用率等数值由确定性代码生成，不由 LLM 推测或改写。
- 运行时素材来自本地受控 Asset Library；ASSETMCP 仅用于开发期素材发现与导入。

## 2. 当前仓库基线

计划编写时，仓库已有 V1 设计/架构文档和根级 `AGENTS.md`，但尚无应用源码、根级 `package.json` 或 `pnpm-workspace.yaml`。因此实现从工程基础设施开始，不假设已有客户端、服务端或测试框架。

| 范围 | 当前基线 | 计划状态 |
|---|---|---|
| 产品与架构文档 | `docs/v1/01-brief-design.md`、`docs/v1/02-architecture.md` | 已有，后续按决策增量更新 |
| 工程脚手架 | pnpm workspace、Vite + Phaser 客户端、Node 服务端和验证脚本已建立 | 阶段 0 完成 |
| Shared Schema / Config / RNG | canonical Zod contracts、初始规则配置和 seeded RNG 已建立 | 阶段 1 完成 |
| Maps | 九个难度模板、确定性选择/生成、Validator 和有限重试已建立 | 阶段 1 完成 |
| Game Core | 纯 TypeScript 固定 tick 状态机、共用动作、塔防规则和 GameResult 已建立 | 阶段 2 完成 |
| Phaser Runtime | Easy / Medium / Hard 等距地图、真实输入、塔/敌人/攻击反馈、HUD、暂停/速度和结算重开已接入 Game Core | 阶段 2 完成 |
| Simulator | Headless Game Core 运行器、三种固定策略、可追溯批量结果/逐波数据和策略对比已建立 | 阶段 3 完成 |
| Metrics | 确定性指标、逐波/塔使用/结果分布查询及 run/result 来源引用已建立 | 阶段 3 完成 |
| Creative Workflow / Evaluation Agent | 固定顺序的 DeepSeek Creative Workflow、Schema 校验、地图生成/验证、失败重试、生成 UI 和证据化 Evaluation Agent 已建立 | 阶段 5、6 完成 |
| SQLite / HTTP API / 本地进度 | SQLite、世界/关卡/进度/开局与结算 API 及内置三难度世界已建立 | 阶段 4 完成 |
| 素材库 | 受控 Manifest/Theme Registry、原创中性 SVG、CC0 Credits、主题回退和经许可检查的 Kenney UI 边框已建立 | 阶段 5、7 完成 |

## 3. 范围与优先级

### 3.1 V1 必须交付

- 可完整胜利或失败的一局塔防；包含建塔、升级、金币、波次、基地生命和结算。
- 四种固定塔 Archetype、四种固定敌人 Archetype，以及配置化的 Easy / Medium / Hard 参数。
- 每种难度至少三个地图模板；V1 默认目标为九个模板。每个关卡生成的地图都必须通过 Validator。
- 世界选择、关卡选择、游戏 HUD、“我的世界”和只展示已发布世界的“创意工坊”。
- SQLite 持久化世界、生成任务、关卡、玩家进度、游戏运行和评测记录。
- 固定顺序、逐步 Zod 校验的世界 Creative Workflow，使用项目维护的结构化 Prompt。
- Headless Simulator、Novice / Baseline / Expert 规则 Bot、确定性 Metrics Engine 和证据可追溯的 Evaluation Agent 报告。
- 世界达到 `ready`、拥有三种难度关卡、地图校验通过且评测完成之后，才能发布到本地创意工坊。

### 3.2 明确不进入 V1

多人协作或 PvP、在线排行榜、评论和评分、技能树、装备、抽卡、强化学习、模型训练、LLM 实时操作塔防、自由坐标地图生成、复杂账号权限系统，以及每个世界独立生成游戏代码。

AI 生成主题图片、自动在线搜索并导入素材、收藏、社交功能和更复杂的 Expert Bot 均是后续增强项，不得阻塞 V1 必要闭环。

## 4. 实施原则

1. **先让塔防成立。** 优先做可玩、可复现的一局，再扩展 AI 和 UGC 流程。
2. **先稳定契约，再并行实现。** 共享 Schema、核心状态、Action、MapSpec 和 GameResult 确定后，客户端与服务端工作才并行展开。
3. **最小垂直切片优先。** 用一个确定性关卡贯通 Game Core、Phaser、Simulator 和结果结算，再扩展内容数量。
4. **规则与内容分开。** 核心规则和数值归代码/配置；LLM 只生成受 Schema 限制的语义内容。
5. **阶段门阻断下游。** 未通过地图验证的关卡不可模拟、游玩或发布；未获得 Simulator 和 Metrics 证据不可生成最终评测报告。
6. **先本地闭环。** 创意工坊 V1 可由本地 SQLite 模拟发布与发现，不引入云部署或在线社交基础设施。
7. **按仓库技术约束实施。** TypeScript、Phaser、Vite、Node.js、pnpm、SQLite、Zod、Vitest、Playwright；MCP 与 Codex Skills 仅用于开发。

## 5. 阶段路线图

阶段按依赖顺序排列。共享契约落定后，页面骨架、数据库迁移和基础素材整理可以并行，但不得提前复制领域规则或定义第二套跨模块类型。

### 阶段 0 — 工程启动与验证基线 `[DONE]`

**目标：** 创建可以安装、启动、构建和验证的 TypeScript monorepo。

**工作项：**

- 建立 pnpm workspace 与锁文件，明确 Node 版本、脚本和最小目录结构：`apps/game`、`apps/server`、`packages/shared`、`packages/core`、`packages/maps`、`packages/simulator`、`packages/metrics`。
- 使用 Vite 初始化客户端，Phaser 作为游戏运行时；建立 Node.js 服务端入口。
- 配置 TypeScript、Zod、Vitest、Playwright 的最小工作配置；建立统一 `pnpm verify`。
- 建立 `.env.example`、本地开发说明和 `.gitignore`；真实凭据不得提交。
- 建立共享包导出规则与 package 边界检查，保证 Core 不依赖 Phaser、DOM、数据库或 LLM。

**完成门：** 新环境按文档可安装依赖；客户端和服务端均可启动；`pnpm verify` 存在并能运行；所有 workspace 包通过类型检查和构建，Core 边界烟测通过。

### 阶段 1 — 共享 Schema、配置与地图基础 `[DONE]`

**目标：** 先建立所有下游共享的权威数据契约和确定性基础。

**工作项：**

- 在 `packages/shared` 定义唯一权威 Zod Schema：`WorldSpec`、`TowerThemeSpec`、`EnemyThemeSpec`、`CampaignSpec`、`LevelThemeSpec`、`ThemeSpec`、`WorldSkin`、`MapSpec`、`GameState`、`GameResult`、`EvaluationMetrics` 和 `EvaluationReport`。
- 定义固定 Tower / Enemy Archetype、Difficulty Profile、经济参数和波次配置；可调数值全部数据化。
- 实现统一 seeded RNG；为相同 seed、配置和输入 Action 的复现行为建立检查。
- 建立每种难度至少三个基础 Map Template；实现确定性模板选择/参数化、坐标范围、入口到基地连通、建造位冲突和最小建造位数量验证。
- 固定地图生成失败策略：有上限的重试，超过上限时返回结构化失败状态。

**完成门：** `[x] DONE` 三种难度各有三个模板；有效 MapSpec 可被序列化和校验；非法地图会被拒绝；相同 seed 得到相同地图；canonical schemas 统一定义于 shared。

### 阶段 2 — Game Core 与可玩垂直切片 `[DONE]`

**目标：** 在无浏览器环境下运行完整规则，并在 Phaser 中手动玩完至少一关。

**工作项：**

- 在纯 TypeScript Core 实现 GameEngine / State Transition、塔放置与升级、目标选择、攻击与伤害、敌人路径移动、波次、金币、基地生命和胜负结算。
- 将游戏推进改为固定 tick；所有玩法随机性经过 seeded RNG；定义玩家与 Bot 共用的 `GameAction`。
- 在 Phaser Runtime 显示等距地图、道路、入口/基地、塔、敌人、投射物、生命/金币/波次 HUD 和胜负画面。
- 输入只产生合法 `GameAction`；视觉动画不得决定伤害、移动或胜负。
- 先用一张 Easy 模板做首个可玩垂直切片，再扩展到 Medium / Hard 与其他地图。

**完成门：** `[x] DONE` 无 Phaser 的 Core 可运行并返回稳定 `GameResult`；浏览器可以开始波次、建塔、升级、暂停并重开；核心测试分别通过完整胜利和失败路径，同 seed、action 和 tick 序列产生一致结果；Easy 关卡可从浏览器实际输入游玩。

### 阶段 3 — Headless Simulator、Bot 与 Metrics `[DONE]`

**目标：** 让自动测试和人工游玩共享 Core 规则，产出可追溯数值事实。

**工作项：**

- 实现 Headless Simulator：加载 `MapSpec`、难度配置和 seed，调用 Game Core，按固定 tick 推进并记录原始 `GameResult`。
- 实现 Novice、Baseline、Expert 规则 Bot。Bot 只通过公共观察上下文产生 `GameAction`，不得使用 LLM。
- 实现单局、批量运行、重复 seed 和 run 对比接口；保留每次 run 的地图、配置、seed、策略版本和结果标识。
- 在 Metrics Engine 计算运行数、胜率、平均/中位基地生命、漏怪率、失败波次、资源利用率、塔使用率、主导塔比例和时长。
- 提供按波次、塔使用和结果分布查询所需的数据，不让 Agent 自己聚合原始数值。

**完成门：** `[x] DONE` Simulator 无浏览器/Phaser 依赖；Novice / Baseline / Expert 均使用 Game Core；同一输入的单局和批量结果可重放、跨策略使用共同 seeds；Metrics 从 GameResult[] 确定性计算并可追溯至 run / result ID，逐波记录与整局统计一致。

### 阶段 4 — 服务端、SQLite 与基础游玩体验 `[DONE]`

**目标：** 提供稳定的本地应用 API 和持久化，使世界和进度在重启后仍存在。

**工作项：**

- 在 Node 服务端接入 SQLite、迁移和 repository 层；实现 worlds、tower/enemy themes、campaigns、levels、world skins、generation jobs、player progress、game runs 和 evaluation runs 数据表。
- 按架构文档实现 `/api/worlds`、`/api/levels`、`/api/progress` 与游戏开始/结算所需 API；边界请求/响应由 Zod 校验。
- 实现官方/示例世界和 Easy / Medium / Hard 关卡 seed 数据；支持世界列表、详情和关卡选择。
- 实现玩家解锁状态、最佳成绩与完成状态的保存/读取；避免让 SQLite 领域细节进入 Game Core。
- 完成主页、世界选择、关卡选择、游戏 HUD、结果页和“我的世界”基础列表。

**完成门：** `[x] DONE` 重启后仍能读取世界、关卡和玩家进度；API 请求/响应均经 Schema 校验；已有世界无需 LLM 服务即可正常游玩。Playwright 全链路验收留在阶段 7。

### 阶段 5 — Theme / Asset Library 与 Creative Workflow `[DONE]`

**目标：** 将用户输入转化为可游玩的主题化世界，后端保持固定步骤与确定性控制。

**工作项：**

- 定义受控 Theme Registry、Asset Manifest 与素材导入规则；记录 `ASSET_MANIFEST` 和 `CREDITS`。本阶段使用项目原创、CC0 的本地 SVG 占位素材，保证没有第三方素材时仍可生成和游玩。
- 实现 Theme Resolver：精确主题 → 相近主题 → neutral fallback；WorldSkin 只能引用已登记 Asset ID。
- 建立项目自有 Prompt 模块和 DeepSeek OpenAI-compatible API 适配层（`https://api.deepseek.com`，默认模型 `deepseek-flash`）；`DEEPSEEK_API_KEY` 只存在服务端环境变量，不能发送给客户端。
- 实现 Generation Job 状态机和固定顺序：世界身份 → 塔主题 → 敌人主题 → Campaign → UI Theme → Theme/Asset 解析 → 三张地图生成与校验。
- 每一步输入最少化，输出 JSON，先经 Zod 校验再写入数据库；失败按有限重试策略处理，记录错误和当前阶段。
- LLM 不能创建地图坐标、塔敌人数值、任意路径/URL、SQL 或文件，也不能决定 Workflow 的下一步。
- 前端按 `generation_jobs.current_step` 展示进度、失败和重试状态。

**完成门：** `[x] DONE` 输入世界观后能创建一个持久化世界和三关；无效 LLM JSON 不进入 canonical 表；三个 MapSpec 经 Validator；素材缺失时使用 fallback，世界仍可保存和游玩；LLM 暂时不可用不影响已有世界。

**素材来源说明：** 当前运行环境未提供 ASSETMCP MCP 工具，因此没有声称完成第三方素材的 ASSETMCP 搜索/下载/许可筛查。受控本地原创占位素材、manifest、Theme Registry 和 credits 已完成；后续通过 ASSETMCP 发现的第三方候选需在导入前单独审查，不会成为本地运行或世界生成的依赖。

### 阶段 6 — Evaluation Agent 与证据报告

**目标：** 让 Agent 基于真实模拟提出和追加实验，并输出有证据的分析。

**工作项：**

- 实现只读关卡检查和实验工具：`inspect_level`、`run_episode`、`run_batch`、`calculate_metrics`、`inspect_wave_metrics`、`inspect_tower_usage`、`compare_runs`。
- 工具调用只接收 ID、策略和受限实验参数；Agent 不接触 SQLite 原始访问、可变 GameState、文件系统或规则修改接口。
- 实现评测 Agent 流程：检查关卡 → 提出假设 → 请求模拟 → 读取 Metrics → 判断证据充分性 → 必要时追加实验 → 报告。
- 报告中每个数值都引用 Metrics 快照或运行记录；定性结论解释其指标依据，不强制生成无证据的单一“可玩性分数”。
- 持久化 Agent 版本、Bot 策略、seed、原始 GameResult 引用、Metrics 和最终报告。
- 评测失败时保留已生成世界，将其留在不可发布状态，允许重试评测。

**完成门：** Agent 至少能根据首轮结果决定是否追加一种实验；没有 Simulator/Metrics 调用不能形成最终评测；Agent 不可能写入或改写数值指标；报告可从证据记录复核。

### 阶段 7 — 发布、创意工坊与 V1 全链路验收

**目标：** 完成世界创作、评测、保存、发布、发现和游玩的闭环。

**工作项：**

- 实现世界状态门：`ready` 需要 3 个难度关卡、地图合法和评测完成。
- 实现发布状态检查：不符合条件的世界不能发布；本地 SQLite 发布世界在 Workshop 列表可查。
- 完成“我的世界”世界详情、试玩、三关查看、评测报告查看、重新评测和发布入口。
- 完成“创意工坊”已发布世界列表、详情和进入游戏路径；不实现评论、评分等在线社交能力。
- 用 Playwright 验收主路径：启动应用 → 选择/打开世界 → 进入关卡 → 放置塔 → 启动波次 → 到达结算 → 重启后读取进度。
- 用一条生成路径验收：输入世界观 → 生成/Schema 校验 → 三关和主题解析 → 地图验证 → Agent 评测 → 保存 → 发布 → Workshop 进入游玩。
- 完成许可证/credits 核对、README 本地启动说明、架构边界检查和 `pnpm verify`。

**完成门：** [Brief 中 V1 Acceptance Criteria](./01-brief-design.md#21-acceptance-criteria) 全部通过；架构文档的验收条目全部满足；失败项和限制明确记录，不以静态页面或伪造指标代替功能。

## 6. 依赖关系与关键路径

```text
工程脚手架
  → Canonical Schemas / Config / Seeded RNG
  → Map Templates / Validator
  → Game Core
  → Phaser 可玩切片
  → Headless Simulator
  → Metrics
  → Evaluation Agent

Canonical Schemas ───────────────┐
SQLite / API 基础 ────────────────┼→ Creative Workflow → 三关生成 → 自动评测 → World Ready
Theme Registry / Asset Resolver ──┘

SQLite / API + World Ready Gate → My Worlds / Publish → Workshop → E2E 验收
```

**不可交换的关键顺序：**

- Simulator 依赖可独立运行的 Game Core；Evaluation Agent 依赖 Simulator 与 Metrics。
- Creative Workflow 依赖 Canonical Schemas、Generation Job 持久化、地图模板/校验和 Theme/Asset Resolver。
- 发布与创意工坊依赖 world readiness gate 和评测记录。
- UI 可提前搭建静态结构，但其状态必须消费服务端/共享契约，不得成为业务事实来源。

## 7. 主要风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 当前仓库没有应用脚手架，V1 范围跨游戏、AI、后端和 UGC | 高 | 先完成工程启动和可玩切片；每个阶段按完成门推进，避免同时铺开多条未验证链路 |
| LLM 输出不合法、超时或不可用 | 世界创建阻塞或数据污染 | 限次重试、Zod 校验、Generation Job 记录失败；已存在世界和官方关卡必须离线可玩 |
| Map 模板数量和合法性不足 | 三难度无法稳定生成 | 先实现模板池和确定性 Validator；模板不满足时拒绝发布，不让模型自由给坐标 |
| 玩家端与评测端规则分叉 | 评测结果不可信 | 两端只调用同一个 Game Core；用相同输入/seed 的复现检查守住边界 |
| Agent 报告出现无来源数据 | 评测不可审计 | 工具生成 Metrics，报告引用运行和快照 ID；没有证据禁止最终报告 |
| 素材许可证、路径或格式问题 | 发行风险或运行时缺图 | 开发期记录来源、许可证和 credits；运行时只认本地 Manifest ID，并实现 neutral fallback |
| 提交日期与实现规模不匹配 | 交付不完整 | 以阶段门暴露真实完成度；若需缩减演示范围，明确记录未完成项，不降低 V1 验收标准后仍宣称完整交付 |

## 8. Definition of Done

V1 只有同时满足以下条件才可标记完成：

- 产品验收标准全部实现，玩家能游玩并完成完整胜负流程。
- 每个世界都有 Easy / Medium / Hard 三关，三个地图模板不同且通过校验。
- Game Core 纯 TypeScript、可复现；Phaser 与 Simulator 共用规则。
- Creative Workflow 固定编排，所有模型输出先经 Zod 校验，素材和地图选择由程序控制。
- Evaluation Agent 的数值结论来自真实模拟和 Metrics，报告可追溯实验数据。
- 世界、进度、运行和评测可以通过 SQLite 持久化；ready 世界可以发布并出现在 Workshop。
- `pnpm verify`、类型检查、相关测试和构建通过；Playwright 主流程验收通过。
- 文档说明如何启动项目、配置运行时 LLM 凭据、查看失败状态和复现模拟。
- 不存在未记录的架构违规、无关功能或许可证信息缺失。

## 9. 交付与进度维护

每个阶段完成后更新本计划中的状态和阻塞项，并同步更新设计/架构文档中已落地或有意变更的部分。实现任务应以可验证的阶段产物收尾：代码提交范围、运行命令、验收结果和遗留限制。

在任务清单中用统一标记维护进度：`[ ] TODO`、`[~] DOING`、`[!] BLOCKED`、`[x] DONE`。阶段只有在其对应任务全部完成并通过阶段完成门后才能标为完成；不能以页面已存在、Agent 已返回文本或数据库已有记录代替端到端行为。

## 10. V1 TODO 清单（按任务维度）

任务按工作维度拆分，ID 用于讨论、提交说明和进度更新。括号内标出对应路线图阶段；依赖未完成时不要提前标记完成。

### 10.1 项目治理与开发工具

- [x] DONE **V1-001** 建立根级 `AGENTS.md`，明确项目定位、技术栈、架构边界、LLM/Skill/MCP 约束和验证要求。
- [x] DONE **V1-002** 安装并验证 ASSETMCP、Playwright MCP、Context7 MCP；ASSETMCP 素材库指向 `assets/library`。（开发环境，不属于游戏 Runtime）
- [x] DONE **V1-003** 将实际运行命令、开发环境要求、环境变量和 MCP 的开发期用途补入项目 README。（阶段 0、7）
- [x] DONE **V1-004** 记录实际采用的外部开源 `game-qa` Skill、上游来源、使用目的及其向项目 Playwright QA 和证据文件的转化；没有将 Skill 引入运行时。（阶段 5、7；见 `docs/v1/skill-usage.md`）

### 10.2 工程脚手架与质量基线

- [x] DONE **V1-010** 创建 pnpm workspace、锁文件、Node 版本约束及根级脚本。（阶段 0）
- [x] DONE **V1-011** 初始化 Vite + Phaser 客户端和 Node.js 服务端入口。（阶段 0）
- [x] DONE **V1-012** 建立 shared、core、maps、simulator、metrics 包及明确的包导出边界。（阶段 0）
- [x] DONE **V1-013** 配置 TypeScript、Zod、Vitest、Playwright、`.env.example` 和忽略规则。（阶段 0）
- [x] DONE **V1-014** 建立 `pnpm verify`，运行 workspace 类型检查、Vitest 与构建；Schema/地图/模拟器烟测会在对应实现阶段补入。（阶段 0）
- [x] DONE **V1-015** 建立可重复的本地启动说明和客户端/服务端开发脚本。（阶段 0、7）

### 10.3 共享领域模型、配置与地图

- [x] DONE **V1-020** 定义并导出唯一权威的 World、Theme、Campaign、Map、GameState、GameResult、Metrics 和 Report Schema。（阶段 1）
- [x] DONE **V1-021** 定义固定塔/敌人 Archetype、难度、经济和波次配置；所有可调数值配置化。（阶段 1；当前值为初始调优基线）
- [x] DONE **V1-022** 实现 seeded RNG，并验证 seed + config + actions 可复现。（阶段 1、2；Core 固定 tick/action 重放测试通过）
- [x] DONE **V1-023** 为 Easy / Medium / Hard 各建立至少三个 Map Template。（阶段 1）
- [x] DONE **V1-024** 实现按难度的模板选择、确定性参数化和避免三关模板重复的规则。（阶段 1）
- [x] DONE **V1-025** 实现 Map Validator：边界、入口/基地、连通路径、建造位冲突和最小建造位数量。（阶段 1）
- [x] DONE **V1-026** 实现地图生成限次重试与结构化失败结果。（阶段 1）

### 10.4 Game Core 与玩家游戏体验

- [x] DONE **V1-030** 实现不依赖 Phaser/DOM/数据库/LLM 的纯 TypeScript Game Core。（阶段 2）
- [x] DONE **V1-031** 定义玩家和 Bot 共用的 GameAction、观察上下文及 GameResult。（阶段 1、2）
- [x] DONE **V1-032** 实现塔放置/升级、目标选择、攻击伤害、敌人移动、波次、经济、基地生命和胜负结算。（阶段 2）
- [x] DONE **V1-033** 用一个 Easy 关卡完成第一条可玩垂直切片，再扩展至三种难度。（阶段 2）
- [x] DONE **V1-034** 在 Phaser 中实现等距地图渲染、输入、HUD、塔/敌人/投射物反馈和结算画面。（阶段 2）
- [x] DONE **V1-035** 实现并通过 Playwright 验证我的世界入口、世界/难度选择、暂停/继续、结算后重玩及返回选关/我的世界的流程。（阶段 4、7）
- [x] DONE **V1-036** 确保视觉、动画和 UI 状态不参与规则判定，玩家输入仅转换为合法 GameAction。（阶段 2）

### 10.5 Headless Simulator、Bot 与 Metrics

- [x] DONE **V1-040** 实现直接调用 Game Core 的 Headless Simulator，不启动 Phaser 或浏览器。（阶段 3）
- [x] DONE **V1-041** 实现 Novice、Baseline、Expert 三种不调用 LLM 的规则 Bot。（阶段 3）
- [x] DONE **V1-042** 支持单局、批量、seed 重放和策略对比，并记录每次运行的输入与版本信息。（阶段 3）
- [x] DONE **V1-043** 实现确定性 Metrics：胜率、基地生命、漏怪、失败波次、资源利用率、塔使用分布、时长等。（阶段 3）
- [x] DONE **V1-044** 建立从 Metrics 快照到原始 GameResult/run 的证据引用。（阶段 3、6）
- [x] DONE **V1-045** 验证玩家与 Bot 通过同一 Game Core 得到一致、可复现的规则结果。（阶段 2、3）

### 10.6 服务端、SQLite 与持久化

- [x] DONE **V1-050** 建立 SQLite schema migration 和 Node 服务端数据访问层。（阶段 4）
- [x] DONE **V1-051** 建立 worlds、themes、campaigns、levels、world_skins、generation_jobs、player_progress、game_runs、evaluation_runs 数据表。（阶段 4）
- [x] DONE **V1-052** 实现世界、关卡、进度、游戏开始/结算 API，并在边界进行 Zod 校验。（阶段 4）
- [x] DONE **V1-052a** 实现创意工坊已发布世界列表/详情和发布 API。（阶段 7）
- [x] DONE **V1-053** 提供可直接游玩的官方示例世界和 Easy / Medium / Hard 关卡 seed 数据。（阶段 4）
- [x] DONE **V1-054** 持久化解锁状态、最佳成绩和完成进度，并通过 SQLite 重开读取测试验证。（阶段 4）

### 10.7 本地素材、主题解析与 Creative Workflow

- [x] DONE **V1-060** 建立 Asset Manifest、Theme Registry、目录约定和受控 Asset ID。（阶段 5）
- [x] DONE **V1-061** 建立本地原创 SVG 素材库，记录许可证和 Credits。（阶段 5）
- [x] DONE **V1-061a** 使用 ASSETMCP 搜索/检查 UI、地图、塔和敌人素材；导入并登记一款 Kenney CC0 Fantasy UI Borders 面板边框；拒绝许可不明或与 Phaser 2D 管线不适配的候选。搜索和许可记录见 `assets/library/ASSET_REVIEW.md`。（阶段 7）
- [x] DONE **V1-062** 实现 Theme Resolver 和 exact → similar → neutral fallback；WorldSkin 只引用已登记 ID。（阶段 5）
- [x] DONE **V1-063** 建立服务端 DeepSeek API 适配层和项目自有结构化 Prompt 模块，凭据只从服务端环境读取。（阶段 5）
- [x] DONE **V1-064** 实现持久化 Generation Job 状态机、有限重试、失败记录和重试入口。（阶段 5）
- [x] DONE **V1-065** 按固定顺序生成世界身份、塔主题、敌人主题、Campaign 和 UI Theme；每步 JSON 经 Zod 校验后才推进。（阶段 5）
- [x] DONE **V1-066** 由程序解析主题/素材、选择模板、生成三张地图并逐张验证；LLM 不接触规则数值和文件路径。（阶段 1、5）
- [x] DONE **V1-067** 实现世界生成进度 UI、失败反馈、可重试状态和完成后的世界详情。（阶段 5）

### 10.8 Evaluation Agent 与报告

- [x] DONE **V1-070** 实现 inspect_level、run_episode、run_batch、calculate_metrics、inspect_wave_metrics、inspect_tower_usage、compare_runs 工具边界；实验参数仅为关卡 ID、策略白名单和受限 seeds。（阶段 6）
- [x] DONE **V1-071** 实现 inspect → hypothesis → experiment → observe → analyze → additional experiment/report Agent 流程；DeepSeek 只输出定性结论及是否追加一次实验。（阶段 6）
- [x] DONE **V1-072** 约束 Agent 只能读取工具产出的结果，不可伪造 GameResult、重算/篡改 Metrics 或修改游戏规则；报告文字拒绝数字陈述。（阶段 6）
- [x] DONE **V1-073** 报告引用真实 run/result 和 Metrics snapshot，并持久化 Agent 版本、策略版本、seed、完整 Simulator runs、Metrics 和报告。（阶段 6）
- [x] DONE **V1-074** 评测失败保留已生成世界并允许重试；只有三关评测成功后生成世界才进入 ready。（阶段 6；发布 API 门禁在阶段 7）
- [x] DONE **V1-075** 用 Mock 模型验证 Agent 可依据首轮证据追加一次策略实验，且最终报告包含追加实验的真实证据。（阶段 6）

### 10.9 我的世界、发布与创意工坊

- [x] DONE **V1-080** 实现“我的世界”创建/管理、三关详情与试玩、评测报告、评测重试和发布入口。（阶段 4、5、7）
- [x] DONE **V1-081** 实现 world readiness gate：三关齐全、模拟前逐图校验、三关评测完成后生成世界才进入 `ready`。（阶段 5、6）
- [x] DONE **V1-082** 实现本地发布状态和发布前条件检查；未达条件时返回原因并拒绝发布。（阶段 7）
- [x] DONE **V1-083** 实现“创意工坊”已发布世界的列表、详情和进入游玩流程。（阶段 7）
- [x] DONE **V1-084** 验证保存世界的详情、试玩和工坊浏览不依赖 LLM；API/UI 测试通过。（阶段 4、7）

### 10.10 测试、验收与发布准备

- [x] DONE **V1-090** 覆盖 Shared Schema、seeded RNG、地图校验、Game Core、Simulator 和 Metrics 的自动化测试。（阶段 0–3）
- [x] DONE **V1-091** 覆盖 Creative Workflow 的 JSON 校验、失败重试、资产 fallback 和 generation state 流转。（阶段 5）
- [x] DONE **V1-092** 覆盖 SQLite 持久化、进度解锁、种子世界和 API Schema 边界校验。（阶段 4）
- [x] DONE **V1-092a** 覆盖 ready/publish gate、拒绝未就绪发布及 Workshop API。（阶段 7）
- [x] DONE **V1-092b** 覆盖评测 Agent 首轮决策、追加实验、证据引用和三关 readiness gate。（阶段 6）
- [x] DONE **V1-093** 用 Playwright 从浏览器实际完成 Easy 战局并触发基地失守结局，检查 SQLite 战绩已保存、刷新后进度可见和重开回到初态；六项 QA 验收、观察清单及截图见 `qa/verification.json`、`qa/evidence/run.json`。（阶段 7）
- [x] DONE **V1-094** 用真实 Simulator 与 Metrics 验收三种难度实验和报告证据；定性 Agent 使用 Mock，避免测试依赖外网/API 凭据。（阶段 6、7）
- [x] DONE **V1-095** 集成验收世界生成 → 三关地图验证 → 真实模拟/指标评测 → SQLite 报告 → 发布 → Workshop 详情。（阶段 7；生成/定性模型均使用 Mock）
- [x] DONE **V1-096** 核对素材库许可归属、credits、README、环境变量示例和架构边界，并运行 `pnpm verify`。（阶段 7）
