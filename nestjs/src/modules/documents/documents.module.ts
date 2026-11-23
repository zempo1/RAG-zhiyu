import { Module } from "@nestjs/common";
import { EmbeddingsModule } from "../embeddings/embeddings.module";
import { VectorStoreModule } from "../vector-store/vector-store.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { DocumentParser } from "./parsers/document.parser";
import { RecursiveChunker } from "./chunkers/recursive.chunker";
import { ChunkUploadService } from "./upload/chunk-upload.service";
import { KnowledgeBasesModule } from "../knowledge-bases/knowledge-bases.module";
import { TasksModule } from "../tasks/tasks.module";
import { IndexingService } from "./indexing/indexing.service";
import { KnowledgeBaseDocumentsController } from "./knowledge-base-documents.controller";
import { DocumentUploadController } from "./upload/document-upload.controller";
import { DocumentAssetsController } from "./originals/document-assets.controller";
import { LlmModule } from "../llm/llm.module";
import { PageAssetsService } from "./originals/page-assets.service";
import { PdfVisualService } from "./parsers/pdf/vision/pdf-visual.service";
import { DocumentOriginalsService } from "./originals/document-originals.service";

@Module({
  imports: [EmbeddingsModule, VectorStoreModule, KnowledgeBasesModule, TasksModule, LlmModule],
  controllers: [
    DocumentsController,
    DocumentUploadController,
    DocumentAssetsController,
    KnowledgeBaseDocumentsController,
  ],
  providers: [
    DocumentsService,
    DocumentOriginalsService,
    DocumentParser,
    RecursiveChunker,
    ChunkUploadService,
    IndexingService,
    PageAssetsService,
    PdfVisualService,
  ],
  exports: [DocumentsService, IndexingService, PageAssetsService],
})
export class DocumentsModule {}
