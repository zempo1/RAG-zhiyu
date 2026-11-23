import { ApiError } from "../../../common/api-error";
import { Store } from "../../../persistence/store";
import { matchQuizQuote, type QuizQuestion } from "../../quizzes/quiz-data";
import type { RetrievalService } from "../../rag/retrieval/retrieval.service";
import type { RetrievalSession } from "../../rag/retrieval/retrieval.types";
import type { AgentOptions, AgentSnapshot } from "../agent.types";

export async function loadQuizEvidence(
  store: Store,
  retrieval: RetrievalService,
  scope: AgentSnapshot["scope"],
  input: NonNullable<AgentOptions["quizContext"]>,
) {
  const attempt = await store.get("quizAttempts", input.attemptId);
  const quiz = attempt && (await store.get("quizzes", attempt.quizId));
  if (attempt?.userId !== scope.userId || quiz?.userId !== scope.userId)
    throw new ApiError(404, "测验练习不存在");
  const [source] = scope.documents;
  if (
    quiz.knowledgeBaseId !== scope.knowledgeBaseId ||
    scope.documents.length !== 1 ||
    source?.documentId !== quiz.documentId
  )
    throw new ApiError(409, "测验来源与检索范围不一致");
  const doc = await store.get("documents", quiz.documentId);
  if (
    !doc ||
    doc.deletedAt ||
    doc.userId !== scope.userId ||
    doc.knowledgeBaseId !== scope.knowledgeBaseId ||
    doc.activeVersionId !== quiz.versionId ||
    doc.activeIndexRevisionId !== quiz.indexRevisionId ||
    source.indexRevisionId !== quiz.indexRevisionId
  )
    throw new ApiError(409, "测验来源已更新或删除");
  const question = (quiz.questions as QuizQuestion[]).find((q) => q.id === input.questionId);
  if (!question || !attempt.answers?.[question.id]?.submitted)
    throw new ApiError(409, "请先提交本题");
  const evidence = new Map<number, AgentSnapshot["evidence"][number]>();
  for (const { chunkId, quote } of question.evidence ?? []) {
    if (evidence.has(chunkId)) continue;
    const chunk = await store.get("chunks", chunkId);
    if (
      !chunk ||
      chunk.documentId !== doc.id ||
      chunk.versionId !== quiz.versionId ||
      chunk.indexRevisionId !== quiz.indexRevisionId ||
      typeof quote !== "string" ||
      !matchQuizQuote(chunk.text, quote)
    )
      continue;
    evidence.set(
      chunkId,
      retrieval.original({
        number: 0,
        documentId: doc.id,
        knowledgeBaseId: scope.knowledgeBaseId,
        versionId: chunk.versionId,
        indexRevisionId: chunk.indexRevisionId,
        chunkId,
        filename: source.filename,
        text: chunk.text,
        location: chunk.location || null,
        score: 1,
      }),
    );
  }
  return [...evidence.values()];
}

/** Context packing is not proof that the complete target corpus has been read. */
export function overviewCovered(
  scope: AgentSnapshot["scope"],
  sources: AgentSnapshot["evidence"],
  session: RetrievalSession,
) {
  return (
    scope.documents.length > 0 &&
    scope.documents.every((doc) => {
      const chunks = (session.chunks || []).filter((c) => c.documentId === doc.documentId);
      return (
        chunks.length > 0 &&
        chunks.every((chunk) => {
          const matches = sources.filter(
            (source) =>
              source.documentId === doc.documentId &&
              source.indexRevisionId === doc.indexRevisionId &&
              (source.chunkId === chunk.id || source.chunkIds?.includes(chunk.id)),
          );
          if (!chunk.location) return matches.some((source) => source.text === chunk.text);
          let covered = chunk.location.start;
          const ranges = matches.flatMap((source) =>
            source.sourceSegments
              ? source.sourceSegments
                  .filter((part) => part.chunkIds.includes(chunk.id))
                  .map((part) => part.location)
              : source.location
                ? [source.location]
                : [],
          );
          for (const range of ranges.sort((a, b) => a.start - b.start)) {
            if (
              range.start > covered &&
              (typeof chunk.text !== "string" ||
                /\S/.test(
                  chunk.text.slice(
                    Math.max(0, covered - chunk.location.start),
                    range.start - chunk.location.start,
                  ),
                ))
            )
              break;
            covered = Math.max(covered, range.end);
          }
          return (
            covered >= chunk.location.end ||
            (typeof chunk.text === "string" &&
              !/\S/.test(chunk.text.slice(Math.max(0, covered - chunk.location.start))))
          );
        })
      );
    })
  );
}
