<template>
  <el-select
    class="knowledge-theme knowledge-select"
    :model-value="modelValue"
    :empty-values="emptyValues"
    popper-class="knowledge-theme knowledge-popper library-options"
    placement="bottom-start"
    :fallback-placements="verticalPlacements"
    :show-arrow="false"
    fit-input-width
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="$slots.prefix" #prefix><slot name="prefix" /></template>
    <el-option
      v-for="option in options"
      :key="option.value"
      :label="option.label"
      :value="option.value"
      :disabled="option.disabled"
    >
      <span class="library-option-name" :title="option.label">{{ option.label }}</span>
      <el-icon v-if="option.value === modelValue" class="library-option-check" aria-hidden="true">
        <Check />
      </el-icon>
    </el-option>
  </el-select>
</template>

<script setup lang="ts" generic="T extends string | number">
import { Check } from "@element-plus/icons-vue";

defineProps<{
  modelValue?: T | null;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
}>();
const emit = defineEmits<{ (e: "update:modelValue", value: T): void }>();
const emptyValues = [null, undefined];
const verticalPlacements: "top-start"[] = ["top-start"];
</script>

<style scoped>
.knowledge-select {
  width: 100%;
  min-width: 0;
}
.knowledge-select :deep(.el-select__wrapper) {
  min-height: 44px;
  border-radius: 11px;
  background: light-dark(rgba(51, 85, 126, 0.045), rgba(255, 255, 255, 0.025));
}
.knowledge-select :deep(.el-select__wrapper:not(.is-disabled)),
.knowledge-select :deep(.el-select__input[aria-expanded="false"]:not(:disabled)) {
  cursor: pointer;
}
.knowledge-select :deep(.el-select__prefix) {
  color: light-dark(#51408a, #b49aff);
  font-size: 18px;
}
</style>
