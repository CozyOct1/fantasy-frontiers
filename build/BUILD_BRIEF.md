# V6 Build Brief

targetFinish: vertical slice
buildStage: production
buildPath: custom

## 目标与设计

- 平台：现有浏览器版，Phaser 3 + TypeScript；玩家战斗适配 PC 与移动端，内部地图编辑器首版面向桌面。
- 玩家结果：玩家能读懂固定路线与下一波威胁，在有限塔位和金币间做选择，通过视听反馈理解结果，并在失败后形成可执行的重试方案。
- 交付：决策优先的战斗 HUD、首局教学、事实型复盘、波间拆除纠错、动作日志/回放、真实音频系统、本地受控 UI/音频素材，以及地图布局与敌军波次的一体化内部关卡工坊。
- 联网边界：已有游戏可离线运行；编辑写 API 默认关闭，开发环境可显式启用。

## 必须保真

- Game Core 是规则唯一权威；Phaser 与编辑器不决定战斗结果。
- 玩家与 Headless Simulator 使用相同 Core、MapSpec、WavePlan、seed 和配置版本。
- AI 只能给语义标签；坐标、波次和数值来自受控内容并经过校验。
- 编辑试玩不写正式进度；已发布内容和已开始对局使用不可变快照。
- 保留现有世界、关卡、玩家进度与旧 seed 行为兼容路径。
- UI、动画与音频只能订阅 Core 语义事件；静音、缺音、倍速和减少动态效果不得改变结果。

## 最小实现与复现

- 最大风险：更多反馈造成 HUD/声音过载，或表现层生命周期影响确定性战斗与重复进入关卡。
- 初始证明：Easy 可完成 `读取威胁 → 建造/升级/波间拆除 → 开波 → 事实型结算 → 重试`；工坊可完成 `编辑地图 → 编排波次 → 共享校验 → 同 Core 试玩 → 草稿/不可变发布`；声音首次手势解锁、设置即时生效，资源失败时静默降级。
- 固定基线 seed：Easy 70421、Medium 70422、Hard 70423。
- signature_command: N/A

## 运行

toolchain:
  targetPlatform: desktop/mobile browser
  targetRuntime: modern evergreen browser + Node.js server
  testedRuntime: local Chromium/Node.js
  engine: Phaser
  engineVersion: 3.90.0
  runtimeVersion: Node >=22.12.0
  packageManager: pnpm@12.4.2
commands:
  install: pnpm install
  buildOrExport: pnpm build
  start: pnpm dev
  modelCheck: pnpm test
  verify: pnpm verify && pnpm test:e2e --workers=2
verification:
  owner: game-qa
  evidence: qa/verification.json

## 限制

- 本轮不包含公共 UGC、多人协作、任意脚本、新塔/敌机制、商业化或局外成长。
- 真人可玩性与真实移动设备性能不能由自动化测试替代，未实际执行时必须保持 UNVERIFIED。
- 外部素材仅作为本地构建资源，来源和许可写入 manifest/Credits；运行时不依赖外部站点。
