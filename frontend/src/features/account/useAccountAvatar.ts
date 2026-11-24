import { onBeforeUnmount, onMounted, ref } from "vue";
import { getAccountAvatar, uploadAccountAvatar } from "../../api/auth";
import { useToast } from "../../composables/useToast";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function useAccountAvatar() {
  const avatarUrl = ref<string>();
  const uploading = ref(false);
  const lifetime = new AbortController();
  const toast = useToast();
  let uploaded = false;

  function show(blob: Blob) {
    if (!(blob instanceof Blob) || !blob.size || !blob.type.startsWith("image/")) return;
    if (avatarUrl.value) URL.revokeObjectURL(avatarUrl.value);
    avatarUrl.value = URL.createObjectURL(blob);
  }

  onMounted(async () => {
    try {
      const image = await getAccountAvatar(lifetime.signal);
      if (!uploaded && !lifetime.signal.aborted) show(image);
    } catch {
      // Keep the default avatar when the image is unavailable.
    }
  });

  onBeforeUnmount(() => {
    lifetime.abort();
    if (avatarUrl.value) URL.revokeObjectURL(avatarUrl.value);
  });

  async function changeAvatar(file: File) {
    if (uploading.value) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("头像图片不能超过 5 MB");
      return;
    }
    uploading.value = true;
    try {
      const image = await uploadAccountAvatar(file, lifetime.signal);
      if (lifetime.signal.aborted) return;
      uploaded = true;
      show(image);
      toast.success("头像已更新");
    } catch (error) {
      if (!lifetime.signal.aborted)
        toast.error(error instanceof Error ? error.message : "头像上传失败，请重试");
    } finally {
      uploading.value = false;
    }
  }

  return { avatarUrl, uploading, changeAvatar };
}
