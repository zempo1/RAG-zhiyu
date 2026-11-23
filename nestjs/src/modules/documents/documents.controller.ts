import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { DocumentsService } from "./documents.service";
import { UserId } from "../auth/auth.guard";
import { IdPipe } from "../../common/pipes/id.pipe";
import { DocumentUpdateDto } from "./dto/document.dto";

@Controller("api")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get("documents")
  list(@UserId() user: number) {
    return this.documents.list(user);
  }

  @Get("documents/:id")
  async summary(@Param("id", IdPipe) id: number, @UserId() user: number) {
    const { content, userId, ...doc } = await this.documents.owned(id, user);
    return doc;
  }

  @Post("documents/:id/activate")
  activate(@Param("id", IdPipe) id: number, @UserId() user: number) {
    return this.documents.activate(id, user);
  }

  @Delete("documents/:id")
  @HttpCode(202)
  delete(@Param("id", IdPipe) id: number, @UserId() user: number) {
    return this.documents.delete(id, user);
  }

  @Put("documents/:id")
  update(@Param("id", IdPipe) id: number, @UserId() user: number, @Body() body: DocumentUpdateDto) {
    return this.documents.update(id, user, body);
  }

  @Post("documents/:id/reindex")
  @HttpCode(202)
  reindex(@Param("id", IdPipe) id: number, @UserId() user: number) {
    return this.documents.reindex(id, user);
  }
}
