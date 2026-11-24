import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import sharp from "sharp";
import { ApiError } from "../../../common/api-error";
import { User } from "../entities/user.entity";
import type { UserRepository } from "../user-repository";

export const AVATAR_UPLOAD_LIMIT = 5 * 1024 * 1024;
const MAX_PIXELS = 4096 * 4096;
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isSupportedImage(bytes: Buffer): boolean {
  return (
    bytes.subarray(0, 3).equals(JPEG) ||
    bytes.subarray(0, 8).equals(PNG) ||
    (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP")
  );
}

@Injectable()
export class AvatarService {
  constructor(@InjectRepository(User) private readonly users: UserRepository) {}

  get(userId: number) {
    return this.users.findAvatar(userId);
  }

  async replace(userId: number, bytes?: Buffer): Promise<Buffer> {
    if (!bytes?.length) throw new ApiError(400, "请选择头像图片");
    if (!isSupportedImage(bytes)) throw new ApiError(400, "头像仅支持 JPG、PNG 或 WebP 图片");

    let avatar: Buffer;
    try {
      avatar = await sharp(bytes, { limitInputPixels: MAX_PIXELS, autoOrient: true })
        .resize(256, 256, { fit: "cover" })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new ApiError(400, "图片无法读取或像素过多，请选择其他图片");
    }

    await this.users.update(userId, { avatar });
    return avatar;
  }
}
