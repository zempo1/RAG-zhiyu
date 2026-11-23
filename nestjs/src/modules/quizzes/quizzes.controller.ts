import {
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Headers,
  HttpCode,
} from "@nestjs/common";
import { UserId } from "../auth/auth.guard";
import { IdPipe } from "../../common/pipes/id.pipe";
import { QuizzesService } from "./quizzes.service";
import { GenerateQuizDto, StartQuizAttemptDto } from "./dto/quiz.dto";

@Controller("api/quizzes")
export class QuizzesController {
  constructor(private readonly service: QuizzesService) {}
  @Post("generate") @HttpCode(202) generate(
    @Body() dto: GenerateQuizDto,
    @UserId() user: number,
    @Headers("x-api-key") key?: string,
  ) {
    return this.service.generate(
      user,
      dto.documentId,
      dto.singleCount,
      dto.multipleCount,
      key,
      dto.requestId,
    );
  }
  @Get("workspace") workspace(
    @UserId() user: number,
    @Query("knowledgeBaseId", IdPipe) kb: number,
  ) {
    return this.service.workspace(user, kb);
  }
  @Get(":id") get(@Param("id", IdPipe) id: number, @UserId() user: number) {
    return this.service.get(id, user);
  }
  @Delete(":id") delete(@Param("id", IdPipe) id: number, @UserId() user: number) {
    return this.service.delete(id, user);
  }
  @Post(":id/attempts") attempt(
    @Param("id", IdPipe) id: number,
    @UserId() user: number,
    @Body() dto: StartQuizAttemptDto,
  ) {
    return this.service.startAttempt(id, user, dto.requestId);
  }
}
