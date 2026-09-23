import { expect, test } from "@playwright/test";

test("production subpath loads its assets, API data, and Phaser canvas", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(process.env.PRODUCTION_SMOKE !== "1", "Run after pnpm build with a preview on port 4173.");
  await page.route("http://127.0.0.1:4173/fantasy-frontiers/api/**", route => {
    const url = new URL(route.request().url());
    url.hostname = "127.0.0.1";
    url.port = "3001";
    url.pathname = url.pathname.replace(/^\/fantasy-frontiers/, "");
    return route.continue({ url: url.toString() });
  });
  const failedResponses: string[] = [];
  page.on("response", response => {
    const editorCapabilityProbe = response.status() === 404 && response.url().endsWith("/api/editor/map-drafts");
    if (response.status() >= 400 && !editorCapabilityProbe) failedResponses.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("http://127.0.0.1:4173/fantasy-frontiers/");
  await expect(page.getByRole("heading", { name: "幻想防线" })).toBeVisible();
  await page.locator("#menu-studio").click();
  await page.getByRole("link", { name: /地图工坊/ }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4173/fantasy-frontiers/map-editor.html");
  await expect(page.getByRole("heading", { name: "地图工坊", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "返回游戏" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4173/fantasy-frontiers/");
  await page.locator("#menu-play").click();
  await page.getByRole("button", { name: /进入世界|继续探索/ }).first().click();
  await page.getByRole("button", { name: "开始挑战" }).first().click();
  await expect(page.locator("#game-root canvas")).toBeVisible();
  await expect(page.locator("#wave-button img")).toHaveCount(1);
  expect(failedResponses).toEqual([]);
  await page.screenshot({ path: "qa/evidence/v4-production-subpath.png", fullPage: true });
});
