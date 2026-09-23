import { expect, test } from "@playwright/test";

test("three semantic worlds have matching distinct covers and battle biomes", async ({ page, request }) => {
  test.setTimeout(60_000);
  const response = await request.get("http://127.0.0.1:3102/api/worlds/frontier-world");
  const saved = await response.json();
  const worlds = ["森林浮岛", "水晶荒原", "黑暗裂隙"].map((name, index) => ({ ...saved.world, id: `storybook-${index}`, name, themeFamily: "fantasy", visualKeywords: [name] }));
  await page.route("**/api/worlds", route => route.fulfill({ json: { worlds } }));
  for (const world of worlds) await page.route(`**/api/worlds/${world.id}`, route => route.fulfill({ json: { ...saved, world, levels: saved.levels.map((level: object) => ({ ...level, worldId: world.id })) } }));
  const errors: string[] = [];
  page.on("dialog", dialog => dialog.accept());
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#lobby-state")).toContainText("4 类防御塔可用");
  await page.locator("#menu-play").click();
  await expect(page.locator(".world-card")).toHaveCount(3);
  await page.screenshot({ path: "qa/evidence/storybook-worlds.png" });
  for (const realm of ["forest", "crystal", "rift"]) {
    await page.locator(`.world-card[data-realm="${realm}"] button`).click();
    await page.getByRole("button", { name: "开始挑战" }).first().click();
    await expect(page.locator("#gameplay-screen")).toHaveAttribute("data-realm", realm);
    await expect(page.locator("#game-root canvas")).toBeVisible();
    await page.getByRole("button", { name: /弩塔/ }).click();
    await expect(page.locator("#game-message")).toContainText("伤害 12");
    await expect(page.locator("#game-message")).toContainText("1 次/秒");
    await page.screenshot({ path: `qa/evidence/storybook-${realm}.png` });
    await page.locator("#leave-gameplay").click();
    await page.locator("#close-world-detail").click();
  }
  expect(errors).toEqual([]);
});
