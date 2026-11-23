import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { UserId } from "../auth/auth.guard";
import { IdPipe } from "../../common/pipes/id.pipe";
import { QuizzesService } from "./quizzes.service";
import { QuizProgressDto } from "./dto/quiz.dto";

@Controller("api/quiz-attempts")
export class QuizAttemptsController {
  constructor(private readonly service: QuizzesService) {}
  @Get(":id") get(@Param("id", IdPipe) id: number, @UserId() user: number) {
    return this.service.getAttempt(id, user);
  }
  @Patch(":id/progress") progress(
    @Param("id", IdPipe) id: number,
    @UserId() user: number,
    @Body() dto: QuizProgressDto,
  ) {
    return this.service.progress(id, user, dto);
  }
}
