import { Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { DocumentsService } from "./documents.service";
import { UserId } from "../auth/auth.guard";
import { IdPipe } from "../../common/pipes/id.pipe";
import { DocumentQueryDto } from "./dto/document.dto";

@Controller("api/knowledge-bases")
export class KnowledgeBaseDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Delete(":id") @HttpCode(202) delete(@Param("id", IdPipe) id: number, @UserId() user: number) {
    return this.documents.deleteLibrary(id, user);
  }
  @Get(":id/documents") documentsPage(
    @Param("id", IdPipe) id: number,
    @UserId() user: number,
    @Query() query: DocumentQueryDto,
  ) {
    return this.documents.page(id, user, query);
  }
  @Post(":id/reindex") @HttpCode(202) reindex(
    @Param("id", IdPipe) id: number,
    @UserId() user: number,
  ) {
    return this.documents.reindexLibrary(id, user);
  }
}
