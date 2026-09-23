import { expect, test } from "@playwright/test";
import { createBoardProjection } from "../../apps/game/src/game/board-projection";
import type { MapSpec } from "../../packages/shared/src/index";

test.beforeEach(async ({ page }) => {
  await page.route("http://127.0.0.1:3001/**", route => {
    const url = new URL(route.request().url());
    url.port = "3102";
    return route.continue({ url: url.toString() });
  });
});

test("V6 audio preferences persist and controlled local audio unlocks after a gesture", async ({ page }) => {
  const failedAudio: string[] = [];
  page.on("response", response => {
    if (/\.(?:ogg|mp3)(?:\?|$)/.test(response.url()) && !response.ok()) failedAudio.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("/");
  await page.getByRole("button", { name: "游戏设置" }).click();
  await expect(page.locator("#audio-status")).toContainText(/声音已启用|浏览器未允许声音/);
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType("resource").filter(entry => /\.(?:ogg|mp3)(?:\?|$)/.test(entry.name)).length)).toBeGreaterThan(0);

  await page.locator("#settings-muted").check();
  await page.locator("#settings-reduce-intense-audio").check();
  await page.locator("#settings-screen-shake").uncheck();
  await page.getByRole("button", { name: "保存设置" }).click();
  await page.reload();
  await page.getByRole("button", { name: "游戏设置" }).click();
  await expect(page.locator("#settings-muted")).toBeChecked();
  await expect(page.locator("#settings-reduce-intense-audio")).toBeChecked();
  await expect(page.locator("#settings-screen-shake")).not.toBeChecked();
  expect(failedAudio).toEqual([]);
});

test("V6 threat brief, contextual tower role, and sell refund form a recoverable deployment loop", async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem("fantasy-frontiers.onboarding.v1", "complete"));
  await page.goto("/");
  await page.locator("#menu-play").click();
  await page.getByRole("button", { name: /进入世界|继续探索/ }).first().click();
  await page.getByRole("button", { name: "开始挑战" }).first().click();

  await expect(page.locator("#wave-brief")).toBeVisible();
  await expect(page.locator("#wave-brief-copy")).not.toContainText("读取敌军情报中");

  const canvas = page.locator("#game-root canvas");
  const response = await request.get("http://127.0.0.1:3102/api/worlds/frontier-world");
  const world = await response.json() as { levels: { difficulty: string; map: MapSpec }[] };
  const map = world.levels.find(level => level.difficulty === "easy")!.map;
  const bounds = (await canvas.boundingBox())!;
  const insets = await page.evaluate(() => {
    const stage = document.querySelector("#game-root")!.getBoundingClientRect();
    return {
      top: Math.max(48, document.querySelector(".gameplay-header")!.getBoundingClientRect().bottom - stage.top + 4),
      bottom: Math.max(12, stage.bottom - document.querySelector(".control-panel")!.getBoundingClientRect().top + 4),
    };
  });
  const projection = createBoardProjection(map.width, map.height, bounds.width, bounds.height, { ...insets, left: 16, right: 16 });

  let towerPixel = projection.project(map.buildSlots[0]!);
  for (const slot of map.buildSlots) {
    const pixel = projection.project(slot);
    await canvas.click({ position: pixel });
    if ((await page.locator("#game-message").innerText()).includes("建造位已选中")) { towerPixel = pixel; break; }
  }
  await page.getByRole("button", { name: /弩塔/ }).click();
  await expect(page.locator("#gold-value")).toHaveText("420");

  await canvas.click({ position: towerPixel });
  await expect(page.locator("#tower-context-role")).toContainText("单体输出");
  await page.locator("#upgrade-button").click();
  await expect(page.locator("#tower-context-level")).toHaveText("Lv.2");

  page.once("dialog", dialog => dialog.accept());
  await page.locator("#sell-button").click();
  await expect(page.locator("#gold-value")).toHaveText("430");
  await expect(page.locator("#battle-feedback")).toContainText("返还 70 金币");
  await expect(page.locator("#tower-context-panel")).toBeHidden();
});
