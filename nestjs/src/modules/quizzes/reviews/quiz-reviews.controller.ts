import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { IdPipe } from "../../../common/pipes/id.pipe";
import { UserId } from "../../auth/auth.guard";
import { QuizReviewsService } from "./quiz-reviews.service";
import {
  AssignCategoryDto,
  CreateCategoryDto,
  ReviewLibraryDto,
  ReviewProgressDto,
  ReviewWorkspaceDto,
  StartReviewPracticeDto,
} from "../dto/quiz-review.dto";

@Controller("api/quiz-reviews")
export class QuizReviewsController {
  constructor(private readonly reviews: QuizReviewsService) {}

  @Get("workspace")
  workspace(@UserId() user: number, @Query() dto: ReviewWorkspaceDto) {
    return this.reviews.workspace(user, dto);
  }

  @Post("categories")
  @HttpCode(200)
  createCategory(@UserId() user: number, @Body() dto: CreateCategoryDto) {
    return this.reviews.createCategory(user, dto.knowledgeBaseId, dto.label);
  }

  @Delete("categories/:key")
  deleteCategory(
    @UserId() user: number,
    @Query() dto: ReviewLibraryDto,
    @Param("key") key: string,
  ) {
    return this.reviews.deleteCategory(user, dto.knowledgeBaseId, key);
  }

  @Patch("items/:id/category")
  assignCategory(
    @UserId() user: number,
    @Param("id", IdPipe) id: number,
    @Body() dto: AssignCategoryDto,
  ) {
    return this.reviews.assignCategory(user, dto.knowledgeBaseId, id, dto.topic);
  }

  @Post("practices")
  @HttpCode(200)
  start(
    @UserId() user: number,
    @Body() dto: StartReviewPracticeDto,
    @Headers("x-api-key") apiKey?: string,
  ) {
    return this.reviews.start(user, dto, apiKey);
  }

  @Get("practices/:id")
  get(@UserId() user: number, @Param("id", IdPipe) id: number) {
    return this.reviews.get(user, id);
  }

  @Delete("practices/:id")
  remove(@UserId() user: number, @Param("id", IdPipe) id: number) {
    return this.reviews.removePractice(user, id);
  }

  @Patch("practices/:id/progress")
  progress(
    @UserId() user: number,
    @Param("id", IdPipe) id: number,
    @Body() dto: ReviewProgressDto,
  ) {
    return this.reviews.progress(user, id, dto);
  }
}
