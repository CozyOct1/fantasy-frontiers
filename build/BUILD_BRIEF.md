# V4 Production Build Brief

```text
buildStage: production
buildPath: custom
designSource: docs/v1/01-brief-design.md + docs/v1/02-architecture.md
targetFinish: 具有分层边境场景、动态战斗对象、清晰战斗反馈、轻量 HUD、桌面/移动响应式呈现，并通过完整 Easy 流程验证的浏览器垂直切片
targetPlatform: Browser (desktop; responsive layout)
targetRuntime: Browser + Phaser 3
testedRuntime: Chromium via Playwright; local Vite development server
engine: Phaser 3.90.0
runtimeVersion: Node.js (repository constraint >=22.12.0)
packageManager: pnpm@12.4.2
install: pnpm install
buildOrExport: pnpm --filter @fantasy-frontiers/game build
start: pnpm dev:game
modelCheck: NONE
verify: pnpm verify && pnpm test:e2e
owner: game-qa
```

## 必须保真的体验

- 玩家通过真实鼠标输入在合法建造位部署塔，消耗金币；可选择已有塔并升级。
- 玩家启动波次后，敌人沿 MapSpec 道路前进，塔自动攻击；击杀奖励金币，漏怪扣除基地生命。
- 全波完成且基地生命大于 0 时胜利；基地生命归零时失败。胜负只由 Game Core 状态决定。
- Phaser 只绘制地图、实体和射击反馈；固定 tick 的纯 TypeScript Game Core 负责状态变化、伤害、金币与胜负。
- 本阶段使用可复现 Easy 地图和固定 seed。地图模板来自 `packages/maps`，Gameplay 可调数值来自 shared config。

## 最小复现路径

1. 启动 `pnpm dev:game`，页面加载固定 seed `70421` 的 Easy 关卡。
2. 选择一种塔，点击绿色建造位，观察金币减少且地图出现防御塔。
3. 点击已建造的塔并升级；启动第一波，观察敌人沿路移动并受到塔攻击。
4. 暂停/继续、切换 1×/2×；继续部署并完成关卡，观察胜利或失败结算；点击“重新开始”恢复同一 seed 的初始状态。

## 范围限制

- 当前只交付一个可切换 Easy / Medium / Hard 的边境关卡；世界选择、持久化、音效和正式素材属于后续阶段。
- Browser Chromium 是当前测试运行时；尚无真实移动设备、音频、热性能与长时运行证据。
- V4 首先完成 Border Outpost / Fantasy 视觉包；其他 ThemeFamily 保持已验证 fallback 与同一布局。
- 当前最大风险是完整浏览器波次 E2E 未在期限内回到部署/终局；必须先采样真实 Core 状态再修复。
```
