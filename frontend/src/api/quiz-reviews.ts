import request from "../utils/request";
import type { ProcessingTask } from "./knowledge-bases";
import type { QuizAttemptSummary, QuizAnswer, QuizProgress, QuizQuestion } from "./quizzes";

export type ReviewStatus = "pending" | "mastered";
export type ReviewMode = "original" | "variant";

export interface ReviewSource {
  quizId: number;
  questionId: string;
  documentId: number;
  filename: string;
  versionId: number;
  indexRevisionId: number;
  sourceOutdated: boolean;
}

export interface ReviewItem {
  id: number;
  quizId: number;
  questionId: string;
  documentId: number;
  filename: string;
  stem: string;
  type: QuizQuestion["type"];
  topicKey: string | null;
  topicLabel: string | null;
  wrongCount: number;
  lastWrongAt: string;
  status: ReviewStatus;
  lastWrongSelection: string[];
  question: QuizQuestion;
  source: ReviewSource;
}

export interface ReviewPracticeSummary extends Omit<QuizAttemptSummary, "status"> {
  mode: ReviewMode;
  topicKey: string | null;
  topicLabel: string | null;
  status: QuizAttemptSummary["status"] | "invalidated";
}

export interface ReviewPractice extends ReviewPracticeSummary {
  knowledgeBaseId: number;
  questions: Array<QuizQuestion & { source: ReviewSource }>;
  answers: Record<string, QuizAnswer>;
}

export interface ReviewTask extends ProcessingTask {
  quizResult?: { quizId: number; practiceId?: number };
}

export interface ReviewCategory {
  key: string;
  label: string;
}

export interface ReviewWorkspace {
  items: ReviewItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<ReviewStatus | "unclassified", number>;
  practiceCounts?: { document: number; topic: number };
  topics: ReviewCategory[];
  documents: Array<{ id: number; filename: string; ready: boolean; topicKeys: string[] }>;
  practices: ReviewPracticeSummary[];
  generationTasks?: ReviewTask[];
}

export interface ReviewFilters {
  knowledgeBaseId: number;
  status: ReviewStatus;
  topic?: string;
  documentId?: number;
  page: number;
}

export type StartReview = {
  knowledgeBaseId: number;
  requestId: string;
  topic?: string;
  documentId?: number;
} & ({ mode: "original" } | { mode: "variant"; singleCount: number; multipleCount: number });

const endpoint = "/api/quiz-reviews";

export const getReviewWorkspace = (filters: ReviewFilters, signal?: AbortSignal) =>
  request.get<unknown, ReviewWorkspace>(`${endpoint}/workspace`, {
    params: filters,
    signal,
    silentError: true,
  });
export const startReview = (data: StartReview) =>
  request.post<unknown, { practiceId?: number; taskId?: number }>(`${endpoint}/practices`, data, {
    silentError: true,
  });
export const createReviewCategory = (knowledgeBaseId: number, label: string) =>
  request.post<unknown, ReviewCategory>(
    `${endpoint}/categories`,
    { knowledgeBaseId, label },
    { silentError: true },
  );
export const deleteReviewCategory = (knowledgeBaseId: number, key: string) =>
  request.delete<unknown, { deleted: true }>(`${endpoint}/categories/${encodeURIComponent(key)}`, {
    params: { knowledgeBaseId },
    silentError: true,
  });
export const assignReviewCategory = (knowledgeBaseId: number, id: number, topic: string | null) =>
  request.patch<unknown, { id: number; topicKey: string | null; topicLabel: string | null }>(
    `${endpoint}/items/${id}/category`,
    { knowledgeBaseId, topic },
    { silentError: true },
  );
export const getReviewPractice = (id: number) =>
  request.get<unknown, ReviewPractice>(`${endpoint}/practices/${id}`, { silentError: true });
export const deleteReviewPractice = (id: number) =>
  request.delete<unknown, { deleted: boolean }>(`${endpoint}/practices/${id}`, {
    silentError: true,
  });
export const saveReviewProgress = (id: number, progress: QuizProgress) =>
  request.patch<unknown, ReviewPractice>(`${endpoint}/practices/${id}/progress`, progress, {
    silentError: true,
  });
