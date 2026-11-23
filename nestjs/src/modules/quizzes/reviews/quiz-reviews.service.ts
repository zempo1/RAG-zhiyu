import { Injectable } from "@nestjs/common";
import { ApiError } from "../../../common/api-error";
import { now, Row, Store } from "../../../persistence/store";
import { TasksService } from "../../tasks/tasks.service";
import type { QuizReviewQuestionRef } from "../entities/quiz-review.entity";
import { Answers, presentQuestions, QuizQuestion, scoreAnswers } from "../quiz-data";
import {
  quizReviewTopic,
  recordWrongQuestion,
  saveReviewPractice,
  UNCLASSIFIED_TOPIC,
  updateQuizAnswer,
} from "./quiz-review-state";
import { ProgressInput, QuizzesService } from "../quizzes.service";

interface ReviewFilter {
  knowledgeBaseId: number;
  status?: "pending" | "mastered";
  topic?: string;
  documentId?: number;
  page?: number;
}

interface PracticeInput {
  knowledgeBaseId: number;
  requestId: string;
  mode: "original" | "variant";
  topic?: string;
  documentId?: number;
  singleCount?: number;
  multipleCount?: number;
}

const PAGE_SIZE = 20;
const UNSCOPED_PRACTICE_SIZE = 20;
const quizQuestion = (quiz: Row, id: string) =>
  (quiz.questions as QuizQuestion[]).find((question) => question.id === id);
const ready = (doc: Row) =>
  doc.status === "ready" &&
  !!doc.activeIndexRevisionId &&
  (doc.desiredIndexRevisionId == null || doc.desiredIndexRevisionId === doc.activeIndexRevisionId);
const matchesTopic = (row: Row, topic?: string) =>
  !topic || (row.topicKey ?? UNCLASSIFIED_TOPIC) === topic;
const recentFirst = (a: Row, b: Row) => b.lastWrongAt.localeCompare(a.lastWrongAt) || b.id - a.id;
const sourceOf = (quiz: Row, questionId: string, doc: Row) => ({
  quizId: quiz.id,
  questionId,
  documentId: quiz.documentId as number,
  filename: quiz.filename as string,
  versionId: quiz.versionId as number,
  indexRevisionId: quiz.indexRevisionId as number,
  sourceOutdated:
    doc.activeVersionId !== quiz.versionId || doc.activeIndexRevisionId !== quiz.indexRevisionId,
});
const practiceSummary = (row: Row) => ({
  id: row.id,
  knowledgeBaseId: row.knowledgeBaseId as number,
  mode: row.mode as "original" | "variant",
  status: row.status as "in_progress" | "completed" | "invalidated",
  topicKey: row.topicKey as string | null,
  topicLabel: row.topicLabel as string | null,
  score: row.score as number,
  totalCount: row.totalCount as number,
  correctCount: row.correctCount as number,
  answeredCount: row.answeredCount as number,
  currentIndex: row.currentIndex as number,
  createdAt: row.createdAt as string,
  completedAt: row.completedAt as string | null,
});

@Injectable()
export class QuizReviewsService {
  constructor(
    private readonly store: Store,
    private readonly quizzes: QuizzesService,
    private readonly tasks: TasksService,
  ) {}

  private async library(userId: number, id: number, store = this.store, lock = false) {
    const library = await (lock
      ? store.lock("knowledgeBases", id)
      : store.get("knowledgeBases", id));
    if (!library || library.userId !== userId || library.deletedAt)
      throw new ApiError(404, "知识库不存在");
  }

  async workspace(userId: number, input: ReviewFilter) {
    const { knowledgeBaseId, page = 1, status = "pending", topic, documentId } = input;
    await this.library(userId, knowledgeBaseId);
    const scope = { userId, knowledgeBaseId };
    const [records, allDocs, categories, practices, tasks] = await Promise.all([
      this.store.list("quizWrongItems", scope),
      this.store.list("documents", scope),
      this.store.list("quizReviewCategories", scope),
      this.store.list("quizReviewPractices", scope, { orderBy: "id", limit: 20 }),
      this.tasks.list(userId, knowledgeBaseId),
    ]);
    const docs = new Map(allDocs.filter((doc) => !doc.deletedAt).map((doc) => [doc.id, doc]));
    const live = records.filter((row) => docs.has(row.documentId));
    const found = live
      .filter(
        (row) =>
          row.status === status &&
          matchesTopic(row, topic) &&
          (!documentId || row.documentId === documentId),
      )
      .sort(recentFirst);
    const topics = categories.map(({ topicKey, topicLabel }) => ({
      key: topicKey as string,
      label: topicLabel as string,
    }));
    const documentTopicRank = new Map<number, number>();
    const reviewDocuments = new Map<
      number,
      {
        id: number;
        filename: string;
        ready: boolean;
        topicKeys: string[];
      }
    >();
    for (const row of [...live].sort(recentFirst)) {
      const doc = docs.get(row.documentId)!;
      if (matchesTopic(row, topic) && !documentTopicRank.has(doc.id))
        documentTopicRank.set(doc.id, documentTopicRank.size);
      const item = reviewDocuments.get(doc.id) ?? {
        id: doc.id,
        filename: doc.filename,
        ready: ready(doc),
        topicKeys: [] as string[],
      };
      const key = row.topicKey ?? UNCLASSIFIED_TOPIC;
      if (!item.topicKeys.includes(key)) item.topicKeys.push(key);
      reviewDocuments.set(doc.id, item);
    }
    const items = [];
    const pageRows = found.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const pageQuizzes = await this.loadQuizzes(
      this.store,
      pageRows.map(({ quizId }) => ({ quizId })),
    );
    for (const row of pageRows) {
      const quiz = pageQuizzes.get(row.quizId);
      const doc = docs.get(row.documentId);
      const question = quiz && quizQuestion(quiz, row.questionId);
      if (!quiz || !question || !doc || !this.quizInScope(quiz, scope)) continue;
      items.push({
        id: row.id,
        quizId: quiz.id,
        questionId: question.id,
        documentId: doc.id,
        filename: quiz.filename,
        stem: question.stem,
        type: question.type,
        topicKey: row.topicKey,
        topicLabel: row.topicLabel,
        wrongCount: row.wrongCount,
        lastWrongAt: row.lastWrongAt,
        status: row.status,
        lastWrongSelection: row.lastWrongSelection,
        question,
        source: sourceOf(quiz, question.id, doc),
      });
    }
    return {
      items,
      total: found.length,
      page,
      pageSize: PAGE_SIZE,
      counts: {
        pending: live.filter((row) => row.status === "pending").length,
        mastered: live.filter((row) => row.status === "mastered").length,
        unclassified: live.filter((row) => !row.topicKey).length,
      },
      practiceCounts: {
        document: documentId ? live.filter((row) => row.documentId === documentId).length : 0,
        topic: topic ? live.filter((row) => matchesTopic(row, topic)).length : 0,
      },
      topics: topics.sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
      documents: [...reviewDocuments.values()].sort(
        (a, b) =>
          (documentTopicRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (documentTopicRank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      ),
      practices: practices.map(practiceSummary),
      generationTasks: tasks.filter((task: Row) => task.quizPurpose === "review_variant"),
    };
  }

  private async category(store: Store, userId: number, knowledgeBaseId: number, topicKey: string) {
    const [category] = await store.list("quizReviewCategories", {
      userId,
      knowledgeBaseId,
      topicKey,
    });
    return category;
  }

  async createCategory(userId: number, knowledgeBaseId: number, label: string) {
    const topic = quizReviewTopic(label);
    if (!topic) throw new ApiError(400, "请输入有效的分类名称");
    return this.store.transaction(async (tx) => {
      await this.library(userId, knowledgeBaseId, tx, true);
      const existing = await this.category(tx, userId, knowledgeBaseId, topic.key);
      if (existing) return { key: existing.topicKey, label: existing.topicLabel };
      await tx.save("quizReviewCategories", {
        userId,
        knowledgeBaseId,
        topicKey: topic.key,
        topicLabel: topic.label,
      });
      return topic;
    });
  }

  async deleteCategory(userId: number, knowledgeBaseId: number, topicKey: string) {
    return this.store.transaction(async (tx) => {
      await this.library(userId, knowledgeBaseId, tx, true);
      const category = await this.category(tx, userId, knowledgeBaseId, topicKey);
      if (!category) return { deleted: true };
      const items = await tx.list("quizWrongItems", { userId, knowledgeBaseId, topicKey });
      for (const item of items) {
        if (item.topicKey === topicKey)
          await tx.save("quizWrongItems", { id: item.id, topicKey: null, topicLabel: null });
      }
      await tx.delete("quizReviewCategories", category.id);
      return { deleted: true };
    });
  }

  async assignCategory(userId: number, knowledgeBaseId: number, id: number, topic: string | null) {
    return this.store.transaction(async (tx) => {
      await this.library(userId, knowledgeBaseId, tx, true);
      const item = await tx.get("quizWrongItems", id);
      if (!item || item.userId !== userId || item.knowledgeBaseId !== knowledgeBaseId)
        throw new ApiError(404, "错题不存在");
      const category =
        topic === null ? undefined : await this.category(tx, userId, knowledgeBaseId, topic);
      if (topic !== null && !category) throw new ApiError(404, "分类不存在");
      const change = {
        id,
        topicKey: category?.topicKey ?? null,
        topicLabel: category?.topicLabel ?? null,
      };
      await tx.save("quizWrongItems", change);
      return change;
    });
  }

  private quizInScope(quiz: Row, scope: { userId: number; knowledgeBaseId: number }) {
    return quiz.userId === scope.userId && quiz.knowledgeBaseId === scope.knowledgeBaseId;
  }

  private async loadQuizzes(store: Store, refs: readonly { quizId: number }[]) {
    const ids = [...new Set(refs.map((ref) => ref.quizId))];
    const quizzes = await Promise.all(ids.map((id) => store.get("quizzes", id)));
    return new Map(quizzes.flatMap((quiz) => (quiz ? [[quiz.id, quiz] as const] : [])));
  }

  async start(userId: number, input: PracticeInput, apiKey?: string) {
    const { knowledgeBaseId, requestId, mode } = input;
    const topic = input.topic || undefined;
    const documentId = input.documentId ?? undefined;
    if (mode === "variant") return this.startVariant(userId, input, apiKey);
    return this.store.transaction(async (tx) => {
      await this.library(userId, knowledgeBaseId, tx, true);
      const prior = (await tx.list("quizReviewPractices", { userId, requestId }))[0];
      if (prior) {
        if (
          prior.knowledgeBaseId !== knowledgeBaseId ||
          prior.mode !== mode ||
          (prior.topicKey ?? undefined) !== topic ||
          (prior.documentId ?? undefined) !== documentId
        )
          throw new ApiError(409, "该请求标识已用于不同的复练配置");
        return { practiceId: prior.id };
      }
      const variant = (await tx.list("tasks", { userId, kind: "quiz" })).some(
        (task) =>
          task.payload?.reviewTopicKey &&
          (task.idempotencyKey === `quiz/${userId}/${requestId}` ||
            task.payload?.requestIds?.includes(requestId)),
      );
      if (variant) throw new ApiError(409, "该请求标识已用于变式复练");
      const scoped = Boolean(topic || documentId);
      const matching = (
        await tx.list("quizWrongItems", {
          userId,
          knowledgeBaseId,
          ...(scoped ? {} : { status: "pending" }),
        })
      )
        .filter((row) => matchesTopic(row, topic) && (!documentId || documentId === row.documentId))
        .sort(recentFirst);
      const entries = scoped ? matching : matching.slice(0, UNSCOPED_PRACTICE_SIZE);
      if (!entries.length) throw new ApiError(422, "当前筛选下没有可以复练的错题");
      const row = await saveReviewPractice(tx, {
        userId,
        knowledgeBaseId,
        requestId,
        mode,
        documentId: documentId ?? null,
        topicKey: topic ?? null,
        topicLabel: topic === UNCLASSIFIED_TOPIC ? "待归类" : topic ? entries[0].topicLabel : null,
        questionRefs: entries.map(({ quizId, questionId }) => ({ quizId, questionId })),
      });
      return { practiceId: row.id };
    });
  }

  private async startVariant(userId: number, input: PracticeInput, apiKey?: string) {
    const { knowledgeBaseId, requestId, topic, documentId } = input;
    await this.library(userId, knowledgeBaseId);
    if (!topic || topic === UNCLASSIFIED_TOPIC) throw new ApiError(400, "变式需要已归类的知识点");
    const category = await this.category(this.store, userId, knowledgeBaseId, topic);
    if (!category) throw new ApiError(404, "分类不存在");
    const prior = (await this.store.list("quizReviewPractices", { userId, requestId }))[0];
    if (prior?.mode === "original") throw new ApiError(409, "该请求标识已用于原题复练");
    const docs = new Map(
      (await this.store.list("documents", { userId, knowledgeBaseId }))
        .filter((doc) => !doc.deletedAt && ready(doc))
        .map((doc) => [doc.id, doc]),
    );
    const wrongs = (
      await this.store.list("quizWrongItems", { userId, knowledgeBaseId, topicKey: topic })
    )
      .filter((row) => row.topicKey === topic)
      .sort(recentFirst);
    const preferred = wrongs.find(
      (item) => docs.has(item.documentId) && (!documentId || documentId === item.documentId),
    );
    if (!preferred) throw new ApiError(422, "该知识点暂无已就绪的来源文档");
    const doc = docs.get(preferred.documentId)!;
    const sourceRows = wrongs.filter((row) => row.documentId === doc.id).slice(0, 30);
    const quizzes = await this.loadQuizzes(
      this.store,
      sourceRows.map(({ quizId }) => ({ quizId })),
    );
    const evidence = new Set<number>();
    for (const row of sourceRows) {
      const quiz = quizzes.get(row.quizId);
      if (quiz?.indexRevisionId !== doc.activeIndexRevisionId || !quiz) continue;
      for (const snippet of quizQuestion(quiz, row.questionId)?.evidence ?? [])
        evidence.add(snippet.chunkId);
    }
    const singleCount = input.singleCount ?? (input.multipleCount === undefined ? 3 : 0);
    return this.quizzes.generate(
      userId,
      doc.id,
      singleCount,
      input.multipleCount ?? 0,
      apiKey,
      requestId,
      {
        topicKey: topic,
        topicLabel: category.topicLabel,
        evidenceChunkIds: [...evidence].slice(0, 40),
        knowledgeBaseId,
      },
    );
  }

  private async owned(userId: number, id: number, store = this.store, lock = false) {
    const row = await (lock
      ? store.lock("quizReviewPractices", id)
      : store.get("quizReviewPractices", id));
    if (!row || row.userId !== userId) throw new ApiError(404, "复练记录不存在");
    return row;
  }

  private async practiceQuestions(row: Row, store = this.store) {
    const refs = row.questionRefs as QuizReviewQuestionRef[];
    const quizzes = await this.loadQuizzes(store, refs);
    const documents = new Map<number, Row>();
    for (const quiz of quizzes.values()) {
      if (documents.has(quiz.documentId)) continue;
      const doc = await store.get("documents", quiz.documentId);
      if (
        doc &&
        !doc.deletedAt &&
        this.quizInScope(doc, { userId: row.userId, knowledgeBaseId: row.knowledgeBaseId })
      )
        documents.set(doc.id, doc);
    }
    const entries = [];
    for (const [index, ref] of refs.entries()) {
      const quiz = quizzes.get(ref.quizId);
      if (
        !quiz ||
        !this.quizInScope(quiz, { userId: row.userId, knowledgeBaseId: row.knowledgeBaseId })
      )
        return null;
      const doc = documents.get(quiz.documentId);
      const original = quizQuestion(quiz, ref.questionId);
      if (!doc || !original) return null;
      entries.push({
        quiz,
        original,
        question: { ...original, id: `q${index + 1}` },
        source: sourceOf(quiz, original.id, doc),
      });
    }
    return entries;
  }

  async get(userId: number, id: number) {
    const row = await this.owned(userId, id);
    await this.library(userId, row.knowledgeBaseId);
    const entries = row.status === "invalidated" ? null : await this.practiceQuestions(row);
    if (!entries)
      return {
        ...practiceSummary(row),
        status: "invalidated" as const,
        answers: {},
        questions: [],
      };
    const questions = presentQuestions(
      entries.map((entry) => entry.question),
      row.answers,
    );
    return {
      ...practiceSummary(row),
      answers: row.answers as Answers,
      questions: questions.map((question, index) => ({
        ...question,
        source: entries[index].source,
      })),
    };
  }

  async removePractice(userId: number, id: number) {
    const initial = await this.owned(userId, id);
    return this.store.transaction(async (tx) => {
      await this.library(userId, initial.knowledgeBaseId, tx, true);
      const row = await this.owned(userId, id, tx, true);
      if (row.mode === "variant") {
        const tasks = await tx.list("tasks", {
          userId,
          knowledgeBaseId: row.knowledgeBaseId,
          kind: "quiz",
        });
        for (const task of tasks.filter((entry) => entry.payload?.quizResult?.practiceId === id)) {
          const current = await tx.lock("tasks", task.id);
          if (current?.payload?.quizResult?.practiceId === id) {
            const { practiceId, ...quizResult } = current.payload.quizResult;
            await tx.save("tasks", { id: current.id, payload: { ...current.payload, quizResult } });
          }
        }
      }
      await tx.delete("quizReviewPractices", id);
      return { deleted: true };
    });
  }

  async progress(userId: number, id: number, input: ProgressInput) {
    const initial = await this.owned(userId, id);
    await this.store.transaction(async (tx) => {
      await this.library(userId, initial.knowledgeBaseId, tx, true);
      const row = await this.owned(userId, id, tx, true);
      const entries = row.status === "invalidated" ? null : await this.practiceQuestions(row, tx);
      if (!entries) throw new ApiError(409, "复练来源已失效，请重新开始");
      if (
        input.currentIndex !== undefined &&
        (!Number.isInteger(input.currentIndex) ||
          input.currentIndex < 0 ||
          input.currentIndex >= entries.length)
      )
        throw new ApiError(400, "题号超出范围");
      const answers: Answers = structuredClone(row.answers);
      if (input.questionId !== undefined) {
        const entry = entries.find((item) => item.question.id === input.questionId);
        if (!entry) throw new ApiError(400, "题目不存在");
        const submission = updateQuizAnswer(answers, entry.question, input);
        if (submission) await recordWrongQuestion(tx, entry.quiz, entry.original, submission);
      } else if (input.selectedOptionIds !== undefined || input.submit) {
        throw new ApiError(400, "缺少题目标识");
      }
      const stats = scoreAnswers(
        entries.map((entry) => entry.question),
        answers,
      );
      const completed = stats.answeredCount === stats.totalCount;
      await tx.save("quizReviewPractices", {
        id,
        ...stats,
        answers,
        currentIndex: input.currentIndex ?? row.currentIndex,
        status: completed ? "completed" : "in_progress",
        completedAt: completed ? (row.completedAt ?? now()) : null,
      });
    });
    return this.get(userId, id);
  }
}
