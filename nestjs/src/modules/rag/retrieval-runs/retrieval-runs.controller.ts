import { Controller, Get, Param } from "@nestjs/common";
import { UserId } from "../../auth/auth.guard";
import { IdPipe } from "../../../common/pipes/id.pipe";
import { RetrievalRunsService } from "./retrieval-runs.service";

@Controller("api/retrieval-runs")
export class RetrievalRunsController {
  constructor(private readonly runs: RetrievalRunsService) {}

  @Get(":id")
  get(@UserId() user: number, @Param("id", IdPipe) id: number) {
    return this.runs.get(user, id);
  }
}
