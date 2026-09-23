import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("http://127.0.0.1:3001/**", route => {
    const url = new URL(route.request().url());
    url.port = "3102";
    return route.continue({ url: url.toString() });
  });
});

test("client and local server bootstrap", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "幻想防线" })).toBeVisible();
  await expect(page.locator(".main-menu-view .scene-castle")).toHaveAttribute("src", /realm\/runtime\/castle/);
  await expect(page.locator("#hub-screen")).toBeVisible();
  await expect(page.locator("#gameplay-screen")).toBeHidden();
  await expect(page.locator("#game-root canvas")).toBeHidden();
  await page.locator("#menu-play").click();
  await page.getByRole("button", { name: /进入世界|继续探索/ }).first().click();
  await page.getByRole("button", { name: "开始挑战" }).first().click();
  await expect(page.locator("#gameplay-screen")).toBeVisible();
  await expect(page.locator("#game-status")).toContainText("部署阶段");
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType("resource").some(entry => entry.name.includes("enemy-normal-9")))) .toBe(true);
  expect(await page.evaluate(() => performance.getEntriesByType("resource").some(entry => /battle-backdrop|world-key-art/.test(entry.name)))).toBe(false);
  await expect(page.locator("#wave-button img")).toHaveCount(1);
  await expect(page.locator("#speed-button img")).toHaveCount(1);
  await expect(page.locator("#hub-screen")).toBeHidden();
  await expect(page.locator("#world-create-form")).toBeHidden();

  const health = await request.get("http://127.0.0.1:3102/health");
  expect(health.ok()).toBeTruthy();
  await expect(health).toBeOK();
  await expect(health.json()).resolves.toMatchObject({
    status: "ok",
    service: "fantasy-frontiers-server",
  });
});

test("player can open creation tools and return to adventure", async ({ page }) => {
  await page.goto("/");
  await page.locator("#menu-studio").click();
  await page.locator("#studio-generate").click();
  await expect(page.locator("#world-create-form")).toBeVisible();
  await page.getByRole("button", { name: "返回创意工坊" }).click();
  await page.getByRole("button", { name: "返回主菜单" }).click();
  await page.locator("#menu-play").click();
  await page.getByRole("button", { name: /进入世界|继续探索/ }).first().click();
  await expect(page.locator("#detail-levels")).toContainText("EASY");
  await page.getByRole("button", { name: "开始挑战" }).first().click();
  await expect(page.locator("#gameplay-screen")).toBeVisible();
  await expect(page.locator("#menu-studio")).toBeHidden();
});

test("player can enter a saved published world without calling world generation", async ({ page, request }) => {
  const response = await request.get("http://127.0.0.1:3102/api/worlds/frontier-world");
  expect(response.ok()).toBeTruthy();
  const savedWorld = await response.json() as { world: { id: string; status: string }; levels: unknown[]; [key: string]: unknown };
  savedWorld.world.status = "published";
  await page.route("**/api/worlds", route => route.fulfill({ json: { worlds: [savedWorld.world] } }));
  await page.route("**/api/worlds/frontier-world", route => route.fulfill({ json: savedWorld }));
  let generationRequested = false;
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("generation")) generationRequested = true; });
  await page.goto("/");
  await page.locator("#menu-play").click();
  await page.getByRole("button", { name: /进入世界|继续探索/ }).first().click();
  await expect(page.locator("#world-detail")).toBeVisible();
  await page.getByRole("button", { name: "开始挑战" }).first().click();
  await expect(page.locator("#gameplay-screen")).toBeVisible();
  await expect(page.locator("#level-label")).toContainText("边境哨站");
  await expect(page.locator("#game-root canvas")).toBeVisible();
  await expect(page.locator("#wave-value")).toHaveText("0 / 6");
  expect(generationRequested).toBe(false);
});

test("application fills desktop and phone viewports without page scrolling", async ({ page }) => {
  await page.goto("/");
  await page.locator("#menu-play").click();
  await page.getByRole("button", { name: /进入世界|继续探索/ }).first().click();
  await page.getByRole("button", { name: "开始挑战" }).first().click();

  const stage = page.locator(".game-stage");
  const shell = page.locator(".shell");
  const canvas = page.locator("#game-root canvas");
  await expect(canvas).toBeVisible();
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const [shellBounds, stageBounds, canvasBounds, documentSize] = await Promise.all([
        shell.boundingBox(), stage.boundingBox(), canvas.boundingBox(),
        page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })),
      ]);
      if (!shellBounds || !stageBounds || !canvasBounds) return false;
      return Math.abs(shellBounds.width - viewport.width) < 2
        && Math.abs(shellBounds.height - viewport.height) < 2
        && shellBounds.width <= viewport.width + 1
        && shellBounds.height <= viewport.height + 1
        && stageBounds.x >= shellBounds.x
        && stageBounds.y >= shellBounds.y
        && stageBounds.x + stageBounds.width <= shellBounds.x + shellBounds.width + 1
        && stageBounds.y + stageBounds.height <= shellBounds.y + shellBounds.height + 1
        && Math.abs(canvasBounds.width - stageBounds.width) < 2
        && Math.abs(canvasBounds.height - stageBounds.height) < 2
        && documentSize.width <= viewport.width
        && documentSize.height <= viewport.height;
    }).toBe(true);
    if (viewport.width >= 1000) {
      await expect(page.getByRole("button", { name: "开始第一波" })).toBeVisible();
      await expect(page.getByRole("button", { name: "返回世界详情" })).toBeVisible();
    }
    await page.screenshot({ path: `qa/evidence/v4-gameplay-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }
});

test("player can build, upgrade, start, pause, and restart an Easy game", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.locator("#menu-play").click();
  await page.getByRole("button", { name: /进入世界|继续探索/ }).first().click();
  const canvas = page.locator("#game-root canvas");
  await page.getByRole("button", { name: "开始挑战" }).first().click();
  await expect(canvas).toBeVisible();
  await expect(page.locator("#hub-screen")).toBeHidden();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;
  const worldResponse = await page.request.get("http://127.0.0.1:3102/api/worlds/frontier-world");
  const world = await worldResponse.json() as { levels: { difficulty: string; map: { width: number; height: number; buildSlots: { x: number; y: number }[] } }[] };
  const map = world.levels.find(level => level.difficulty === "easy")!.map;
  const sum = map.width + map.height;
  const viewWidth = bounds.width;
  const viewHeight = bounds.height;
  const insets = await page.evaluate(() => {
    const stage = document.querySelector("#game-root")!.getBoundingClientRect();
    const header = document.querySelector(".gameplay-header")!.getBoundingClientRect();
    const controls = document.querySelector(".control-panel")!.getBoundingClientRect();
    return {
      top: Math.max(48, header.bottom - stage.top + 4),
      bottom: Math.max(12, stage.height - (controls.top - stage.top) + 4),
    };
  });
  const insetTop = insets.top;
  const insetBottom = insets.bottom;
  const scale = Math.min((viewWidth - 32) / (sum * 26), (viewHeight - insetTop - insetBottom) / (sum * 16));
  const tileWidth = 52 * scale;
  const tileHeight = 32 * scale;
  const anchorX = viewWidth / 2 - ((map.width - map.height) * tileWidth) / 4;
  const anchorY = insetTop + (viewHeight - insetTop - insetBottom) / 2 - ((sum - 2) * tileHeight) / 4;
  let slotPixel = { x: 0, y: 0 };
  for (const slot of map.buildSlots) {
    const worldX = anchorX + (slot.x - slot.y) * tileWidth / 2;
    const worldY = anchorY + (slot.x + slot.y) * tileHeight / 2;
    slotPixel = { x: worldX, y: worldY };
    await canvas.click({ position: slotPixel });
    if (await page.locator("#game-message").innerText().then(text => text.includes("建造位已选中"))) break;
  }
  await expect(page.locator("#game-message")).toContainText("建造位已选中");
  await page.getByRole("button", { name: /弩塔/ }).click();
  await expect(page.locator("#gold-value")).toHaveText("420");
  await canvas.click({ position: slotPixel });
  await expect(page.locator("#tower-context-panel")).toBeVisible();
  await page.locator("#upgrade-button").click();
  await expect(page.locator("#tower-context-level")).toHaveText("Lv.2");
  await page.locator("#speed-button").click();
  await expect(page.locator("#tower-context-panel")).toBeHidden();
  await canvas.click({ position: slotPixel });
  await expect(page.locator("#tower-context-panel")).toBeVisible();

  await page.getByRole("button", { name: "开始第一波" }).click();
  await expect(page.locator("#game-status")).toContainText("战斗进行中");
  await page.getByRole("button", { name: "暂停" }).click();
  await expect(page.locator("#game-status")).toContainText("已暂停");
  await expect(page.locator("#pause-overlay")).toBeVisible();
  await page.locator("#restart-button").click();
  await expect(page.locator("#game-status")).toContainText("部署阶段");
  await expect(page.locator("#gold-value")).toHaveText("500");
  await expect(page.locator("#wave-value")).toHaveText("0 / 6");
});

test("Easy, Medium, and Hard all enter the shared Gameplay screen", async ({ page }) => {
  await page.goto("/");
  await page.locator("#menu-play").click();
  await page.getByRole("button", { name: /进入世界|继续探索/ }).first().click();
  page.on("dialog", dialog => dialog.accept());
  for (const [index, difficulty] of [[0, "EASY"], [1, "MEDIUM"], [2, "HARD"]] as const) {
    await page.locator("#detail-levels button").nth(index).click();
    await expect(page.locator("#gameplay-screen")).toBeVisible();
    await expect(page.locator("#level-label")).toContainText(difficulty);
    await page.locator("#leave-gameplay").click();
    await expect(page.locator("#hub-screen")).toBeVisible();
  }
});

test("Pause overlay resumes the same running battle and speed control toggles", async ({ page }) => {
  await page.goto("/");
  await page.locator("#menu-play").click();
  await page.getByRole("button", { name: /进入世界|继续探索/ }).first().click();
  await page.getByRole("button", { name: "开始挑战" }).first().click();
  await page.locator("#wave-button").click();
  await expect(page.locator("#game-status")).toContainText("战斗进行中");
  await page.locator("#speed-button").click();
  await expect(page.locator("#speed-button")).toHaveText("2× 速度");
  await page.locator("#pause-button").click();
  await expect(page.locator("#pause-overlay")).toBeVisible();
  const waveBeforeResume = await page.locator("#wave-value").innerText();
  await page.locator("#pause-resume").click();
  await expect(page.locator("#pause-overlay")).toBeHidden();
  await expect(page.locator("#game-status")).toContainText("战斗进行中");
  await expect(page.locator("#wave-value")).toHaveText(waveBeforeResume);
});

test("reduced motion keeps the battle readable and running", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("#menu-play").click();
  await page.getByRole("button", { name: /进入世界|继续探索/ }).first().click();
  await page.getByRole("button", { name: "开始挑战" }).first().click();
  await expect(page.locator("#game-root canvas")).toBeVisible();
  await page.locator("#wave-button").click();
  await expect(page.locator("#game-status")).toHaveText("战斗进行中");
  await expect.poll(async () => Number(await page.locator("#gameplay-screen").getAttribute("data-debug-elapsed")), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(page.locator("#hp-value")).toBeVisible();
  await expect(page.locator("#wave-value")).toHaveText("1 / 6");
  await page.screenshot({ path: "qa/evidence/v4-reduced-motion.png", fullPage: true });
});

test("an enemy leak produces visible base damage feedback", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await page.locator("#menu-play").click();
  await page.getByRole("button", { name: /进入世界|继续探索/ }).first().click();
  await page.getByRole("button", { name: "开始挑战" }).first().click();
  await page.locator("#speed-button").click();
  await page.locator("#wave-button").click();
  await expect.poll(async () => Number((await page.locator("#hp-value").innerText()).split("/")[0]?.trim()), { timeout: 35_000 }).toBeLessThan(30);
  await expect(page.locator("#battle-feedback")).toContainText("基地受损");
  await page.screenshot({ path: "qa/evidence/v4-base-hit.png", fullPage: true });
});
