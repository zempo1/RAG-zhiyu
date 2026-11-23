<template>
  <section class="library-picker knowledge-theme">
    <KnowledgeSelect
      :model-value="knowledgeBaseId"
      :options="libraryOptions"
      placeholder="选择知识库"
      :disabled="uploading"
      @update:model-value="emit('change', $event)"
      :title="currentLibrary?.name"
    >
      <template #prefix
        ><el-icon><Collection /></el-icon
      ></template>
    </KnowledgeSelect>
    <div class="picker-actions">
      <el-button class="manage-button" :disabled="!currentLibrary" @click="emit('manage')"
        ><el-icon><FolderOpened /></el-icon>管理文档</el-button
      >
      <el-button
        class="create-button"
        title="新建知识库"
        aria-label="新建知识库"
        @click="emit('create')"
        ><el-icon><Plus /></el-icon
      ></el-button>
    </div>
    <p class="library-hint">问答检索当前知识库</p>
    <div class="selected-source" :title="selectedDocument?.filename">
      <el-icon><Document /></el-icon>
      <div>
        <span class="source-label">工作台来源</span
        ><span class="source-name">{{ selectedDocument?.filename || "在文档管理中选择文档" }}</span>
      </div>
      <el-button
        v-if="selectedDocument"
        class="clear-source"
        title="取消使用"
        aria-label="取消使用"
        @click="emit('clear')"
        ><el-icon><Close /></el-icon
      ></el-button>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { Collection, FolderOpened, Plus, Document, Close } from "@element-plus/icons-vue";
import KnowledgeSelect from "../../components/KnowledgeSelect.vue";
import type { KnowledgeBase, ManagedDocument } from "../../api/knowledge-bases";
const props = defineProps<{
  knowledgeBaseId: number | null;
  libraries: KnowledgeBase[];
  currentLibrary?: KnowledgeBase;
  selectedDocument: ManagedDocument | null;
  uploading: boolean;
}>();
const libraryOptions = computed(() => {
  const options: Array<{ value: number; label: string; disabled?: boolean }> =
    props.libraries.map(({ id, name }) => ({ value: id, label: name }));
  if (props.knowledgeBaseId && !props.currentLibrary)
    options.push({ value: props.knowledgeBaseId, label: "已删除知识库（历史会话）", disabled: true });
  return options;
});
const emit = defineEmits<{
  (e: "change", id: number): void;
  (e: "manage"): void;
  (e: "create"): void;
  (e: "clear"): void;
}>();
</script>
