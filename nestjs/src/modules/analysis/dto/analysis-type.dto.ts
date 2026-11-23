import { IsIn, IsOptional, IsInt, Min, Max } from "class-validator";
import { Type } from "class-transformer";

export const ANALYSIS_TYPES = ["SUMMARY", "FLASHCARD"] as const;

export function isAnalysisType(value: unknown): value is (typeof ANALYSIS_TYPES)[number] {
  return ANALYSIS_TYPES.some((type) => type === value);
}

export class AnalysisTypeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  knowledgeBaseId?: number;
  @IsIn(ANALYSIS_TYPES)
  type: (typeof ANALYSIS_TYPES)[number];
}
