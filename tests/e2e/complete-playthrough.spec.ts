import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const api = "http://127.0.0.1:3102";
const evidencePath = "qa/evidence/run.json";

test("complete an Easy campaign run, persist its outcome, reload progress, and restart", async ({ page, request }) => {
  test.setTimeout(180_000);
  await page.route("http://127.0.0.1:3001/**", route => {
    const url = new URL(route.request().url());
    url.port = "3102";
    return route.continue({ url: url.toString() });
  });
  const inputTrace: string[] = [];
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "幻想防线" })).toBeVisible();
  await expect(page.locator("#hub-screen")).toBeVisible();
  await page.locator("#menu-play").click();
  await page.getByRole("button", { name: /进入世界|继续探索/ }).first().click();
  await page.getByRole("button", { name: "开始挑战" }).first().click();
  await expect(page.locator("#gameplay-screen")).toBeVisible();
  await expect(page.locator("#hub-screen")).toBeHidden();
  await expect(page.locator("#game-root canvas")).toBeVisible();
  await expect(page.locator("#game-status")).toHaveText("部署阶段");
  await expect(page.locator("#wave-value")).toHaveText("0 / 6");
  await expect(page.locator(".battle-hud")).toHaveCSS("background-color", /rgba/);
  await expect(page.locator(".tower-option img")).toHaveCount(4);
  await expect(page.locator("#wave-button img")).toHaveCount(1);
  await expect(page.locator("#speed-button img")).toHaveCount(1);
  await expect.poll(() => page.locator(".tower-option img").evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);

  const canvas = page.locator("#game-root canvas");
  const canvasBounds = await canvas.boundingBox();
  const worldResponse = await request.get(`${api}/api/worlds/frontier-world`);
  const world = await worldResponse.json() as { levels: { difficulty: string; map: { width: number; height: number; buildSlots: { x: number; y: number }[]; paths: { tiles: { x: number; y: number }[] }[] } }[] };
  const map = world.levels.find(level => level.difficulty === "easy")!.map;
  const viewport = { width: canvasBounds!.width, height: canvasBounds!.height };
  const insets = await page.evaluate(() => {
    const stage = document.querySelector("#game-root")!.getBoundingClientRect();
    const header = document.querySelector(".gameplay-header")!.getBoundingClientRect();
    const controls = document.querySelector(".control-panel")!.getBoundingClientRect();
    return {
      top: Math.max(48, header.bottom - stage.top + 4),
      bottom: Math.max(12, stage.height - (controls.top - stage.top) + 4),
    };
  });
  const sum = map.width + map.height;
  const tileWidth = 52 * Math.min((viewport.width - 32) / (sum * 26), (viewport.height - insets.top - insets.bottom) / (sum * 16));
  const tileHeight = tileWidth * 32 / 52;
  const anchorX = 16 + (viewport.width - 32) / 2 - ((map.width - map.height) * tileWidth) / 4;
  const anchorY = insets.top + (viewport.height - insets.top - insets.bottom) / 2 - ((sum - 2) * tileHeight) / 4;
  const route = map.paths[0]!.tiles;
  const targets = [.18, .5, .82].map(progress => route[Math.floor((route.length - 1) * progress)]!);
  const remainingSlots = [...map.buildSlots];
  const chosenSlots = targets.map(target => {
    remainingSlots.sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y));
    return remainingSlots.shift()!;
  });
  await page.getByRole("button", { name: /重炮塔/ }).click();
  for (const slot of chosenSlots) {
    await canvas.click({ position: { x: anchorX + (slot.x - slot.y) * tileWidth / 2, y: anchorY + (slot.x + slot.y) * tileHeight / 2 } });
  }
  await expect(page.locator("#gold-value")).toHaveText("20");
  await page.screenshot({ path: "qa/evidence/v3-gameplay-deployed.png", fullPage: true });

  await page.getByRole("button", { name: "1× 速度" }).click();
  inputTrace.push("Clicked 2× speed; speed label changed from 1× to 2×.");
  await expect(page.locator("#speed-button")).toHaveText("2× 速度");

  let terminal = "";
  for (let wave = 0; wave < 6; wave += 1) {
    if (await page.locator("#result-panel").isVisible()) break;
    const startWave = page.locator("#wave-button");
    await expect(startWave).toBeEnabled({ timeout: 45_000 });
    const label = await startWave.innerText();
    await startWave.click();
    inputTrace.push(`Clicked ${label}; Easy wave ${wave + 1} started.`);
    if (wave === 0) {
      await page.waitForTimeout(1600);
      await page.screenshot({ path: "qa/evidence/v3-gameplay-first-wave.png", fullPage: true });
    }
    await expect.poll(async () => {
      if (await page.locator("#result-panel").isVisible()) return "terminal";
      return await page.locator("#wave-button").isEnabled() ? "deployment" : "combat";
    }, { timeout: 100_000 }).toMatch(/deployment|terminal/);
    if (await page.locator("#result-panel").isVisible()) break;
  }

  await expect(page.locator("#result-panel")).toBeVisible({ timeout: 45_000 });
  terminal = await page.locator("#result-title").innerText();
  expect(terminal).toMatch(/防线守住了|基地失守/);
  await expect(page.locator("#game-status")).toHaveText(/防线守住了|基地失守/);
  inputTrace.push(`Game reached designed terminal outcome: ${terminal}.`);

  const screenshot = "qa/evidence/gameplay-result.png";
  await mkdir("qa/evidence", { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true });

  await expect.poll(async () => {
    const response = await request.get(`${api}/api/progress?playerId=local-player`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json() as { progress: { levelId: string; completed: boolean; bestWin: boolean | null }[] };
    return data.progress.find(record => record.levelId === "frontier-easy");
  }, { timeout: 10_000 }).toMatchObject({ completed: terminal.includes("防线守住了"), bestWin: terminal.includes("防线守住了") });

  await page.getByRole("button", { name: "返回世界详情" }).click();
  await expect(page.locator("#hub-screen")).toBeVisible();
  await expect(page.locator("#world-detail")).toBeVisible();
  inputTrace.push("Returned from the result to the current world's detail in the Hub.");
  await page.getByRole("button", { name: "开始挑战" }).first().click();
  await expect(page.locator("#gameplay-screen")).toBeVisible();
  await expect(page.locator("#game-status")).toHaveText("部署阶段");
  await expect(page.locator("#wave-value")).toHaveText("0 / 6");
  await expect(page.locator("#gold-value")).toHaveText("500");
  await expect(page.locator("#result-screen")).toBeHidden();
  inputTrace.push("Returned to the Hub, selected Easy, and launched a fresh run from the initial state.");

  await page.reload();
  await expect(page.getByRole("heading", { name: "幻想防线" })).toBeVisible();
  await page.locator("#menu-play").click();
  await expect(page.locator(".world-progress")).toContainText(terminal.includes("防线守住了") ? "简单 ✓" : "简单 可玩");
  await expect.poll(async () => {
    const response = await request.get(`${api}/api/progress?playerId=local-player`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json() as { progress: { levelId: string; completed: boolean; bestWin: boolean | null; bestDuration: number | null }[] };
    return data.progress.find(record => record.levelId === "frontier-easy");
  }).toMatchObject({ completed: terminal.includes("防线守住了"), bestWin: terminal.includes("防线守住了"), bestDuration: expect.any(Number) });
  inputTrace.push("Reloaded the page; the Easy progress badge and saved outcome were still present in SQLite.");

  await writeFile(evidencePath, JSON.stringify({
    schemaVersion: 1,
    runId: "easy-full-playthrough",
    environment: "Playwright Chromium desktop browser; Vite development build and isolated Node.js/SQLite server.",
    inputTrace,
    observations: {
      launch: { id: "browser-launch", inputs: ["Navigated to /"], state: "Fantasy Frontiers loaded with Easy deployment state." },
      render: { id: "game-render", inputs: ["Captured the rendered page at terminal outcome"], state: "Phaser canvas and outcome UI rendered.", visual: screenshot },
      input: { id: "player-input", inputs: inputTrace.slice(0, 2), state: "Speed control accepted browser input and updated its visible state." },
      coreLoop: { id: "easy-campaign-loop", inputs: inputTrace.filter(entry => entry.includes("wave")), state: "Easy waves advanced through the shared playable game runtime." },
      outcome: { id: "designed-outcome", inputs: ["Played Easy waves at 2× speed"], state: terminal, visual: screenshot },
      restart: { id: "restart-to-initial", inputs: ["Returned to campaign selection", "Selected Easy again"], state: "initial-state" },
    },
  }, null, 2));
});
