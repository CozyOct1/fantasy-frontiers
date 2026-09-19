# Fantasy Frontiers V2 改造计划

> **执行状态：** Phase 1–10 已完成；P0 战斗闭环、P1 基础战场表现/反馈/WorldSkin 接入及回归均已实现。实现采用最小改动路径，Gameplay UI 与 `BoardScene` 当前仍集中在 `apps/game/src/main.ts`；Game Core、Simulator、Metrics、Evaluation 和 Creative Workflow 未修改。最终验证：`pnpm verify` 与 `pnpm test:e2e` 通过。  
> **改造类型：** V1 同一塔防玩法域内的表现层、交互层和页面流程演进。  
> **最高原则：** 以最少架构风险把可玩的 V1 原型改造成具有完整塔防呈现感的作品；配置承载可调值，设计文档解释取舍，Game Core 继续作为唯一玩法规则来源。

## 1. Current State Assessment

### 1.1 V1 已具备的能力

- 纯 TypeScript Game Core：`createGameEngine`、`dispatch(GameAction)`、固定步进 `step()`、`GameState` 和终局 `GameResult`。
- Phaser 3 等距地图运行时；Easy / Medium / Hard 使用不同地图、波数和难度参数。
- 建塔、升级、开始波次、暂停/继续、1x/2x 速度、胜负状态与结果保存。
- 世界选择、世界详情、关卡入口、创意工坊、世界生成与评测报告的基础 UI/API。
- Headless Simulator 直接调用 Game Core；V2 不需要也不应重写模拟、Metrics 或 Agent。

### 1.2 当前实现检查

| Current | 证据 / 位置 | Problem | Proposed Migration |
|---|---|---|---|
| 首页、世界库、创建世界、工坊、详情、难度与战斗共处一个 HTML 文档 | `apps/game/index.html`；`apps/game/src/main.ts` | 选择世界依赖隐藏区块与滚动到 `.game-layout`，战斗仍像长网页的一部分 | 引入显式屏幕状态与 Hub / Gameplay / Result 视图；保留当前原生 DOM 与 Vite，不增加前端框架 |
| 世界/服务状态、战斗状态、用户选择和 DOM 操作集中在一个模块 | `apps/game/src/main.ts`（718 行） | 全局变量与函数互相调用，难以单独验证 HUD、交互和生命周期 | 逐步抽出屏幕流程、GameSession/Controller、Phaser Scene 与 HUD 模块；每阶段保留工作版本 |
| Phaser 场景与引擎之间经闭包访问共享全局变量 | `BoardScene` 位于 `apps/game/src/main.ts`；调用 `engine.step()`、`engine.dispatch()`、`renderHud()` | 规则本身在 Core，但输入、时间推进、选择状态和渲染职责未形成清晰适配边界 | 由纯 TS Gameplay Controller 持有 Core 会话和固定步进，场景只呈现快照、收集输入意图并转交 Controller |
| Phaser 使用固定 880×560、`Scale.FIT`；地图锚点为 `(440, 48)` | `apps/game/src/main.ts` 中 `Phaser.Game` 与 `BoardScene.project()` | 游戏页全屏化后可能留黑边或地图不居中；Canvas 尺寸和 HUD 占位未以 Gameplay 视口为设计基准 | 以 Gameplay 容器尺寸计算地图缩放与中心锚点；保持等距坐标规则，单独验证桌面及窄屏布局 |
| 12×12 左右的地表格全部绘制边框；建造位、入口、基地、炮塔、敌人是 Graphics 基础形状 | `BoardScene.drawTerrain/drawTower/drawEnemy/drawShots()` | 当前识别度像调试场景；地图每格边线持续可见；攻击只是瞬时线段 | 先淡化/隐藏非交互网格并建立视觉对象层，再用本地 Asset Library 逐类替换；缺素材时保留可读占位对象 |
| Canvas 点击直接反算格坐标；先选塔再点格建造；点击塔只更新 `selectedTowerId` | `BoardScene.onBoardClick()`、`selectedArchetype`、`selectedTowerId` | 建造操作由右侧控件驱动，塔面板没有自己的开关/焦点生命周期 | 统一指针坐标转换与选择状态；点击空建造位、塔、空地分别成为显式交互；支持取消、切换与菜单外点击关闭 |
| HUD 和操作都在右侧网页 Panel 中 | `apps/game/index.html` 的 `.control-panel`；`apps/game/src/style.css` 的 `.game-layout/.resource-grid` | 四个资源 Card、部署 Card、指挥 Card 与说明文字占据大面积网页 UI | HUD 覆盖在战场容器上；保留必要触屏尺寸、对比度和响应式安全边距 |
| 结算当前是战场下方的普通 `.result-panel` | `#result-panel`；`renderHud()` | 没有清晰的胜利/失败场景，用户可见战斗结算与管理页边界不明 | 独立 Result View/覆盖层显示结果摘要、重试、下一关和返回世界详情 |
| Theme 主要更新三个 CSS 变量和防御塔文本 | `selectWorld()`；`WorldSkin` 在 `packages/shared/src/schemas.ts` | Phaser 地图和实体绘制不读取主题；WorldSkin 的 asset ID 目前未成为战斗视觉映射。仓库已有 `assets/library/ASSET_MANIFEST.json`、`THEME_REGISTRY.json`、neutral SVG 占位和少量 Kenney UI 资产，但当前战场尚未消费这些资源 | 做固定 HUD/Layout 的主题映射层，将 WorldSkin 语义与批准资产映射到材质、配色和命名；无匹配时 fallback |

### 1.3 当前运行版本检查

已通过 Playwright 打开运行中的 V1：`http://49.234.190.55/fantasy-frontiers/`。浏览器标题为“幻想防线 · 边境哨站”，世界列表、创建世界、Easy/Medium/Hard、地图 Canvas、四项资源、塔选择、升级、波次控制均同时出现在同页。世界详情当前把 Easy/Medium/Hard 关卡行与评测/发布操作放在同一详情面板，没有独立的 Level Select 屏幕。页面快照中的游戏区下方仍是独立的大控制面板；在当前检查视口中页面内容纵向延展约 1500 CSS px。此检查用于确认真实结构，不代表已完成完整 V2 游玩验收。

### 1.4 Game Core 边界结论

- **已经满足：** `packages/core/src/index.ts` 不导入 Phaser、DOM、服务端、数据库或 LLM；共享 `GameState`、`GameAction`、`GameResult` 来自 `packages/shared/src/schemas.ts`；Simulator 调用同一 Core。
- **需要整理的边界：** `main.ts` 直接拥有 Core Engine、固定 tick accumulator、选择状态、DOM 引用、网络存档和 Phaser 场景闭包。Core 没有 UI 依赖，但 App/Adapter/Scene/UI 尚未分层。
- **V2 的最小必要重构：** 新增纯 TS `GameSession`/Controller 封装引擎创建、dispatch、固定步进和只读呈现快照；Phaser 场景只绘制快照并发出输入意图；DOM HUD/菜单消费 Controller 的状态及 Core 事件。不要为此移动或改写 Game Core 规则。

## 2. V2 Goals

1. 明确分成 Meta / Hub 与 Gameplay 两个视觉和导航层。
2. Gameplay 进入后不呈现世界管理、世界生成、创意工坊或难度切换 UI。
3. 战场成为全屏或近全屏主视觉；目标是在常用桌面视口中让战场占可用首屏主要区域（基准目标约 70%–85%，以可用游戏区域而非含地址栏的浏览器屏幕面积计）。
4. 将信息与操作改成战场 HUD、底部建塔栏、地图内塔面板和独立结果页。
5. 提升地图对象与战斗事件可读性，并接入有限、可复用的基础 Game Feel。
6. WorldSkin 可改变视觉材质与内容命名，但所有世界保持一致的 HUD 布局、输入语义和玩法。
7. 用 Controller/Adapter 建立 Core → Controller → Phaser/HUD 的单向边界，保护 Simulator 与 Evaluation Agent。

## 3. V2 Non-Goals

- 不修改 Game Core 战斗规则、伤害/射程/冷却、塔和敌人 Archetype、经济、波次、难度、胜负条件、种子或固定步进。
- 不重写 Creative Workflow、Evaluation Agent、Simulator、Metrics、API/SQLite 数据模型或世界生成结构。
- 不新增前端框架、游戏引擎、运行时 Skill/MCP 依赖；不因 UI 重构升级依赖。
- 不制作完整美术资产包、不承诺大量世界专属动画，不复制 Kingdom Rush 任何美术、图标、角色、塔型、UI 贴图或 Logo。
- 不增加多人、排行榜、技能树、装备、抽卡、训练或其他新玩法。
- 不在未经玩法/经济决策前新增出售塔的退款规则。

## 4. Target Gameplay UX

- 进入 Gameplay 后，视觉焦点锁定地图；页面切换只发生在 Home/Hub、Gameplay、Result 三种产品屏幕之间。
- 玩家主要通过地图操作：点建造位进入建塔状态；点塔查看升级上下文；点空地取消选择。
- 战斗期间仅显示理解与控制当前战局所需的信息：HP、Gold、Wave、暂停、速度、当前可用建造方式和下一波/开始波次。
- HUD 控件应轻、易扫读、不遮住关键路径/入口/基地；重要触控目标需留出桌面与窄屏安全边距。
- 反馈只对 Core 事件做视觉表现，不延迟或改变 `dispatch()`、`step()`、GameResult 的结算。

## 5. Target Screen Flow

```text
Home / World Hub
  → World Detail
  → Level Select（Easy / Medium / Hard）
  → Gameplay（锁定所选 worldId / levelId / difficulty）
  → Result（Victory 或 Defeat）
      ├─ Replay → 同关新会话
      ├─ Next Level → 下一可玩关卡（胜利且存在时）
      └─ Return to World → World Detail
```

- **Hub** 收纳我的世界、创建世界、创意工坊、世界详情和 AI Evaluation Report。
- **Gameplay** 不显示世界库/创建器/发布/评测/管理按钮或难度 Tabs。可选的轻量关卡名只显示世界/关卡识别信息，不成为大标题。
- **Result** 是 Gameplay 生命周期中的独立屏幕状态或覆盖层；返回目的地和当前 worldId 保持明确。
- 使用当前原生 DOM + TypeScript 实现显式屏幕切换，不引入 React/Vue 或完整 Router。是否同步浏览器历史作为实现细节，默认先实现站内返回按钮与状态恢复。

## 6. Gameplay Layout Spec

- Gameplay 容器占满可用窗口（`100dvh`，兼容回退值）并避免 Hub 的 1440px 页面壳、页头和长页滚动。
- 战场作为全宽/全高的主要层；HUD、塔栏、暂停菜单和 Context UI 是覆盖层，不再用右侧大型 Dashboard 作为网格列。
- 桌面和横屏目标：地图渲染区域占可用 Gameplay 可视区约 70%–85%；先保证路径和实体可读，HUD 覆盖面积尽量小。窄屏/竖屏允许地图周围出现精简底栏或纵向 HUD，但不得恢复完整右侧 Dashboard。
- 采用容器驱动的 Phaser resize / 相机映射。地图格子仍为逻辑 Grid，投影、屏幕坐标转换只在 Phaser Adapter 中维护；缩放后建造位命中和渲染位置必须一致。
- 通过 Phaser Canvas 层、DOM HUD 层、菜单/Modal 层三层叠放；DOM 控件可访问并可键盘聚焦；点击 DOM 面板不得穿透成地图输入。
- 布局适配 safe area、窗口 resize、窄视口、浏览器缩放；暂停/结算 Overlay 需明确阻断战场输入。

## 7. HUD Spec

| 区域 | 常驻信息/操作 | 规则 |
|---|---|---|
| 左上角 | `♥ HP`、`✦ Gold`、`Wave n / total`；小型关卡名可选 | 一个紧凑 HUD 条或统一材质面板；不再使用四张资源 Dashboard Card；塔数量不作为常驻核心数据 |
| 右上角 | Pause、速度切换（1× / 2×）、Settings 入口 | Pause 只在 running/paused 可操作；速度仍只决定 Phaser 请求 Core 固定 tick 的频率，不更改单 tick 规则；Settings V2 可先只放声音/画面占位或省略，不阻塞核心循环 |
| 底部 | Tower Bar；Wave Control 与交互提示 | 战斗中保持轻量；根据 ready/running/paused/won/lost 明确禁用或隐藏不适用控件 |
| 地图上下文 | 建造选择 / 选中塔信息 | 锚定地图选择；对遮挡路径的候选位置做边界翻转/安全偏移；Esc 可取消 |

HP、Gold、Wave 数值直接从 `GameState` 投影到 HUD；渲染动画只能平滑显示值，不能成为状态来源。

## 8. Build Interaction Spec

### 方案比较

| 方案 | 与现有实现适配 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| Radial / contextual build menu | Phaser 可检测 build slot，但现有 Canvas 使用等距投影和 CSS 缩放，DOM 菜单还需与 Canvas 坐标、边缘翻转和 Phaser 输入遮挡同步 | 最贴近“点地块建造”；信息离目标近；可释放常驻空间 | 坐标与视口适配风险最高；手机触控、键盘访问、菜单命中和场景事件生命周期需额外处理 | 可作为后续迭代，不作为 P0 首选 |
| Bottom Tower Bar | 当前已有 DOM 塔按钮与 `selectedArchetype`→点击地图的输入路径 | 改造面最小、易测、易触控；可先将塔型/价格常驻在战场底缘，稳定完成 Gameplay 分层 | 点地图前仍需选择塔；底栏需避免遮住投影地图/窄屏关键格 | **V2 P0 推荐。** 点击 BuildSlot 先进入“选择塔”态并高亮该格；底栏选择塔后向 Controller 发送一次 `placeTower` 并退出建造态。也允许先选塔再点空位，作为现有操作兼容路径。 |

建造交互必须区分未建造格、已占用格、道路/禁建格和空地；Core 仍是合法性权威。失败时显示简短原因，不在 UI 重算成本或规则。

## 9. Tower Context UI Spec

- 点已有 Tower：设置 Presentation 层 `selectedTowerId`，高亮塔与射程提示（若可在不改玩法规则的情况下提供），打开附着于该塔附近的紧凑 Context Panel。
- Panel 展示主题名 / Archetype 名、Level、Damage、Range、Upgrade Cost、Upgrade 与 Sell 状态。数值从共享配置计算/读取展示，升级是否合法仍调用 Core Action；拒绝原因通过统一反馈呈现。
- 点击另一塔更新上下文；点空地、Esc 或点击面板外关闭；窗口 resize 后重新定位；暂停、屏幕切换与结果态关闭/禁用面板。
- Tower Selected State 属于 UI/Controller 表现状态，不添加到 `GameState`。
- **Sell 决策门：** 当前 `GameAction` 没有 sell，`GameEngine` 没有退款/出售规则。为保持“V2 不改 Core 与经济”的硬约束，P0 Panel 可以显示 Sell 按钮的禁用状态/“V2 暂未开放”，但不得自行退款、删除塔或伪造状态。若要求 V2 支持实际出售，必须先另行批准 Core Action 与经济规则，再修改本计划和 V2 Non-Goals。

## 10. Wave Control Spec

- `startWave` 放在战场底部靠右的显著 HUD 按钮，位于地图中安全空区；准备态按 Core 状态显示“开始第 1 波 / 下一波”，running 时隐藏或显示非交互波次状态，paused 时显示暂停状态。
- Pause 与 Speed 位于右上角；暂停菜单覆盖战场，菜单内 Restart（Core 新建同 map/seed 的新会话）与 Resume；不在 HUD 常驻 Restart。
- 按钮的 enabled/label 由 Core `status`、`waveIndex`、`totalWaves` 派生，不由 DOM 自己维护第二份战斗状态。
- Wave 开始反馈监听 Core `statusChanged`，展示短 Banner；不在生成动画期间暂停或跳过模拟。
- Space 暂停/开始行为保留；输入焦点在 textbox/button 等可编辑控件时不抢夺键盘事件。

## 11. Result Screen Spec

- 当 `GameEngine.result()` 非空且状态是 `won/lost` 时，Gameplay Controller 发出唯一一次终局转换；由 canonical `GameResult` 提供数据，并继续通过现存 API 保存结果。
- 显示清晰的 Victory / Defeat、剩余 HP、到达波次、击杀/漏怪、剩余/使用资源摘要；不放 AI Evaluation 的长报告。
- 操作：Replay、Next Level（胜利后且下一关已存在/已解锁时启用）、Return to World。若尚无下一关，显示禁用理由或隐藏按钮。
- Result UI 不重算胜率、资源或胜负；重复 render 不得重复保存 Run Result。
- 切回 Hub 时恢复当前世界详情/难度进度；选择 Replay 时才创建新 Run。

## 12. Battle Visual Upgrade

以逻辑与视觉分层为先，不以整包美术为前提：

| 对象 | V1 | V2 表现目标 | 逻辑边界 |
|---|---|---|---|
| Grid / Terrain | 所有 Tile 常驻描边 | 通过地表材质/连续底图弱化格线；Hover/Selection/合法建造位才显示格高亮 | `MapSpec` 网格与合法坐标不变 |
| BuildSlot | 小型绿色圆圈 | 依 WorldSkin 显示石台、机械基座、珊瑚平台等可读物件；空/选中/占用状态明确 | 继续由 `MapSpec.buildSlots` 决定 |
| Spawn | 红色圆点 | Portal、Gate、Cave、Rift 等主题入口对象；多入口方向可辨 | 使用现有 `MapSpec.spawns` |
| Base | 金色圆点/矩形 | Castle、Crystal、Core、Shrine 等主题终点，且低 HP 状态醒目 | `MapSpec.base` 与 HP 规则不变 |
| Tower | 圆/矩形 Graphics | 最小自制/已批准 Sprite 或清楚的本地占位图；能读出 archetype、Level 与 selected | Tower 数据与 Archetype 不变 |
| Enemy | 圆形 + 血条 | Archetype 可区分的视觉对象、可读 HP bar 与轻量移动姿态 | 位置/HP 仍取自 Core 快照 |
| Combat | 一帧线段 | 可读 Projectile/Beam 生命周期、Hit Flash、Death cue | Core 事件是唯一触发来源；特效不决定命中 |

资源仅来自受控本地 Asset Library/Manifest。素材未就绪时采用统一 fallback。美术制作可增量替换，不阻塞页面分离和可玩闭环。

## 13. Game Feel / Juice

所有效果订阅语义事件并在 Phaser Presentation 层播放；场景离开时释放 Tween、计时器、事件订阅与临时对象。

| Core 事件/状态 | 基础反馈 | 边界 |
|---|---|---|
| `towerPlaced` | 建造物短促 scale/bounce、建造位闪光 | 不延迟建造成功状态 |
| `towerFired` / 命中线索 | Projectile/Beam 到目标的简短表现 | Core 仍负责伤害命中与死亡；`towerFired` 事件当前无“命中”事件，V2 可基于后续 `enemyKilled` 做命中特效，不得猜测未暴露的伤害结果 |
| `enemyKilled` | 小型粒子/消散 | 受对象数量上限约束；不影响奖励时机 |
| 奖励变化 | 简短 Gold 浮字/计数轻闪 | 从状态前后差值或确定性事件 `enemyKilled.reward` 展示；不能二次加金币 |
| `enemyLeaked` | 基地 HP 闪烁/轻微画面位移 | 只表现 Core 已扣除 HP；提供低动态偏好/关闭 shake 的选择或不用 shake |
| 波次状态进入 running | 短 Wave Banner | 不停顿/更改 fixed tick |
| `won/lost` | 清晰胜利/失败转场与音画反馈 | 由 canonical Result 驱动 |

V1 的 `towerFired` 只表达开火目标，并不能证明目标受击；若 V2 需要精确逐次 Hit Flash，先确认现有 Core 事件是否足够表达真实命中，不得让视觉层反推或影响战斗结果。

## 14. WorldSkin Integration

- Layout、HUD 锚点、HP/Gold/Wave 语义、菜单位置、交互和易读性在所有世界完全相同。
- WorldSkin 只映射配色、面板材质、按钮皮肤、边框/装饰、地表/对象 Asset ID、塔/敌人的视觉皮肤与展示名称。
- 读取既有 canonical `WorldSkin` / theme schemas，不新建平行的皮肤模型；用项目 Asset Manifest 校验 id，并按已有主题匹配与 neutral fallback 规则回退。
- Theme 只在进入 Gameplay 时装载；切关或切世界更新 Presentation 资源，不创建不同布局分支，不更新 Core。
- 至少对现有已覆盖 themeFamily 做 smoke 检查，资产不齐时用同一 neutral 占位确保可玩。

## 15. Architecture Impact

```text
Canonical Shared Schemas / Game Config
                 ↓
          Game Core（保持不变） ←→ Headless Simulator / Metrics（保持不变）
                 ↑
    Gameplay Controller / GameSession（新增纯 TS 适配层）
             ↙             ↘
 Phaser BoardScene       DOM HUD / Overlay Views
             ↘             ↙
       Screen Flow / World Hub Application（管理导航与 API）
```

- **Game Core：** 不导入 Phaser、DOM、CSS、API；继续处理唯一的规则、状态、合法性、事件和 GameResult。
- **Gameplay Controller：** 持有一个 Core Engine；接收 `GameAction`；按 `FIXED_TICK_SECONDS` 进行确定步进；保留 presentation-only selected tower/build slot；发布只读快照与 Core 事件。速度只是 tick 请求倍率。
- **Phaser BoardScene：** 绘制地图快照、映射逻辑坐标与像素、产生 build slot/tower/ground 点击意图、播放表现反馈。不直接改变规则，不持有第二套血量/金币/胜负。
- **HUD/Overlay UI：** 以 DOM 展示 Controller view model，按钮调用 Controller 的 `dispatch` / Application command；不写 Core state。
- **Screen Flow/Hub：** 持有当前 World/Level 导航上下文、生成/评测/工坊 API 流程；进入战斗传入 canonical `LevelRecord`，结算时保存 canonical `GameResult`。
- **Simulator、Metrics、Evaluation Agent、Creative Workflow、Server：** 本轮无职责变化，不受客户端 UI 依赖。
- **Canonical 类型：** 复用 `GameState`、`GameAction`、`GameResult`、`MapSpec`、`WorldSkin`；仅新增纯 UI 状态类型到适配层，不复制这些 schema。

## 16. Current File / Module Analysis

| Existing File | Current Responsibility | V2 Change | Risk |
|---|---|---|---|
| `apps/game/index.html` | Hub、创世表单、工坊、世界详情、难度、游戏 Canvas、右侧控制、结果 DOM 全部静态铺在一个 shell | 拆出 Hub / Gameplay / Result 容器；把战斗控件迁为覆盖层并明确隐藏/显示生命周期 | 屏幕切换漏显管理控件；Playwright selectors 变化 |
| `apps/game/src/main.ts` | World/API 数据刷新、Workshop/详情/评测、GameEngine、Run 保存、HUD 渲染、战斗输入、固定步进、Phaser Game/BoardScene 初始化 | 逐步变成应用组合根；按阶段提取导航、GameSession、BoardScene、HUD、交互和结算模块 | 最高风险/冲突点；大文件改造容易影响异步存档、世界皮肤和游戏运行 |
| `apps/game/src/style.css` | Hub 页面卡片、两列 Game Dashboard、塔选项、Result 下方 Panel、断点样式 | 新增全屏 Gameplay CSS、HUD 层级/安全区、底部塔栏、Overlay/结果视图与响应式规则；保留 Hub 样式 | CSS 状态互相泄漏、窄屏遮住地图、Canvas 尺寸变化使命中坐标错位 |
| `packages/core/src/index.ts` | 纯 TS Core；Tower Build/Upgrade、Wave、Pause、结果和事件 | **无玩法规则改造**；只在发现无法注入/测试固定步进的 adapter 问题时提出单独审查 | 不必要触碰会破坏 V2 不变量及 Simulator 回归 |
| `packages/shared/src/schemas.ts` | Canonical `GameState/Action/Result`、`MapSpec`、`WorldSkin` schemas | 复用既有模型；只有真实 API/跨模块合同需要才单独改 schema | 新增 sell 等 action 会跨 Core/Simulator/API，超出当前授权范围 |
| `packages/shared/src/config.ts` | 游戏数值、难度、塔/敌人配置 | 只读取展示 Damage/Range/Cost；不为界面改数值 | UI 重复硬编码会与实际数值不一致 |
| `packages/simulator/src/index.ts`、`packages/metrics/src/index.ts` | Core Headless 评测与确定性指标 | 不改实现；回归验证保证不被 Phaser/UI import | 若 Controller 被放入共享包或反向依赖，可能污染 headless 边界 |
| `tests/core.test.ts` | Core 行为、可复现性、升级/胜负测试 | 保持原测试；增加 UI 无法改变 Core 结果的 Controller 测试 | 误把 Presentation 状态塞入 GameState |
| `tests/e2e/bootstrap.spec.ts` | 单页加载、工坊、建塔/升级/暂停重开流程 | 更新定位器和新屏幕流程；保留 API/Workshop 回归 | 多项场景全在一个 spec 可能脆弱 |
| `tests/e2e/complete-playthrough.spec.ts` | 当前单页从进入、波次到结果/返回的 E2E；读取旧 `#result-panel` 与 Dashboard 控件 | 改为 Hub → Level Select → Gameplay → Result → World 的真实流；验证胜负持久化和 Replay/Next | 旧 locator、画布坐标和 Result 位置依赖须同步更新 |
| `tests/server-api.test.ts`、workflow 与 simulator/metrics 测试 | 服务端、创世、评测和模拟合同 | 业务行为不变；作为全量 `pnpm verify` 防回归 | V2 不应为了视觉重构改服务端数据合同 |
| `docs/v1/01-brief-design.md`、`docs/v1/02-architecture.md`、`AGENTS.md` | 既有产品原则和架构约束 | 作为不可破坏约束；只有用户确认范围变化才修改 | V2 文档若偏离，会导致 UI 需求和 Core 规则冲突 |

## 17. Proposed File / Module Changes

以下为计划名称，实施前先确认目录内没有已有同责模块；优先薄模块，避免设计成通用 UI 框架。

| Proposed File / Module | Responsibility | Introduced in |
|---|---|---|
| `apps/game/src/app/screen-flow.ts` | Hub / Gameplay / Result 显式状态、进入/返回命令、当前世界与关卡导航上下文 | Phase 1 |
| `apps/game/src/game/game-session.ts` | 纯 TS 包装 `GameEngine`，负责 action dispatch、固定 tick、结果/快照读取及 Core event 转发 | Phase 1–3 |
| `apps/game/src/game/gameplay-controller.ts` | Gameplay 输入用例、presentation-only 选择态（tower/build slot）、会话生命周期和 UI 投影 | Phase 1/4/5 |
| `apps/game/src/game/board-projection.ts` | Iso 逻辑格 ⇄ 场景坐标转换、基于视口的居中/缩放计算；仅被 Phaser Adapter 使用 | Phase 2/4 |
| `apps/game/src/scenes/board-scene.ts` | 只负责 Phaser 地图/实体渲染、地图输入意图和视觉反馈 | Phase 1–2 抽离，后续演进 |
| `apps/game/src/ui/game-hud.ts` | HP/Gold/Wave、Pause/Speed、状态渲染与 DOM 事件绑定 | Phase 3 |
| `apps/game/src/ui/tower-bar.ts` | 塔型/费用选择和建造待选态 | Phase 4 |
| `apps/game/src/ui/tower-context-panel.ts` | 塔选中详情、升级成本、Upgrade、Sell Disabled 状态 | Phase 5 |
| `apps/game/src/ui/pause-overlay.ts` | Resume / Restart / Return；阻断底层输入 | Phase 3 |
| `apps/game/src/ui/result-screen.ts` | canonical GameResult 展示、Replay / Next / Return 导航 | Phase 6 |
| `apps/game/src/presentation/battle-feedback.ts` | 订阅/消费 Core 事件并播放受控的视觉反馈，负责 dispose | Phase 8 |
| `apps/game/src/presentation/world-skin-resolver.ts` | canonical WorldSkin → approved asset/theme presentation tokens + fallback；消费已有 Manifest/Registry 和 neutral SVG，必要时再增加已审查资源 | Phase 9 |
| `apps/game/src/ui/hub-view.ts`（可选） | 若 `main.ts` 仍过长才将世界 UI/API 事件处理提取到 Hub 模块 | Phase 1 或后续清理 |

命名不是要求一次性新增所有模块。每一阶段只创建当期需要的模块；V2 不以拆文件数量作为完成指标。

**实际落地文件：** 新增 `apps/game/src/game/gameplay-controller.ts`、`apps/game/src/presentation/world-skin-resolver.ts` 和 `apps/game/src/game/board-projection.ts`；屏幕流程在 `src/app/screen-flow.ts`。按比赛交付的最小风险原则，HUD、塔栏、Context Panel、暂停层、Result UI、`BoardScene` 与事件表现仍留在 `main.ts` / `index.html`，没有为形式拆分新建上述每个 UI 模块。后续如 `main.ts` 继续扩张，再单独按责任提取。

## 18. Migration Plan

1. 先冻结 V1 行为基线：已有 Core/Simulator/Playwright 流程，记录 Easy/Medium/Hard 初始化状态、建塔/升级/暂停/速度、胜败结果和保存行为。
2. 先添加显式屏幕流程，再迁 DOM，不改 Core API。Hub 继续负责现有世界/创世/工坊流程。
3. 抽 `GameSession`/Controller，把现有 `dispatch` 与 accumulator 一次性搬出全局闭包；确保仍以 Core 固定 tick 推进。
4. 抽离 `BoardScene` 并建立统一投影/指针转换，先保持 Graphics 表现不变，以便独立判断“结构变了但规则/命中未变”。
5. 每阶段只迁移一组 UI：主布局/HUD → Build → Tower Context → Result；不断更新 E2E 以保持运行版本。
6. 结构稳定后才替换基础 Graphics 对象/接入本地素材与反馈，最后接入 WorldSkin。主题缺素材不得阻断玩法。
7. 每阶段保持应用可启动和可玩；禁止临近完成时把所有结构、主题、反馈改动合成一个难以回滚的大提交。

## 19. Phase-by-Phase Implementation Plan

优先级：P0 为完整战斗呈现与闭环必需；P1 为明显提升对象识别和手感；P2 为时间允许时的高级表现。阶段按迁移依赖排序。

### Phase 1 — Gameplay Route / Scene Separation `[P0]` `[完成：2026-09-19]`

- **Goal：** 建立 Hub、Gameplay、Result 显式屏幕状态；进入战斗时隐藏所有世界管理 UI。
- **Files / Modules：** `apps/game/index.html`、`apps/game/src/main.ts`、新 `src/app/screen-flow.ts`、`src/game/game-session.ts`（必要时 `src/scenes/board-scene.ts`）。
- **已完成：** Hub 中保留世界/生成/工坊/详情；难度和关卡入口可启动 Gameplay；通过显式 `ScreenFlow` 隔离 Hub / Gameplay / Result；Gameplay 隐藏世界管理和难度选择 UI；离开战斗返回当前世界详情；终局进入独立 Result 屏并支持重玩/返回；离开 Hub 时忽略游戏热键；Phaser Canvas 在首次进入可见屏幕后调整尺寸。
- **本阶段范围调整：** `GameEngine`、固定步进和 Phaser `BoardScene` 暂仍由 `main.ts` 管理，没有新增 `GameSession`。该抽离不影响页面隔离验收，延后至 Phase 2 的 Gameplay Controller / Scene 解耦工作中执行，避免本阶段扩大重构面。
- **Acceptance Criteria：** World → Level Select → Gameplay 可运行；Gameplay DOM 不显示我的世界、生成、工坊、管理和难度 Tabs；退出战斗能回到同一 World Detail；结果可重玩并返回世界详情。以上已通过端到端验证。
- **Tests：** `tests/screen-flow.test.ts`；Playwright 检查入口/屏幕隔离/世界详情返回、工坊回归、建塔/升级/波次/暂停/重开和完整战役结果流程；`pnpm verify`。
- **Risks：** 单页原地隐藏可能残留滚动/键盘输入；API 异步世界刷新可能覆盖当前屏幕；分场景重建时必须避免并行两个 Phaser Game 实例。

### Phase 2 — Battle-first Layout `[P0]` `[完成：2026-09-19]`

- **Goal：** Phaser 战场成为主视区并占据 70%–85% 可用视口目标。
- **Files / Modules：** `apps/game/src/style.css`、`apps/game/index.html`、`BoardScene`（目前仍在 `src/main.ts`）、`src/game/board-projection.ts`。
- **已完成：** Gameplay 改为固定全屏战场容器；Canvas 覆盖整个视口；标题与状态移入顶部轻量浮层，原控制面板改为底部半透明操作托盘；Phaser 首次进入 Gameplay 时创建，避免隐藏容器产生 0×0 renderer；用当前 HUD 和操作托盘的真实边界计算可用棋盘区域，并随视口 resize 重新布局和缩放等距地图；渲染与指针输入共享纯 TypeScript `board-projection` 正/逆投影。
- **Acceptance Criteria：** 桌面和竖屏下战场 Canvas 覆盖视口、控件保持浮层且可用；Resize 后重算棋盘投影；网格位置能正向投影后逆变换回原格；建造位可点击且不会被控件浮层拦截。以上均通过对应验证。
- **Tests：** `tests/board-projection.test.ts` 覆盖桌面、竖屏、横屏下全格往返与地图边界；Playwright 验证桌面/竖屏 Canvas 尺寸、重排、建塔/升级/波次/暂停/重启及完整战役流程。
- **Risks：** `Scale.FIT` 与 CSS resize 混用造成坐标偏移；isometric 地图边界计算不当造成切角；窄屏信息优先级需明确。

### Phase 3 — HUD + Wave / Pause Controls `[P0]` `[完成：2026-09-19]`

- **Goal：** 以轻量游戏 HUD 显示 HP/Gold/Wave 和战斗控制。
- **Files / Modules：** `apps/game/index.html`、`apps/game/src/style.css`、`apps/game/src/main.ts`、`apps/game/src/game/gameplay-controller.ts`。
- **Required Changes：** 资源合并成一条 HUD；右上 Pause 与 1x/2x；右下/底部 Wave Start；Restart 移进 Pause Overlay；由 Controller/GameState 推导 label、状态和禁用；键盘焦点控件不被 Space/Escape 热键抢夺。
- **Acceptance Criteria：** 不存在右侧 Dashboard；塔数量不常驻；按钮行为和 V1 一致；暂停时模拟停止且 Resume 后按同一 Core 状态继续；速度只改变 tick 调用频率。
- **Tests：** Controller 单测验证 action/status 与固定步进；Playwright 验证波次开始/暂停/继续/速度；暂停 Overlay 阻断 Canvas 输入且 Resume 关闭。
- **Risks：** 速度乘数错加到单 tick 或 Core；暂停 Overlay 状态与 Engine 脱节；键盘可访问性和窄屏 HUD 重叠。
- **完成记录：** 已完成轻量 HP/Gold/Wave HUD、顶部 Pause/Speed、底部 Wave Start 与带 Resume/Restart/退出的暂停层；新增纯 TS `GameplayController`，用固定步进累积器驱动原 Core。浮点容差回归保证 30/60 FPS 同 tick 结果。暂停/速度/重启有 Playwright 覆盖。

### Phase 4 — Build Interaction `[P0]` `[完成：2026-09-19]`

- **Goal：** 用地图建造位与轻量 Tower Bar 完成清楚、稳定的建塔交互。
- **Files / Modules：** `apps/game/src/main.ts` 中的 `BoardScene`/塔栏事件、`src/game/gameplay-controller.ts`、`src/game/board-projection.ts`、`style.css`。
- **Required Changes：** 点合法 BuildSlot 后高亮并进入选塔态；底部栏展示固定四 Archetype、主题名和配置 Cost；选择塔后调用 Core `placeTower`；允许先选塔再点格兼容现有操作；Esc/空地取消；Core 拒绝原因可读。
- **Acceptance Criteria：** 建塔流程只产生一次 Core action；黄金/塔/合法性唯一来自 Core；占用格/道路不能凭 UI 自己判为成功；Tower Bar 不遮挡关键路径；键盘与触屏都有可理解的取消/确认方式。
- **Tests：** Controller 测试无效/有效格委派、选择态不改 GameState、无重复 dispatch；Playwright 从点击格到选塔到建造并看到塔/Gold 更新；快速连续点击无重复建造。
- **Risks：** Phaser/UI 坐标和状态竞态；选择态未随切关清理；主题名称更新不应改 Archetype ID。
- **完成记录：** 建造位先选中并以石台高亮，再从底部栏选塔立即向 Controller 派发一次 `placeTower`；先选塔再点建造位仍可用。金币、塔状态和 Core 拒绝原因仍来自 Core；E2E 验证部署后的金币变化。

### Phase 5 — Tower Context UI `[P0]` `[完成：2026-09-19]`

- **Goal：** 点击 Tower 后显示靠近对象的升级上下文并支持稳定关闭/切换。
- **Files / Modules：** `apps/game/src/main.ts` 中的 tower selected lifecycle / context panel、`style.css`、`gameplay-controller.ts`。
- **Required Changes：** 实现 selected tower lifecycle；Panel 呈现名称、Level、Damage、Range、Upgrade Cost、Upgrade 与禁用 Sell；塔选中高亮；切塔更新；点面板外/Esc/空地关闭；面板不能把点击传给地图。
- **Acceptance Criteria：** 数值显示取自现有配置与 Core state；升级成功只由 Core action 决定；Core 拒绝时 Panel 反映当前状态且无重复消费；场景离开/暂停/结算关闭 Panel；Sell 明确 disabled，不引入退款。
- **Tests：** 单测选择状态和不同 lifecycle；Playwright 建塔后点塔、升级、选择另一塔、外部关闭、面板边缘定位；断言 sell disabled 与 GameState/economy 未改。
- **Risks：** DOM 锚点映射随 resize 漂移；升级成本显示公式重复；误将 Sell 当作仅 UI 功能而绕过经济规则。
- **完成记录：** 点击塔显示随投影定位的 Context Panel，呈现主题名、等级、配置伤害/射程/升级费用；升级调用 Core Action；无出售规则时 Sell disabled。点面板外、空地或 Escape 可关闭，暂停/结算会隐藏面板。Playwright 覆盖升级、关闭与 Sell 禁用。

### Phase 6 — Battle Result Screen `[P0]` `[完成：2026-09-19]`

- **Goal：** 将 Victory / Defeat 纳入清晰的独立 Result flow。
- **Files / Modules：** `apps/game/index.html`、`style.css`、`src/app/screen-flow.ts`、`src/main.ts` 的 canonical result/save 流程。
- **Required Changes：** Engine terminal → canonical GameResult → 恰好一次保存 → Result view；显示剩余 HP、波次、Gold/资源摘要、重试、下一关条件入口、返回当前世界详情；即时结算不嵌入 AI Evaluation 报告。
- **Acceptance Criteria：** Victory 和 Defeat 都可到结果屏；数据与 Core `result()` 完全一致；重渲染不重复保存；Replay 重开初始状态；Next Level 只在有效解锁时出现/启用；Return 回到正确世界。
- **Tests：** Result mapping 单测；Playwright 覆盖胜利和失败、回放、下一关可用/不可用、返回 World；服务器进度保存行为保持现状。
- **Risks：** V1 `refreshWorldLibrary()` 与导航状态耦合；终局事件可能多次 render；失败路线的后续关解锁语义需遵循既有 Progress API。
- **完成记录：** Result 作为独立屏幕保留，并基于 canonical `GameResult` 展示波次、剩余 HP、击退数、剩余/获得金币和建塔数；Replay、已解锁 Next Level、返回选关/世界入口接通。以结果键和持久化 run ID 防止重复展示/保存；完整 E2E 已覆盖终局、SQLite 进度刷新及重开。

### Phase 7 — Battle Visuals `[P1]` `[完成：2026-09-19]`

- **Goal：** 显著降低调试画面感，形成可辨的世界对象与战斗对象。
- **Files / Modules：** `apps/game/src/main.ts` 的 `BoardScene`、`style.css`、受控的 `assets/library` 与 Manifest（本阶段使用 Vector fallback，未新增素材）。
- **Required Changes：** 默认弱化格线；Hover/Selection 才强调格；BuildSlot、Spawn、Base、Tower、Enemy 以批准 Sprite/本地 Asset ID 或可复用 Vector fallback 替换 debug marker；敌人血条、塔等级/选择态和战斗可读性明确。
- **Acceptance Criteria：** 玩家仍能辨认所有路径、入口、基地、可建造格和敌人 HP；无素材场景 fallback 正常；主题展示不产生新的逻辑坐标或 Archetype。
- **Tests：** Playwright 截图人工比较 + 语义对象覆盖 smoke；资产 Manifest/ID 验证；低分辨率和窄视口可读性检查。
- **Risks：** 资产比例/锚点和等距投影不匹配；装饰降低地图对比；新增资源加载失败阻止启动。
- **完成记录：** 用项目内 Phaser Vector fallback 替换主要调试标记：弱化常驻格线、增强道路边缘、把 BuildSlot 画为石台，Spawn 画为裂隙，Base 画为堡垒/核心，塔有底座/塔身/等级圈，敌人有 Archetype 色彩与血条。当前素材 Manifest 主要是占位资产，因此本阶段没有伪称已完成真实 Sprite 接入；本地 Vector 表现不依赖资源加载。

### Phase 8 — Game Feel `[P1]` `[完成：2026-09-19]`

- **Goal：** 在不改变规则时提供最小明确反馈。
- **Files / Modules：** `apps/game/src/main.ts` 的 Core event 消费 / Phaser Tween、少量 `style.css`。
- **Required Changes：** tower placement bounce、事件触发的发射/击杀/漏怪反馈、Gold 变化浮字、Wave Banner、低频/低强度基地反馈、Victory/Defeat 过渡；清理 Tween/particles；限制并发对象，避免每帧 DOM 重建。
- **Acceptance Criteria：** feedback layer 只订阅 Core 事件；同种输入/seed/动作的 Core snapshot 和 GameResult 与 V1 一致；暂停/切屏可清理表现对象；关闭/低动态设置不影响玩法。
- **Tests：** Controller/Core replay regression 对照；事件→反馈映射单测；Playwright 检查反馈出现/消退与结果时序，不以动画决定测试结果。
- **Risks：** `towerFired` 不是命中证明；Tween 生命周期泄漏；特效遮挡战斗或在高波次降低帧率。
- **完成记录：** Core 事件映射至建塔扩散环、发射/命中闪光、击杀粒子、金币浮字、基地 HUD 受击闪动、波次横幅及胜负结算。Core 的 `towerFired` 在同一 tick 已经扣除目标 HP，因此命中表现绑定到其实际目标位置；Tween 完成即销毁，不参与胜负。

### Phase 9 — WorldSkin Integration `[P1]` `[完成：2026-09-19]`

- **Goal：** 让世界有主题辨识度，但 Gameplay Layout/操作不变。
- **Files / Modules：** `src/presentation/world-skin-resolver.ts`、`src/main.ts` 的主题 token 应用、`style.css`、共享已有 Asset Manifest / Theme Registry。
- **Required Changes：** resolver 解析 canonical WorldSkin/Asset ID；固定 HUD token 槽位改变 palette/material/decoration/名称；地图对象调用主题资源；按既有相似主题→neutral fallback；切换 world 时完全 reset 上一个 theme。
- **Acceptance Criteria：** 至少两种差异明显的现存主题可展示（若当前数据不足用测试 fixture）；屏幕元素位置/功能一致；缺 asset 不影响启动/游戏；不加载网络任意路径。
- **Tests：** resolver 的 exact/similar/neutral fallback；同 viewport 对比主题布局 bounding boxes 一致；Playwright 切世界检查 theme class/tokens reset。
- **Risks：** 当前 V1 只把少量颜色应用到 CSS，现存 Asset Library 覆盖可能不足；不能虚称所有 ThemeFamily 已有完整素材。
- **完成记录：** 新增 `world-skin-resolver.ts`，通过共享 Zod schema 检查 Theme Registry 与 Manifest，只返回本地已登记 Asset ID；按 exact → similar → neutral 解析，并把固定颜色 token 应用到 HUD/Gameplay 和地图基色，塔/敌命名继续读取各世界主题。Resolver 单测覆盖 exact、similar、未批准 ID 与 neutral 兜底。当前各 pack 共用 neutral SVG 占位，主题差异主要是配色/材质 token/命名，不是完整主题素材包。

### Phase 10 — Polish & Regression `[P0 Gate; P1/P2 polish]` `[完成：2026-09-19]`

- **Goal：** 完整验证单屏战斗、世界流程、不同难度、视口和架构不变量，收敛 V2。
- **Files / Modules：** 所有前端模块；`tests/core.test.ts`、新增 Controller tests、`tests/e2e/bootstrap.spec.ts`、`tests/e2e/complete-playthrough.spec.ts`；不改服务端除非发现独立缺陷并获得新任务范围。
- **Required Changes：** 更新 E2E 为真实 Hub→Level→Gameplay→Result 流程；覆盖建造、升级、Wave、Pause/Resume、Speed、Win/Lose、Replay/Next/Return；做 Easy/Medium/Hard smoke；做 desktop/mobile resize 和无主题素材 fallback；跑全项目 verify。
- **Acceptance Criteria：** 本文 DoD 全部满足；无 Game Core、Simulator、Metrics、Evaluation Workflow 规则变更；`pnpm verify` 通过；Playwright 核心流程在 CI/本机可复现。
- **Tests：** 下节完整测试矩阵；最终命令 `pnpm verify`。
- **Risks：** 端到端全流程耗时；自动化失败若依赖像素坐标会脆弱；测试应优先使用 accessible names 与稳定 data-testid，Canvas 命中坐标仅保留必要的投影集成检查。
- **完成记录：** 已通过 `pnpm verify` 与全量 `pnpm test:e2e`。浏览器覆盖 Hub/Gameplay 隔离、工坊进入、桌面及竖屏填充、BuildSlot 建塔/升级/关闭面板、Pause/Resume/Speed/Restart、Easy/Medium/Hard 入口、完整终局/持久化与重开。核心控制器固定步进、主题 fallback 和现有 Core/Simulator/Metrics 单测均通过。

## 20. P0 / P1 / P2 Priority

| Priority | Scope | Completion intent |
|---|---|---|
| **P0** | Hub/Gameplay 分离、战场主视觉、轻量 HUD、Build 操作、Tower Upgrade Context、Pause/Speed/Wave Controls、Victory/Defeat Result、E2E 与全量回归 | 让玩家一眼进入战斗并能完成一局、结算、再玩或返回 |
| **P1** | BuildSlot/Spawn/Base/Tower/Enemy 视觉升级、Projectile/Hit/Death/Gold/Wave Game Feel、WorldSkin 到战斗 UI/地图整合 | 强化主题辨识和战斗反馈；用本地素材与 fallback 增量交付 |
| **P2** | Radial build menu、高级动画/粒子、复杂 HUD 转场、大量主题资产、精致高级设置 | 只有 P0 完成、时间预算允许时才考虑；不能阻塞提交 |

建议比赛交付顺序：优先完成 Phase 1–6 的可玩闭环，再完成足以降低 debug 感的最小 Phase 7/8，再做 Phase 9；若时间不足先减 P1/P2 的美术广度，不减流程完整性和验证。

## 21. Testing Plan

### Unit / Integration

- `GameSession`/Controller 的 UI selection state 不进入或修改 canonical `GameState`。
- `GameAction` 委派：建塔、升级、开始波次、暂停/继续；Core 拒绝动作后 HUD 从新快照重新渲染。
- 固定 tick：相同 map/seed/action/tick 轨迹得到与 V1 一致的 Core state 与 `GameResult`；速度倍率不能改变单 tick 结果。
- Tower selection/context panel lifecycle：选塔、换塔、外部关闭、Esc、切关、暂停、终局清除选择状态。
- Wave UI state：ready/running/paused/won/lost 的控件文案、enabled 和菜单状态正确派生。
- Result：Victory/Defeat 数据映射、Replay/Next/Return 条件与结果提交 exactly-once。
- Theme resolver：exact、similar、neutral fallback；不改变 Layout tokens 和逻辑地图数据。
- 不新增 Phaser 玩法逻辑；保留当前 `tests/core.test.ts`、Simulator/Metrics/Evaluation/Creative Workflow 现有测试。

### Playwright 必须流程

1. 打开 Home / Hub。
2. 进入一个世界详情。
3. 选择 Easy。
4. 进入 Gameplay，断言所有世界管理控件不可见，战场 Canvas 主视。
5. 点建造位并选择塔，成功建塔。
6. 点 Tower，显示信息与升级面板。
7. Upgrade，验证 Level/Gold 的 Core 驱动变化。
8. 开始 Wave。
9. Pause / Resume。
10. Speed Change 到 2× 再回 1×。
11. 通过确定性流程完成一局并出现 Victory 或 Defeat Result。
12. 验证 Replay 和至少一个有效 Return / Next Level 路径；胜负持久化行为正确。

还应在至少一个窄视口运行 smoke；Easy/Medium/Hard 初始化和切换在 Level Select 中验证；WorldSkin 两种主题的布局 bounding box 相同。

### 全项目验证

完成实现阶段时运行：

```bash
pnpm verify
pnpm test:e2e
```

`pnpm verify` 是项目 DoD 必需门；Playwright 配置若 `pnpm verify` 未包含 E2E，则仍需单独运行 `pnpm test:e2e`。不得把只看静态截图当作可玩验收。

## 22. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| App 主逻辑集中在 `main.ts`，一边拆模块一边改 UI 容易引入回归 | 页面、存档、世界生成或 Phaser 游戏可能同时失效 | 先增加 Controller/Screen Flow 并维持 V1 表现，分阶段迁移；每阶段有 E2E |
| Phaser 视口缩放与 iso inverse-projection 不一致 | 点到错误格、无法建造、塔选择错对象 | 统一 `board-projection`，用实际 Canvas bounding rect 测坐标；覆盖 resize 与角落格 |
| Phaser 单一运行包超过 Vite 的默认体积提示阈值 | 首次下载包较大，加载速度受网络影响 | 当前产物约 1.35 MB（gzip 约 363 KB），由 Phaser 与完整游戏客户端组成；本次不做拆包/依赖重构，若加载时间成为实际问题再单独评估按屏幕动态加载 |
| 结果页与 API 保存异步流程竞争 | 重复记录、返回世界时状态丢失 | Core result ID/run ID 幂等守卫；结果导航与异步刷新解耦 |
| Tower Sell 被 UI 误做为“返还固定金币” | 经济规则变化、Simulator 与玩家规则不一致 | V2 默认禁用 Sell；任何出售规则另立决策/范围和 Core 测试 |
| 美术素材不足或不适用 iso 格式 | 计划延迟、表现不统一 | 固定 Vector/Sprite fallback；P1 分对象替换；只用本地受控 Manifest |
| 主题 tokens 导致文字对比不足或 Layout 分叉 | HUD 难读、不同世界操作位置不一致 | 固定 semantic token slots/布局；对比度与 bounding-box 回归；neutral fallback |
| 动画与全屏图层损害性能/输入响应 | 波次期间卡顿或点击被吞 | 特效数量上限、暂停清理、减少每帧 DOM 操作、低动态/无动画降级 |
| 既有 E2E 强依赖旧选择器、单页滚动与像素坐标 | 全量 Playwright 失败 | 先改屏幕流程测试，再渐进迁 locator；优先 role/name 与稳定 test id |
| 近期提交时间有限 | P1 美术工作挤占闭环 | 严格 P0 gate；可减高级粒子、主题数量和转场复杂度 |

## 23. V2 Definition of Done

只有以下条件全部满足才标记 V2 完成：

- [x] Gameplay 与 World Management 完全分离；进入战斗不显示创建世界、我的世界管理、工坊入口、世界管理按钮和难度 Tabs。
- [x] 战场占据主视觉；移除右侧大型 Dashboard 和大面积外围卡片。
- [x] HP / Gold / Wave 为轻量 HUD；Pause / Speed / Wave Start 是 Gameplay HUD 操作；Restart 在 Pause Menu。
- [x] 建塔交互在地图 BuildSlot 上发生，并由 Tower Bar/上下文状态传到现有 Core `placeTower`。
- [x] 点击 Tower 出现可关闭/切换的 Context UI；升级走现有 Core Action；Sell 在没有正式规则批准时明确 disabled。
- [x] Victory/Defeat 为独立结算体验，显示 canonical 结果；Replay、有效 Next Level、Return to World 工作。
- [x] 常驻 Grid Debug 感明显降低；BuildSlot / Spawn / Base 有游戏化 Vector 视觉；Tower / Enemy 能识别 Archetype 和 Level/HP。
- [x] 基础 Attack/Projectile、Hit/Kill、Gold、Base Damage、Wave Start 和终局反馈存在；表现不参与 Core 状态计算。
- [x] WorldSkin 只换视觉 token/本地资产 ID 映射/名称，不改变 Gameplay Layout、交互或 Game Core。
- [x] Easy / Medium / Hard 入口正常；Simulator、Metrics、Evaluation Agent、Creative Workflow 未因本次 UI 改造变更。
- [x] Game Core 规则未变；固定步进跨帧率一致性与现有 Core/Simulator/Metrics 回归通过。
- [x] `pnpm verify` 通过，Playwright 完成规定流程与窄视口 smoke。
- [x] 运行时无 Skill/MCP 依赖、无新前端框架、无未经批准的技术栈/经济规则变更。

---

**V2 执行准则：** `AGENTS.md` 定义不能变的原则；配置文件承载可调参数；设计文档解释为什么。Presentation 可以换，规则仍只由 Game Core 决定。
