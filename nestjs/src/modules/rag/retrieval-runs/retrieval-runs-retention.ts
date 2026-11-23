import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RetrievalRunsService } from "./retrieval-runs.service";

@Injectable()
export class RetrievalRunsRetention implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetrievalRunsRetention.name);
  private timer?: NodeJS.Timeout;
  private active?: Promise<void>;

  constructor(
    private readonly runs: RetrievalRunsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const isWorker = process.env.PROCESS_ROLE === "worker";
    if (isWorker !== (this.config.get("QUEUE_DRIVER") === "bullmq")) return;
    this.timer = setInterval(
      () => {
        this.active ??= this.runs
          .purge()
          .catch(() => this.logger.warn("检索记录清理失败，将在下一轮重试"))
          .finally(() => {
            this.active = undefined;
          });
      },
      60 * 60 * 1000,
    );
    this.timer.unref();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.active;
  }
}
