import { expect, test } from "@playwright/test";

test("在账户设置更换头像，刷新后显示，并可退出登录", async ({ page }) => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWMoCn9BEDGMKmIYhEEAAAKZ85HDKRzoAAAAAElFTkSuQmCC",
    "base64",
  );
  let saved = false;
  let usernameUpdates = 0;
  let passwordUpdates = 0;
  await page.addInitScript(() => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("username", "测试账号");
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    if (!pathname.startsWith("/api/")) return route.continue();
    if (pathname === "/api/auth/avatar") {
      expect(req.headers().authorization).toBe("Bearer test-token");
      if (req.method() === "PUT") {
        expect(req.headers()["content-type"]).toContain("multipart/form-data; boundary=");
        saved = true;
      }
      return saved
        ? route.fulfill({ contentType: "image/png", body: png })
        : route.fulfill({ status: 204 });
    }
    if (pathname === "/api/auth/change-username") {
      expect(req.postDataJSON()).toEqual({ newUsername: "知屿用户" });
      usernameUpdates++;
      return route.fulfill({ json: { data: { username: "知屿用户" } } });
    }
    if (pathname === "/api/auth/change-password") {
      passwordUpdates++;
      if (passwordUpdates === 1)
        return route.fulfill({ status: 400, json: { message: "原密码错误" } });
      expect(req.postDataJSON()).toEqual({ oldPassword: "old-test-2", newPassword: "new-test" });
      return route.fulfill({ json: { data: {} } });
    }
    if (pathname === "/api/knowledge-bases")
      return route.fulfill({ json: { data: [{ id: 1, name: "默认知识库", isDefault: 1 }] } });
    if (pathname.endsWith("/documents"))
      return route.fulfill({ json: { data: { items: [], total: 0 } } });
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto("/");
  const settings = page.getByRole("button", { name: "账户设置" });
  await expect(settings).toBeVisible();
  await expect(page.getByRole("button", { name: "模型设置", exact: true })).toHaveCount(0);
  await settings.click();
  await expect(page.getByRole("menuitem", { name: "模型设置" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "更换头像" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "修改资料" }).click();
  const dialog = page.getByRole("dialog", { name: "账户设置" });
  await expect(dialog.getByLabel("用户名", { exact: true })).toHaveValue("测试账号");
  await expect(dialog.getByLabel("原密码", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "个人资料" })).toHaveCount(0);
  const chooser = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "更换头像" }).click();
  await (await chooser).setFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
  const avatar = page.getByAltText("测试账号的头像");
  await expect(avatar).toHaveAttribute("src", /^blob:/);
  await page.setViewportSize({ width: 390, height: 480 });
  await dialog.getByLabel("用户名", { exact: true }).fill("知屿用户");
  await dialog.getByLabel("原密码", { exact: true }).fill("old-test-1");
  await dialog.getByLabel("新密码", { exact: true }).fill("new-test");
  await dialog.getByLabel("确认新密码", { exact: true }).fill("new-test");
  await dialog.getByRole("button", { name: "保存修改" }).click();
  await expect(dialog.getByText(/用户名已保存。密码修改失败/)).toBeVisible();
  await dialog.getByLabel("原密码", { exact: true }).fill("old-test-2");
  await dialog.getByRole("button", { name: "保存修改" }).click();
  await expect(dialog).toBeHidden();
  expect(usernameUpdates).toBe(1);
  expect(passwordUpdates).toBe(2);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(avatar).toHaveAttribute("src", /^blob:/);
  await page.locator("#document-sidebar .collapse-trigger").click();
  await expect(settings.getByAltText("测试账号的头像")).toBeVisible();
  await settings.click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await expect(page.getByText("退出确认", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect(page.getByRole("button", { name: "立即开始" })).toBeVisible();
});
