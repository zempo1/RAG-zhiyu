import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiError } from "../../../common/api-error";
import { DocumentsService } from "../documents.service";
import { UserId } from "../../auth/auth.guard";
import { IdPipe } from "../../../common/pipes/id.pipe";
import { ChunkUploadService } from "./chunk-upload.service";
import { ChunkDto, MergeDto, UploadCheckDto, UploadOptionsDto } from "../dto/upload.dto";

const upload = FileInterceptor("file", {
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 12 },
});

@Controller("api")
export class DocumentUploadController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly chunks: ChunkUploadService,
  ) {}

  @Post("upload")
  @HttpCode(202)
  @UseInterceptors(upload)
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @UserId() user: number,
    @Body() options: UploadOptionsDto,
  ) {
    return this.ingestFile(file, user, options);
  }

  private ingestFile(
    file: Express.Multer.File | undefined,
    user: number,
    options: UploadOptionsDto,
  ) {
    if (!file) throw new ApiError(400, "file is required");
    let filename = file.originalname;
    // Busboy decodes unextended Content-Disposition filenames as Latin-1,
    // while browsers send UTF-8. Keep already-decoded Unicode untouched.
    if ([...filename].every((character) => character.charCodeAt(0) <= 255)) {
      try {
        filename = new TextDecoder("utf-8", { fatal: true }).decode(
          Buffer.from(filename, "latin1"),
        );
      } catch {
        /* A genuine legacy Latin-1 filename is already readable. */
      }
    }
    return this.documents.ingest(file.buffer, filename, user, {
      ...options,
      idempotencyKey: options.idempotencyKey || options.uploadId,
    });
  }

  @Put("documents/:id/file")
  @HttpCode(202)
  @UseInterceptors(upload)
  replace(
    @Param("id", IdPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @UserId() user: number,
    @Body() options: UploadOptionsDto,
  ) {
    return this.ingestFile(file, user, { ...options, documentId: id });
  }

  @Get("upload/check")
  check(@Query() dto: UploadCheckDto, @UserId() user: number) {
    return this.chunks.check(dto, user);
  }

  @Post("upload/chunk")
  @UseInterceptors(upload)
  chunk(
    @Body() dto: ChunkDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @UserId() user: number,
  ) {
    return this.chunks.upload(dto, file, user);
  }

  @Post("upload/merge")
  @HttpCode(202)
  merge(@Body() dto: MergeDto, @UserId() user: number) {
    return this.chunks.merge(dto, user);
  }
}
