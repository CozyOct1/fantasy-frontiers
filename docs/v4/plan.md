# Fantasy Frontiers V4 — Battlefield Presence & Game Feel

> **目标：** 在保留 V2/V3 已有游戏流程、等距地图、素材库与战斗规则的前提下，把 Gameplay Scene 从“已美化的静态塔防原型”推进到有场景纵深、清晰战场主体和可感知战斗反馈的游戏画面。
> **工作范围：** 本文是 V4 工程改造计划，不授权本轮直接实现业务代码。所有阶段状态初始为待执行；实施期间逐项更新状态与证据。
> **首发主题：** Border Outpost / 边境哨站。优先在现有原创本地素材上迭代，不要求同时制作其他 WorldSkin 的完整资源包。
> **不可变边界：** V4 是 Presentation / UX / Asset Pass。Game Core、共享规则、战斗数值、地图合法性、胜负、Simulator、Metrics、Creative Workflow 和 Evaluation Agent 不因视觉改造而改变。
> **完成状态（2026-09-20）：** Phase 0–6 已完成。完整 Playwright 套件 10 passed / 1 条按设计跳过的 production-only smoke，production smoke 单独 1 passed；`pnpm verify` 通过（44 tests + typecheck + build）。证据见 `qa/evidence/v4-*.png`、`qa/evidence/gameplay-result.png` 与 `qa/evidence/run.json`。

## 1. Current State Assessment

### 1.1 产品与架构现状

- Fantasy Frontiers 是塔防游戏；世界生成与评测是辅助能力。大厅、世界详情、关卡选择、Gameplay、Result 已分层，V4 只针对 Gameplay 战场表现。
- Game Core 继续由纯 TypeScript 规则驱动，Phaser `BoardScene` 负责投影、画面与输入。V4 不将视觉演出变成第二套规则，也不把 UI 状态写回 Core。
- 项目现有正式战斗素材均由本地 Manifest / Theme Registry 解析；`assets/library/border-outpost/` 已有原创地表、道路、BuildSlot、Rift、Keep、塔、敌人和装饰资源。
- V3 的 `docs/v3/plan.md` 记录了尚未通过的完整 Easy 战役 Playwright 流程。V4 P0 开始前须先定位该测试停留于 `combat` 的原因，建立可信的运行中基线；不能在波次状态无法稳定推进时仅靠截图验收战斗表现。

### 1.2 当前 Gameplay 表现（基于现有代码）

| 层/对象 | 当前实现 | 现存问题 / V4 机会 |
|---|---|---|
| 地图背景 | `BoardScene.create()` 将 Phaser Canvas 背景设为 `#101a1a`；`.game-stage` 有 CSS 径向渐变。棋盘外侧仍可能读成黑色空画布 | 需要让远景氛围在 Canvas/地图之外连续，不依赖纯色空幕；检查层级和移动视口裁切 |
| 地表 | `drawTerrain()` 按地图网格铺本地 terrain IDs；当前 Fantasy pack 有少量草地变化 | 虽非单一纯色，变化仍规则重复；缺少草地边缘、裸土、磨损等地块层次 |
| 道路 | 对每个路径格铺同一 stone-road 素材 | 格子重复纹样明显，路边没有过渡/磨损；需弱化“逐格拼图”观感，同时保留路线辨识 |
| 装饰 | `createDecorationPlacements()` 用地图 seed 产生确定性位置，当前地图绘制少量树/灌木/石块/旗帜 | 数量与尺度较克制，世界可居住感弱；须增加局部群落、路边语义和密度控制，继续避开逻辑单元 |
| BuildSlot | 本地石质 Sprite、悬停/选中高亮已存在 | 仍容易像带图标的插槽；需要更明确的地形嵌入、台座体积与接地影，默认低调 |
| Rift / Keep | 本地 Sprite 已接入并对齐 MapSpec 坐标 | 当前是静态对象，危险入口和守护目标的视觉识别/动势可再加强 |
| Tower / Enemy | Tower 使用独立 Sprite；Enemy Sprite 根据 `pathProgress` 位置更新，含 HP bar | 塔是静态摆件；敌人是连续平移图像，缺少步伐/悬浮节奏和方向感；活动单位尚未成为首要焦点 |
| 战斗反馈 | 已有放置光环、圆点 projectile、命中 flash、击杀粒子、波次横幅、金币文字、HUD 受击反馈 | 反馈存在但小、短或层级弱；放塔没有主体 scale/bounce，发射瞬间缺少清楚 muzzle cue，Base/HUD 受击反馈有限；需在真实运行中逐项验收而非重复造已有效果 |
| HUD | 单条 HP/Gold/Wave 资源板、暂停/速度控制、图像式 Tower Deck 与 Wave Start 已有 | 仍有若干 HTML 控件/边框质感；可进一步压缩资源区，增加费用/选中视觉重点，控制不抢战场焦点 |

### 1.3 Current → Problem → V4 Migration

| Current | Problem | V4 Migration |
|---|---|---|
| 草地与石路由少量重复 tile 构成 | 局部仍像规则等距棋盘 | 以受控变体、边缘过渡、轻量磨损组成可读地块；路径整体连续，不再强调每格边界 |
| 棋盘外是较深、空的背景 | 地图像摆在开发画布上 | 在 Gameplay 背景补一层低对比远景剪影、雾/暗角和柔和色阶，边缘不显空洞 |
| BuildSlot 是石台图片叠格子 | 看起来像可点击 UI 标记 | 台座与地面形成体积/接触影；交互只在 hover/选中时发光 |
| Rift / Keep 是静态 landmark sprite | 危险源与守护目标的角色语义不够强 | 以克制的脉动、裂隙辉光、旗帜/灯火/守护光表达身份 |
| 塔静止、敌人仅线性平移 | 地图物体没有呼吸和动作节奏 | 增加受限 idle / locomotion motion；所有表现位置仍由 GameState 采样，不驱动玩法 |
| projectile/flash/particle 已实现 | 对比度、发射瞬间与因果链不够醒目 | 优化 bolt 轮廓、muzzle flash、撞击位置与死亡/奖励衔接，并对照 Core 事件逐项验证 |
| HUD 已游戏化但仍偏面板 | 与地图争夺视觉权重 | 统一轻量资源条、状态标签、图标塔牌；让场景 > 战斗单位/路径 > HUD 的阅读顺序成立 |

## 2. V4 Goals

1. 第一眼先看见处于世界中的战场，而非暗色画布边界或外围 HTML 控件。
2. 通过地表变化、路径边缘、地标、远景和装饰，让 Border Outpost 看起来“有人居住并用于防守”，而不只是可计算地图。
3. BuildSlot、Spawn、Base、Tower、Enemy 都以地面锚点、体积、阴影和明确轮廓融入场景；路径与战斗单位仍易读。
4. 建塔、移动、开火、命中、击杀、漏怪、波次开始均有短促、清晰、由既有输入/Core state/event 驱动的反馈。
5. HUD 更轻、更像覆盖在战场上的游戏界面；重要资源、建塔选择、波次操作仍在目标视口内清楚可操作。
6. 所有装饰、动效、光效仅属于 Presentation；相同 MapSpec、Seed 与 Action Trace 仍得到相同 GameResult。
7. 修复或解释 V3 完整战役 E2E 阻塞，避免把运行状态不明误当成视觉完成。

## 3. Non-Goals

- 不推翻 V2/V3 的 Hub → World Detail → Level Select → Gameplay → Result 页面流程和 Gameplay 布局锚点。
- 不改 Game Core、tower/enemy archetype 或数值、economy、地图、寻路、波次、难度、胜负、Simulator、Metrics、Evaluation Agent 或 Creative Workflow。
- 不引入新前端框架、游戏引擎、运行时素材服务、MCP 依赖或 remote asset URL。
- 不在本轮开发新的游戏模式、关卡机制、技能、装备、多人、复杂镜头、3D 场景或大量主题世界。
- 不用大量纯装饰细节覆盖路径、敌人、血条、BuildSlot 或 HUD；不以 CSS 圆角/阴影微调代替地块/物件/动效工作。
- 不复制 Kingdom Rush 或其他作品的具体美术、地图、角色、塔造型、图标、UI 贴图或 Logo。

## 4. V4 Visual Direction Contract

### 4.1 体验阅读顺序

目标阅读顺序固定为：

1. **场景**：草甸、石路、林线和边境环境形成一个完整地点。
2. **战斗信息**：敌人入口 → 沿路敌人/塔 → 基地；塔与敌人有明确前后层次。
3. **操作 HUD**：资源条、塔牌、波次与暂停在需要时可见，不压过场景主体。
4. **瞬时反馈**：muzzle、projectile、hit、kill、leak、banner 在事件发生时短暂成为焦点，随后让回场景。

### 4.2 场景四层

| Layer | 内容 | 强度规则 |
|---|---|---|
| Environment | 连续地表、草地变体、土/石过渡、道路磨损、远景林线、轻雾/暗角 | 低对比、低频、不可遮路；背景不能再是一块突兀纯黑矩形 |
| Battle Objects | BuildSlot、Spawn/Rift、Base/Keep、Tower、Enemy、环境道具 | 以形状和地面接触影表达体积；危险入口、守护基地、敌人与防御单位一眼区分 |
| Combat Feedback | 放置弹跳、敌人步态、炮口闪光、投射物、hit flash、death、金币、Base 受击、Wave banner | 短时、分级、事件驱动；高压力反馈优先于装饰 idle |
| HUD / Overlay | HP/Gold/Wave、暂停/速度、Tower Deck、context、结果界面 | 轻量、少边框、图标明确；不挪动 V2 已验证的关键锚点 |

### 4.3 Art / readability rules

- 延续 V3 Border Outpost：手绘感、2.5D 等距、暖灰石路、松绿草甸、冷石守方结构、紫红裂隙、暖金交互。不得改变成像素风、写实 PBR 或混搭来源拼贴。
- Terrain variation 用于打断重复，不制造噪点：大色块先于纹理颗粒，路径轮廓始终高于草地细节。
- 远景 silhouette / fog / vignette 只在棋盘以外或低风险区域出现，棋盘边缘必须柔和过渡到背景；移动端不裁掉关键地标。
- 统一左上主光和右下接触影。所有会站在地面上的物件要有 foot anchor / shadow；不能只靠轮廓发光伪造体积。
- 阵营和状态不能只靠颜色区分。敌/友、合法建造/选中、HP 警报同时用形状、图标、轮廓、文案或明暗表达。
- Idle motion 的优先级低于输入和战斗：敌人被击中、基地受创、塔发射、wave banner 到来时，场景动势先强调此事件。
- 强烈运动不得造成地图点击区域、投影坐标、路径进度、Core 时间步或结算结果变化。

## 5. Gameplay Scene & HUD Spec

### 5.1 Environment / terrain

- 草地至少由 2–3 个已批准本地地表变化构成；加入小范围土色、草簇、浅石或路边磨损，用 deterministic seed 控制重复布局。
- 道路以连续带状路线阅读；边缘可有低对比土肩/磨损，但逻辑道路和路线中心继续严格取自 `MapSpec.paths`。
- 降低规律 tile 接缝和相同路块重复的可见度；地表 variation 不得改变 tile hit test、MapSpec 或敌人位置。
- Canvas 周边增加低对比氛围底：远处森林/山脊剪影，少量层叠雾，边缘 vignette；保证 Phaser Canvas 尺寸变化、HUD 叠层、手机安全区下不盖住地图。
- 远景必须是本地受控资源或程序化 vector 绘制，无运行时网络请求。fallback 可退为 V3 gradient + neutral ambient colors。

### 5.2 Battle objects

| 对象 | V4 表现 | 状态反馈 | 不变规则 |
|---|---|---|---|
| BuildSlot | 更厚实的石/木防御基座，明确体积、接触影，融入草地/道路边缘 | 闲置低对比；hover 轻亮；选中显著但局部；建造后塔落位 | 合法格仍来自当前 MapSpec/Core；装饰不能制造可建造暗示 |
| Spawn / Rift | 裂隙内核、外缘能量与落地阴影，提高危险方向辨识度 | 部署时低频呼吸；波次开始短促增强/脉冲；敌人出生点位置不变 | Visual pulse 不产出敌人、不改 spawn timer |
| Base / Keep | 加强堡垒轮廓、旗帜/火光或守护色，形成明确守护目标 | idle 极轻微；受击有基地局部闪光/震动与 HP HUD 提示 | 血量和受击次数只由 Core state/event 决定 |
| Tower | 塔基、塔身、炮口/顶端分层感；朝向由既有攻击事件目标方向作表现 | 建造 scale/bounce；idle 轻呼吸/旗帜；towerFired 时 muzzle flash + projectile；选中状态明确 | 塔种类、等级、射程/伤害仍用固定 config/Core |
| Enemy | 4 种 archetype 保持 V3 sprite identity，提供轻量脚步/bob 节奏和运动方向线索 | `pathProgress` 驱动位置；hit/slow/death 反馈清楚；HP bar 正确且不遮脸 | Core 仍决定路径位置、速度、生命、减速与死亡 |
| Props | 旗帜、树、石、灌木、木桩/路标、残墙等小批环境组合 | 极少量风动/摇曳；高压力时优先降级/停用 | 独立装饰 seed；不得占路、BuildSlot、Spawn、Base 或敌人视线关键区 |

### 5.3 Feedback specification

| 事件/输入 | 画面反馈 | 约束与验收 |
|---|---|---|
| 建塔成功 | 预览/塔体从约 0.75 倍弹至正常大小，短 bounce；脚下投影同步出现 | 只在 `towerPlaced` 后播放；不延迟 Tower state 变更；一轮约 120–220 ms |
| Enemy 移动 | 轻微 bob / 2–3 帧式步态感；沿当前 Core 投影点平滑显示 | 不插值反写 Core；不同速度可读，不因动画猜测速度值 |
| Tower 开火 | muzzle flash / bow spark，再发出轮廓易辨的 projectile 或 beam | 由 `towerFired` 驱动；塔/敌目标来源取事件字段；有数量上限和清理 |
| 命中 | 目标短闪、轻微方向性 hit spark，低血量血条保持准确 | 用实际 shot 的表现终点；不能让动画完成与否影响命中/伤害 |
| 击杀 / 奖励 | 敌人短淡出或粒子消散；`+N` 金币从死亡位置升起并与 HUD 资源变化关联 | 金币数量由 Core event；避免多个字条堆叠、减少动态模式静止显示 |
| Wave Start | 波次横幅从边缘/轻 scale 入场；Rift 短 pulse；约 1–2 秒后退出焦点 | 仅由 Core status/wave index 派生，不展示虚构倒计时 |
| Enemy leak / Base hit | Keep 短闪、微小屏幕/地图震动；HUD HP 图标/数值同步警示 | 仅由 `enemyLeaked` 与最新 Core HP 触发；减少动效时仍有颜色/图标/文案提示 |
| Victory / Defeat | 当前已有 Result Screen 加清晰场景式分级、胜负色彩与胜利/失败焦点 | 不阻塞结算持久化、重玩、回到世界；不是普通 toast 替代 |

**动效预算：** 首版只做可读、短促、少量同时发生的 tween/粒子。提供 active projectile/particle cap、scene destroy cleanup、`prefers-reduced-motion` 降级；低端移动端可禁用远景雾动画和装饰 idle，保留命中、HP 与胜负信息。

### 5.4 HUD & Tower Deck

- 资源区从多个可见独立小框收紧为统一资源条：心/基地生命、金币、波次使用高辨识图标 + 大数字 + 少量分隔，不重复长标签。
- 右上状态是非交互轻量标签；Pause、Speed 保持图标优先和可访问名称，降低按钮底色/边框对战场的注意力竞争。
- Tower Deck 维持四塔和固定底部锚点；塔像牌面而不是普通按钮：portrait 更大、价格更醒目、名称更短。hover/focus 有亮边；选中态有非颜色标志；金币不足清楚但不灰到不可读。
- Wave Start 是塔栏内单一主动作，战斗中状态明确；不增加功能不明的 HUD 装饰按钮。
- `WorldSkin` 可改变色彩、材质和图案；各主题的 HP / Gold / Wave / Tower / Wave Start 布局坐标保持一致。
- 通过实测 bounding boxes 确认 HUD、tower card、wave control 与 Phaser Canvas 在 1440×900、1280×720、390×844 下不相互遮挡。窄屏可压缩卡片但不可隐藏主要操作。

## 6. Asset & Presentation Contract

- 优先复用 `ASSET_MANIFEST.json` 与 `THEME_REGISTRY.json` 中的 V3 Border Outpost 原创本地素材；先做组合、尺寸、层次和少量定向变体，不因“需要更多内容”而扩大成套外购范围。
- 新增的地表/远景/粒子素材需要 Asset ID、source/license/credit、theme family、显示用途与 fallback；运行时只解析本地批准 ID。
- 同一物件的状态通过程序化 tint/halo/alpha/scale/tween 表现；核心机制不允许 AI/主题素材更改。
- 新 asset 需要确认和 V3 的 52×32 iso cell、sprite footpoint、目标视口显示尺寸和纹理边缘兼容。资源缺失必须退回 V3 local assets / neutral / gradient。
- 远景与地表 variations 的种子来源只影响 presentation；不能复用或推进 Game Core RNG 状态。

## 7. Architecture Boundaries

```text
Canonical GameState / GameEvent / MapSpec
                  ↓ read-only
Gameplay Controller → Phaser BoardScene / Presentation helpers → Canvas + HUD
```

- 本轮预计集中在 `BoardScene`、presentation helpers、HUD markup/style、local asset resolver 和 E2E/visual tests。
- 保留 `Game Core → GameplayController → Phaser` 单向关系；不让 Phaser scene 或 DOM 状态修改核心计算结果。
- 所有表演状态从现有 `GameEvent` / `GameState` 触发或派生。现有 `towerFired`、`enemyKilled`、`enemyLeaked`、`towerPlaced`、`statusChanged` 的语义要先确认，再接入表现。
- Phaser tweens、shaderless fog、particles、camera nudge、terrain variation 均不可决定攻击命中、塔落点、敌人坐标、tick 时长、资源变更或 GameResult。
- 未完成 V3 波次状态 E2E 排障前，不能把已开始 wave 当作 V4 战斗反馈验收通过。测试要覆盖真实 GameState/Result，视觉帧单独作为展示证据。
- 不将 V4 的计划文档、Codex Skills 或 MCP 内容接入 Runtime。

## 8. Current File / Module Analysis

| 文件 / 模块 | 当前职责 | V4 拟议变化 | 主要风险 |
|---|---|---|---|
| `apps/game/src/main.ts` | 主入口组合根；`BoardScene` 内含 `drawTerrain`、塔/敌绘制、投射物/粒子、输入和 scene resize | 在最小范围加 terrain variation、对象 depth/motion 和事件反馈调度；若实现膨胀可拆小型 `battlefield-presentation` helper | 组合根体量继续增长；scene 重建/换图/resize 导致 tween 孤儿或对象重叠 |
| `apps/game/src/game/gameplay-controller.ts` | Fixed-tick Game Core facade | 默认不改；仅用于调查 E2E tick 与 Core status 行为，不放美术逻辑 | 若为视觉方便修改 tick 或 status 会破坏玩家/模拟一致性 |
| `apps/game/src/game/board-projection.ts` | MapSpec 网格 → Canvas 投影/可点击反投影 | 验收 landscape/mobile 远景层坐标、对象 ground anchors、canvas resize 后 layer fitting | 背景缩放改变 projection 会造成误点或单位偏格 |
| `apps/game/src/presentation/deterministic-decoration.ts` | 确定性 cosmetic placements 与逻辑格避让 | 如需增加场景小物，扩充候选分类、cluster 和安全区，不改 Core MapSpec | 装饰密度过高会遮挡敌人和合法 BuildSlot |
| `apps/game/src/presentation/local-game-assets.ts` | manifest id → 本地 Vite asset URL/key | 如新增 variation / ambient layer，继续采用校验 ID 与明确 fallback | 错误 ID 在 production 变成空纹理 |
| `apps/game/src/presentation/world-skin-resolver.ts` | WorldSkin / theme pack 与 fallback | 检查 palette 对雾、远景和 HUD 的组合；保持 layout 不随 ThemeFamily 分叉 | CSS/asset family 分支增加维护成本 |
| `apps/game/index.html` | HUD、Tower Deck、Pause/Context/Result DOM slots | 只在 HUD/按钮需要语义调整时改 markup，保留可访问名称和测试选择器稳定性 | DOM contract 变化会破坏 Playwright 与 aria-live |
| `apps/game/src/style.css` | Stage/Canvas/HUD/controls/feedback 的 responsive 与 reduced-motion 样式 | 加强战场层次与轻 HUD、动效优先级、窄屏安全区 | CSS 背景层与 Phaser canvas 层次不一致；小屏内容溢出 |
| `assets/library/ASSET_MANIFEST.json`, `THEME_REGISTRY.json` | 本地游戏资产合同与主题映射 | 只登记验收通过的新变化/远景图；可程序绘制则优先避免无谓资产 | Registry 和本地 bundle 不一致 |
| `tests/v3-visual-assets.test.ts` / `tests/e2e/*` | asset/determinism tests 与 browser flows | 增加 V4 层级、减弱动效、屏幕适配、真实 gameplay event capture；先修完整 Easy flow 阻塞 | 截图测试可能因动态表现不稳定；需固定 seed 并区分逻辑/视觉断言 |
| `qa/evidence/*` | 既有 V3 gameplay/viewport/production captures | 新增 V4 部署、战斗、tower hit/kill、base hit、窄屏对比截图与录屏 | 旧截图不能代表新代码或真实运行状态 |

## 9. Priority

| Priority | 交付内容 | 说明 |
|---|---|---|
| **P0 — 游戏场景成立** | V3 完整战役 E2E 排障；地表/道路减少规则拼块感；BuildSlot 体积与接地影；Spawn/Rift 与 Base/Keep 强化辨识；塔/敌在运行战斗中的可见度与运动；部署/攻击/命中/击杀/基地受击/wave 反馈有真实证据 | 这部分决定玩家能否看到“发生了什么”；先修可验证性，再增强演出 |
| **P1 — 世界可居住且 HUD 收敛** | 路边磨损/土肩与少量装饰群落；远景林线/柔雾/暗角；轻量资源条；Tower Deck 牌面比例、费用和选中态；低动效/窄屏 polish | 以少量、统一且不遮挡为准；保持当前布局锚点 |
| **P2 — 氛围与扩展 polish** | 更丰富背景层次、额外地表变化、稀少 ambient particles、细粒度塔 idle/旗帜动画、WorldSkin ambience variants | P0/P1 可玩性/可读性通过后再做；不能拖延完整战斗链路 |

## 10. Phase-by-Phase Implementation Plan

### Phase 0 — Baseline & V3 Combat E2E Gate `[P0]` `[x]`

- **Goal：** 建立可信的当前状态和战斗事件证据，先解决 V3 release gate 中断点。
- **Files / Modules：** `docs/v3/plan.md`、`tests/e2e/complete-playthrough.spec.ts`、`apps/game/src/main.ts`、`GameplayController`；输出写入 `qa/evidence/`。
- **Required Changes：** 用 trace/只读 debug instrumentation 确认 Phaser update、Core tick、spawn queue、active enemies、waveComplete、terminal result 是否推进；定位原因后只改真正的问题，不以放宽断言替代修复。捕获 V3 baseline，并标出黑边、规则 tile、对象层次、实际战斗反馈可见性。
- **Acceptance Criteria：** Easy 至少能通过真实输入走过一波并进入下一状态/终局；Playwright 断言使用真实 state/API/result；不构造或伪造 `GameResult`。
- **Tests：** 单场完整 Playwright flow；对照 Core/Simulator 同 seed/action 结果不变；保留 trace 与 state 采样摘要。
- **Risks：** V3 的时间/状态问题与表现层问题混淆；instrumentation 不应渗入生产规则。
- **Tasks：**
  - [x] 调查第一波 `combat` 超时，确认服务器 headless Chromium 的 WebGL/SwiftShader 渲染拥塞令 Core 时间远慢于墙钟。
  - [x] Playwright 环境改用 Phaser Canvas renderer；生产浏览器仍使用 AUTO。Core 规则与 controller fixed tick 未改。
  - [x] 保存 idle/deployed/combat/hit-or-kill/base-hit 的运行截图。

### Phase 1 — Environment Layer & Terrain Pass `[P0]` `[x]`

- **Goal：** 让棋盘处于一个可识别的边境环境里，打断平面草地和规则棋盘感。
- **Files / Modules：** `BoardScene.drawTerrain()` 或小型 scene renderer、`deterministic-decoration.ts`、`style.css`、manifest/registry（仅有必要时）。
- **Required Changes：** 扩展地表变化与 deterministic tile selection；增加道路边缘过渡/磨损层；Canvas 外围以低对比远景色层承接 Stage；检查四边留黑和地图外轮廓；背景细节不压制单位。
- **Acceptance Criteria：** 同 seed 截图稳定；地图各地表有变化但路线优先级最高；正常态无明显网格；Canvas 背景与页面背景过渡自然；手机地图不裁切或出现突兀大黑区。
- **Tests：** asset id/fallback 单测；seed deterministic test；Phaser 实际运行下的 1440×900、1280×720、390×844 截图。
- **Risks：** 瓦片变化出现棋盘噪声、远景侵占可玩区域、跨视口渐变显著不同。
- **Tasks：**
  - [x] 以现有本地草地素材和确定性 tint 形成 2–3 种同画风地面表现。
  - [x] 形成道路土肩/轻磨损层，严格按实际 MapSpec path 组合。
  - [x] 加入低对比远景、林线、边缘 vignette；V3 gradient 仍是 CSS fallback。
  - [x] 在 1440×900、1280×720、390×844 截图中复核密度、重复度和棋盘边缘。

### Phase 2 — Landmarks, BuildSlots & Scene Depth `[P0]` `[x]`

- **Goal：** 让入口、目标与建造位真正像世界中的物体而非格子标记。
- **Files / Modules：** `main.ts`/BoardScene terrain layer and object depth、local asset resolver、少量原创本地素材（必要时）。
- **Required Changes：** 加强石台/木台的体积轮廓和独立 shadow；Rift 使用静态完整轮廓 + 可读 emissive/pulse；Keep 增强旗帜/城防层次和守护识别色；统一对象 depth 与 ground anchor；加低风险 ambient layer。
- **Acceptance Criteria：** idle 时 BuildSlot 融入场景但可识别，hover/selected 高亮唯一且明确；Spawn 的危险感与 Base 的守护感不靠颜色 alone；装饰和 glow 不遮路径/单位/操作。
- **Tests：** MapSpec 到 sprite footpoint 对齐 smoke；悬停合法/非法位置画面对照；path/build/spawn/base safety property； reduced-motion snapshot。
- **Risks：** 发光过多抢焦点；对象阴影和 tile 层深度顺序错误；装饰误导可建区域。
- **Tasks：**
  - [x] 降低 idle BuildSlot 对比，保留接地影和唯一 hover/selected 暖金状态。
  - [x] Rift 增加受限脉动；Keep 在受击时 tint、短震动并联动 HUD/camera。
  - [x] 确定性 Props 密度从 10 提升至 16，继续避让道路、BuildSlot、Spawn、Base 安全区。

### Phase 3 — Living Towers & Enemies `[P0]` `[x]`

- **Goal：** 让战斗单位成为地图焦点，而不是静态 icon。
- **Files / Modules：** Tower/Enemy draw/update helper、`main.ts` GameState presentation、现有 sprites；不扩展 Archetype。
- **Required Changes：** 让敌人有轻量 bob/step 和朝向变化线索；塔增加克制 idle，发射时朝目标的 muzzle cue；提升敌人、塔对照环境的尺寸/轮廓可读性。表现位置基于 Core 坐标，只在 render transform 上加小偏移。
- **Acceptance Criteria：** 敌人沿路持续可追踪；塔/敌人在实际缩放下辨识；攻击时玩家看出发射单位、目标和方向；Reduced Motion 下有静态清晰替代。
- **Tests：** 固定 seed 浏览器战斗；enemy visual position 与 Core `pathProgress` 误差在约定视觉偏移内；pause freezes simulation and relevant motion; no game-result changes across motion preference.
- **Risks：** Sprite bobbing 与道路高度/脚点脱离；大量单位 tween 引起性能/清理问题；塔 idle 造成伪命中感觉。
- **Tasks：**
  - [x] 4 种敌人共用轻量 bob，并按下一路径点翻转方向；大小继续按 archetype 区分。
  - [x] 塔拥有轻微 idle 与事件驱动 muzzle flash；无攻击时不持续闪亮。
  - [x] 在真实第一波/完整战役截图中实测塔、敌对比、大小和遮挡。

### Phase 4 — Combat Feedback Chain `[P0]` `[x]`

- **Goal：** 将已有反馈升级为能看懂输入、攻击和后果的一条实时因果链。
- **Files / Modules：** `consumeBattleEvents()`、BoardScene effect helpers、HUD classes、`style.css`、Playwright event fixture。
- **Required Changes：** 放塔 bounce/shadow；muzzle → projectile → hit flash → kill/death → gold；wave banner + Rift pulse；enemy leak → Keep reaction + HUD HP flash。以现有事件语义为准，不误把 `towerFired` 的动画当成命中确认；装饰效果要有 cap、dispose 和 reduced-motion path。
- **Acceptance Criteria：** 每段因果都有真实 Core event/state 来源；可以在实际运行录像中辨认；关掉动效时状态与结果仍明确；不改 Core 输出或 tick 时间。
- **Tests：** Game Core 固定 action/seed result snapshot 前后对比；event-to-feedback mapping tests；E2E 至少捕捉 placement、shot/hit/kill 或 leak、wave banner；pause/restart/scene leave 后无 orphan tweens。
- **Risks：** 事件密集造成屏幕闪烁、目标太小看不见 projectile、跨 Scene timer 迟到改 DOM。
- **Tasks：**
  - [x] placement 使用基于 scene clock 的主体 scale/bounce；现有接地影保持同步位置。
  - [x] 增加 muzzle/projectile/hit 因果呈现，保留 projectile/particle 上限和清理。
  - [x] 击杀奖励数值从敌人死亡位置上浮，并保留中央可访问消息。
  - [x] wave banner、Rift pulse、Keep/HUD/camera base damage 联合反馈已接入真实事件。

### Phase 5 — HUD & Tower Deck Finish `[P1]` `[x]`

- **Goal：** 把 HUD 再压低一级视觉权重，仍保留即时战斗可操作性。
- **Files / Modules：** `index.html`、`style.css`、`renderHud()`；保留 stable selectors 与 accessible names。
- **Required Changes：** 收紧 HP/Gold/Wave 成一个资源条；降低 Pause/Speed 的按钮表面；加大塔图/小化名字、突出价格与选中亮边；状态标签不是主按钮；保持 Wave Start 是唯一主操作。
- **Acceptance Criteria：** 第一眼是场景、第二眼单位/路径、第三眼 HUD；在高亮/低资源/窄屏状态信息仍能读取；键盘焦点与辅助文本保留。
- **Tests：** Playwright bounding box、aria role/name、keyboard focus、low gold disabled and selected states；desktop and 390×844 captures。
- **Risks：** 过度缩小 UI、icon 失去语义、Tower Deck 压缩地图视口。
- **Tasks：**
  - [x] HP/Gold/Wave 保持单条资源板，不更改 HUD 数据合同。
  - [x] 弱化右上控件表面；保留图像优先塔牌、醒目费用、选中轮廓及 Wave 主操作。
  - [x] 检查窄屏、图标/文字冗余与高对比 focus；修复 renderHud 覆盖 icon DOM 的问题。

### Phase 6 — Polish, Performance & Regression Gate `[P1/P0 Gate]` `[x]`

- **Goal：** 证实 V4 表现不损害规则、输入、可读性、性能和上线运行。
- **Files / Modules：** game assets, all changed presentation modules, tests, QA screenshots, `docs/v4/plan.md`。
- **Required Changes：** 在低动效、缺失素材 fallback、低端/窄屏场景抽查；清除 orphan effects；检查 PNG bundle 增量；对照 V3/Core/Simulator rule checks；修复之前 V3 完整 Easy E2E blocker。
- **Acceptance Criteria：** P0 DoD 全通过；完整 E2E 完成一轮真实 wave/outcome；`pnpm verify` 与 `pnpm test:e2e` 全过；production base `/fantasy-frontiers/` 资源可加载；没有改玩法规则或引入 remote runtime assets。
- **Tests：** `pnpm verify`、`pnpm test:e2e`、Manifest/reference audit、desktop/mobile screenshot audit、production subpath smoke；V4 screenshot evidence 更新。
- **Risks：** E2E test flake 盖住真实游戏 bug；资产越加越大；某种 motion preference 下 feedback 丢失。
- **Tasks：**
  - [x] 运行真实 Easy 六波胜利/result/persist/restart 流程并刷新证据。
  - [x] 回归 Pause/Resume/Speed/Restart/Build/Upgrade/Result/World return。
  - [x] 44 个 Core/Simulator/Metrics 等 Vitest 测试通过；表现改造未触及 Core 行为文件。
  - [x] `pnpm verify`、`pnpm test:e2e` 与 production subpath smoke 均通过。
  - [x] 更新 V4 状态、QA 事实文件和截图证据。

## 11. Validation Plan

### 11.1 Unit / Integration

- Terrain/decor variation 对固定 map seed 确定性；不接触 Game Core RNG。
- Decoration 保持避让路径、入口、基地、建造位安全区。
- Event → visual effect 的映射只消费现有 GameEvents；可视状态不可 dispatch gameplay actions。
- 移动/idle effect 完全依赖渲染 delta，不改变 Core elapsed time / enemy path progress。
- Reduced Motion 开关不改变固定 seed/action 的 `GameResult`。
- Scene restart/destroy 清除所有 active tween, timer, sprite, particle。

### 11.2 Playwright / Visual Runtime

1. 打开默认世界 Easy 并捕获 `idle/deployed`。
2. 在合法位造塔，检查弹跳、shadow、金币状态。
3. 开始波次，看到 Rift pulse、Wave Start banner、敌人移动。
4. 捕获塔发射、projectile、hit、death/reward 或 leak/base damage 的一条真实反馈链。
5. 验证塔栏、暂停/恢复、1×/2×、升级与 Result flow；波次不得靠测试伪造完成。
6. 同一战斗流程在 `prefers-reduced-motion` 下仍可辨认并得到相同 Core outcome。
7. Desktop 1440×900、1280×720 与 mobile 390×844；检查 map fit、HUD overlap、terrain edge 和外部背景衔接。

### 11.3 Project verification

- 文档仅规划；进入代码实施后必须依仓库 `AGENTS.md`：补 focused tests、运行 typecheck/test/build，最后 `pnpm verify`；存在 E2E 时运行 `pnpm test:e2e`。
- 发布验收使用 `/fantasy-frontiers/` production base，检查 HTML/JS/CSS/assets/API/Phaser Canvas。
- 只用真实运行 canvas/trace/screenshot/recording 证明视觉和交互，不以概念图代替可玩证据。

## 12. Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| 地表变体变成视觉噪声或棋盘花纹 | 让大形优先、限制变体频次；用缩小到实际视口的截图复核路线连续性 |
| 远景/雾/vignette 让背景更黑或更像编辑器 | 先做低对比色阶，测地图外轮廓；提供明确 gradient fallback，避免新增大块纯黑 |
| 装饰物挡路径、BuildSlot、敌人或敌人血条 | seed deterministic；逻辑格与视线通道禁放；以运行中单位截图验收 |
| tween 堆积影响性能或游戏更新 | 对 ambient motion 限数/休眠；场景销毁清理；只降低表现频率，不修改 simulation speed |
| projectile 动画被误认为 Core 命中依据 | 只表现 Core 已发出的 `towerFired` 和其目标快照；伤害/击杀仍以 Core state/events 为事实 |
| 相机震动/闪光引起不适或可访问性问题 | 轻幅短时；Reduced Motion / low intensity path；HP 文案和图标仍保留 |
| HUD 收缩损害触控和易读性 | 用目标 viewport 真实点按测试；保持最小触控面积与按钮名称 |
| V3 运行中 E2E blocker 被视觉改动掩盖 | Phase 0 独立追踪 tick/status/event evidence；不降低结果断言；失败保留 trace |

## 13. V4 Definition of Done

- [x] 第一眼可见完整、自然过渡的边境场景；地图外围不再显得像黑色开发画布。
- [x] 地表存在受控变化，石路有整体连贯感且不再强烈呈现规则拼块。
- [x] BuildSlot 像地面上的防御基座；hover/selected 有清楚但局部的状态表现。
- [x] Rift/Spawn 危险可辨，Base/Keep 是明确守护目标；Idle 与受击反馈都克制、可靠。
- [x] 4 种 Tower 与 Enemy 在战斗中有实际可见度和基础运动/开火反馈，不是静态地图图标。
- [x] 建塔、muzzle/projectile/hit、kill/reward、wave start、base damage 中的关键链路真实可见；反馈来自输入/Core event/state。
- [x] 环境装饰提供边境生活/防守语义且避开所有关键逻辑/视觉通道。
- [x] HUD 是轻量覆盖层，资源/塔牌/控制/波次明确，且不抢场景主体。
- [x] desktop 与 390×844 mobile 场景无关键遮挡/裁切；Theme layout 未分叉。
- [x] Reduced Motion、缺素材 fallback、scene cleanup 可用；运行时不依赖网络素材、Skill 或 MCP。
- [x] 同一 seed/action trace 的 Core/GameResult 与 V3 一致；Simulator/Metrics/AI 系统没有因表现修改变化。
- [x] V3 Easy 完整战役 E2E 阻塞已经解决并有真实 Result/持久化证据；`pnpm verify`、`pnpm test:e2e` 和 production subpath smoke 全通过。

---

**V4 执行原则：** 让场景先成立、让物体站稳、让事件有回应、让 HUD 退到战场之后。表现增强服务可读性和玩家动作；规则事实始终只由 Game Core 决定。
