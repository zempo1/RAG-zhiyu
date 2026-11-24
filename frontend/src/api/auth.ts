import request from "../utils/request";
import { isAxiosError } from "axios";

const avatarPath = "/api/auth/avatar";

export function getAccountAvatar(signal: AbortSignal) {
  return request.get<Blob, Blob>(avatarPath, { responseType: "blob", signal, silentError: true });
}

export async function uploadAccountAvatar(file: File, signal: AbortSignal) {
  const form = new FormData();
  form.append("file", file);
  try {
    return await request.put<Blob, Blob>(avatarPath, form, {
      headers: { "Content-Type": "multipart/form-data" },
      responseType: "blob",
      signal,
      silentError: true,
    });
  } catch (error) {
    const body = isAxiosError(error) ? error.response?.data : undefined;
    const detail = body instanceof Blob ? await body.text().then(JSON.parse).catch(() => null) : null;
    throw new Error(typeof detail?.message === "string" ? detail.message : "头像上传失败，请重试");
  }
}

export const changePassword = async (oldPassword: string, newPassword: string) => {
  return request.post("/api/auth/change-password", {
    oldPassword,
    newPassword,
  });
};

export const changeUsername = async (newUsername: string) => {
  return request.post("/api/auth/change-username", {
    newUsername,
  });
};
