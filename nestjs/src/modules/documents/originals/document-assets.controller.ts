import {
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseIntPipe,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { DocumentsService } from "../documents.service";
import { UserId } from "../../auth/auth.guard";
import { IdPipe } from "../../../common/pipes/id.pipe";
import { ApiError } from "../../../common/api-error";
import { byteRange, DocumentOriginalsService } from "./document-originals.service";
import { PageAssetsService } from "./page-assets.service";

@Controller("api")
export class DocumentAssetsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly assets: PageAssetsService,
    private readonly originals: DocumentOriginalsService,
  ) {}

  @Get("documents/:id/preview")
  @Header("Cache-Control", "private, no-store")
  preview(
    @Param("id", IdPipe) id: number,
    @UserId() user: number,
    @Query("versionId") versionId?: string,
  ) {
    const version = versionId === undefined ? undefined : Number(versionId);
    if (version !== undefined && (!Number.isSafeInteger(version) || version < 1))
      throw new ApiError(400, "文档版本无效");
    return this.originals.preview(user, id, version);
  }

  // Express also routes HEAD through GET; the handler omits the body explicitly.
  @Get("documents/:id/versions/:versionId/original")
  async original(
    @Param("id", IdPipe) id: number,
    @Param("versionId", IdPipe) versionId: number,
    @UserId() user: number,
    @Headers("range") range: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const file = await this.originals.file(user, id, versionId);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/'/g, "%27")}`,
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Accept-Ranges", "bytes");
    let selected: ReturnType<typeof byteRange>;
    try {
      selected = byteRange(request.method === "HEAD" ? undefined : range, file.size);
    } catch {
      response.setHeader("Content-Range", `bytes */${file.size}`);
      response.status(416).end();
      return;
    }
    response.status(selected ? 206 : 200);
    response.setHeader("Content-Length", selected ? selected.end - selected.start + 1 : file.size);
    if (selected)
      response.setHeader("Content-Range", `bytes ${selected.start}-${selected.end}/${file.size}`);
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    try {
      await pipeline(createReadStream(file.path, selected || undefined), response);
    } catch (error) {
      if (!response.destroyed) throw error;
    }
  }

  @Get("documents/:id/versions/:versionId/pages/:page/image")
  async pageImage(
    @Param("id", IdPipe) id: number,
    @Param("versionId", IdPipe) versionId: number,
    @Param("page", IdPipe) page: number,
    @Query("profile") profile: string,
    @UserId() user: number,
    @Res() response: Response,
  ) {
    const bytes = await this.assets.image(user, id, { versionId, page, profile });
    response.setHeader("Content-Type", "image/png");
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(bytes);
  }

  // 区域接口同样经文档、版本、知识库归属校验，路径不接受自由文件名。
  @Get("documents/:id/versions/:versionId/pages/:page/regions/:regionId/image")
  async regionImage(
    @Param("id", IdPipe) id: number,
    @Param("versionId", IdPipe) versionId: number,
    @Param("page", IdPipe) page: number,
    @Param("regionId") regionId: string,
    @Query("profile") profile: string,
    @UserId() user: number,
    @Res() response: Response,
  ) {
    const bytes = await this.assets.regionImage(user, id, { versionId, page, profile, regionId });
    response.setHeader("Content-Type", "image/png");
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(bytes);
  }

  @Get("documents/:id/versions/:versionId/citation-context")
  @Header("Cache-Control", "private, no-store")
  citationContext(
    @Param("id", IdPipe) id: number,
    @Param("versionId", IdPipe) versionId: number,
    @Query("revisionId", IdPipe) revisionId: number,
    @Query("start", ParseIntPipe) start: number,
    @Query("end", ParseIntPipe) end: number,
    @UserId() user: number,
  ) {
    return this.documents.citationContext(id, user, versionId, revisionId, start, end);
  }
}
