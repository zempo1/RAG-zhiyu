import { expect, test } from "@playwright/test";

test("预览逐字显示回复，且没有引用跳转", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "查看演示" }).click();

  const preview = page.getByRole("region", { name: "知屿工作区预览" });
  const output = preview.locator(".typed-answer");
  await expect(output).toHaveClass(/is-typing/);
  await page.clock.runFor(500);
  await expect(output).toHaveText(/^三次握手.+/);
  await expect(output).not.toContainText("初始序列号");
  await page.clock.runFor(2500);
  await expect(output).toHaveText(/初始序列号。$/);
  await expect(preview.getByRole("link")).toHaveCount(0);
});

test("登录页可向下浏览新版功能，并从底部打开登录", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "查看演示" }).click();
  await expect(page.getByRole("region", { name: "知屿工作区预览" })).toBeInViewport();
  await page.getByRole("link", { name: "浏览全部功能" }).click();
  await expect(page.getByRole("heading", { name: "从资料到自己的知识" })).toBeInViewport();

  const learning = page.getByRole("region", { name: "学习与复习" });
  await expect(learning).not.toBeInViewport();
  await expect(learning).toHaveCSS("opacity", "0");
  await page.getByRole("link", { name: "学习与复习" }).click();
  await expect(learning).toBeInViewport();
  await expect(learning.getByRole("heading", { name: "错题整理" })).toBeInViewport();
  await expect(learning).toHaveCSS("opacity", "1");

  await page.getByRole("button", { name: "进入知屿" }).click();
  await expect(page.getByRole("heading", { name: "登录", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "立即注册" }).click();
  await expect(page.getByRole("heading", { name: "注册", exact: true })).toBeVisible();
});

test("窄屏下所有功能都可滚动查看，减少动态效果时直接显示", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#learning", { waitUntil: "domcontentloaded" });

  const learning = page.getByRole("region", { name: "学习与复习" });
  await expect(learning.getByRole("heading", { name: "学习与复习" })).toBeInViewport();
  await expect(learning).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  await page.getByRole("heading", { name: "模型设置" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "模型设置" })).toBeInViewport();

  await page.getByRole("link", { name: "查看演示" }).click();
  const preview = page.getByRole("region", { name: "知屿工作区预览" });
  await expect(preview.locator(".typed-answer")).toHaveText(/初始序列号。$/);
  await expect(preview.locator(".is-typing")).toHaveCount(0);
});
