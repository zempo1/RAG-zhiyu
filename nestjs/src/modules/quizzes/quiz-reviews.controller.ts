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
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { IdPipe } from "../../common/pipes/id.pipe";
import { UserId } from "../auth/auth.guard";
import { QuizAnswerProgressDto } from "./quizzes.controller";
import { QuizReviewsService } from "./quiz-reviews.service";

class ReviewLibraryDto {
  @Type(() => Number) @IsInt() @Min(1) knowledgeBaseId: number;
}

class ReviewWorkspaceDto extends ReviewLibraryDto {
  @IsOptional() @IsIn(["pending", "mastered"]) status?: "pending" | "mastered";
  @IsOptional() @IsString() @MaxLength(100) topic?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) documentId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
}

class CreateCategoryDto extends ReviewLibraryDto {
  @IsString() @MaxLength(40) label: string;
}

class AssignCategoryDto extends ReviewLibraryDto {
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  topic: string | null;
}

class ReviewProgressDto extends QuizAnswerProgressDto {
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) currentIndex?: number;
}

class StartReviewPracticeDto {
  @IsInt() @Min(1) knowledgeBaseId: number;
  @IsUUID() requestId: string;
  @IsIn(["original", "variant"]) mode: "original" | "variant";
  @IsOptional() @IsString() @MaxLength(100) topic?: string;
  @IsOptional() @IsInt() @Min(1) documentId?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) singleCount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) multipleCount?: number;
}

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
