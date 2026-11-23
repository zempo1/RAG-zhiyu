import { Module } from "@nestjs/common";
import { EmbeddingsModule } from "../embeddings/embeddings.module";
import { VectorStoreModule } from "../vector-store/vector-store.module";
import { RagService } from "./rag.service";
import { RetrievalService } from "./retrieval/retrieval.service";
import { KnowledgeBasesModule } from "../knowledge-bases/knowledge-bases.module";
import { LlmModule } from "../llm/llm.module";
import { QualityModelsService } from "./retrieval/quality-models.service";
import { SummaryService } from "./summary.service";
import { RetrievalRunsController } from "./retrieval-runs/retrieval-runs.controller";
import { RetrievalRunsService } from "./retrieval-runs/retrieval-runs.service";
import { RetrievalRunsRetention } from "./retrieval-runs/retrieval-runs-retention";
import { PdfTableBackfillService } from "./citations/pdf-table-backfill.service";
import { DocumentOriginalsService } from "../documents/originals/document-originals.service";

@Module({
  imports: [EmbeddingsModule, VectorStoreModule, KnowledgeBasesModule, LlmModule],
  controllers: [RetrievalRunsController],
  providers: [
    RagService,
    RetrievalRunsService,
    RetrievalRunsRetention,
    RetrievalService,
    QualityModelsService,
    SummaryService,
    PdfTableBackfillService,
    DocumentOriginalsService,
  ],
  exports: [RagService, RetrievalService, SummaryService],
})
export class RagModule {}
