import { ConfigService } from "@nestjs/config";
import { MemoryStore } from "../src/persistence/memory.store";
import { QuizReviewsService } from "../src/modules/quizzes/quiz-reviews.service";
import { QuizzesService } from "../src/modules/quizzes/quizzes.service";
import { createVariantPractice } from "../src/modules/quizzes/quiz-review-state";
import type { QuizQuestion } from "../src/modules/quizzes/quiz-data";

const question = (stem: string, knowledgePoint?: string): QuizQuestion => ({
  id: "q1",
  type: "SINGLE",
  stem,
  knowledgePoint,
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: "选项 " + id })),
  correctOptionIds: ["A"],
  explanation: "按原文解释",
  optionExplanations: { A: "正确", B: "错误", C: "错误", D: "错误" },
  evidence: [{ chunkId: 101, quote: "光照改变反应速率。" }],
});

describe("错题整理", () => {
  let store: MemoryStore, quizzes: QuizzesService, reviews: QuizReviewsService;
  async function makeQuiz(stem: string, documentId: number, knowledgePoint?: string) {
    return store.save("quizzes", {
      userId: 1,
      knowledgeBaseId: 1,
      documentId,
      versionId: documentId * 10,
      indexRevisionId: documentId * 100,
      filename: "资料" + documentId,
      questions: [question(stem, knowledgePoint)],
      title: stem,
      singleCount: 1,
      multipleCount: 0,
    });
  }
  async function answer(quizId: number, requestId: string, selectedOptionIds = ["B"]) {
    const attempt = await quizzes.startAttempt(quizId, 1, requestId);
    const progress = { questionId: "q1", selectedOptionIds, submit: true };
    await quizzes.progress(attempt.id, 1, progress);
    return { attempt, progress };
  }

  async function categorize(quizId: number, label: string) {
    const category = await reviews.createCategory(1, 1, label);
    const [item] = await store.list("quizWrongItems", { quizId });
    await reviews.assignCategory(1, 1, item.id, category.key);
  }

  beforeEach(async () => {
    store = new MemoryStore();
    await store.save("knowledgeBases", { id: 1, userId: 1 });
    await store.save("knowledgeBases", { id: 2, userId: 2 });
    for (const id of [1, 2])
      await store.save("documents", {
        id,
        userId: 1,
        knowledgeBaseId: 1,
        status: "ready",
        filename: "资料" + id,
        activeVersionId: id * 10,
        activeIndexRevisionId: id * 100,
      });
    const documents = { ready: (id: number) => store.get("documents", id) };
    quizzes = new QuizzesService(
      documents as any,
      {} as any,
      store,
      new ConfigService({ JWT_SECRET: "fixture" }),
    );
    reviews = new QuizReviewsService(store, quizzes, { list: async () => [] } as any);
  });

  it("跨来源聚合，忽略草稿和重复提交，重做可掌握和重开错题", async () => {
    const first = await makeQuiz("光照1", 1, "光照条件");
    const another = await makeQuiz("光照2", 2, "光照条件");
    const legacy = await makeQuiz("旧题", 2);
    const { attempt, progress } = await answer(first.id, "wrong-one");
    await quizzes.progress(attempt.id, 1, progress);
    await answer(another.id, "wrong-another");
    const draft = await quizzes.startAttempt(legacy.id, 1, "draft");
    await quizzes.progress(draft.id, 1, { questionId: "q1", selectedOptionIds: ["B"] });
    const page = await reviews.workspace(1, { knowledgeBaseId: 1 });
    expect(page.counts).toEqual({ pending: 2, mastered: 0, unclassified: 2 });
    expect(page.items.map((item) => item.wrongCount)).toEqual([1, 1]);
    expect(page.topics).toEqual([]);
    await categorize(first.id, "光照条件");
    expect((await reviews.workspace(1, { knowledgeBaseId: 1, documentId: 2 })).items).toHaveLength(
      1,
    );
    await answer(first.id, "correct-one", ["A"]);
    expect(
      (await reviews.workspace(1, { knowledgeBaseId: 1, status: "mastered" })).items[0],
    ).toMatchObject({
      quizId: first.id,
      wrongCount: 1,
      lastWrongSelection: ["B"],
    });
    await answer(first.id, "wrong-again", ["D"]);
    expect((await store.list("quizWrongItems", { quizId: first.id }))[0]).toMatchObject({
      status: "pending",
      wrongCount: 2,
      lastWrongSelection: ["D"],
      topicKey: "光照条件",
    });
  });

  it("原题复练幂等、恢复草稿、隔离来源及原测验，删除后失效", async () => {
    const first = await makeQuiz("题 1", 1, "光照条件");
    const other = await makeQuiz("题 2", 2, "光照条件");
    const original = await answer(first.id, "history-one");
    await answer(other.id, "history-two");
    await categorize(first.id, "光照条件");
    await categorize(other.id, "光照条件");
    const input = {
      knowledgeBaseId: 1,
      requestId: "same-review",
      mode: "original",
      topic: "光照条件",
    } as const;
    const results = await Promise.all([reviews.start(1, input), reviews.start(1, input)]);
    expect(results[0]).toEqual(results[1]);
    const id = (results[0] as { practiceId: number }).practiceId;
    const before = await reviews.get(1, id);
    expect(before.questions).toHaveLength(2);
    expect(before.questions.map((q) => q.source.quizId).sort()).toEqual([first.id, other.id]);
    expect(JSON.stringify(before.questions)).not.toMatch(
      /correctOptionIds|optionExplanations|解释/,
    );
    await expect(reviews.get(2, id)).rejects.toThrow("复练记录不存在");
    await expect(reviews.workspace(2, { knowledgeBaseId: 1 })).rejects.toThrow("知识库不存在");
    const { id: localId } = before.questions.find((q) => q.source.quizId === first.id)!;
    await reviews.progress(1, id, {
      questionId: localId,
      selectedOptionIds: ["A"],
      currentIndex: 1,
    });
    expect(await reviews.get(1, id)).toMatchObject({
      currentIndex: 1,
      answers: { [localId]: { submitted: false } },
    });
    const graded = await reviews.progress(1, id, { questionId: localId, submit: true });
    expect(graded.answeredCount).toBe(1);
    expect(graded.questions.find((q) => q.id === localId)?.correctOptionIds).toEqual(["A"]);
    expect(graded.questions.find((q) => q.id !== localId)?.correctOptionIds).toBeUndefined();
    expect((await quizzes.getAttempt(original.attempt.id, 1)).answers.q1).toMatchObject({
      selectedOptionIds: ["B"],
      isCorrect: false,
    });
    expect((await store.list("quizWrongItems", { quizId: first.id }))[0].status).toBe("mastered");
    await quizzes.delete(other.id, 1);
    expect(await reviews.get(1, id)).toMatchObject({ status: "invalidated", questions: [] });
    expect(await store.list("quizWrongItems", { quizId: other.id })).toEqual([]);
    await expect(reviews.progress(1, id, { currentIndex: 0 })).rejects.toThrow("来源已失效");
  });

  it("变式默认三题，来源按知识点授权，变式答错独立归档", async () => {
    const source = await makeQuiz("原题", 1, "光照条件");
    await answer(source.id, "history");
    await categorize(source.id, "光照条件");
    const unrelated = await makeQuiz("其他考点", 2, "温度条件");
    await answer(unrelated.id, "unrelated-history");
    await categorize(unrelated.id, "温度条件");
    const filtered = await reviews.workspace(1, { knowledgeBaseId: 1, topic: "光照条件" });
    expect(filtered.documents.map((document) => document.id)).toEqual([1, 2]);
    const input = {
      knowledgeBaseId: 1,
      requestId: "variant-request",
      mode: "variant",
      topic: "光照条件",
    } as const;
    await expect(reviews.start(1, { ...input, documentId: 2 })).rejects.toThrow("暂无已就绪");
    const accepted = (await reviews.start(1, input)) as { taskId: number };
    expect(await reviews.start(1, input)).toEqual(accepted);
    expect(await store.get("tasks", accepted.taskId)).toMatchObject({
      documentId: 1,
      payload: {
        reviewTopicKey: "光照条件",
        singleCount: 3,
        multipleCount: 0,
        reviewEvidenceChunkIds: [101],
      },
    });
    const generated = await makeQuiz("变式题", 1, "光照条件");
    const variant = await store.save("quizzes", {
      id: generated.id,
      reviewTopicKey: "光照条件",
      reviewTopicLabel: "光照条件",
    });
    const practice = await store.transaction((tx) =>
      createVariantPractice(tx, variant, input.requestId),
    );
    await reviews.progress(1, practice.id, {
      questionId: "q1",
      selectedOptionIds: ["C"],
      submit: true,
    });
    expect((await reviews.workspace(1, { knowledgeBaseId: 1 })).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ quizId: variant.id, topicKey: null }),
        expect.objectContaining({ quizId: source.id }),
      ]),
    );
    expect((await store.list("quizWrongItems", { quizId: source.id }))[0].status).toBe("pending");
  });

  it("分类可空建、跨库隔离，删除分类后把错题移回待归类并保留复练", async () => {
    expect(await reviews.createCategory(1, 1, " 复习题 ")).toEqual({
      key: "复习题",
      label: "复习题",
    });
    expect(await reviews.createCategory(1, 1, "复习题")).toEqual({
      key: "复习题",
      label: "复习题",
    });
    expect((await reviews.workspace(1, { knowledgeBaseId: 1 })).topics).toHaveLength(1);
    const quiz = await makeQuiz("原题", 1, "模型推荐标签");
    await answer(quiz.id, "history");
    const [item] = await store.list("quizWrongItems", { quizId: quiz.id });
    await expect(reviews.assignCategory(2, 2, item.id, null)).rejects.toThrow("错题不存在");
    await expect(reviews.assignCategory(1, 1, item.id, "不存在")).rejects.toThrow("分类不存在");
    await reviews.assignCategory(1, 1, item.id, "复习题");
    const practice = (await reviews.start(1, {
      knowledgeBaseId: 1,
      topic: "复习题",
      mode: "original",
      requestId: "practice",
    })) as { practiceId: number };
    await reviews.deleteCategory(1, 1, "复习题");
    expect(await store.get("quizWrongItems", item.id)).toMatchObject({
      topicKey: null,
      wrongCount: 1,
    });
    expect((await reviews.workspace(1, { knowledgeBaseId: 1 })).topics).toEqual([]);
    expect(await reviews.get(1, practice.practiceId)).toMatchObject({
      totalCount: 1,
      status: "in_progress",
    });
  });

  it("文档和分类复练各自取全量错题，包含已掌握并可保存第 21 题", async () => {
    const makeWrongSet = async (documentId: number, count: number, topicKey: string | null) => {
      const quiz = await makeQuiz("大题集", documentId);
      const questions = Array.from({ length: count }, (_, index) => ({
        ...question("第 " + index + " 题"),
        id: `q${index + 1}`,
      }));
      await store.save("quizzes", { id: quiz.id, questions });
      for (const [index, item] of questions.entries())
        await store.save("quizWrongItems", {
          userId: 1,
          knowledgeBaseId: 1,
          quizId: quiz.id,
          questionId: item.id,
          documentId,
          topicKey,
          topicLabel: topicKey,
          status: index === 0 ? "mastered" : "pending",
          lastWrongAt: "2026-11-23T00:00:00",
        });
    };
    await reviews.createCategory(1, 1, "章节");
    await makeWrongSet(1, 19, "章节");
    await makeWrongSet(1, 3, null);
    await makeWrongSet(2, 4, "章节");
    const workspace = await reviews.workspace(1, {
      knowledgeBaseId: 1,
      topic: "章节",
      documentId: 1,
    });
    expect(workspace.practiceCounts).toEqual({ topic: 23, document: 22 });
    const document = (await reviews.start(1, {
      knowledgeBaseId: 1,
      mode: "original",
      requestId: "whole-document",
      documentId: 1,
    })) as { practiceId: number };
    const category = (await reviews.start(1, {
      knowledgeBaseId: 1,
      mode: "original",
      requestId: "whole-topic",
      topic: "章节",
    })) as { practiceId: number };
    expect(await reviews.progress(1, document.practiceId, { currentIndex: 20 })).toMatchObject({
      totalCount: 22,
      currentIndex: 20,
    });
    expect(await reviews.get(1, category.practiceId)).toMatchObject({ totalCount: 23 });
  });
});
