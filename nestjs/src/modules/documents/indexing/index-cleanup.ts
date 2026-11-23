import { ConfigService } from "@nestjs/config";
import { unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { ApiError } from "../../../common/api-error";
import { Store, Row, now } from "../../../persistence/store";
import { TasksService, terminalTask } from "../../tasks/tasks.service";
import { VectorStore } from "../../vector-store/vector-store.interface";
import { PageAssetsService } from "../originals/page-assets.service";

export class DependencyPending extends Error {}
export const indexWallTime = (value: string) => Date.parse(value.replace(" ", "T") + "Z");

export class IndexCleanup {
  constructor(
    private readonly store: Store,
    private readonly vectors: VectorStore,
    private readonly tasks: TasksService,
    private readonly config: ConfigService,
    private readonly assets?: PageAssetsService,
  ) {}

  // 清理必须等待保留期和写入任务结束，否则可能删掉正在使用或刚写入的索引。
  async run(task: Row, token: string) {
    if (task.payload?.notBefore && indexWallTime(task.payload.notBefore) > indexWallTime(now()))
      throw new DependencyPending("索引仍在请求快照保留窗口");
    if (task.kind === "retire") {
      await this.store.withDocumentVectorLock(task.documentId, async (store) => {
        const doc = await store.get("documents", task.documentId);
        if (
          doc?.activeIndexRevisionId === task.indexRevisionId ||
          doc?.desiredIndexRevisionId === task.indexRevisionId
        )
          throw new ApiError(409, "不能清理生效或待发布的索引");
        if (
          (await store.list("tasks", { indexRevisionId: task.indexRevisionId })).some(
            (t) => t.kind === "index" && t.executionToken,
          )
        )
          throw new DependencyPending("等待索引写入任务终止");
        await this.vectors.removeRevision(task.indexRevisionId, task.userId);
      });
      for (const chunk of await this.store.list("chunks", {
        indexRevisionId: task.indexRevisionId,
      }))
        await this.store.delete("chunks", chunk.id);
      await this.store.save("indexRevisions", { id: task.indexRevisionId, status: "cleaned" });
    } else if (task.kind === "cleanup") {
      await this.store.withDocumentVectorLock(task.documentId, async (store) => {
        const doc = await store.get("documents", task.documentId);
        if (!doc?.deletedAt) throw new ApiError(409, "文档未删除，拒绝清理");
        const active = (await store.list("tasks", { documentId: task.documentId })).some(
          (t) => t.kind === "index" && t.executionToken,
        );
        if (active) throw new DependencyPending("等待文档处理任务终止后清理");
        await this.vectors.removeDocument(task.documentId, task.userId);
      });
      await this.assets?.removeDocument(task.userId, task.documentId);
      for (const version of await this.store.list("versions", { documentId: task.documentId })) {
        if (version.originalPath) {
          if (basename(version.originalPath) !== version.originalPath)
            throw new ApiError(400, "原件路径无效");
          await unlink(join(this.config.getOrThrow("ORIGINALS_DIR"), version.originalPath)).catch(
            (error) => {
              if (error.code !== "ENOENT") throw error;
            },
          );
        }
        await this.store.delete("versions", version.id);
      }
      for (const chunk of await this.store.list("chunks", { documentId: task.documentId }))
        await this.store.delete("chunks", chunk.id);
      for (const revision of await this.store.list("indexRevisions", {
        documentId: task.documentId,
      }))
        await this.store.delete("indexRevisions", revision.id);
      await this.store.save("documents", {
        id: task.documentId,
        content: "",
        activeVersionId: null,
        status: "deleted",
      });
    } else if (task.kind === "cleanup-library") {
      const docs = await this.store.list("documents", { knowledgeBaseId: task.knowledgeBaseId });
      if (docs.some((d) => d.status !== "deleted"))
        throw new DependencyPending("等待知识库文档清理完成");
      for (const category of await this.store.list("categories", {
        knowledgeBaseId: task.knowledgeBaseId,
      }))
        await this.store.delete("categories", category.id);
    }
    await this.store.transaction(async (tx) => {
      const current = await tx.lock("tasks", task.id);
      if (current?.executionToken !== token) return;
      await tx.save("tasks", {
        id: task.id,
        status: "completed",
        stage: "completed",
        completed: 1,
        total: 1,
        executionToken: null,
        updatedAt: now(),
      });
    });
  }

  async ensureScheduled(task: Row) {
    const doc = await this.store.get("documents", task.documentId);
    if (!doc?.deletedAt) {
      // Superseded staging revisions never become visible and can be removed immediately.
      const current = await this.store.get("tasks", task.id);
      if (
        current?.status === "canceled" &&
        task.indexRevisionId &&
        doc?.activeIndexRevisionId !== task.indexRevisionId &&
        doc?.desiredIndexRevisionId !== task.indexRevisionId
      ) {
        await this.store.transaction(async (tx) => {
          await tx.lock("knowledgeBases", task.knowledgeBaseId);
          await tx.lock("documents", task.documentId);
          if (
            !(await tx.list("tasks", { indexRevisionId: task.indexRevisionId })).some(
              (t) => t.kind === "retire" && !terminalTask(t.status),
            )
          )
            await this.tasks.create(tx, {
              userId: task.userId,
              knowledgeBaseId: task.knowledgeBaseId,
              documentId: task.documentId,
              indexRevisionId: task.indexRevisionId,
              kind: "retire",
            });
        });
      }
      return;
    }
    await this.store.transaction(async (tx) => {
      await tx.lock("knowledgeBases", task.knowledgeBaseId);
      await tx.lock("documents", task.documentId);
      const tasks = await tx.list("tasks", { documentId: task.documentId });
      const existing = tasks.find((t) => t.kind === "cleanup" && !terminalTask(t.status));
      if (!existing) {
        const cleanup = await this.tasks.create(tx, {
          userId: task.userId,
          knowledgeBaseId: task.knowledgeBaseId,
          documentId: task.documentId,
          kind: "cleanup",
        });
        await tx.save("documents", {
          id: task.documentId,
          status: "deleting",
          latestTaskId: cleanup.id,
        });
      }
    });
  }
}
