import { expect, test, type Page } from "@playwright/test";
import { openQuiz, quizFixture } from "./quiz-fixture";

async function chooseTheme(page: Page, label: "浅色模式" | "深色模式") {
  await page.getByRole("button", { name: "账户设置" }).click();
  await expect(page.getByRole("menuitem", { name: label })).not.toBeVisible();
  await page.getByRole("button", { name: "当前主题" }).hover();
  const submenu = page.locator(".theme-settings-submenu:visible");
  await expect(submenu).toHaveAttribute("data-popper-placement", "right-start");
  const parent = page.locator(".account-settings-menu:not(.theme-settings-submenu):visible");
  expect((await submenu.boundingBox())!.x).toBeGreaterThanOrEqual(
    (await parent.boundingBox())!.x + (await parent.boundingBox())!.width - 2,
  );
  await page.getByRole("menuitem", { name: label }).click();
}

test("登录页切换主题，刷新后保留配色并覆盖登录表单", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".landing-container")).toHaveCSS(
    "background-color",
    "rgb(248, 250, 252)",
  );
  await page.getByRole("button", { name: "切换到深色模式" }).click();
  await expect(page.locator(".landing-container")).toHaveCSS("background-color", "rgb(18, 18, 20)");
  await page.reload();
  await expect(page.getByRole("button", { name: "切换到浅色模式" })).toBeVisible();
  await page.getByRole("button", { name: "立即开始" }).click();
  await expect(page.locator(".auth-card")).toHaveCSS("background-color", "rgb(28, 28, 31)");
  await expect(page.locator(".auth-card input").first()).toBeVisible();
});

test("工作区切换主题，设置、文档弹窗、测验与阅读器使用同一配色", async ({ page }) => {
  await quizFixture(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#document-sidebar")).toHaveCSS("background-color", "rgb(18, 18, 20)");
  await chooseTheme(page, "浅色模式");
  await expect(page.locator("#document-sidebar")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator("#panel-workbench")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".qa-controls .el-select__wrapper")).toHaveCSS(
    "background-color",
    "rgb(241, 245, 249)",
  );

  await page.getByRole("button", { name: "账户设置" }).click();
  await expect(page.getByRole("button", { name: "当前主题" })).toContainText("浅色模式");
  await page.getByRole("menuitem", { name: "修改资料" }).click();
  await expect(page.getByRole("heading", { name: "账户设置" })).toBeVisible();
  await expect(page.locator(".modal-container")).toHaveCSS(
    "background-color",
    "rgb(241, 245, 249)",
  );
  await page.locator(".modal-container .close-btn").click();
  await page.getByRole("button", { name: "模型设置" }).click();
  await expect(page.getByRole("dialog", { name: "模型设置" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "管理文档", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "测试知识库" })).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.locator(".el-drawer__close-btn:visible").click();

  await openQuiz(page);
  await page.getByRole("radio", { name: /A 在相邻节点/ }).click();
  await expect(page.locator(".quiz-option.correct")).toHaveCSS(
    "background-color",
    "rgb(237, 248, 242)",
  );
  await chooseTheme(page, "深色模式");
  await expect(page.locator(".quiz-option.correct")).toHaveCSS(
    "background-color",
    "rgb(25, 40, 32)",
  );
  await page.locator(".quiz-panel .quiz-source-link").click();
  await expect(page.getByRole("region", { name: "文档阅读器" })).toHaveCSS(
    "background-color",
    "rgb(18, 18, 20)",
  );
});

test("学习卡片和导图画布切换主题，保留导图节点", async ({ page }) => {
  await quizFixture(page);
  await page.route("**/api/analysis?*", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 31,
            documentId: 7,
            type: "FLASHCARD",
            documentName: "网络原理.md",
            content: JSON.stringify([{ q: "什么是帧？", a: "数据链路层的传输单位。" }]),
            createdAt: "2026-11-17T10:00:00",
          },
        ],
      },
    }),
  );
  await page.route("**/api/mindmaps/workspace?*", (route) =>
    route.fulfill({
      json: {
        data: {
          items: [{ id: 32, title: "网络导图", createdAt: "2026-11-17", documentId: 7 }],
          generationTasks: [],
        },
      },
    }),
  );
  await page.route("**/api/mindmaps/32", (route) =>
    route.fulfill({
      json: {
        data: {
          id: 32,
          title: "网络导图",
          data: JSON.stringify({
            root: { data: { text: "数据链路层" }, children: [{ data: { text: "帧" } }] },
          }),
        },
      },
    }),
  );

  await page.locator(".wb-tab").getByText("学习卡片", { exact: true }).click();
  const flashcard = page.locator("#panel-workbench").getByText("网络原理.md", { exact: true });
  await flashcard.click();
  await expect(page.locator(".flashcard-overlay")).toHaveCSS(
    "background-image",
    /rgb\(15, 12, 26\)/,
  );
  await page.locator(".fc-close").click();
  await chooseTheme(page, "浅色模式");
  await flashcard.click();
  await expect(page.locator(".flashcard-overlay")).toHaveCSS(
    "background-image",
    /rgb\(244, 247, 252\)/,
  );
  await page.locator(".fc-close").click();

  await page.reload();
  await page.getByText("网络导图", { exact: true }).click();
  const canvas = page.locator(".mindmap-canvas");
  await expect(canvas.locator(".smm-node").filter({ hasText: "数据链路层" })).toBeVisible();
  await expect(canvas).toHaveCSS("background-color", "rgb(243, 247, 252)");
  await chooseTheme(page, "深色模式");
  await expect(canvas).toHaveCSS("background-color", "rgb(17, 24, 32)");
  await expect(canvas.locator(".smm-node").filter({ hasText: "数据链路层" })).toBeVisible();
  await expect(page.locator(".dirty-state")).toHaveCount(0);
});
