import {
  IsInt,
  Min,
  Max,
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsIn,
  IsBoolean,
} from "class-validator";

export class GenerateQuizDto {
  @IsInt() @Min(1) documentId: number;
  @IsInt() @Min(0) @Max(20) singleCount: number;
  @IsInt() @Min(0) @Max(20) multipleCount: number;
  @IsUUID() requestId: string;
}
export class StartQuizAttemptDto {
  @IsUUID() requestId: string;
}
export class QuizAnswerProgressDto {
  @IsOptional() @IsString() @MaxLength(10) questionId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(["A", "B", "C", "D"], { each: true })
  selectedOptionIds?: string[];
  @IsOptional() @IsBoolean() submit?: boolean;
}
export class QuizProgressDto extends QuizAnswerProgressDto {
  @IsOptional() @IsInt() @Min(0) @Max(19) currentIndex?: number;
}
