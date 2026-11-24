<template>
  <aside class="sidebar" :class="{ collapsed: isCollapsed }">
    <div class="sidebar-header">
      <div class="header-top">
        <div class="collapse-trigger" @click="toggleSidebar">
          <el-icon><Menu /></el-icon>
        </div>
        <div class="brand" v-show="!isCollapsed">
          <h2>知屿 · Islet</h2>
        </div>
      </div>

      <el-button
        class="new-chat-btn"
        @click="handleNewChat"
        :class="{ 'icon-only': isCollapsed }"
        v-if="isCollapsed"
      >
        <el-icon><Plus /></el-icon>
      </el-button>

      <div class="new-chat-btn-full" @click="handleNewChat" v-if="!isCollapsed">
        <el-icon><Plus /></el-icon>
        <span>新对话</span>
      </div>
    </div>

    <div class="sidebar-content">
      <div class="section-title" v-show="!isCollapsed">最近</div>
      <div class="chat-list" v-show="!isCollapsed">
        <div
          v-for="chat in chats"
          :key="chat.id"
          class="chat-item"
          :class="{ active: currentChatId === chat.id }"
          @click="handleSelectChat(chat.id)"
        >
          <div class="chat-title-wrapper">
            <el-icon><ChatLineRound /></el-icon>
            <el-tooltip :content="chat.title" placement="right" :show-after="400" :hide-after="0">
              <span class="chat-title-text">{{ chat.title }}</span>
            </el-tooltip>
          </div>
          <div class="chat-actions">
            <el-icon class="delete-icon" @click.stop="handleDeleteChat(chat.id)">
              <Delete />
            </el-icon>
          </div>
        </div>
      </div>

      <div class="section-title" v-show="!isCollapsed">知识库</div>
      <div class="upload-wrapper" v-show="!isCollapsed">
        <Upload
          :knowledge-base-id="knowledgeBaseId"
          :document-id="documentId"
          @knowledge-base-change="(id) => emit('knowledge-base-change', id)"
          @activated="handleFileActivated"
          @source-ready="(ready) => emit('source-ready', ready)"
          @deleted="(id) => emit('file-deleted', id)"
          @version-changed="emit('version-changed')"
          @preview-document="(target) => emit('preview-document', target)"
          @knowledge-base-deleted="(id) => emit('knowledge-base-deleted', id)"
        />
      </div>
    </div>

    <div class="sidebar-footer">
      <div class="user-info">
        <el-avatar
          v-if="!isCollapsed"
          :size="32"
          class="user-avatar"
          :src="avatarUrl"
          :icon="UserFilled"
          :alt="`${username}的头像`"
        />
        <div class="user-details" v-show="!isCollapsed">
          <span class="name">{{ username }}</span>
        </div>
        <div class="user-actions">
          <el-dropdown
            ref="accountMenu"
            trigger="click"
            placement="top-end"
            popper-class="account-settings-menu"
            @command="handleAccountCommand"
          >
            <button
              type="button"
              class="action-icon account-settings-trigger"
              aria-label="账户设置"
              :aria-busy="uploading"
              title="账户设置"
            >
              <el-avatar
                v-if="isCollapsed"
                :size="32"
                class="user-avatar"
                :src="avatarUrl"
                :icon="UserFilled"
                :alt="`${username}的头像`"
              />
              <el-icon v-else><Setting /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <li role="none" class="theme-menu-row">
                  <el-dropdown
                    :trigger="['hover', 'click']"
                    placement="right-start"
                    :popper-options="{ modifiers: [{ name: 'flip', enabled: false }] }"
                    :show-timeout="100"
                    :hide-timeout="180"
                    popper-class="account-settings-menu theme-settings-submenu"
                    @command="handleAccountCommand"
                  >
                    <button type="button" class="theme-menu-trigger" aria-label="当前主题">
                      <el-icon><Sunny v-if="theme === 'light'" /><Moon v-else /></el-icon>
                      {{ theme === "light" ? "浅色模式" : "深色模式" }}
                      <el-icon class="theme-chevron"><ArrowRight /></el-icon>
                    </button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item
                          command="light"
                          :class="{ 'is-current-theme': theme === 'light' }"
                        >
                          <el-icon><Sunny /></el-icon>浅色模式
                          <el-icon
                            v-if="theme === 'light'"
                            class="theme-check"
                            aria-label="当前主题"
                            ><Check
                          /></el-icon>
                        </el-dropdown-item>
                        <el-dropdown-item
                          command="dark"
                          :class="{ 'is-current-theme': theme === 'dark' }"
                        >
                          <el-icon><Moon /></el-icon>深色模式
                          <el-icon v-if="theme === 'dark'" class="theme-check" aria-label="当前主题"
                            ><Check
                          /></el-icon>
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </li>
                <el-dropdown-item command="profile" divided>
                  <el-icon><EditPen /></el-icon>修改资料
                </el-dropdown-item>
                <el-dropdown-item command="models">
                  <el-icon><Key /></el-icon>模型设置
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>

    <ChangePasswordDialog
      v-model="changePasswordVisible"
      :current-username="username"
      :avatar-url="avatarUrl"
      :avatar-uploading="uploading"
      @avatar-selected="changeAvatar"
      @username-changed="handleUsernameChanged"
    />
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import Upload from "../upload/Upload.vue";
import ChangePasswordDialog from "../account/ChangePasswordDialog.vue";
import { useAccountAvatar } from "../account/useAccountAvatar";
import { theme, setTheme, type Theme } from "../../composables/useTheme";
import {
  Plus,
  UserFilled,
  Menu,
  EditPen,
  ChatLineRound,
  Delete,
  Setting,
  Sunny,
  Moon,
  Check,
  ArrowRight,
  SwitchButton,
  Key,
} from "@element-plus/icons-vue";

import { useConfirm } from "../../composables/useConfirm";
import { useToast } from "../../composables/useToast";
import type { ChatItem } from "../../types";
import request from "../../utils/request";
import type { DocumentTarget } from "../reader/types";

const props = defineProps<{
  username: string;
  currentChatId: number | null;
  knowledgeBaseId: number | null;
  documentId: number | null;
  collapsed?: boolean;
}>();

const emit = defineEmits<{
  (e: "source-ready", ready: boolean): void;
  (e: "update:collapsed", value: boolean): void;
  (e: "knowledge-base-deleted", id: number): void;
  (e: "preview-document", target: DocumentTarget): void;
  (e: "new-chat"): void;
  (e: "select-chat", id: number): void;
  (e: "delete-chat", id: number): void;
  (e: "logout"): void;
  (e: "open-settings"): void;
  (e: "file-activated", filename: string, id: number | null): void;
  (e: "file-deleted", id: number): void;
  (e: "username-changed", username: string): void;
  (e: "knowledge-base-change", id: number): void;
  (e: "version-changed"): void;
}>();

const confirm = useConfirm();
const toast = useToast();

const localCollapsed = ref(false);
const isCollapsed = computed({
  get: () => props.collapsed ?? localCollapsed.value,
  set: (value: boolean) => {
    localCollapsed.value = value;
    emit("update:collapsed", value);
  },
});
const chats = ref<ChatItem[]>([]);
const changePasswordVisible = ref(false);
const accountMenu = ref<{ handleClose: () => void }>();
const { avatarUrl, uploading, changeAvatar } = useAccountAvatar();

function handleAccountCommand(command: Theme | "profile" | "models" | "logout") {
  accountMenu.value?.handleClose();
  switch (command) {
    case "profile":
      changePasswordVisible.value = true;
      break;
    case "models":
      emit("open-settings");
      break;
    case "logout":
      void handleLogout();
      break;
    default:
      setTheme(command);
  }
}

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value;
};

const handleNewChat = () => {
  emit("new-chat");
};

const handleSelectChat = (id: number) => {
  emit("select-chat", id);
};

const handleDeleteChat = async (id: number) => {
  const confirmed = await confirm.danger("确定要删除这个对话吗？删除后无法恢复。", "删除确认");
  if (!confirmed) return;
  emit("delete-chat", id);
  toast.success("对话已删除");
};

const handleLogout = async () => {
  const confirmed = await confirm.warning("确定要退出登录吗？", "退出确认");
  if (!confirmed) return;
  emit("logout");
  toast.success("退出成功");
};

const handleUsernameChanged = (newUsername: string) => {
  emit("username-changed", newUsername);
};

const handleFileActivated = (filename: string, id: number | null) => {
  emit("file-activated", filename, id);
};

const loadChats = async () => {
  try {
    const res = await request.get<any, ChatItem[]>("/api/chats");
    chats.value = res;
  } catch (e) {
    console.error(e);
  }
};

defineExpose({
  loadChats,
});
</script>

<style lang="scss" src="./Sidebar.scss" scoped></style>
