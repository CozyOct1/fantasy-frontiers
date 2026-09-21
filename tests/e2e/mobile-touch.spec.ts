import { expect, test } from "@playwright/test";
import { createBoardProjection } from "../../apps/game/src/game/board-projection";
import type { MapSpec } from "../../packages/shared/src/index";

test("portrait touch can deploy a tower with a forgiving slot target", async ({ browser, request }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto("http://127.0.0.1:5173");
    await page.locator("#menu-play").tap();
    await page.getByRole("button", { name: "选择关卡" }).first().tap();
    await page.getByRole("button", { name: "开始挑战" }).first().tap();
    const canvas = page.locator("#game-root canvas");
    await expect(canvas).toBeVisible();
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
    const pixel = projection.project(map.buildSlots[0]!);
    await page.getByRole("button", { name: /弩塔/ }).tap();
    await canvas.tap({ position: { x: pixel.x + 10, y: pixel.y } });
    await expect(page.locator("#gold-value")).toHaveText("420");
    await page.locator("#wave-button").tap();
    await expect(page.locator("#game-status")).toHaveText("战斗进行中");
    await page.locator("#pause-button").tap();
    await expect(page.locator("#pause-overlay")).toBeVisible();
    await page.locator("#pause-resume").tap();
    await expect(page.locator("#pause-overlay")).toBeHidden();
    expect(errors).toEqual([]);
    await page.screenshot({ path: "qa/evidence/realm-mobile-touch.png" });
  } finally { await context.close(); }
});
