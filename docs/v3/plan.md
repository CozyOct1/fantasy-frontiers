# Fantasy Frontiers V3 Visual Pass 计划

> **版本目标：** 完成 V2.1 Visual Pass：把已经独立的 Gameplay Scene 从可玩原型推进到有统一视觉语言、正式本地素材和清晰战斗反馈的游戏画面。
> **当前状态（2026-09-20）：** V3 视觉实现已落地，`pnpm verify` 通过；Manifest 本地文件审计、桌面/移动截图以及 production 子路径线上 smoke 已完成。发布门仍未通过：当前完整 Easy 战役 Playwright 在第一波持续处于 `combat`，100 秒内没有回到部署状态或进入结算，详见第 14 节。不得据此声称完整战役回归通过。V3 最新视觉证据见 `qa/evidence/v3-gameplay-*.png`。
> **范围原则：** 首先完整制作“边境哨站”一个官方默认世界。V3 不扩展玩法，也不要求一次性为所有 WorldSkin 制作全套资产。

## 1. Current State Assessment

### 1.1 V2 已有基础

- Hub / Gameplay / Result 已分离；Gameplay 使用全屏 Phaser Canvas，HUD、Tower Bar、Pause 和 Context Panel 为覆盖层。
- 左上 HP / Gold / Wave、关卡标识、右上 Pause / Speed、底部塔栏和 Wave Start 的位置关系已经确定。本轮保留其信息架构和交互语义。
- 网格、路径、建造位、Spawn、Base、塔和敌人仍主要由 `apps/game/src/main.ts` 内的 Phaser Graphics 绘制。Tile 描边已弱化，但地图主体仍由几何块组成。
- 已有 `GameplayController`、等距投影、Tower Context、Result Flow、事件反馈和 WorldSkin resolver。V3 只增强呈现层，不改这些系统的玩法责任。
- `WorldSkin` 已能解析 palette 与本地 Asset ID，但战斗地图目前仍以 Vector fallback 为主。

### 1.2 Asset Library 现状

- `assets/library/ASSET_MANIFEST.json`、`THEME_REGISTRY.json`、`CREDITS.md` 和 `ASSET_REVIEW.md` 已建立，运行时素材仍限定为本地批准资源。
- Neutral SVG 包含 background、panel、button、decoration、enemy、frame、tile、tower 等占位素材；它们不能替代正式等距地图、塔和敌人美术。
- 当前唯一导入的第三方素材是 Kenney Fantasy UI Borders 的一个边框 PNG，许可已记录为 CC0-1.0。此前搜索未找到合适的塔/敌人/地形包，因此 V3 必须重新按当前明确的 2D 等距合同筛选素材，不能假设旧搜索结果足够。
- AssetMCP 可用于开发期搜索、授权检查、下载、预览与 provenance 辅助；游戏运行时只读项目本地 Asset Library，不依赖 MCP 或网络素材地址。

### 1.3 主要视觉问题与迁移方向

| Current | 问题 | V3 目标 |
|---|---|---|
| 地表、道路和实体以纯色几何块为主 | 像 Debug Preview，地表没有材质和空间层次 | 先建立连续可读的地表/石路，再以正式物件与阴影分层 |
| 大多数 tile 都有边线；多个建造位同时高亮 | 编辑器感强，建造位抢走焦点 | 默认几乎无 Grid；只强调 Hover、合法建造态和 Selected Slot |
| BuildSlot、Spawn、Base 是基础图形 | 缺少明确世界物件轮廓 | 使用石质防御基座、主题裂隙/门、边境堡垒 Sprite 或经批准的本地 Vector fallback |
| 塔和敌人以圆/矩形标识 | Archetype 与阵营辨识依赖文字和颜色 | 通过统一风格 Sprite、轮廓、朝向、等级/血条状态识别 |
| HUD 各元素像独立网页 Card；底栏像 HTML 按钮组 | 材质、图标和层级不统一 | 统一 HUD 底板；资源用图标优先表达；塔栏成为 Tower Deck |
| 基础事件提示已有，但画面反馈较弱 | 攻击、命中、金币和基地受击缺少连贯层次 | 事件驱动 Projectile、Hit、Death、Gold 与 Base feedback |
| Hub 世界列表与空工坊信息较稀疏 | 世界没有成为可识别的内容卡片 | V3 P1 再补世界缩略图卡和工坊 Empty State，不抢占 Gameplay 资产主线 |

**边界说明：** 玩家提供的是视觉诊断与方向建议，不包含本轮可直接审阅的四张原始截图。因此阶段验收必须在当前部署页面和真实目标视口截图进行，不能只依据这份文字或概念图宣布视觉完成。

## 2. V3 Goals

1. 保留 V2 已验证的 Gameplay Screen Flow、HUD 锚点和交互，将表现层替换为统一、可读的原创等距幻想边境视觉语言。
2. 首先让“边境哨站”拥有一致的地形、石路、BuildSlot、Spawn、Base、4 种塔、4 种敌人与基础 UI 图标资产。
3. 把 Grid 从常驻信息降为调试/交互反馈；玩家仍能准确判断道路、入口、基地、合法建造位和敌人位置。
4. 让 HUD 与 Tower Deck 以图形、材质、明度和动效层级传达 HP、Gold、Wave、塔类型、可建造、选中、危险等状态。
5. 让战斗事件形成可观察的反馈链：发射 → 命中/伤害 → 击杀 → 金币；漏怪 → 基地受击。
6. 所有素材有明确本地 Asset ID、来源、许可、展示尺寸、投影/锚点和 fallback；没有有效素材时游戏仍能启动和游玩。
7. 不改变 Game Core、MapSpec、路径、建塔合法性、难度、经济、波次、胜负、Simulator 或 Evaluation 行为。

## 3. Non-Goals

- 不重做 V2 已通过的全屏战场布局和页面流程；不把 Gameplay 改回 Web Dashboard。
- 不改塔/敌人 Archetype、数值、碰撞、路径、地图合法性、胜负状态、经济或 Core 事件语义。
- 不在 V3 P0 同时扩建 Steampunk、Ocean、Dark Fantasy 全套美术；其他世界继续使用已存在的主题 token 与可读 fallback。
- 不做大量高级粒子、全场景骨骼动画、复杂材质 Shader、镜头系统或完整 3D pipeline。
- 不把概念图、生成图或 ASSETMCP 预览误当成已通过许可检查、已导入、已在 Phaser 运行验证的正式资产。
- 不让 LLM、任意图片 URL、远程素材服务、Skill 或 MCP 成为运行时 Asset Source。
- 不复制 Kingdom Rush 等参考作品的具体角色、塔、地图、图标、边框或独特视觉资产。

## 4. V3 Art Direction Contract

### 4.1 默认世界：边境哨站

- **媒介：** 2D 等距塔防场景；材质采用手绘质感的简化 Sprite/Tile，形体有明确体块和接触阴影，避免写实纹理噪声、像素拼贴或混用不同来源的渲染风格。
- **世界身份：** 王国边境的旧石路、森林草甸与前线防御工事；地标是可辨的边境堡垒与敌军裂隙。场景不能退化成通用绿色棋盘。
- **投影/尺度：** 先读取现有 `board-projection.ts` 确认格子宽高比、锚点、屏幕缩放和 Sprite 占格范围；资产以 Phaser 实际投影为准，不将“2:1 等距”当成未经核对的假设。
- **轮廓语言：** 环境大形圆润自然，石材/防御物轮廓厚实；塔比地表有更清楚的垂直轮廓；敌人轮廓要能在目标显示尺寸下区分 normal / fast / tank / boss。
- **材质/光照：** 统一左上主光源，地面接触影往右下；石路用暖灰褐、堡垒用冷石灰与蓝/金防守识别色，敌方裂隙用紫红/暖红危险色，交互高亮用暖金。深松绿只用于环境，不再同时承担交互或危险语义。
- **明度：** 路径、可建造位、敌人和基地相对所在底色必须有稳定明度差；低色觉区分时同时使用轮廓、图形和文字/状态标记，不依赖纯颜色编码。
- **UI 材质：** 使用统一的防御工事石/皮革/金属质感或经过验收的 Kenney border 作为少数锚点。通过底板、分隔、阴影、图标和层次区分信息；避免每个元素套同一圆角矩形加 1px 绿色边框。
- **反例：** 纯色菱形地图、整屏明显 Tile 边框、十二个高亮圆盘、不同画风的外购素材混用、过度纹理盖住道路/血条、用红绿两色作为唯一状态提示。

### 4.2 关键视觉时刻

1. **部署：** 玩家点击低对比石台后，局部进入可操作状态；Tower Deck 聚焦，选择塔后落在格点上，出现短暂落地/弹性反馈。
2. **迎敌：** 视线沿石路从紫红裂隙移向蓝金堡垒；Wave Start 是醒目但不覆盖路径的单一主动作。
3. **塔击杀：** 塔的攻击方向与 Projectile 清楚；受击闪光、伤害数字和死亡反馈短促、不遮挡其他敌人，金币提示指向奖励变化。
4. **基地受创/终局：** HP 警示通过图标/明度/文案共同传达；Victory/Defeat 延续当前世界的色彩和地标，不使用普通网页 Toast 代替结果表现。

## 5. Target Gameplay UX — V2 结构保留，视觉替换

### 5.1 Layout 与 HUD

| 区域 | V3 目标 | 验收边界 |
|---|---|---|
| 左上资源区 | 统一轻量 Game HUD 底板；一排心/盾、金币/水晶、波次图标和数字，例如 `♥ 30/30 · ✦ 500 · 波次 0/6` | 不再是三张相同 Dashboard Card；图标来自批准 SVG/PNG 或同风格本地 Vector；中文标签仍可读 |
| 顶部关卡信息 | 世界/关卡名保持原锚点；“部署阶段”降为小型游戏状态标记；初次进入可有短暂部署提示 | 不加永久大标题；提示淡出不影响输入和模拟 |
| 右上战斗控件 | Pause / Speed 使用图标优先但有可访问名称/Tooltip；沿用当前行为 | 触控、键盘聚焦和 disabled 状态均可读；布局位置与 V2 相同 |
| 中央地图 | Terrain、Path、Decoration、BuildSlot、Spawn、Base、Tower、Enemy、VFX 分层绘制 | 关键路径、BuildSlot、入口、基地不被装饰或 Sprite 遮住 |
| 底部 Tower Deck | 4 个固定塔 Archetype 的小型视觉牌：塔图/剪影优先，名称与费用其次；悬停/焦点才展开伤害、射程、描述 | 选中、余额不足、disabled、hover/focus 状态一眼可辨；塔和费用仍来自固定 config |
| Wave Start | 右下/底部靠右的唯一高显著度行动，配 Play/Wave 图标和“迎击第一波 / 开始下一波” | 使用 Core `status`/`waveIndex` 派生；战斗中禁用/隐藏，不自维护倒计时或虚构下一波时间 |

V3 先沿用现有 HUD 控件几何位置；只允许为塔卡片和统一底板作小幅尺寸调整，并用 Playwright bounding box 检查遮挡与窄屏回归。

### 5.2 Tower Deck 图标信息结构

- 卡片主体显示批准的塔 Sprite portrait 或原型资产的清晰剪影；低分辨率/资产缺失时回退到统一 SVG/Vector Archetype 图标。
- 常驻文字最多为短名称与费用；伤害/射程/主题描述通过 `title`、Tooltip 或 aria 描述在 Hover/Focus 出现，不铺满四张卡片。
- 可建造性只用 Core 当前 Gold 与固定 Cost 推导；选择塔只是 Presentation 状态，点合法 BuildSlot 才向 Core 派发动作。
- Archetype 使用图标、轮廓、短名共同区分，不得只有不同颜色。

### 5.3 地图与交互物状态

| 对象 | 默认态 | Hover/选择态 | 禁止事项 |
|---|---|---|---|
| Grid | 几乎完全隐藏；Debug 绘制仅在开发调试选项开启 | Hover 只显当前 Tile；建造状态显示 Core/MapSpec 提供的可建造候选或当前合法 Slot 轮廓 | 不可把所有 Tile 边线当成普通状态 |
| BuildSlot | 低对比石质台座，有地面影；与环境材质融合 | hover/keyboard focus 显微弱外轮廓；选中后出现暖金高亮和局部选择反馈 | 不让所有空位同时发亮；不能用装饰替代合法性标记 |
| Spawn | 有方向/中心焦点的裂隙、门或洞穴视觉对象 | wave running 时有短促能量/光效 | 不遮挡敌人 Spawn 坐标，不由装饰偏移逻辑坐标 |
| Base | 小型石堡/哨塔/旗帜轮廓，冷蓝石材配金色阵营细节 | 低 HP 时形状/图标/亮度/提示共同预警 | 不能只把终点 tile 染成红色/金色 |
| Tower / Enemy | Sprite 主体、独立投影阴影、合适的地面锚点 | 选塔轮廓、塔等级徽记；敌人血条清楚 | VFX 和血条不得改变点击坐标或 Core 状态 |

## 6. Asset Contract & Acquisition

### 6.1 首套官方资产范围（边境哨站）

**P0 必需资产：**

1. 地表：草地至少 2 个轻微变体、石路直线/转角/端点/分叉或足以根据现有路径组成连续石路的 Tile/图层；若拼接成本不合适，可用一个可平铺地表 + 代码绘制路径边缘 fallback。
2. 建筑/标记：BuildSlot 石质基座 1 套（空闲/选中由程序态表现）、敌人入口裂隙/门 1 套、边境 Base/堡垒 1 套。
3. Tower：Basic、AOE、Slow、Heavy 四个轮廓明确的正式 Sprite；Level 通过徽记/光环表达，不要求每个等级另画完整 Sprite。
4. Enemy：normal、fast、tank、boss 四个区别明确的 Sprite；以既有 Gameplay 绘制尺寸为验收基准，不增加 Archetype。
5. HUD/Tower Deck：HP、Gold、Wave、Pause、Speed、Start Wave 五种通用 UI 图标和 4 个塔型 icon/portrait；素材必须在实际 HUD 大小下辨识。
6. 基础表现：Projectile 至少一种通用表现（按现有塔信息可允许少量 tint/形状变体）；Hit flash、Death 可用 Phaser 程序 VFX，不要求所有效果另生产 spritesheet。

**P1 环境装饰：** 树、矮灌木、石块、路边旗帜/火把、残垣、木箱中挑选 4–6 类；同类可做 1–2 个稳定变体。V3 首版宁可少而成套，不追求高数量。

### 6.2 逐素材交付合同

每个正式资产进入 `ASSET_MANIFEST.json` 前记录：

- canonical Asset ID、相对本地路径、资产类别、themeFamily、tags、来源 URL/作者、SPDX 许可、署名文本与 license 文件/截图位置；与现有 Zod schema 保持一致。
- in-game 用途、目标显示尺寸、源尺寸、Projection/朝向、pivot/origin、占格范围、透明边界/阴影策略、调色板和光源方向。
- 运行时 fallback Asset ID；缺图、格式失败、低分辨率或特定 ThemeFamily 无匹配时仍能加载。
- 需要动画时记录源点/目标点、时长、循环/一次性、帧数、中心点和减弱/停止时的表现。不把静态 Sprite 当成命中反馈已完成。

具体像素尺寸、纹理过滤、文件格式由实施者先根据 Phaser Canvas 缩放、当前 Sprite 显示大小和目标截图 DPI 探测后冻结；未测之前不在计划里编造尺寸合同。

### 6.3 搜集与许可工作流

```text
ASSETMCP / 公开资产来源（开发期）
  → 搜索与候选集
  → 检查项目投影、画风、显示尺寸和 license
  → 逐项人工审阅/拒绝
  → 下载到 assets/library/third-party/<source>/
  → 本地导入与目标视口预览
  → 更新 ASSET_MANIFEST / CREDITS / ASSET_REVIEW
  → Gameplay 只按已批准 Asset ID 加载
```

- 首选同一来源、同一系列、同一投影/比例的完整 2D 等距包；查找关键词要包含 isometric、2D sprite、tower defense、enemy、environment props、fantasy UI icons，排除只提供 3D 模型的包。
- 每项资产必须通过授权可确认、运行时尺寸可读、轮廓可区分、投影兼容、可放入本地 manifest 五道门。许可证不清楚的候选不进入运行包。
- 开源/第三方素材做像素级裁剪、调色或衍生是否符合许可证须按对应 license 审查；不要把“AssetMCP 已显示许可”当成项目合规审查结束。
- 若市场素材无法满足统一风格，优先生产少量项目自有 SVG/PNG Sprite；不要把不同画风候选硬凑成首套。

## 7. Technical Boundaries

- Game Core 和 shared schema 不改；表现只读取 `GameState` / `GameEvent` / `MapSpec` / `WorldSkin`。
- `BoardScene` 可拆出 presentation helper，但不得让素材加载器反向引入 Core 对 Phaser 的依赖。运行时流程保持：Core → Controller → Phaser presentation / DOM HUD。
- 随机环境装饰只做 presentation。需要稳定截图/回放时，使用 world/level/map seed 的独立确定性装饰 RNG；不得调用 `Math.random()`，不得改 MapSpec、路径、BuildSlot、Spawn 或 Base。
- 装饰生成必须过滤逻辑道路、建造位、出生点、基地和关键入口周围的安全区。视觉放置不得改变敌人坐标、点击映射、碰撞或建塔合法性。
- Tile、Sprite、贴图和 VFX 只从已 schema 验证的 manifest / theme registry 读取已批准本地 ID；Asset ID 缺失走 fallback 并记录开发期诊断，不访问任意网络地址。
- WorldSkin 只能选图和换 token；UI 锚点、交互位置、塔/敌人机制、数值和关卡规则保持一致。
- 首轮只接入 Border Outpost/Fantasy pack。其他 `themeFamily` 继续使用已有相似主题/neutral fallback，不因资源缺失阻断世界选择/游玩。
- 不用 Unity/Godot、Python 运行时或新前端框架；不升级依赖作为素材接入的顺手工作。

## 8. Proposed File / Module Impact

| File / Module | V3 职责 | 预计变化 | 风险 |
|---|---|---|---|
| `apps/game/src/main.ts` | 当前 `BoardScene`、地图/实体绘制、事件反馈、Asset 初始化集中处 | 把硬编码 Graphics 部分改为 manifest 驱动 Sprite/Tile + Vector fallback；最好提取 `BoardScene`/scene renderer 或小型 presenter | 现为大型组合根，逐步替换；纹理加载时序/销毁和地图变化易引入回归 |
| `apps/game/src/style.css` | 当前 CSS HUD、Tower Deck、Overlay | 统一视觉 token、HUD 底板、塔牌图标布局、hover/focus/disabled 和窄屏尺寸 | CSS 定位变化会影响 Canvas 的可用地图边界/点击命中 |
| `apps/game/index.html` | Hud/Tower Deck markup、icon fallback/aria 标签 | 只需增加/调整所需语义 slot 和 icon 容器，不迁移 V2 screen flow | DOM selector 改动影响 Playwright |
| `apps/game/src/game/board-projection.ts` | 当前 iso 投影/viewport fitting | 只校验 sprite origin、地面锚点是否与现有投影一致；必要时加纯 presentation transform，不改格点映射 | 锚点/缩放差异导致实体偏格 |
| `apps/game/src/presentation/world-skin-resolver.ts` | 当前 family → validated local pack fallback | 扩充 Fantasy pack 的具体 tower/enemy/tile/prop Asset ID，并维持 fallback/安全路径 | Theme Registry 与 Manifest 漂移时加载失败 |
| `assets/library/ASSET_MANIFEST.json` | 唯一 runtime Asset catalog | 增加审核后的 id/path/license/source/category/tags/family | Schema 不匹配、重复 ID、遗漏署名 |
| `assets/library/THEME_REGISTRY.json` | theme → semantic Asset ID 和 palette | 配齐 Border Outpost 可用 ID，fallback 继续显式 | 资产 family 拼写/ID 断链 |
| `assets/library/ASSET_REVIEW.md`、`CREDITS.md` | 来源筛选、许可与署名审查 | 记录新增来源、拒绝理由、归档内容及素材修改 | 权利信息不完整无法安全发布 |
| `assets/library/<approved source>/` | 经过批准的原文件/运行文件 | 新增本地纹理，采用可追溯目录和不重名文件名 | 包体、尺寸、来源归档不完整 |
| `tests/*` | schema/asset mapping、装饰确定性、交互回归和视口验收 | 新增 resolver/asset-reference/decoration 单测，扩展 Playwright 截图与 Gameplay 流程 | 只测运行路径不测素材显示会漏掉空纹理 |
| `docs/v3/plan.md` | V3 scope/task/DoD | 每阶段完成后更新状态与证据 | 计划状态和实际资产产物不一致 |

## 9. Priority

| Priority | Deliverables |
|---|---|
| **P0** | 视觉方向/资产合同；Grid 常态隐藏；地表与道路层次；BuildSlot/Spawn/Base 正式 Sprite 或统一批准 fallback；4 塔与 4 敌人 Sprite；HUD 统一底板与语义图标；Tower Deck 图标/短信息；Projectile/Hit/Death/Gold/Base feedback；本地 manifest/license/fallback；核心 Gameplay E2E 回归 |
| **P1** | 4–6 类安全区环境装饰；Hub 世界封面卡、工坊空状态插画/empty state；结果/部署状态动效精修；扩充第二个 themeFamily 的已批准视觉 pack；低动态/高对比 polish |
| **P2** | 大规模主题素材、塔/敌人全动作 Sprite 动画、复杂粒子/天气/环境循环、高级材质/Shader、radial Tower Deck、复杂菜单转场 |

**节奏门：** P0 最先交付 Border Outpost 一套垂直视觉闭环。没有正式塔/敌人/地图素材前不以大规模 CSS 改色或补数十种环境 props 代替核心资产完成度。

## 10. Phase-by-Phase Implementation Plan

### Phase 0 — Visual Target & Asset Audit `[P0]` `[~]`

- **Goal：** 把“像一款独立塔防作品”转成可以拒绝不合格素材的可检查方向，并确定 V2 实际坐标/显示合同。
- **Files / Modules：** 新增 `docs/v3/visual-style-guide.md`（如果团队希望把方向从执行计划独立管理）；`docs/v2/plan.md`、`board-projection.ts`、`ASSET_REVIEW.md` 作为输入。
- **Required Changes：** 冻结边境哨站 palette roles、光照、轮廓、材质、投影、地面锚点、目标 Canvas/移动显示尺寸；截取部署、第一波、塔击杀、基地受创四个真实运行状态作 baseline；挑选/制作 1 张原创可交互场景视觉目标图，仅作风格裁决不当最终资产。
- **Acceptance Criteria：** 同一方向同时覆盖草地/道路、BuildSlot、塔、敌人与 HUD；Danger/Interactive/Ally 有明度与非颜色编码；实际截图中路径和交互没有被材质噪点吞掉。
- **Tests / Review：** 1440×900、1280×720、390×844 至少三组运行态截图；方向评审通过后冻结 Asset Contracts。
- **Risks：** 视觉目标图很漂亮但不符合实际小型 Sprite、透明边界或 HUD 空间；必须以实际游戏中的可玩截帧验收。
- **Tasks：**
  - [x] 写定 Fantasy Frontiers / Border Outpost 简版 Style Bible 与反例（`docs/v3/visual-style-guide.md`）。
  - [x] 读取真实 iso 投影参数并冻结当前 Sprite 地面锚点/显示尺寸合同。
  - [ ] 保存部署、第一波、击杀、基地受创四种 baseline 截图及截图审核问题清单；桌面/窄屏视口截图待最终 E2E 产出。

### Phase 1 — License-Cleared Border Outpost Asset Pack `[P0]` `[x]`

- **Goal：** 用一套画风统一、许可可追溯的素材为实际战斗场景提供核心对象。
- **Files / Modules：** `assets/library/third-party/` 或项目 authored 目录、`ASSET_MANIFEST.json`、`THEME_REGISTRY.json`、`ASSET_REVIEW.md`、`CREDITS.md`。
- **Required Changes：** 用 AssetMCP/可信来源搜索 2D 等距 fantasy pack；逐项检查许可、投影、轮廓、源尺寸和下载质量。取得地表、石路、BuildSlot、Spawn、Base、4 塔、4 敌、HUD 资源图标、4 塔 portrait 最小集合。候选缺项时自制同风格 fallback。
- **Acceptance Criteria：** 每个 P0 Asset ID 都能在 Manifest 找到且路径存在；License/作者/来源明确；无远程资源依赖；每种资源都有 target-size 预览和 fallback。
- **Tests / Review：** Manifest Zod 校验；文件存在/图片解码/尺寸检查；实际投影叠图审视；生成或外部来源素材按规范完成视觉筛选，未经审阅不能标正式。
- **Risks：** 当前已有资产搜索曾未发现合适的 2D 塔/敌/地形包；因此 Phase 0 合同后要迅速决定“统一外购小包”或“项目自制关键 Sprite”，不做无限搜索。
- **Tasks：**
  - [x] 将旧 ASSET_REVIEW 的搜索限制和已导入 Kenney border 纳入新审查，不重复误用 3D 资产。
  - [x] 建立 P0 Asset ID 清单及其来源/许可/显示合同。
  - [x] ASSETMCP 无匹配候选后制作并审查 Border Outpost Fantasy runtime assets；SVG 源与 2× 本地 PNG runtime 分开保存。
  - [x] 更新 manifest、registry、credits 和来源归档；Vite runtime 只打包 manifest 引用的本地 PNG。

### Phase 2 — Terrain, Path & Landmark Scene `[P0]` `[x]`

- **Goal：** 首先让地图从彩色 Tile 图变成能读出环境、道路、入口和防线终点的场景。
- **Files / Modules：** `main.ts` 或提取出的 `src/scenes/board-scene.ts`、新的 scene presentation helper、`world-skin-resolver.ts`、Manifest/Registry。
- **Required Changes：** 保留 MapSpec 网格逻辑；默认隐藏 tile 边线；地表用本地 Tile/Sprite 材质或无缝底面，路径由实际 path tile 绘制石板/土路与柔和边缘；BuildSlot 用不抢焦点的石质底座；入口显示裂隙/门；Base 显示边境堡垒；独立地面阴影和物体层次。
- **Acceptance Criteria：** 普通态几乎无完整 grid；Hover 只高亮当前 Tile；建造交互只提示合法 BuildSlot；道路连接所有入口到基地；地面/路线/交互物有清楚明度分层；投影/点击保持 V2 一致。
- **Tests / Review：** 对比 V3 baseline；Playwright 在真实 Canvas 做 BuildSlot 点击回归；截图确认 100% 和缩小浏览下路径仍可读；无纹理 fallback 开启后依然可玩。
- **Risks：** 路径 Tile 转角/分叉重复明显；地面素材尺寸和当前非整数投影不匹配；BuildSlot 高亮遮挡塔与 UI。
- **Tasks：**
  - [x] 用地表/道路正式材质替换主要纯色 Tile，默认状态取消完整 Grid 描边。
  - [x] 完成默认、hover、选中、占用 BuildSlot 呈现态，交互高亮只在当前格/合法建造位显示。
  - [x] 接入主题裂隙 Spawn 和边境 Base Sprite。
  - [x] 为 BuildSlot、地标、塔、敌、装饰加入独立地面阴影或 Sprite 接地层次。

### Phase 3 — Tower / Enemy Sprite Pass `[P0]` `[x]`

- **Goal：** 让四塔、四敌在目标尺寸下通过轮廓、形状与少量色彩即可识别。
- **Files / Modules：** BoardScene/presentation renderer、tower/enemy Theme Registry、Map/World skin resolver、Playwright visual fixtures。
- **Required Changes：** 将 Vector 圆/矩形改为批准 Tower/Enemy Sprite；统一 ground origin；塔等级/选中使用独立徽记/光环而不复制全套 Sprite；Enemy HP bar 与移动位置继续读取 Core State；统一阴影/描边/左上光源；加载失败回退到风格相同的本地占位。
- **Acceptance Criteria：** 4 塔 archetype 和 4 敌 archetype 在桌面与窄屏均能区分；sprite ground contact 与 tile 中心对应；血条状态准确；没有更改 Core、路径或 hitbox。
- **Tests / Review：** 各 Sprite 原生尺寸预览、混编比例审查、运行中走位截图；战斗/选择/升级/击杀 E2E 回归；核对无空纹理和控制台资源错误。
- **Risks：** 素材包比例/透视混乱、敌人尺寸遮路、塔体阻挡 BuildSlot 点击和地图路径。
- **Tasks：**
  - [x] 4 个 Tower Archetype 生产资产和小尺寸 Portrait。
  - [x] 4 个 Enemy Archetype 生产资产与统一 foot origin。
  - [x] 完成 tower level/selected、enemy HP/受击状态覆盖层。
  - [x] 配置本地中性资产/Vector fallback；缺失纹理不会向 Core 派发状态变更。

### Phase 4 — Game HUD & Tower Deck `[P0]` `[~]`

- **Goal：** 用一套 Game UI 材质、图标和状态语法消除残余 SaaS Card/Button 感，同时保留 V2 信息布局。
- **Files / Modules：** `index.html`、`style.css`、HUD/Tower Deck UI helper（如确有需要）、HUD icon IDs/Theme Registry。
- **Required Changes：** HP/Gold/Wave 并入一个轻量底板；图标优先并保留数值/辅助标签；塔栏改成图像优先小型 Tower Deck；Hover/Focus 才显示伤害/射程等细节；Wave Start 成为底栏最醒目的单一交互；Pause/Speed 使用图标与 aria-label/tooltip；“部署阶段”降级为轻量状态提示；减少重复矩形边框。
- **Acceptance Criteria：** 关键数值一眼可读；塔图标和费用不挤压文字；选择/可建/不足金币/disabled/focus 均有非颜色冗余状态；布局锚点与 V2 相同且 Canvas 可用面积无显著回退。
- **Tests / Review：** Playwright accessible role/name 检查、键盘焦点/触屏点按、HUD bounding box / overlap 检查；1440×900 与 390×844 截图评审。
- **Risks：** 图标语义不清、窄屏底栏过宽、视觉细节导致字号/对比度下降、Vite snapshot selector 被无意破坏。
- **Tasks：**
  - [x] 实现单底板 HUD 与 HP/Gold/Wave 图标。
  - [x] 4 塔 deck card 改为塔型图像优先并保留简短名称与费用。
  - [x] 加入 hover/focus 原生辅助说明，不常驻铺开详情。
  - [x] 重绘 Wave Start / Pause / Speed 的图形态和可访问标签。

### Phase 5 — Combat Feedback Pass `[P0]` `[~]`

- **Goal：** 让攻击→伤害→死亡→奖励和漏怪→基地受创形成清楚、短促且不改规则的反馈。
- **Files / Modules：** Core event consumer、BoardScene/VFX helpers、`style.css` 的有限 HUD feedback。
- **Required Changes：** Projectile 从 Tower 到目标；基于现有真实伤害/击杀事件显示 Hit flash 与可控伤害反馈；Death 消散/粒子；Gold +X 与资源图标短闪；enemyLeaked 时基地/HP 提示；Wave Start banner；Victory/Defeat 结果状态。对 V2 当前 `towerFired` 的真实语义进行审查：只有确认事件与真实扣血同 tick 时才绑定 hit 表现，不用视觉推断命中。
- **Acceptance Criteria：** 每种表现来自 Core event 或 GameState；关闭/Reduced Motion 时去掉装饰特效仍能看懂战局；Tween/临时对象有 dispose/上限；表现不会改 tick、伤害、奖励、输入或结果时间。
- **Tests / Review：** event-to-VFX 映射单测；同输入 seed/action 对比 GameResult 不变；Playwright 检查关键反馈存在和终局顺序，断言不依赖动画时间决定结果。
- **Risks：** 高波次粒子导致掉帧；HUD 动画遮挡数值；Hit 与 `towerFired` 意义混淆；多次击杀浮字堆叠。
- **Tasks：**
  - [x] 建立短时 projectile 表现；由真实 `towerFired` 事件触发，超出视觉负载时跳过装饰 bolt。
  - [x] Hit/Death/Gold/Base/Wave/Victory 反馈使用已有 Core event/state 并在短时表现后清理。
  - [x] 提供 prefers-reduced-motion 降级路径；E2E/Core 回归待最终验收。

### Phase 6 — Deterministic Environment Decoration `[P1]` `[x]`

- **Goal：** 通过少量树、石块、灌木、旗帜/火把、残垣等环境 props 增加地图层次与世界身份。
- **Files / Modules：** BoardScene decoration layer、确定性 cosmetic placement helper、Manifest/Theme Registry、对应单测。
- **Required Changes：** 用 map/world seed 和独立 deterministic RNG 生成或选择装饰位置；设置禁放区；保持颜色/光源/投影一致；装饰只在正式 terrain/landmark 之后绘制，不掩盖关键信息。
- **Acceptance Criteria：** 相同 map/seed 重复装饰布局一致；不同 seed 可以变化；装饰集不改 MapSpec、路径、可建造位置、敌人逻辑坐标与 Core result；4–6 类已经足以形成层次。
- **Tests / Review：** deterministic property tests；自动校验装饰不落在 path/buildSlots/spawn/base 与预设安全半径；桌面/窄屏人工读图；关闭装饰层的 fallback 截图。
- **Risks：** Decoration Layer 看似无害但遮敌人/点击区域；随机装饰使 Playwright 视觉测试不稳定。
- **Tasks：**
  - [x] 选定 4 类 Border Outpost 装饰资产。
  - [x] 实现不污染 gameplay RNG 的确定性 decoration placement。
  - [x] 避开路径、BuildSlot、Spawn、Base 与出生/基地周围 1 格安全区；单测验证相同 seed 稳定。

### Phase 7 — Meta Hub Content Presentation `[P1]` `[~]`

- **Goal：** 用世界封面和明确空状态让“世界”成为内容对象，减少前三张 Hub 截图的后台表格观感。
- **Files / Modules：** Hub markup/style、World card data → safe local thumbnail resolver、Theme Registry/Manifest。
- **Required Changes：** 我的世界卡片加入本地 World Thumbnail、世界名/主题/难度进度/进入操作；创意工坊无内容时放置 Empty State 插画/说明/创建入口；颜色/装饰仍来自本地 Theme/Asset ID。MVP 里优先对 fantasy default 做封面，其他主题使用稳定 neutral/family fallback。
- **Acceptance Criteria：** 世界列表为响应式内容卡，不伪造尚无的世界描述；Empty State 在普通桌面高度内可见并明确下一步；世界详情/生成/评测/发布功能不回归。
- **Tests / Review：** Playwright 进入 Hub、Workshop empty state、World Detail 的完整流；窄屏卡片布局/图片失败 fallback；本地 asset manifest reference 校验。
- **Risks：** 图片挤压已有世界操作、生成世界 thumbnail 动态路径不安全、空状态引导使用不存在的功能。
- **Tasks：**
  - [x] 制作一张 Border Outpost 本地 World Thumbnail。
  - [x] 制作创意工坊 Empty State 插画与“前往我的世界”返回操作。
  - [ ] 对多主题世界卡 fallback、生成/发布回归进行 E2E 验收。

### Phase 8 — WorldSkin Expansion & Polish Gate `[P1]` `[~]`

- **Goal：** 锁定首套 Fantasy 资产集成质量，并验证其他主题缺图时仍能沿用相同布局与 fallback。
- **Files / Modules：** `world-skin-resolver.ts`、Theme Registry、asset resolver tests、V2 World selection E2E。
- **Required Changes：** Fantasy pack 指向正式 tile/landmark/tower/enemy/UI icons；similar/neutral fallback 不访问任意路径；至少用一个非 Fantasy fixture 演练 fallback；审查 HUD 主题调色与对比度。
- **Acceptance Criteria：** Fantasy 显示正式本地资产；第二 ThemeFamily 可以有未覆盖项但 fallback 可靠；Gameplay/HUD bounding boxes、操作和逻辑地图不变；asset id 缺失不会让游戏空白。
- **Tests / Review：** resolver exact/similar/neutral；theme asset id 存在性；两个 ThemeFamily 同视口 layout box 比较；fallback 强制缺图 runtime smoke。
- **Risks：** 扩大主题资产范围挤占首套质量；CSS/theme family 分支造成 layout 分叉。
- **Tasks：**
  - [x] 将 Fantasy 正式资产映射入 WorldSkin Registry 并检查对应 Manifest ID/文件/CC0 provenance。
  - [x] 保持其他主题 exact/similar/neutral fallback；已有 resolver 单测覆盖路径选择。
  - [ ] 对不同 ThemeFamily 的布局 bounding box、低对比度、低动效和强制缺图场景做最终浏览器审查。

### Phase 9 — Regression, Packaging & Release Gate `[P0 Gate]` `[~]`

- **Goal：** 以真实运行证据确认 V3 是“可玩的统一视觉包”，不是一张素材拼贴图。
- **Files / Modules：** 全客户端、Manifest/Registry/credits、unit tests、`tests/e2e/*`、V3 evidence。
- **Required Changes：** 覆盖 Hub→Easy→Gameplay、建塔、开 Wave、塔攻击/击杀、升级、Pause/Resume/Speed、胜负结算/回 Hub；检查窄屏；运行无素材/故意错误 Asset ID 的 fallback；审查包体、重复文件和引用链。最终构建需使用站点部署前缀，避免覆盖线上 dist 为 `/assets/...`。
- **Acceptance Criteria：** 本文 DoD 全部通过；视觉检查包括运行中真实 Canvas；Core/Simulator/Evaluation 同规则和结果；所有 Third-party Credits/许可链完整；线上 build 可在 `/fantasy-frontiers/` 正常载入 CSS、JS、API 和 Phaser Canvas。
- **Tests：** `pnpm verify`、`pnpm test:e2e`；asset manifest/file/reference audit；Playwright desktop/mobile screenshots；部署 build 检查 index asset URL 与线上 JS/CSS/API status。
- **Risks：** 超大 Sprite sheet 增加下载体积；本地 E2E 不等同线上 Nginx 子路径；截图通过但 HUD 交互/低帧率未覆盖。
- **Tasks：**
  - [x] 审核本地 manifest 引用、ID 唯一性、文件存在及 runtime PNG；不删除来源/许可证存档。
  - [x] 检查 production 包体；执行本地素材路径与 production 子路径资源 smoke。Vite 仍提示 Phaser 所在 JS chunk 超过 500 KB，作为后续包体优化项记录。
  - [x] 运行 `pnpm verify`（typecheck、44 个 Vitest 测试、build 全通过）。
  - [ ] 运行并通过 `pnpm test:e2e`；目前 Hub/响应式及其它浏览器场景通过，但完整 Easy 战役场景失败，见第 14 节。
  - [x] 使用 `/fantasy-frontiers/` production base 实测部署入口、CSS、JS、API 与 Phaser Canvas；线上启动关卡请求返回 201，静态资源/API 返回成功。
  - [x] 更新本计划状态、证据链接和已知限制；解除完整战役 E2E 阻塞后再关闭发布门。

## 11. Testing & Visual Acceptance Matrix

| 验收项 | Evidence | Pass Criteria |
|---|---|---|
| 视觉方向 | 真实 gameplay captures + Style Guide | 四个关键时刻一致使用同一投影/光照/调色板/轮廓语法 |
| 资产完整性 | ASSET_MANIFEST / Theme Registry / file audit | 所有引用 ID 唯一、路径存在、许可/作者可追溯、fallback 有效 |
| Isometric 尺寸与锚点 | Phaser 截图叠图 / Sprite preview | 建筑/塔/敌人接地位置与实际 MapSpec tile 一致，无悬浮/切边 |
| 场景可读性 | 1440×900 / 1280×720 / 390×844 截图 | 路、Spawn、Base、BuildSlot、Enemy 和 HUD 可辨；正常 grid 边界不抢眼 |
| Build interaction | Playwright + Canvas integration | 只允许现有 Core 合法格成功；tower slot select 后只 dispatch 一次；选择与 hover 不改变 GameState |
| Combat readability | Gameplay event run + Playwright | Projectile、真实 Hit、Kill、Gold、Leak 有对应反馈；视觉层不能改变结果 |
| Decoration determinism | Unit/property test | 相同 seed 与 map 的装饰一致；不同 seed 允许不同；逻辑格安全约束总是成立 |
| HUD accessibility | role/name、keyboard、contrast review | Icon 同时有 accessible label；选中/禁用状态不单靠颜色；焦点可见、数字不被截断 |
| WorldSkin fallback | resolver tests + forced missing asset smoke | 无远程 URL；exact/similar/neutral 路径正常；布局 bounding box 保持 |
| Logic regression | `pnpm verify` + existing Core/Simulator/Metrics tests | V1/V2 规则/metrics/evaluation 不变 |
| Runtime/deploy | `pnpm test:e2e` + production subpath smoke | 服务端世界 API 返回有效数据；生产 JS/CSS 返回正确 MIME；Gameplay Canvas 可显示 |

### Required Playwright Flow

1. 打开 Hub，检查世界卡/主题封面及 Creative Workshop Empty State。
2. 进入 Border Outpost → Easy → Gameplay，断言管理 UI 隐藏。
3. Hover/键盘聚焦 BuildSlot，确认只有当前格高亮；选塔并建造，验证金币/Core State。
4. 验证四种塔图形、塔升级 Context Panel、disabled 状态。
5. 开始 Wave，观测至少一个 Projectile、受击、击杀/金币或漏怪/基地受击反馈。
6. Pause/Resume、1×/2× Speed、Restart/结果返回。
7. 运行一轮胜利或失败并验证独立 Result flow。
8. 桌面和窄屏截帧；故意缺少一个 Sprite ID，确认 fallback 可玩。

测试不可等待纯装饰动画结束后再依赖其结果；逻辑断言绑定 GameState/结果，视觉断言单独验证特效有无和清理。

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| 找不到能匹配当前 2D 等距比例的成套素材 | Phase 0 先冻结资产合同；ASSETMCP 搜索设时间盒；转为自制关键 Sprite，不混搭多个不一致包 |
| 素材 license 不明或衍生权不明确 | 不下载入库/不发布；核对来源页和 license 原文；Manifest、CREDITS、Review 同步记录 |
| 正式 Sprite 与 Phaser 当前 projection/origin 不匹配 | 先将素材以实际显示尺寸贴入目标截图验证，再做批量接入；逻辑中心格和 sprite footpoint 分开表示 |
| 地表细节掩盖路线和攻击 | 道路优先明度、控制 tile 纹理密度；关键格优先级高于装饰；以真实战斗缩略截图验收 |
| 环境 Decoration 遮挡关键对象或造成测试随机 | 独立 deterministic RNG；逻辑安全区；seed fixture 固定；可关闭整个 Decoration Layer |
| VFX 派生了 Core 未表达的逻辑 | 只由 Core Events/State 触发；审查 `towerFired` 语义；表现不能延迟/确认命中/改变 GameResult |
| HUD 一改导致地图投影和点击偏移 | 调整后更新 BoardScene available rect；覆盖所有 BuildSlot 与不同视口投影测试 |
| 主题资产扩充导致包体过大 | 单套 pack 切片导入、压缩和移除未引用候选；测 gzip/浏览器加载；不把数套主题一次性塞进 P0 |
| Hub UI 工作挤压核心 Gameplay 资产 | Hub 卡片/Empty State 为 P1；先完成 Border Outpost 完整战斗视觉闭环 |

## 13. V3 Definition of Done

- [ ] V2 Gameplay 结构和 Core/Simulator/Evaluation 规则完整保留。
- [ ] Border Outpost 有一套画风统一、license 清晰、Asset ID 唯一、可本地加载的 P0 资产包。
- [ ] 普通状态几乎没有完整 Grid Debug 边线；Hover/交互态的 Tile 提示局部、清晰。
- [ ] BuildSlot 是低对比石质防御基座，hover/选中时强调；默认不让所有空位同时抢眼。
- [ ] Spawn 是主题入口；Base 是可辨的边境城堡/防御对象；两者均与逻辑坐标对齐并有阴影/层次。
- [ ] 4 类 Tower 与 4 类 Enemy 在原生游戏尺寸下靠轮廓/剪影/辅助标识可区分，Level 与 Enemy HP 信息准确。
- [ ] HUD 是统一 Game HUD 底板与 HP/Gold/Wave 图标；塔栏是图像优先 Tower Deck；Wave Start、Pause、Speed 使用统一图标/视觉状态。
- [ ] 战斗中可见 Projectile、真实 Hit、Death、Gold、Base Damage、Wave Start 和 Result feedback；特效有容量/清理且不改变 Core。
- [ ] 至少有 4–6 类确定性环境装饰，避开道路/入口/基地/建造位，且不影响逻辑或输入。
- [ ] WorldSkin 的 Border Outpost mapping 使用本地 Manifest IDs；其他 ThemeFamily 缺图会按既有 resolver 回退，Layout 不变。
- [ ] Hub 世界内容以至少一张本地 World Thumbnail 展示；Workshop 空状态有插画、说明与下一步入口（P1 若首发时间不足可有范围记录但不得作为 P0 阻塞）。
- [ ] 桌面、横屏与窄屏实际游戏场景经过人工/Playwright 检查；不是只通过概念图验收。
- [ ] `pnpm verify`、`pnpm test:e2e`、Manifest/Asset audit 和 production subpath 浏览器 smoke 全通过。当前 verify、资产审计和部署 smoke 通过；完整 E2E 未通过。
- [x] 线上 production 子路径正确载入 JS/CSS/API/Canvas；运行时无 Skill、MCP、网络随机素材依赖。

## 14. 当前验收记录与剩余工作

### 已验证

- `pnpm verify`：通过，包含 TypeScript typecheck、44 个 Vitest 用例与 production build。
- 资产审计：35 个唯一 Manifest ID 均指向存在的本地源/运行文件；35 张 runtime PNG 总计约 330 KB。runtime 资产不依赖在线素材服务。
- Playwright 已生成 1440×900、1280×720、390×844 游戏画面；移动端地图适配修正后的画面确认完整居中、未裁切。
- Production 子路径 `/fantasy-frontiers/`：线上页面、JS/CSS、静态素材与 API 可访问；Easy 关卡启动 API 返回 201。该 smoke 仅证明部署入口和启动链路，不等同完整战役验收。
- 可查看 `qa/evidence/v3-gameplay-1440x900.png`、`qa/evidence/v3-gameplay-1280x720.png`、`qa/evidence/v3-gameplay-390x844.png`、`qa/evidence/v3-gameplay-deployed.png`、`qa/evidence/v3-gameplay-first-wave.png` 和 `qa/evidence/v3-production-online.png`。

### 发布门阻塞：完整战役 E2E

- `tests/e2e/complete-playthrough.spec.ts` 的 Playwright run 能进入 Gameplay、加载本地塔图、建造三座重炮塔（金币由 500 降至 20）、切换 2× 速度并开始 Easy 第一波。
- 随后 `#wave-button` 在 100 秒轮询窗口内一直不可用、`#result-panel` 未显示，测试以 `combat` 状态超时失败。现有截图显示波次已启动，但不足以区分游戏模拟停滞、波次推进过慢或浏览器自动化观测问题；需先从运行中的 GameState/核心事件定位原因，再修正测试或呈现循环。不得通过跳过波次、直接构造 GameResult、放宽为“已开始波次”或更改 V1 核心规则来伪造通过。
- 失败 trace / DOM 上下文位于 `test-results/complete-playthrough-compl-70b43-reload-progress-and-restart-chromium/`。`qa/evidence/gameplay-result.png` 与 `qa/evidence/run.json` 是之前生成的旧证据，不代表本轮 V3 完整战役通过。
- 下一步：使用 Playwright trace/运行时采样记录 `GameState.status`、`waveIndex`、敌人数、队列数与 `elapsedTime`；确认模拟 tick 是否持续、核心是否发出 `waveCompleted`/终局事件。必要时在不改变 Core 规则的前提下修复 Phaser/controller 生命周期或测试等待条件；随后重跑单场完整流程和 `pnpm test:e2e`，刷新结果截图与 `run.json`。

### 仍需完成

1. 解决并通过完整 Easy 战役端到端流程，覆盖实际结算持久化、返回 Hub 和重新开局；刷新 terminal screenshot 与 `run.json`。
2. 补齐视觉验收矩阵中尚无证据的 tower kill、基地受创、胜利/失败当次截图；不要用旧文件冒充本轮证据。
3. 完成 keyboard/focus、Reduced Motion、强制缺图 fallback，以及另一 ThemeFamily layout bounding box 的浏览器检查；对应阶段保持 `[~]` 直到有实测结果。
4. 重跑 `pnpm test:e2e` 与 `pnpm verify`，核对最终 diff/asset 引用，再将 Phase 9 与 V3 DoD 发布门勾选。

**当前结论：** 视觉素材与 V3 展示层已实现，production 子路径已完成 smoke；V3 尚未达到 Definition of Done，也不应标记为全部计划完成。

---

**V3 执行准则：** 先通过一套经过授权和实际画面验证的官方默认世界资产建立视觉标杆，再扩充主题；Gameplay 的可读性和规则准确性始终高于装饰密度。
