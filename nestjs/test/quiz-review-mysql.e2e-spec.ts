import { randomBytes, randomUUID } from "node:crypto";
import { createConnection } from "mysql2/promise";
import { DataSource } from "typeorm";
import { mysqlOptions } from "../src/persistence/data-source";
import { MysqlStore, verifySchema } from "../src/persistence/mysql.store";
import { RemoveOutlines1795219200001 } from "../src/persistence/migrations/1795219200001-remove-outlines";
import { QuizReviews1795219200002 } from "../src/persistence/migrations/1795219200002-quiz-reviews";
import { ManualQuizCategories1795219200003 } from "../src/persistence/migrations/1795219200003-manual-quiz-categories";

const enabled = process.env.MYSQL_INTEGRATION === "1";

(enabled ? describe : describe.skip)("错题升级（隔离测试数据库）", () => {
  const database = "ai_rag_nest_test_" + randomBytes(6).toString("hex");
  let connection: Awaited<ReturnType<typeof createConnection>>;
  let source: DataSource;

  beforeAll(async () => {
    connection = await createConnection({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    source = new DataSource(mysqlOptions({ ...process.env, DB_NAME: database }));
    await source.initialize();
    await source.runMigrations();
    await verifySchema(source);
  });

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    if (connection) {
      if (!/^ai_rag_nest_test_[a-f0-9]{12}$/.test(database))
        throw new Error("Unsafe test database");
      await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
      await connection.end();
    }
  });

  it("回填已提交的错误，保留掌握状态和重复升级后的新进度，只删除大纲", async () => {
    const store = new MysqlStore(source.manager);
    const user = await store.save("users", {
      username: "quiz-review-fixture",
      password: "fixture",
    });
    const kb = await store.save("knowledgeBases", { userId: user.id, name: "错题测试" });
    const doc = await store.save("documents", {
      userId: user.id,
      knowledgeBaseId: kb.id,
      filename: "测试.md",
    });
    const quiz = await store.save("quizzes", {
      userId: user.id,
      knowledgeBaseId: kb.id,
      documentId: doc.id,
      versionId: 1,
      indexRevisionId: 1,
      filename: "测试.md",
      title: "旧题集",
      singleCount: 3,
      multipleCount: 0,
      questions: [{ id: "q1" }, { id: "q2" }, { id: "q3" }],
    });
    const answer = (selection: string, isCorrect: boolean, time: number) => ({
      selectedOptionIds: [selection],
      submitted: true,
      isCorrect,
      submittedAt: "2026-11-22T0" + time + ":00:00",
    });
    for (const answers of [
      {
        q1: answer("A", false, 1),
        q2: answer("A", false, 1),
        q3: { submitted: false, selectedOptionIds: ["D"] },
      },
      { q1: answer("B", false, 2), q2: answer("B", true, 2) },
    ]) {
      await store.save("quizAttempts", {
        userId: user.id,
        quizId: quiz.id,
        requestId: randomUUID(),
        answers,
        currentIndex: 0,
        status: "in_progress",
        score: 0,
        correctCount: 0,
        answeredCount: 2,
        totalCount: 3,
      });
    }
    for (const type of ["OUTLINE", "SUMMARY", "FLASHCARD"])
      await store.save("analyses", { userId: user.id, type, content: type });
    const runner = source.createQueryRunner();
    try {
      const review = new QuizReviews1795219200002();
      const outlines = new RemoveOutlines1795219200001();
      await outlines.up(runner);
      await review.up(runner);
      const wrong = (await store.list("quizWrongItems", { quizId: quiz.id })).sort((a, b) =>
        a.questionId.localeCompare(b.questionId),
      );
      expect(wrong).toMatchObject([
        { questionId: "q1", wrongCount: 2, status: "pending", lastWrongSelection: ["B"] },
        { questionId: "q2", wrongCount: 1, status: "mastered", lastWrongSelection: ["A"] },
      ]);
      await store.save("quizWrongItems", { id: wrong[0].id, status: "mastered" });
      await review.up(runner);
      await outlines.up(runner);
      expect(await store.get("quizWrongItems", wrong[0].id)).toMatchObject({
        status: "mastered",
        wrongCount: 2,
      });
      expect(
        (await store.list("analyses", { userId: user.id })).map((row) => row.type).sort(),
      ).toEqual(["FLASHCARD", "SUMMARY"]);
      const legacyTask = await store.save("tasks", {
        kind: "quiz_review_classification",
        userId: user.id,
        knowledgeBaseId: kb.id,
        status: "running",
        stage: "classifying",
        executionToken: "legacy-token",
        retryable: 1,
        payload: { credential: "sealed", modelSnapshot: "sealed", leaseUntil: 1 },
      });
      await store.save("quizWrongItems", {
        id: wrong[0].id,
        topicKey: "往期知识点",
        topicLabel: "往期知识点",
      });
      const categories = new ManualQuizCategories1795219200003();
      await categories.up(runner);
      const [legacy] = await store.list("quizReviewCategories", { knowledgeBaseId: kb.id });
      expect(legacy).toMatchObject({ topicKey: "往期知识点", topicLabel: "往期知识点" });
      expect(await store.get("tasks", legacyTask.id)).toMatchObject({
        status: "canceled",
        executionToken: null,
        retryable: 0,
        payload: {},
      });
      await store.save("quizWrongItems", { id: wrong[0].id, topicKey: null, topicLabel: null });
      await store.delete("quizReviewCategories", legacy.id);
      await store.save("quizReviewCategories", {
        knowledgeBaseId: kb.id,
        userId: user.id,
        topicKey: "空分类",
        topicLabel: "空分类",
      });
      await categories.up(runner);
      expect(await store.list("quizReviewCategories", { knowledgeBaseId: kb.id })).toMatchObject([
        { topicKey: "空分类" },
      ]);
      expect(await store.get("quizWrongItems", wrong[0].id)).toMatchObject({
        topicKey: null,
        status: "mastered",
      });
    } finally {
      await runner.release();
    }
  });
});
