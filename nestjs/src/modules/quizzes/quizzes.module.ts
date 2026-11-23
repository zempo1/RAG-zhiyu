import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module";
import { LlmModule } from "../llm/llm.module";
import { EmbeddingsModule } from "../embeddings/embeddings.module";
import { TasksModule } from "../tasks/tasks.module";
import { QuizzesService } from "./quizzes.service";
import { QuizzesController } from "./quizzes.controller";
import { QuizAttemptsController } from "./quiz-attempts.controller";
import { QuizReviewsController } from "./reviews/quiz-reviews.controller";
import { QuizReviewsService } from "./reviews/quiz-reviews.service";
@Module({
  imports: [DocumentsModule, LlmModule, EmbeddingsModule, TasksModule],
  providers: [QuizzesService, QuizReviewsService],
  controllers: [QuizzesController, QuizAttemptsController, QuizReviewsController],
  exports: [QuizzesService],
})
export class QuizzesModule {}
