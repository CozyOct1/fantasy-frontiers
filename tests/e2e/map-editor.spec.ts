import { expect, test } from "@playwright/test";
import { createBenchmarkContent, draftFromMap } from "../../packages/maps/src/index";

test("author can validate, edit, undo and preview a canonical map without campaign writes", async ({ page }) => {
  const draft = {
    ...draftFromMap(createBenchmarkContent("easy", "editor-e2e").map, "editor-e2e-draft"),
    name: "编辑器闭环验证",
  };
  await page.addInitScript(value => localStorage.setItem("fantasy-frontiers.map-draft.v1", JSON.stringify(value)), draft);

  const campaignWrites: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && /\/api\/levels\/[^/]+\/(start|result)$/.test(request.url())) campaignWrites.push(request.url());
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  await page.goto("/map-editor.html");
  await expect(page.locator("#editor-grid [role=gridcell]")).toHaveCount(96);
  await expect(page.locator("#editor-status")).toContainText("地图与波次均合法");
  await expect(page.locator("#editor-preview")).toBeEnabled();

  await page.locator("#editor-tab-waves").click();
  await expect(page.locator("#editor-wave-view")).toBeVisible();
  await expect(page.locator("#editor-wave-list button")).toHaveCount(draft.wavePlan?.waves.length ?? 0);
  const beforeEvents = await page.locator("#editor-wave-events .wave-event-row").count();
  await page.locator("#editor-enemy-count").fill("2");
  await page.locator("#editor-wave-batch-add").click();
  await expect(page.locator("#editor-wave-events .wave-event-row")).toHaveCount(beforeEvents + 2);
  await expect(page.locator("#editor-save-state")).toContainText("未保存");

  await page.locator("#editor-tab-map").click();

  await page.locator("[data-editor-tool=obstacle]").click();
  await page.locator("#editor-grid [role=gridcell]").nth(95).click();
  await expect(page.locator("#editor-undo")).toBeEnabled();
  await page.locator("#editor-undo").click();
  await expect(page.locator("#editor-status")).toContainText("已撤销");

  await page.locator("#editor-preview").click();
  await expect(page).toHaveURL(/\?mapPreview=1$/);
  await expect(page.locator("#gameplay-screen")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#game-root canvas")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#level-label")).toContainText("地图工坊试玩");
  await page.locator("#leave-gameplay").click();
  await expect(page).toHaveURL(/\/map-editor\.html$/);

  expect(campaignWrites).toEqual([]);
  expect(errors).toEqual([]);
});
