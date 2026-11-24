<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="visible" class="modal-overlay" @click.self="handleClose">
        <div
          class="modal-container"
          role="dialog"
          aria-labelledby="account-settings-title"
          @keydown.esc.stop="handleClose"
        >
          <form @submit.prevent="handleSubmit">
            <div class="modal-header">
              <h3 id="account-settings-title">账户设置</h3>
              <button
                type="button"
                class="close-btn"
                aria-label="关闭弹窗"
                :disabled="loading"
                @click="handleClose"
              >
                <el-icon aria-hidden="true"><Close /></el-icon>
              </button>
            </div>

            <div class="modal-body">
              <button
                type="button"
                class="profile-avatar"
                :aria-label="avatarUploading ? '正在上传头像' : '更换头像'"
                :aria-busy="avatarUploading || undefined"
                :disabled="avatarUploading"
                title="更换头像"
                @click="avatarInput?.click()"
              >
                <img v-if="avatarUrl" :src="avatarUrl" alt="" />
                <el-icon v-else aria-hidden="true"><UserFilled /></el-icon>
              </button>
              <input
                ref="avatarInput"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                @change="selectAvatar"
              />

              <div class="form-group">
                <label for="account-username">用户名</label>
                <input
                  id="account-username"
                  v-model="username"
                  type="text"
                  maxlength="20"
                  autocomplete="username"
                  :disabled="loading"
                />
              </div>

              <div v-for="field in passwordFields" :key="field.key" class="form-group">
                <label :for="'account-' + field.key">{{ field.label }}</label>
                <div class="input-wrapper">
                  <input
                    :id="'account-' + field.key"
                    v-model="passwordForm[field.key]"
                    :type="shownPasswords[field.key] ? 'text' : 'password'"
                    :autocomplete="field.autocomplete"
                    :placeholder="field.placeholder"
                    :disabled="loading"
                  />
                  <button
                    type="button"
                    class="toggle-btn"
                    :aria-label="(shownPasswords[field.key] ? '隐藏' : '显示') + field.label"
                    @click="shownPasswords[field.key] = !shownPasswords[field.key]"
                  >
                    <el-icon aria-hidden="true"
                      ><Hide v-if="shownPasswords[field.key]" /><View v-else
                    /></el-icon>
                  </button>
                </div>
              </div>
              <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-cancel" :disabled="loading" @click="handleClose">
                取消
              </button>
              <button
                type="submit"
                class="btn btn-confirm"
                :disabled="loading || (!usernameChanged && !passwordChanged)"
              >
                {{ loading ? "保存中…" : "保存修改" }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Close, Hide, UserFilled, View } from "@element-plus/icons-vue";
import { changePassword, changeUsername } from "../../api/auth";
import { useToast } from "../../composables/useToast";

const props = defineProps<{
  modelValue: boolean;
  currentUsername?: string;
  avatarUrl?: string;
  avatarUploading?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "success"): void;
  (e: "username-changed", username: string): void;
  (e: "avatar-selected", file: File): void;
}>();

const passwordFields = [
  {
    key: "oldPassword",
    label: "原密码",
    autocomplete: "current-password",
    placeholder: "修改密码时填写",
  },
  { key: "newPassword", label: "新密码", autocomplete: "new-password", placeholder: "至少 6 位" },
  {
    key: "confirmPassword",
    label: "确认新密码",
    autocomplete: "new-password",
    placeholder: "再次输入新密码",
  },
] as const;

const toast = useToast();
const visible = computed(() => props.modelValue);
const avatarInput = ref<HTMLInputElement>();
const username = ref("");
const savedUsername = ref("");
const passwordForm = reactive({ oldPassword: "", newPassword: "", confirmPassword: "" });
const shownPasswords = reactive({ oldPassword: false, newPassword: false, confirmPassword: false });
const loading = ref(false);
const formError = ref("");
const usernameChanged = computed(() => username.value.trim() !== savedUsername.value);
const passwordChanged = computed(() => Object.values(passwordForm).some(Boolean));

watch(
  visible,
  (open) => {
    if (open) username.value = savedUsername.value = props.currentUsername ?? "";
    else {
      for (const { key } of passwordFields) {
        passwordForm[key] = "";
        shownPasswords[key] = false;
      }
      formError.value = "";
    }
  },
  { immediate: true },
);

function handleClose() {
  if (!loading.value) emit("update:modelValue", false);
}

function selectAvatar(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) emit("avatar-selected", file);
}

function validationMessage(newUsername: string) {
  if (usernameChanged.value && (newUsername.length < 2 || newUsername.length > 20))
    return "用户名须为 2–20 个字符";
  if (passwordChanged.value) {
    if (!passwordForm.oldPassword) return "请输入原密码";
    if (passwordForm.newPassword.length < 6) return "新密码至少需要 6 位";
    if (passwordForm.newPassword !== passwordForm.confirmPassword) return "两次输入的新密码不一致";
  }
  return "";
}

async function handleSubmit() {
  if (loading.value || (!usernameChanged.value && !passwordChanged.value)) return;
  const newUsername = username.value.trim();
  formError.value = validationMessage(newUsername);
  if (formError.value) return;
  loading.value = true;
  let usernameSaved = false;
  try {
    if (usernameChanged.value) {
      await changeUsername(newUsername);
      savedUsername.value = newUsername;
      usernameSaved = true;
      localStorage.setItem("username", newUsername);
      emit("username-changed", newUsername);
    }
    if (passwordChanged.value)
      await changePassword(passwordForm.oldPassword, passwordForm.newPassword);
    toast.success("账户设置已保存");
    emit("success");
    emit("update:modelValue", false);
  } catch (error) {
    const detail =
      (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (error instanceof Error ? error.message : "保存失败，请重试");
    formError.value = usernameSaved ? "用户名已保存。密码修改失败：" + detail : detail;
  } finally {
    loading.value = false;
  }
}
</script>

<style lang="scss" src="./ChangePasswordDialog.scss" scoped></style>
