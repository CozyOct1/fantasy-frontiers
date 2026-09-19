# DEBUG_HANDOFF

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
