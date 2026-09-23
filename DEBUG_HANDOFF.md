# DEBUG_HANDOFF

## 2026-09-22 — 地图工坊跳转到同域另一个项目

### 现象与根因

生产站点部署在 `/fantasy-frontiers/`，但工坊入口、试玩入口和试玩返回使用了 `/map-editor.html`、`/?mapPreview=1` 等站点根绝对路径。浏览器因此离开应用 base path，并命中同域根目录部署的另一个项目。

### 修正与证据

- HTML 入口改为相对链接；运行时导航统一通过 `appUrl()` 基于 `import.meta.env.BASE_URL` 生成。
- 增加生产 smoke：主界面进入地图工坊、确认 `/fantasy-frontiers/map-editor.html`、返回 `/fantasy-frontiers/`，再进入 Phaser 战斗。
- `PRODUCTION_SMOKE=1 pnpm exec playwright test tests/e2e/production-smoke.spec.ts --workers=1 --trace=off`：1 passed。
- 默认关闭的编辑 API 会以 404 表示能力未启用；工坊将其视为本地模式，而不是产品错误。

### 不应重复的修法

- 子路径部署中不要用以 `/` 开头的应用内 URL。
- 不要通过硬编码生产前缀修复；开发、预览和其他部署前缀必须共用 Vite `BASE_URL`。
- 不要把编辑 API 的关闭状态当成必须在线；本地编辑、导入导出和试玩必须继续工作。

## 2026-09-22 — V6 mobile onboarding intercepted map touches

### 现象与根因

在 390×844 触摸视口，选择弩塔后点击合法塔位无法建造。Core 与投影坐标均正确；实际原因是首局教学卡片位于战场上方并接收了 pointer hit-test，违背了“非阻塞教学”约束。

### 修正与证据

- 教学第一步保留交互按钮；进入选塔、建造和开波等事件驱动步骤后，卡片标记为 passive，隐藏无效按钮并使用 `pointer-events:none`，让地图接收触摸。
- `pnpm exec playwright test tests/e2e/mobile-touch.spec.ts`：1 passed。
- 随后的完整 `pnpm test:e2e`：16 passed，1 个 production-preview-only test 按条件 skipped。

### 不应重复的修法

- 不要扩大 Core 合法塔位或触摸容差来掩盖 DOM 覆盖层命中问题。
- 不要让教学在玩家执行地图操作时持有透明或不可见的全屏点击层。

## 错误现象

`tests/e2e/complete-playthrough.spec.ts` can load Gameplay, build towers, switch to 2×, and start Easy wave 1, but `#wave-button` remains disabled and no result is shown within 100 seconds.

## 最小重现步骤

1. Run `pnpm exec playwright test tests/e2e/complete-playthrough.spec.ts`.
2. Enter Border Outpost Easy, build three heavy towers, switch to 2×, and start wave 1.
3. Poll for deployment or terminal state.

## 目前错误讯息 / Log

Expected `/deployment|terminal/`; received `combat` after 100000 ms.

## 已尝试修法与证据

- Increased the Playwright timeout: still failed in combat.
- Changed tower placement from six basic towers to three heavy towers close to the route: still failed in combat.
- Existing Core unit tests pass, so changing tower strategy did not prove the browser runtime advances at the intended rate.

## 失败原因

Previous attempts changed test duration or tower placement without observing Core elapsed time, enemy queue, or active enemy count. They did not distinguish a slow browser loop from a gameplay state bug.

## 根因假设

Resolved: Playwright's headless Chromium used WebGL through SwiftShader on this server. The GPU process saturated while the Phaser loop advanced only about 0.85 Core seconds per wall-clock minute. The Game Core queue and state machine were healthy.

## 下一個可否證驗證步驟

Completed: development-only counters sampled `elapsedTime`, status, wave, queue and enemies. Switching only automated browsers (`navigator.webdriver`) to Phaser Canvas rendering restored continuous progress. The same Easy flow completed six waves and reached a real victory in about 1.1 minutes.

## 不准再重複的修法

- Do not increase the timeout again without state samples.
- Do not keep changing tower composition as a substitute for locating the state transition problem.
- Do not alter Game Core wave, speed, enemy, economy, or outcome rules to make the E2E pass.

## 解决验证

- `pnpm test:e2e`: 10 passed; production-only smoke skipped by design in the default suite.
- `PRODUCTION_SMOKE=1 pnpm exec playwright test tests/e2e/production-smoke.spec.ts`: 1 passed.
- `pnpm verify`: typecheck, 44 Vitest tests and production build passed.

---

## 2026-09-20 — Real DeepSeek evaluation contract failure

### 错误现象

The first real DeepSeek evaluation reached the model but all level records failed schema validation or ended with `evaluation_evidence_insufficient`.

### 根因

- The initial Zod schema required `hypothesis`, but the prompt omitted that field.
- The final schema allowed `needs_more_testing`, while the workflow rejected that value after the only allowed follow-up.
- The final prompt did not explicitly prohibit echoing the input `phase` field.

### 修正

- Aligned the prompt with every required initial field and maximum length.
- Restricted the post-follow-up conclusion to `balanced` or `needs_tuning`.
- Explicitly prohibited extra final fields and added up to three bounded validation retries.
- Required concise Simplified Chinese prose.

### 解决验证

- Real DeepSeek run completed all three Border Outpost levels.
- Each completed report references novice, baseline, and expert Simulator runs and deterministic metrics.
- `reports/evaluations/frontier-world.md` was generated successfully.
- `pnpm verify`: 50 tests passed; typecheck and production build passed.
