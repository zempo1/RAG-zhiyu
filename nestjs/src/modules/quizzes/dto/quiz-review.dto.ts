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
import { QuizAnswerProgressDto } from "./quiz.dto";

export class ReviewLibraryDto {
  @Type(() => Number) @IsInt() @Min(1) knowledgeBaseId: number;
}

export class ReviewWorkspaceDto extends ReviewLibraryDto {
  @IsOptional() @IsIn(["pending", "mastered"]) status?: "pending" | "mastered";
  @IsOptional() @IsString() @MaxLength(100) topic?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) documentId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
}

export class CreateCategoryDto extends ReviewLibraryDto {
  @IsString() @MaxLength(40) label: string;
}

export class AssignCategoryDto extends ReviewLibraryDto {
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  topic: string | null;
}

export class ReviewProgressDto extends QuizAnswerProgressDto {
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) currentIndex?: number;
}

export class StartReviewPracticeDto {
  @IsInt() @Min(1) knowledgeBaseId: number;
  @IsUUID() requestId: string;
  @IsIn(["original", "variant"]) mode: "original" | "variant";
  @IsOptional() @IsString() @MaxLength(100) topic?: string;
  @IsOptional() @IsInt() @Min(1) documentId?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) singleCount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) multipleCount?: number;
}
