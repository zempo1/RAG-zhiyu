import { IsOptional, IsString, MaxLength } from "class-validator";

export class NameDto {
  @IsString() @MaxLength(120) name: string;
}
export class KnowledgeBaseDto extends NameDto {
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
