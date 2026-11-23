import { Injectable, Optional } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { QaTasksService } from "../tasks/qa/qa-tasks.service";
import { ChatDto } from "./dto/chat.dto";
import { AnswerEvent, ChatService } from "./chat.service";
import { HistoryService } from "../history/history.service";
import { ApiError, errorMessage } from "../../common/api-error";
import { Citation, normalizeCitations } from "../rag/citations/citations";
import { QuizzesService } from "../quizzes/quizzes.service";
import type { PublicStep } from "../agent/agent.types";
import { AgentQaTasksService } from "../tasks/qa/agent-qa.service";

export type PreparedChat = Awaited<ReturnType<ChatWorkflowService["prepare"]>>;
type ExecutingChat = Exclude<PreparedChat, { accepted: object }>;
type ChatAnswer = Extract<AnswerEvent, { type: "done" }>;
type ResolvedChat = ChatDto & { question: string };

@Injectable()
export class ChatWorkflowService {
  constructor(
    private readonly chat: ChatService,
    private readonly history: HistoryService,
    private readonly qa: QaTasksService,
    @Optional() private readonly agentTasks?: AgentQaTasksService,
    @Optional() private readonly quizzes?: QuizzesService,
  ) {}

  private fingerprint(body: ChatDto) {
    return createHash("sha256")
      .update(
        JSON.stringify([
          body.chatId ?? null,
          body.knowledgeBaseId ?? null,
          body.question?.trim(),
          [...(body.documentIds || [])].sort((a, b) => a - b),
          body.mode || "auto",
          ...(body.quizContext ? [body.quizContext] : []),
        ]),
      )
      .digest("hex");
  }

  private async resolveRequest(body: ChatDto, user: number) {
    if (!body.question?.trim()) throw new ApiError(400, "Question is required.");
    if (body.quizContext) {
      if (!this.quizzes) throw new ApiError(503, "测验解释暂不可用");
      const resolved = await this.quizzes.resolveChatContext(
        user,
        body.quizContext,
        body.knowledgeBaseId,
      );
      // The canonical, readable question is also persisted as the user message.
      // Source retrieval already supplies evidence privately; never serialize metadata into chat text.
      body = { ...body, ...resolved };
    }
    if (!body.question?.trim()) throw new ApiError(400, "Question is required.");
    return { ...body, question: body.question };
  }

  async preflightStream(body: ChatDto, user: number) {
    const resolved = await this.resolveRequest(body, user);
    if (resolved.chatId != null)
      await this.history.writable(resolved.chatId, user, resolved.knowledgeBaseId);
  }

  async prepare(
    body: ChatDto,
    user: number,
    apiKey?: string,
    onProgress?: (stage: string) => void,
    signal?: AbortSignal,
    onAgentStep?: (step: PublicStep) => Promise<void> | void,
    onTaskStarted?: (task: ReturnType<AgentQaTasksService["accepted"]>) => void,
  ) {
    return this.prepareResolved(
      await this.resolveRequest(body, user),
      user,
      apiKey,
      onProgress,
      signal,
      onAgentStep,
      onTaskStarted,
    );
  }

  private async prepareResolved(
    body: ResolvedChat,
    user: number,
    apiKey?: string,
    onProgress?: (stage: string) => void,
    signal?: AbortSignal,
    onAgentStep?: (step: PublicStep) => Promise<void> | void,
    onTaskStarted?: (task: ReturnType<AgentQaTasksService["accepted"]>) => void,
  ) {
    const fingerprint = this.fingerprint(body),
      requestId = body.requestId || randomUUID();
    signal?.throwIfAborted();
    if (this.agentTasks) {
      const started = await this.agentTasks.begin(user, {
        ...body,
        question: body.question,
        apiKey,
        requestId,
        fingerprint,
      });
      if (started.existing) return { accepted: this.agentTasks.accepted(started.task) };
      const execution = this.agentTasks.execution(started.task.id, started.token!, signal);
      try {
        onTaskStarted?.(this.agentTasks.accepted(started.task));
        const context = await this.chat.prepare(body.question, user, started.chat.knowledgeBaseId, {
          documentIds: body.documentIds,
          mode: body.mode || "auto",
          quizContext: body.quizContext,
          requestId,
          chatId: started.chat.id,
          history: started.chat.messages || [],
          apiKey,
          onProgress,
          ...execution,
          onAgentStep,
        });
        execution.signal.throwIfAborted();
        if (context.requiresAsync) {
          const accepted = await this.agentTasks.handoff(started.task.id, started.token!);
          execution.dispose();
          return { accepted };
        }
        return { chat: started.chat, context, execution, started };
      } catch (error) {
        if (signal?.aborted)
          await this.agentTasks.cancel(started.task.id, user).catch(() => undefined);
        try {
          await this.agentTasks.fail(started.task.id, started.token!, error);
        } finally {
          execution.dispose();
        }
        throw error;
      }
    }
    // 后台问答通过请求标识和内容指纹去重；重发请求直接返回原任务。
    const existing = body.requestId ? await this.qa.lookup(user, requestId, fingerprint) : null;
    if (existing) return { accepted: existing };
    const chat =
      body.chatId == null
        ? await this.history.create(body.question.slice(0, 30), user, body.knowledgeBaseId)
        : await this.history.writable(body.chatId, user, body.knowledgeBaseId);
    const retrievalContext = {
      documentIds: body.documentIds,
      mode: body.mode || "auto",
      requestId,
    };
    const context = await this.chat.prepare(body.question, user, chat.knowledgeBaseId, {
      ...retrievalContext,
      chatId: chat.id,
      history: chat.messages,
      apiKey,
      onProgress,
      signal,
      onAgentStep,
      quizContext: body.quizContext,
    });
    // 全文证据超出上下文时转为后台任务，HTTP/SSE 返回受理信息，前端随后轮询。
    if (context.requiresAsync) {
      const accepted = await this.qa.enqueue(
        user,
        chat.id,
        requestId,
        fingerprint,
        { ...context.snapshot, chatId: chat.id },
        apiKey,
        retrievalContext,
      );
      return { accepted };
    }
    await this.history.addMessage(chat.id, user, "user", body.question, [], "completed", {
      retrievalContext,
    });
    return { chat, context };
  }

  private async complete(prepared: ExecutingChat, user: number, final: Omit<ChatAnswer, "type">) {
    if (prepared.started)
      await this.agentTasks!.complete(prepared.started.task.id, prepared.started.token!, final);
    else
      await this.history.addMessage(
        prepared.chat.id,
        user,
        "assistant",
        final.answer,
        final.citations,
        "completed",
        { retrievalRunId: final.retrievalRunId, diagnostics: final.diagnostics },
      );
  }

  async answer(body: ChatDto, user: number, apiKey: string | undefined, signal: AbortSignal) {
    let prepared: PreparedChat | undefined;
    try {
      prepared = await this.prepare(body, user, apiKey, undefined, signal);
      if (prepared.accepted) {
        return { accepted: prepared.accepted } as const;
      }
      const final = await this.chat.answerPrepared(
        prepared.context,
        apiKey,
        prepared.execution?.signal || signal,
      );
      await this.complete(prepared, user, final);
      return {
        result: { ...final, chatId: prepared.chat.id, generationStatus: "completed" },
      } as const;
    } catch (error) {
      if (prepared?.started) {
        if (signal.aborted)
          await this.agentTasks!.cancel(prepared.started.task.id, user).catch(() => undefined);
        await this.agentTasks!.fail(prepared.started.task.id, prepared.started.token!, error);
      }
      throw error;
    } finally {
      prepared?.execution?.dispose();
    }
  }

  async stream(
    prepared: ExecutingChat,
    user: number,
    apiKey: string | undefined,
    abort: AbortController,
    send: (data: unknown, event?: string) => Promise<void>,
  ) {
    const chatId = prepared.chat.id;
    let answer = "",
      sources: Citation[] = [],
      settled = false;
    // Bound silence, rather than cutting off an answer that is still progressing.
    const timer = setTimeout(
      () => abort.abort(new Error("模型长时间未返回正文，请稍后重试")),
      60000,
    );
    let onAbort: () => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      onAbort = () => reject(abort.signal.reason);
      abort.signal.addEventListener("abort", onAbort, { once: true });
    });
    interrupted.catch(() => undefined);
    try {
      abort.signal.throwIfAborted();
      await send(chatId, "chatId");
      await send({ stage: "generating" }, "status");
      const consume = async () => {
        for await (const event of this.chat.streamPrepared(
          prepared.context,
          apiKey,
          prepared.execution?.signal || abort.signal,
        )) {
          if (abort.signal.aborted) return;
          if (event.type === "sources") {
            sources = event.sources;
            await send(sources, "sources");
          } else if (event.type === "message") {
            timer.refresh();
            answer += event.text;
            await send(event.text);
          } else {
            answer = event.answer;
            await this.complete(prepared, user, event);
            settled = true;
            await send(event.citations, "citations");
            await send(
              {
                answer,
                citations: event.citations,
                chatId,
                generationStatus: "completed",
                retrievalRunId: event.retrievalRunId,
                diagnostics: event.diagnostics,
              },
              "done",
            );
          }
        }
      };
      await Promise.race([consume(), interrupted]);
    } catch (error) {
      const final = normalizeCitations(answer, sources);
      const interruptedAnswer = final.answer || "[生成失败: " + errorMessage(error) + "]";
      if (prepared.started) {
        const partial = {
          answer: interruptedAnswer,
          citations: final.citations,
          diagnostics: prepared.context?.diagnostics,
        };
        if (abort.signal.aborted)
          await this.agentTasks!.cancel(prepared.started.task.id, user, partial).catch(
            () => undefined,
          );
        await this.agentTasks!.fail(
          prepared.started.task.id,
          prepared.started.token!,
          error,
          3,
          false,
          partial,
        );
      }
      if (!settled && !prepared.started) {
        await this.history
          .addMessage(
            chatId,
            user,
            "assistant",
            interruptedAnswer,
            final.citations,
            "interrupted",
            {
              retrievalRunId: prepared.context?.diagnostics?.runId,
              diagnostics: prepared.context?.diagnostics,
            },
          )
          .catch(() => undefined);
      }
      await send(
        {
          message: errorMessage(error),
          answer: interruptedAnswer,
          citations: final.citations,
          chatId,
          generationStatus: "interrupted",
          retrievalRunId: prepared.context?.diagnostics?.runId,
          diagnostics: prepared.context?.diagnostics,
        },
        "error",
      ).catch(() => undefined);
    } finally {
      clearTimeout(timer);
      abort.signal.removeEventListener("abort", onAbort);
      prepared.execution?.dispose();
    }
  }
}
