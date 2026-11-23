import { ApiError } from "../../common/api-error";
import { now, Row, Store } from "../../persistence/store";
import {
  Answers,
  cleanQuizKnowledgePoint,
  normalizeQuizTopic,
  OPTION_IDS,
  QuizAnswer,
  QuizQuestion,
  sameOptions,
} from "./quiz-data";
import type { QuizReviewQuestionRef } from "./entities/quiz-review.entity";

export const UNCLASSIFIED_TOPIC = "unclassified";

export function quizReviewTopic(value: string) {
  const label = cleanQuizKnowledgePoint(value);
  const key = normalizeQuizTopic(label);
  return key && key !== UNCLASSIFIED_TOPIC && key !== "待归类" ? { key, label } : undefined;
}

export function updateQuizAnswer(
  answers: Answers,
  question: QuizQuestion,
  input: { selectedOptionIds?: string[]; submit?: boolean },
): QuizAnswer | undefined {
  if (answers[question.id]?.submitted) {
    if (
      input.selectedOptionIds &&
      !sameOptions(input.selectedOptionIds, answers[question.id].selectedOptionIds)
    )
      throw new ApiError(409, "已提交答案不可更改");
    return;
  }
  const selection = input.selectedOptionIds ?? answers[question.id]?.selectedOptionIds ?? [];
  if (
    !Array.isArray(selection) ||
    selection.some((id) => !OPTION_IDS.includes(id)) ||
    new Set(selection).size !== selection.length ||
    selection.length > (question.type === "SINGLE" ? 1 : 4)
  )
    throw new ApiError(400, "选项无效");
  if (input.submit && selection.length < 1) throw new ApiError(400, "请选择有效答案后提交");
  const selectedOptionIds = [...selection].sort();
  if (!input.submit) {
    answers[question.id] = { selectedOptionIds, submitted: false };
    return;
  }
  const submitted = {
    selectedOptionIds,
    submitted: true,
    isCorrect: sameOptions(selection, question.correctOptionIds),
    submittedAt: now(),
  };
  answers[question.id] = submitted;
  return submitted;
}

/** Call once on the first submission of an answer while holding the library lock. */
export async function recordWrongQuestion(
  tx: Store,
  quiz: Row,
  question: QuizQuestion,
  submitted: QuizAnswer,
) {
  const [existing] = await tx.list("quizWrongItems", { quizId: quiz.id, questionId: question.id });
  if (submitted.isCorrect) {
    if (existing?.status === "pending")
      await tx.save("quizWrongItems", { id: existing.id, status: "mastered" });
    return;
  }
  await tx.save("quizWrongItems", {
    id: existing?.id,
    userId: quiz.userId,
    knowledgeBaseId: quiz.knowledgeBaseId,
    documentId: quiz.documentId,
    quizId: quiz.id,
    questionId: question.id,
    topicKey: existing?.topicKey ?? null,
    topicLabel: existing?.topicLabel ?? null,
    status: "pending",
    wrongCount: (existing?.wrongCount ?? 0) + 1,
    lastWrongSelection: submitted.selectedOptionIds,
    lastWrongAt: submitted.submittedAt!,
  });
}

export async function saveReviewPractice(
  tx: Store,
  input: {
    userId: number;
    knowledgeBaseId: number;
    requestId: string;
    mode: "original" | "variant";
    documentId: number | null;
    topicKey: string | null;
    topicLabel: string | null;
    questionRefs: QuizReviewQuestionRef[];
  },
) {
  return tx.save("quizReviewPractices", {
    ...input,
    status: "in_progress",
    currentIndex: 0,
    answers: {},
    score: 0,
    correctCount: 0,
    answeredCount: 0,
    totalCount: input.questionRefs.length,
    completedAt: null,
  });
}

export async function createVariantPractice(tx: Store, quiz: Row, requestId: string) {
  const existing = (await tx.list("quizReviewPractices", { userId: quiz.userId, requestId }))[0];
  if (existing) throw new ApiError(409, "该请求标识已用于复练");
  return saveReviewPractice(tx, {
    userId: quiz.userId,
    knowledgeBaseId: quiz.knowledgeBaseId,
    mode: "variant",
    requestId,
    topicKey: quiz.reviewTopicKey,
    topicLabel: quiz.reviewTopicLabel,
    documentId: quiz.documentId,
    questionRefs: (quiz.questions as QuizQuestion[]).map(({ id }) => ({
      quizId: quiz.id,
      questionId: id,
    })),
  });
}

export async function clearQuizReviews(tx: Store, quiz: Row) {
  for (const wrong of await tx.list("quizWrongItems", { quizId: quiz.id }))
    await tx.delete("quizWrongItems", wrong.id);
  for (const practice of await tx.list("quizReviewPractices", {
    userId: quiz.userId,
    knowledgeBaseId: quiz.knowledgeBaseId,
  })) {
    if (
      practice.status !== "invalidated" &&
      (practice.questionRefs as QuizReviewQuestionRef[]).some(({ quizId }) => quizId === quiz.id)
    )
      await tx.save("quizReviewPractices", { id: practice.id, status: "invalidated" });
  }
}
