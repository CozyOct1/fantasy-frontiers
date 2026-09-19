import { expect, test } from "@playwright/test";

test("production subpath loads its assets, API data, and Phaser canvas", async ({ page }) => {
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
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("http://127.0.0.1:4173/fantasy-frontiers/");
  await expect(page.getByRole("heading", { name: "幻想防线" })).toBeVisible();
  await page.getByRole("button", { name: "管理详情" }).first().click();
  await page.getByRole("button", { name: "试玩关卡" }).first().click();
  await expect(page.locator("#game-root canvas")).toBeVisible();
  await expect(page.locator("#wave-button img")).toHaveCount(1);
  expect(failedResponses).toEqual([]);
  await page.screenshot({ path: "qa/evidence/v4-production-subpath.png", fullPage: true });
});
