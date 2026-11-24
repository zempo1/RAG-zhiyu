import { Controller, Get, Put, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { UserId } from "../auth.guard";
import { AVATAR_UPLOAD_LIMIT, AvatarService } from "./avatar.service";

@Controller("api/auth/avatar")
export class AvatarController {
  constructor(private readonly avatars: AvatarService) {}

  @Get()
  async get(@UserId() userId: number, @Res() response: Response) {
    this.send(response, await this.avatars.get(userId));
  }

  @Put()
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: AVATAR_UPLOAD_LIMIT, files: 1, fields: 0 } }),
  )
  async replace(
    @UserId() userId: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res() response: Response,
  ) {
    this.send(response, await this.avatars.replace(userId, file?.buffer));
  }

  private send(response: Response, avatar: Buffer | null) {
    response.setHeader("Cache-Control", "private, no-store");
    if (!avatar) {
      response.status(204).end();
      return;
    }
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.type("image/webp").send(avatar);
  }
}
