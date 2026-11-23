import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiError } from "../../../common/api-error";
import { parseStoreTime, Store } from "../../../persistence/store";

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

@Injectable()
export class RetrievalRunsService {
  constructor(
    private readonly store: Store,
    private readonly config: ConfigService,
  ) {}

  private timezone(): string {
    return this.config.get<string>("DB_TIMEZONE") || "+08:00";
  }

  async get(userId: number, id: number) {
    const run = await this.store.get("retrievalRuns", id);
    if (!run || run.userId !== userId) throw new ApiError(404, "检索记录不存在或已过期");
    const created = parseStoreTime(run.createdAt, this.timezone());
    if (!Number.isFinite(created) || created < Date.now() - RETENTION_MS)
      throw new ApiError(404, "检索记录不存在或已过期");
    return { id: run.id, createdAt: run.createdAt, ...run.payload };
  }

  purge() {
    return this.store.deleteExpiredRetrievalRuns(
      new Date(Date.now() - RETENTION_MS),
      this.timezone(),
    );
  }
}
