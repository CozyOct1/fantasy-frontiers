import { expect, test } from "@playwright/test";

test("main menu separates play, creation tools, and settings", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "幻想防线" })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始冒险" })).toBeVisible();
  await expect(page.locator("#world-create-form")).toBeHidden();
  await page.screenshot({ path: "qa/evidence/v3-main-menu.png", fullPage: true });

  await page.getByRole("button", { name: "开始冒险" }).click();
  await expect(page.getByRole("heading", { name: "选择世界" })).toBeVisible();
  await expect(page.locator(".world-thumbnail").first()).toBeVisible();
  await page.getByRole("button", { name: "选择关卡" }).first().click();
  await expect(page.locator("#world-detail")).toBeVisible();
  await page.getByRole("button", { name: "开始挑战" }).first().click();
  await expect(page.locator("#gameplay-screen")).toBeVisible();

  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "返回世界详情" }).click();
  await expect(page.locator("#world-detail")).toBeVisible();
  await page.getByRole("button", { name: "返回世界" }).click();
  await page.getByRole("button", { name: "返回主菜单" }).click();

  await page.getByRole("button", { name: /创意工坊/ }).click();
  await expect(page.getByRole("button", { name: "生成世界" })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 评测" })).toBeVisible();
  await page.getByRole("button", { name: "生成世界" }).click();
  await expect(page.locator("#world-create-form")).toBeVisible();
  await page.getByRole("button", { name: "返回创意工坊" }).click();
  await page.getByRole("button", { name: "返回主菜单" }).click();

  await page.getByRole("button", { name: "游戏设置" }).click();
  await expect(page.locator("#settings-api-key")).toHaveAttribute("type", "password");
  await page.locator("#settings-model").fill("deepseek-chat");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.locator("#settings-status")).toContainText("当前浏览器");
});
