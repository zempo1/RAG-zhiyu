import { expect, test, type Page } from "@playwright/test";
import type {
  ReviewItem,
  ReviewPractice,
  ReviewTask,
  StartReview,
} from "../../src/api/quiz-reviews";
import { quizFixture } from "./quiz-fixture";

const stem = "在共享链路上，什么情况下需要判断帧是否完整才能交付给上层？";
const topic = { key: "frame-transfer", label: "帧传输" };
const source = {
  quizId: 21,
  questionId: "q1",
  documentId: 7,
  filename: "网络原理.md",
  versionId: 1,
  indexRevisionId: 1,
  sourceOutdated: false,
};
const question = {
  id: "q1",
  stem,
  type: "SINGLE" as const,
  options: [
    { id: "A", text: "接收数据帧时" },
    { id: "B", text: "选择全网路由时" },
  ],
  evidence: [
    {
      chunkId: 71,
      quote: "数据链路层在相邻节点之间传输数据帧。",
      location: { heading: "数据链路层", paragraph: 1, start: 0, end: 20 },
    },
  ],
  correctOptionIds: ["A"],
  explanation: "先确认数据帧完整，再交付给上层。",
  optionExplanations: { A: "接收方需要检查数据帧。", B: "这是网络层的任务。" },
};
const initialItem: ReviewItem = {
  id: 51,
  quizId: 21,
  questionId: "q1",
  documentId: 7,
  filename: source.filename,
  stem,
  type: "SINGLE",
  status: "pending",
  wrongCount: 2,
  lastWrongAt: "2026-11-23T01:00:00",
  lastWrongSelection: ["B"],
  topicKey: topic.key,
  topicLabel: topic.label,
  question,
  source,
};

async function reviewFixture(page: Page, theme: "light" | "dark", unclassified = false) {
  await page.addInitScript((value) => localStorage.setItem("islet.theme", value), theme);
  const ordinary = await quizFixture(page);
  const item = structuredClone(initialItem);
  if (unclassified) item.topicKey = item.topicLabel = null;
  const requests: StartReview[] = [];
  let practice: Omit<ReviewPractice, "questions"> | undefined;
  let variantTask: Partial<ReviewTask> | undefined;
  const categories = unclassified ? [] : [{ ...topic }];
  const { evidence, explanation, correctOptionIds, optionExplanations, ...publicQuestion } =
    question;
  const practiceView = () => ({
    ...practice,
    questions: Array.from({ length: practice?.totalCount ?? 0 }, (_, index) => {
      const shown = practice?.answers.q1?.submitted ? question : { ...publicQuestion, evidence: [] };
      return { ...shown, id: `q${index + 1}`, stem: index ? stem + `（题目 ${index + 1}）` : stem, source };
    }),
  });
  await page.route("**/api/quiz-reviews/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/workspace")) {
      const status = url.searchParams.get("status");
      const selected = url.searchParams.get("topic");
      const documentId = url.searchParams.get("documentId");
      const items =
        item.status === status && (!selected || selected === (item.topicKey ?? "unclassified")) &&
          (!documentId || Number(documentId) === item.documentId)
          ? [item]
          : [];
      return route.fulfill({
        json: {
          data: {
            items,
            total: items.length,
            page: 1,
            pageSize: 20,
            counts: {
              pending: item.status === "pending" ? 1 : 0,
              mastered: item.status === "mastered" ? 1 : 0,
              unclassified: item.topicKey ? 0 : 1,
            },
            practiceCounts: {
              document: documentId === String(item.documentId) ? 1 : 0,
              topic: selected === (item.topicKey ?? "unclassified") ? 1 : 0,
            },
            topics: categories,
            documents: [
              {
                id: 7,
                filename: source.filename,
                ready: true,
                topicKeys: [item.topicKey ?? "unclassified"],
              },
            ],
            practices: practice ? [practice] : [],
            generationTasks: variantTask ? [variantTask] : [],
          },
        },
      });
    }
    if (url.pathname.endsWith("/categories") && route.request().method() === "POST") {
      const created = { key: topic.key, label: route.request().postDataJSON().label };
      categories.push(created);
      return route.fulfill({ json: { data: created } });
    }
    if (url.pathname.includes("/categories/") && route.request().method() === "DELETE") {
      categories.length = 0;
      item.topicKey = item.topicLabel = null;
      return route.fulfill({ json: { data: { deleted: true } } });
    }
    if (url.pathname.endsWith("/category") && route.request().method() === "PATCH") {
      const selected = categories.find(({ key }) => key === route.request().postDataJSON().topic);
      item.topicKey = selected?.key ?? null;
      item.topicLabel = selected?.label ?? null;
      return route.fulfill({ json: { data: { id: item.id, topicKey: item.topicKey, topicLabel: item.topicLabel } } });
    }
    if (url.pathname.endsWith("/practices")) {
      const payload = route.request().postDataJSON() as StartReview;
      requests.push(payload);
      practice = {
        id: 401,
        mode: payload.mode,
        knowledgeBaseId: 1,
        topicLabel: topic.label,
        topicKey: topic.key,
        status: "in_progress",
        score: 0,
        createdAt: "2026-11-23T01:30:00",
        completedAt: null,
        totalCount: payload.mode === "original" && payload.documentId ? 24 : 1,
        currentIndex: 0,
        answeredCount: 0,
        correctCount: 0,
        answers: {},
      };
      if (payload.mode === "variant") {
        variantTask = {
          id: 88,
          kind: "quiz",
          status: "running",
          stage: "generating",
          completed: 0,
          total: 3,
        };
        return route.fulfill({ json: { data: { taskId: 88 } } });
      }
      return route.fulfill({ json: { data: { practiceId: 401 } } });
    }
    if (url.pathname.endsWith("/practices/401") && route.request().method() === "DELETE") {
      practice = undefined;
      return route.fulfill({ json: { data: { deleted: true } } });
    }
    if (url.pathname.endsWith("/progress") && practice) {
      const payload = route.request().postDataJSON();
      if (payload.currentIndex !== undefined) practice.currentIndex = payload.currentIndex;
      if (payload.submit) {
        const isCorrect = payload.selectedOptionIds.join() === "A";
        item.status = isCorrect ? "mastered" : "pending";
        practice.status = "completed";
        practice.answers.q1 = {
          submitted: true,
          isCorrect,
          selectedOptionIds: payload.selectedOptionIds,
        };
        practice.answeredCount = 1;
        practice.correctCount = Number(isCorrect);
        practice.score = Number(isCorrect) * 100;
      }
    }
    return route.fulfill({ json: { data: practiceView() } });
  });
  await page.route("**/api/tasks/88", (route) => route.fulfill({ json: { data: variantTask } }));
  const workbench = page.getByRole("region", { name: "错题整理" });
  await page.getByRole("button", { name: "错题整理", exact: true }).click();
  await expect(workbench.getByText(stem)).toBeVisible();
  return {
    workbench,
    ordinary,
    requests,
    finishVariant: () => {
      variantTask = {
        ...variantTask,
        status: "completed",
        stage: "completed",
        quizResult: { quizId: 22, practiceId: 401 },
      };
    },
  };
}

async function selectReviewOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  const choice = page.getByRole("option", { name: option, exact: true });
  await choice.click();
  await expect(choice).toBeHidden();
}

test("错题详情和原文回看、原题复练及掌握状态", async ({ page }) => {
  const { workbench, ordinary, requests } = await reviewFixture(page, "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await workbench.getByRole("button", { name: "全屏错题整理" }).click();
  const fullscreen = page.getByRole("dialog", { name: "错题整理全屏" });
  await expect(fullscreen).toBeVisible();
  await expect(page.locator(".main-content")).toBeHidden();
  await expect(workbench.getByText("错 2 次")).toBeVisible();
  await workbench.getByRole("button", { name: stem, exact: false }).click();
  await expect(workbench.getByText("最近错答")).toBeVisible();
  await workbench.getByRole("button", { name: "数据链路层", exact: true }).click();
  await expect(page.locator("#panel-reader")).toBeVisible();
  await page.getByRole("button", { name: "关闭阅读器" }).click();
  await expect(fullscreen).toBeVisible();
  await expect(workbench.getByText("正确答案")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(fullscreen).toBeHidden();
  await selectReviewOption(page, "知识点", topic.label);
  await expect(workbench.getByRole("button", { name: "复练知识点错题" })).toBeEnabled();
  if (process.env.QUIZ_REVIEW_SCREENSHOTS) {
    await page.mouse.move(5, (page.viewportSize()?.height ?? 844) - 2);
    await page
      .locator("#panel-workbench")
      .screenshot({ path: "../.shared/quiz-review-desktop-dark.png" });
  }
  await workbench.getByRole("button", { name: "复练知识点错题" }).click();
  const practice = page.getByRole("region", { name: "错题复练答题面板" });
  await expect(practice.getByText(stem)).toBeVisible();
  await expect(practice.getByText(question.explanation)).toHaveCount(0);
  await practice.getByRole("radio", { name: "A 接收数据帧时" }).click();
  await expect(practice.getByText("100", { exact: false }).first()).toBeVisible();
  await practice.getByRole("button", { name: "查看全部解析" }).click();
  await practice.getByRole("button", { name: "数据链路层", exact: true }).click();
  await expect(page.locator("#panel-reader")).toBeVisible();
  await page.getByRole("button", { name: "关闭阅读器" }).click();
  await expect(practice.getByRole("heading", { name: stem })).toBeVisible();
  await practice.getByRole("button", { name: "查看成绩" }).click();
  await practice.getByRole("button", { name: "返回错题整理" }).click();
  await workbench.getByRole("button", { name: /已掌握/ }).click();
  await expect(workbench.getByText(stem)).toBeVisible();
  const history = workbench.locator(".review-practice-history");
  const remove = history.getByRole("button", { name: "删除复练记录：" + topic.label });
  if (!(await remove.isVisible())) await history.getByText("复练记录", { exact: true }).click();
  await remove.click();
  await page.locator(".confirm-dialog").getByRole("button", { name: "取消" }).click();
  await expect(remove).toBeVisible();
  await remove.click();
  await page.locator(".confirm-dialog").getByRole("button", { name: "删除", exact: true }).click();
  await expect(history).toHaveCount(0);
  await expect(workbench.getByText(stem)).toBeVisible();
  expect(ordinary.attempt()).toBeNull();
  expect(requests[0]).toMatchObject({ mode: "original", topic: topic.key, knowledgeBaseId: 1 });
});

test("手动创建分类、移动错题，删除分类时保留错题", async ({ page }) => {
  const { workbench } = await reviewFixture(page, "dark", true);
  await expect(workbench.getByRole("heading", { name: "待归类" })).toBeVisible();
  await workbench.getByRole("button", { name: "管理分类" }).click();
  const manager = page.getByRole("dialog", { name: "管理错题分类" });
  await manager.getByRole("textbox", { name: "分类名称" }).fill(topic.label);
  await manager.getByRole("button", { name: "创建分类" }).click();
  await expect(manager.getByText(topic.label, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(manager).toBeHidden();
  await workbench.getByRole("button", { name: stem, exact: false }).click();
  await selectReviewOption(page, "归入知识点", topic.label);
  await expect(workbench.getByRole("heading", { name: topic.label })).toBeVisible();
  await expect(workbench.getByText(`已归入「${topic.label}」。`, { exact: true })).toHaveCount(0);
  await workbench.getByRole("button", { name: "管理分类" }).click();
  await manager.getByRole("button", { name: "删除分类：" + topic.label }).click();
  await page.getByRole("button", { name: "删除分类", exact: true }).click();
  await expect(manager.getByText(topic.label, { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(workbench.getByRole("heading", { name: "待归类" })).toBeVisible();
  await expect(workbench.getByText(stem)).toBeVisible();
});

test("错题筛选菜单与侧栏共用样式，并在选择框下方对齐", async ({ page }) => {
  await page.setViewportSize({ width: 1484, height: 678 });
  const { workbench } = await reviewFixture(page, "dark");
  const selector = workbench.locator(".knowledge-select").filter({
    has: page.getByRole("combobox", { name: "文档", exact: true }),
  });
  await selector.getByRole("combobox").click();
  const menu = page.locator(".library-options.el-popper:visible");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("data-popper-placement", "bottom-start");
  await expect(menu.getByRole("option", { name: "全部文档", exact: true })
    .locator(".library-option-check")).toBeVisible();
  await expect.poll(async () => {
    const [trigger, popup] = await Promise.all([selector.boundingBox(), menu.boundingBox()]);
    return !!trigger && !!popup &&
      popup.y >= trigger.y + trigger.height - 1 && Math.abs(popup.x - trigger.x) <= 2;
  }).toBe(true);
});

test("同时选择分类和文档时，可复练整份文档并跳到第 24 题", async ({ page }) => {
  const { workbench, requests } = await reviewFixture(page, "dark");
  await selectReviewOption(page, "知识点", topic.label);
  await selectReviewOption(page, "文档", source.filename);
  await workbench.getByRole("button", { name: "复练文档错题" }).click();
  const practice = page.getByRole("region", { name: "错题复练答题面板" });
  await practice.getByRole("spinbutton", { name: "目标题号" }).fill("24");
  await practice.getByRole("button", { name: "跳转" }).click();
  await expect(practice.getByRole("heading", { name: stem + "（题目 24）" })).toBeVisible();
  expect(requests[0]).toMatchObject({ mode: "original", documentId: 7, knowledgeBaseId: 1 });
  expect(requests[0]).not.toHaveProperty("topic");
});

test("窄屏浅色主题生成并打开知识点变式", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { workbench, requests, finishVariant } = await reviewFixture(page, "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(async () => (await workbench.boundingBox())?.width).toBeGreaterThan(300);
  await selectReviewOption(page, "知识点", topic.label);
  await expect(workbench.getByRole("button", { name: "生成变式" })).toBeEnabled();
  if (process.env.QUIZ_REVIEW_SCREENSHOTS) {
    await page.mouse.move(5, (page.viewportSize()?.height ?? 844) - 2);
    await page
      .locator("#panel-workbench")
      .screenshot({ path: "../.shared/quiz-review-mobile-light.png" });
  }
  await workbench.getByRole("button", { name: "生成变式" }).click();
  const modal = page.getByRole("dialog", { name: "生成变式" });
  await expect(modal.getByLabel("题目数量")).toHaveValue("3");
  await expect(modal.getByText(source.filename, { exact: true })).toBeVisible();
  await modal.getByRole("button", { name: "开始生成" }).click();
  await expect(workbench.getByRole("progressbar", { name: "变式生成进度" })).toBeVisible();
  finishVariant();
  await workbench.getByRole("button", { name: "打开变式" }).click();
  const practice = page.getByRole("region", { name: "错题复练答题面板" });
  await expect(practice.getByRole("heading", { name: "帧传输 · 变式复练" })).toBeVisible();
  await expect.poll(async () => (await practice.boundingBox())?.width).toBe(390);
  expect(requests[0]).toMatchObject({
    mode: "variant",
    topic: topic.key,
    documentId: 7,
    singleCount: 3,
    multipleCount: 0,
  });
});
