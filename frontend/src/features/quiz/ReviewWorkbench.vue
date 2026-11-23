<template>
  <section class="review-workspace" :class="{ 'is-fullscreen': fullscreen }" aria-label="错题整理">
    <header class="review-heading">
      <h2>错题整理</h2>
      <div class="review-heading-actions">
        <button type="button" :disabled="!knowledgeBaseId" @click="openCategories">
          <el-icon aria-hidden="true"><Folder /></el-icon>
          <span>管理分类</span>
        </button>
        <button
          type="button"
          class="review-icon-button"
          :aria-label="fullscreen ? '退出全屏' : '全屏错题整理'"
          :title="fullscreen ? '退出全屏' : '全屏错题整理'"
          @click="emit('fullscreen-change', !fullscreen)"
        >
          <el-icon aria-hidden="true"><FullScreen /></el-icon>
        </button>
      </div>
    </header>
    <div v-if="knowledgeBaseId" class="review-toolbar">
      <div class="review-status-filter" role="group" aria-label="掌握状态">
        <button
          v-for="entry in statusOptions"
          :key="entry.key"
          type="button"
          :aria-pressed="status === entry.key"
          @click="status = entry.key"
        >
          <span>{{ entry.label }}</span
          ><strong>{{ data?.counts[entry.key] ?? 0 }}</strong>
        </button>
      </div>
      <div class="review-filters">
        <div class="review-field">
          <span>知识点</span>
          <KnowledgeSelect
            v-model="topic"
            :options="topicFilterOptions"
            aria-label="知识点"
            filterable
            placeholder="全部知识点"
          />
        </div>
        <div class="review-field">
          <span>文档</span>
          <KnowledgeSelect
            v-model="document"
            :options="documentFilterOptions"
            aria-label="文档"
            filterable
            placeholder="全部文档"
          />
        </div>
      </div>
    </div>

    <div class="review-content">
      <article v-if="variantTask" class="review-task">
        <div class="review-task-heading"><strong>变式练习</strong></div>
        <p role="status">{{ taskMessage(variantTask, "正在生成变式") }}</p>
        <progress
          v-if="activeTask(variantTask) && variantTask.total"
          :value="variantTask.completed"
          :max="variantTask.total"
          aria-label="变式生成进度"
        />
        <div class="review-task-actions">
          <button
            v-if="activeTask(variantTask)"
            type="button"
            :disabled="busy"
            @click="taskAction(variantTask, 'cancel')"
          >
            取消生成
          </button>
          <button
            v-else-if="
              variantTask.retryable && ['failed', 'partial_failed'].includes(variantTask.status)
            "
            type="button"
            :disabled="busy"
            @click="taskAction(variantTask, 'retry')"
          >
            重试生成
          </button>
          <button
            v-else-if="variantTask.quizResult?.practiceId"
            type="button"
            @click="emit('open-practice', variantTask.quizResult.practiceId)"
          >
            打开变式
          </button>
        </div>
      </article>

      <p v-if="actionError" class="review-error" role="alert">{{ actionError }}</p>
      <div v-if="loadError && data" class="review-inline-error" role="alert">
        <span>{{ loadError }}</span> <button type="button" @click="refresh()">重新加载</button>
      </div>
      <p v-if="loading && !data" class="review-empty" role="status">正在读取错题…</p>
      <div v-else-if="loadError && !data" class="review-empty" role="alert">
        <p>{{ loadError }}</p>
        <button type="button" @click="refresh()">重新加载</button>
      </div>
      <div v-else-if="!groups.length" class="review-empty">
        <el-icon aria-hidden="true"><Collection /></el-icon>
        <strong>{{ emptyTitle }}</strong>
        <p v-if="knowledgeBaseId && !data?.counts.pending && !data?.counts.mastered">
          提交测验后，答错的题会自动出现在这里。
        </p>
      </div>

      <section v-for="group in groups" :key="group.key" class="review-group">
        <h3>
          <el-icon aria-hidden="true"><Collection /></el-icon>{{ group.title }}
        </h3>
        <article v-for="item in group.items" :key="item.id" class="review-item">
          <button
            type="button"
            class="review-item-toggle"
            :aria-expanded="expanded.has(item.id)"
            :aria-controls="'review-item-' + item.id"
            @click="toggleItem(item.id)"
          >
            <span class="review-item-main">
              <span class="review-stem">{{ item.stem }}</span>
              <span class="review-meta">
                <span class="review-filename" :title="item.filename">{{ item.filename }}</span>
                <time :datetime="item.lastWrongAt">{{ formatDate(item.lastWrongAt) }}</time>
              </span>
            </span>
            <span class="review-item-side">
              <span class="review-chip" :class="{ mastered: item.status === 'mastered' }">
                <el-icon aria-hidden="true"
                  ><CircleCheck v-if="item.status === 'mastered'" /><Warning v-else
                /></el-icon>
                {{ item.status === "mastered" ? "已掌握" : "错 " + item.wrongCount + " 次" }}
              </span>
              <el-icon aria-hidden="true"
                ><ArrowUp v-if="expanded.has(item.id)" /><ArrowDown v-else
              /></el-icon>
            </span>
          </button>
          <div v-if="expanded.has(item.id)" :id="'review-item-' + item.id" class="review-detail">
            <div class="review-field review-item-category">
              <span>归入知识点</span>
              <KnowledgeSelect
                :model-value="item.topicKey ?? 'unclassified'"
                :options="categoryOptions"
                aria-label="归入知识点"
                filterable
                :disabled="savingCategory !== undefined"
                :loading="savingCategory === item.id"
                @update:model-value="moveItem(item, $event)"
              />
            </div>
            <ul class="review-options" aria-label="原题选项">
              <li v-for="option in item.question.options" :key="option.id">
                <b>{{ option.id }}.</b> {{ option.text }}
              </li>
            </ul>
            <p><strong>最近错答</strong> {{ item.lastWrongSelection.join("、") }}</p>
            <p class="review-correct">
              <strong>正确答案</strong> {{ item.question.correctOptionIds?.join("、") }}
            </p>
            <p v-if="item.question.explanation" class="review-explanation">
              {{ item.question.explanation }}
            </p>
            <div v-if="item.question.evidence.length" class="review-evidence">
              <button
                v-for="(source, index) in item.question.evidence"
                :key="source.chunkId + ':' + index"
                type="button"
                @click="openEvidence(item, index)"
              >
                <el-icon aria-hidden="true"><Document /></el-icon>
                {{
                  source.location?.page
                    ? "第 " + source.location.page + " 页"
                    : source.location?.heading || "查看原文"
                }}
              </button>
            </div>
          </div>
        </article>
      </section>

      <nav v-if="pageCount > 1" class="review-pagination" aria-label="错题分页">
        <button type="button" :disabled="loading || page <= 1" @click="page--">上一页</button>
        <span aria-live="polite">{{ page }} / {{ pageCount }}</span>
        <button type="button" :disabled="loading || page >= pageCount" @click="page++">
          下一页
        </button>
      </nav>
      <details
        v-if="data?.practices.length"
        class="review-practice-history"
        :open="!!data.practices.some((entry) => entry.status === 'in_progress') || undefined"
      >
        <summary>复练记录</summary>
        <div v-for="record in data.practices" :key="record.id" class="review-practice-row">
          <button
            type="button"
            class="review-practice-open"
            :disabled="record.status === 'invalidated' || deletingPractice === record.id"
            @click="emit('open-practice', record.id)"
          >
            <span
              >{{ record.topicLabel || "错题" }} ·
              {{ record.mode === "original" ? "原题" : "变式" }}</span
            >
            <small>{{
              record.status === "invalidated"
                ? "来源失效"
                : record.status === "completed"
                  ? record.score + " 分"
                  : record.answeredCount + " / " + record.totalCount
            }}</small>
          </button>
          <button
            type="button"
            class="review-practice-delete"
            :aria-label="'删除复练记录：' + (record.topicLabel || '错题')"
            title="删除复练记录"
            :disabled="deletingPractice !== undefined"
            @click="removePractice(record.id)"
          >
            <el-icon aria-hidden="true"><Delete /></el-icon>
          </button>
        </div>
      </details>
    </div>

    <footer
      v-if="data && (topic || document || data.counts.pending || data.counts.mastered)"
      class="review-footer"
    >
      <div v-if="topic || document" class="review-footer-actions">
        <button
          v-if="document"
          type="button"
          class="review-primary"
          :disabled="busy || loading || data.practiceCounts?.document === 0"
          @click="startOriginal('document')"
        >
          <el-icon aria-hidden="true"><VideoPlay /></el-icon>复练文档错题
          <span v-if="data.practiceCounts" class="review-scope-count" aria-hidden="true">{{
            data.practiceCounts.document
          }}</span>
        </button>
        <button
          v-if="topic"
          type="button"
          :class="{ 'review-primary': !document }"
          :disabled="busy || loading || data.practiceCounts?.topic === 0"
          @click="startOriginal('topic')"
        >
          <el-icon aria-hidden="true"><VideoPlay /></el-icon>复练知识点错题
          <span v-if="data.practiceCounts" class="review-scope-count" aria-hidden="true">{{
            data.practiceCounts.topic
          }}</span>
        </button>
        <button
          v-if="currentTopic"
          type="button"
          class="review-variant"
          :disabled="busy || loading || !readyDocuments.length"
          @click="openVariantDialog"
        >
          <el-icon aria-hidden="true"><MagicStick /></el-icon>生成变式
        </button>
      </div>
      <small v-if="!topic && !document">选择文档或知识点，即可复练范围内的所有错题。</small>
      <small v-else-if="topic && document">分别按文档或知识点复练，包含已掌握的错题。</small>
    </footer>

    <el-dialog
      v-model="categoriesDialog"
      title="管理错题分类"
      width="min(460px, calc(100vw - 24px))"
      append-to-body
      align-center
      :close-on-click-modal="false"
    >
      <div class="review-config">
        <form class="review-create-category" @submit.prevent="addCategory">
          <label class="review-field">
            <span>分类名称</span>
            <input
              v-model="categoryLabel"
              type="text"
              maxlength="40"
              placeholder="例如：植物生理"
              required
            />
          </label>
          <button
            class="review-primary"
            type="submit"
            :disabled="categoryBusy || !categoryLabel.trim()"
          >
            <el-icon aria-hidden="true"><Plus /></el-icon>创建分类
          </button>
        </form>
        <p v-if="categoryError" class="review-error" role="alert">{{ categoryError }}</p>
        <p v-if="!data?.topics.length" class="review-category-empty">尚未创建分类</p>
        <ul v-else class="review-category-list" aria-label="已有分类">
          <li v-for="category in data.topics" :key="category.key">
            <div class="review-category-row">
              <span>{{ category.label }}</span>
              <button
                type="button"
                class="review-icon-button"
                :aria-label="'删除分类：' + category.label"
                :disabled="categoryBusy"
                @click="categoryToDelete = category.key"
              >
                <el-icon aria-hidden="true"><Delete /></el-icon>
              </button>
            </div>
            <div v-if="categoryToDelete === category.key" class="review-category-confirm">
              <p>删除此分类后，其中的错题会移到「待归类」。</p>
              <div class="review-dialog-actions">
                <button
                  type="button"
                  :disabled="categoryBusy"
                  @click="categoryToDelete = undefined"
                >
                  取消
                </button>
                <button
                  type="button"
                  class="review-delete-category"
                  :disabled="categoryBusy"
                  @click="removeCategory(category.key)"
                >
                  删除分类
                </button>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </el-dialog>

    <el-dialog
      v-model="variantDialog"
      title="生成变式"
      width="min(420px, calc(100vw - 24px))"
      class="review-config-dialog"
      align-center
      append-to-body
    >
      <form class="review-config" @submit.prevent="startVariant">
        <p>
          知识点 <strong>{{ currentTopic?.label }}</strong>
        </p>
        <div class="review-field">
          <span>来源文档</span>
          <KnowledgeSelect
            v-model="variantDocument"
            :options="variantSourceOptions"
            aria-label="来源文档"
            filterable
            placeholder="选择来源文档"
          />
        </div>
        <label
          >题目数量
          <input
            class="review-quantity-input"
            v-model.number="variantCount"
            type="number"
            min="1"
            max="20"
            required
        /></label>
        <fieldset>
          <legend>题型</legend>
          <label><input v-model="variantTypes" type="checkbox" value="SINGLE" /> 单选题</label>
          <label><input v-model="variantTypes" type="checkbox" value="MULTIPLE" /> 多选题</label>
        </fieldset>
        <label v-if="variantTypes.length === 2 && variantCount >= 2" class="review-ratio">
          单选 {{ counts?.singleCount }} 道 · 多选 {{ counts?.multipleCount }} 道
          <input
            v-model.number="variantRatio"
            type="range"
            min="0"
            max="1"
            :step="1 / variantCount"
            aria-label="单选题比例"
          />
        </label>
        <p v-if="validation || actionError" class="review-error" role="alert">
          {{ validation || actionError }}
        </p>
        <div class="review-dialog-actions">
          <button type="button" :disabled="busy" @click="variantDialog = false">取消</button>
          <button
            type="submit"
            class="review-primary"
            :disabled="busy || !counts || !variantDocument"
          >
            {{ busy ? "正在提交…" : "开始生成" }}
          </button>
        </div>
      </form>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import KnowledgeSelect from "../../components/KnowledgeSelect.vue";
import { useConfirm } from "../../composables/useConfirm";
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  Collection,
  Delete,
  Document,
  Folder,
  FullScreen,
  MagicStick,
  Plus,
  VideoPlay,
  Warning,
} from "@element-plus/icons-vue";
import {
  assignReviewCategory,
  createReviewCategory,
  deleteReviewPractice,
  deleteReviewCategory,
  getReviewWorkspace,
  startReview,
  type ReviewItem,
  type ReviewStatus,
  type ReviewTask,
  type ReviewWorkspace,
  type StartReview,
} from "../../api/quiz-reviews";
import { cancelTask, getTask, retryTask } from "../../api/knowledge-bases";
import type { Citation } from "../../api/knowledge-bases";
import type { DocumentTarget } from "../reader/types";
import { resolveQuizCounts } from "./quiz-state";

const props = defineProps<{
  knowledgeBaseId?: number | null;
  active?: boolean;
  fullscreen?: boolean;
}>();
const emit = defineEmits<{
  (e: "open-practice", id: number): void;
  (e: "open-source", target: DocumentTarget): void;
  (e: "fullscreen-change", value: boolean): void;
}>();
const statusOptions = [
  { key: "pending", label: "待复练" },
  { key: "mastered", label: "已掌握" },
] as const;
const status = ref<ReviewStatus>("pending");
const topic = ref("");
const document = ref("");
const page = ref(1);
const data = ref<ReviewWorkspace>();
const categoryOptions = computed(() => [
  { value: "unclassified", label: "待归类" },
  ...(data.value?.topics ?? []).map(({ key, label }) => ({ value: key, label })),
]);
const topicFilterOptions = computed(() => [
  { value: "", label: "全部知识点" },
  ...categoryOptions.value,
]);
const documentFilterOptions = computed(() => [
  { value: "", label: "全部文档" },
  ...(data.value?.documents ?? []).map(({ id, filename }) => ({
    value: String(id),
    label: filename,
  })),
]);
const expanded = ref(new Set<number>());
const loading = ref(false);
const busy = ref(false);
const loadError = ref("");
const actionError = ref("");
const confirm = useConfirm();
const deletingPractice = ref<number>();
const variantTask = ref<ReviewTask>();
const variantDialog = ref(false);
const variantDocument = ref<number>();
const variantCount = ref(3);
const variantTypes = ref<string[]>(["SINGLE"]);
const variantRatio = ref(0.5);
const variantTaskId = ref<number>();
const categoriesDialog = ref(false);
const categoryLabel = ref("");
const categoryToDelete = ref<string>();
const categoryBusy = ref(false);
const categoryError = ref("");
const savingCategory = ref<number>();
let generation = 0;
let controller: AbortController | undefined;
let poll: ReturnType<typeof setTimeout> | undefined;
let submitKey = "";
let submitId = "";
let alive = true;

const pageCount = computed(() =>
  data.value ? Math.max(1, Math.ceil(data.value.total / data.value.pageSize)) : 1,
);
const currentTopic = computed(() => data.value?.topics.find((entry) => entry.key === topic.value));
const scopedDocuments = computed(
  () =>
    data.value?.documents.filter(
      (entry) => !document.value || entry.id === Number(document.value),
    ) || [],
);
const readyDocuments = computed(() =>
  scopedDocuments.value.filter((entry) => entry.ready && entry.topicKeys.includes(topic.value)),
);
const variantSourceOptions = computed(() =>
  readyDocuments.value.map(({ id, filename }) => ({ value: id, label: filename })),
);
const groups = computed(() => {
  const result = new Map<string, { key: string; title: string; items: ReviewItem[] }>();
  for (const item of data.value?.items ?? []) {
    const key = item.topicKey || "unclassified";
    const group = result.get(key) ?? { key, title: item.topicLabel || "待归类", items: [] };
    group.items.push(item);
    result.set(key, group);
  }
  return [...result.values()];
});
const emptyTitle = computed(() => {
  if (!props.knowledgeBaseId) return "请选择知识库";
  if (topic.value || document.value) return "没有符合条件的错题";
  if (status.value === "pending" && data.value?.counts.mastered) return "错题已全部掌握";
  return status.value === "mastered" && data.value?.counts.pending
    ? "还没有已掌握的错题"
    : "还没有错题";
});
const config = computed(() => {
  try {
    return {
      counts: resolveQuizCounts(variantCount.value, variantTypes.value, variantRatio.value),
      error: "",
    };
  } catch (error) {
    return { counts: undefined, error: message(error, "请检查生成配置") };
  }
});
const counts = computed(() => config.value.counts);
const validation = computed(() => config.value.error);
const activeTask = (task: ReviewTask) =>
  !["completed", "failed", "partial_failed", "canceled"].includes(task.status);
const failedTask = (task: ReviewTask) => ["failed", "partial_failed"].includes(task.status);

function message(error: unknown, fallback: string) {
  const remote = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return remote || (error as Error)?.message || fallback;
}
function formatDate(value: string) {
  return new Date(value.replace(" ", "T")).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}
function requestId(key: string) {
  if (!submitId || submitKey !== key) {
    submitKey = key;
    submitId = crypto.randomUUID();
  }
  return submitId;
}
function taskMessage(task: ReviewTask, working: string) {
  if (task.status === "completed") return "已完成";
  if (task.status === "canceled") return "已取消";
  if (!activeTask(task)) return task.error || "任务未完成，请重试";
  if (task.status === "queued" || task.status === "waiting") return "正在排队…";
  return task.total ? `${working} ${task.completed} / ${task.total}` : working + "…";
}
function cancelPoll() {
  clearTimeout(poll);
  poll = undefined;
}
function schedule() {
  cancelPoll();
  if (!alive || props.active === false || !props.knowledgeBaseId) return;
  if (variantTask.value ? activeTask(variantTask.value) : variantTaskId.value)
    poll = setTimeout(() => void refresh(true), 1600);
}
async function refresh(quiet = false) {
  cancelPoll();
  const kb = props.knowledgeBaseId;
  controller?.abort();
  if (!kb || props.active === false) return;
  const current = ++generation;
  controller = new AbortController();
  if (!quiet) loading.value = true;
  loadError.value = "";
  try {
    if (variantTaskId.value) {
      try {
        const task = await getTask(variantTaskId.value, true);
        if (current !== generation || !alive) return;
        variantTask.value = task;
      } catch (error) {
        if (current !== generation || !alive) return;
        if ((error as { response?: { status?: number } })?.response?.status === 404)
          variantTaskId.value = undefined;
      }
    }
    const result = await getReviewWorkspace(
      {
        knowledgeBaseId: kb,
        status: status.value,
        topic: topic.value || undefined,
        documentId: document.value ? Number(document.value) : undefined,
        page: page.value,
      },
      controller.signal,
    );
    if (current !== generation || !alive) return;
    if (page.value > Math.max(1, Math.ceil(result.total / result.pageSize))) {
      page.value = 1;
      return;
    }
    data.value = result;
    if (!variantTaskId.value) {
      const tasks = result.generationTasks ?? [];
      variantTask.value = tasks.find(activeTask) || tasks.find(failedTask);
    }
  } catch (error) {
    if (current === generation && !controller.signal.aborted)
      loadError.value = message(error, "错题读取失败");
  } finally {
    if (current === generation && alive) {
      loading.value = false;
      schedule();
    }
  }
}
function toggleItem(id: number) {
  if (expanded.value.has(id)) expanded.value.delete(id);
  else expanded.value.add(id);
}
function openEvidence(item: ReviewItem, index: number) {
  const evidence = item.question.evidence[index];
  const { documentId, versionId, indexRevisionId, filename, sourceOutdated } = item.source;
  if (!props.knowledgeBaseId || !evidence) return;
  const citation: Citation = {
    number: index + 1,
    filename,
    documentId,
    versionId,
    indexRevisionId,
    knowledgeBaseId: props.knowledgeBaseId,
    sourceOutdated,
    score: 0,
    chunkId: evidence.chunkId,
    text: evidence.quote,
    location: evidence.location as Citation["location"],
  };
  emit("open-source", { documentId, versionId, citation });
}
function openVariantDialog() {
  actionError.value = "";
  variantDocument.value = readyDocuments.value[0]?.id;
  const recent = data.value?.items.find((item) => item.documentId === variantDocument.value);
  variantCount.value = 3;
  variantTypes.value = [recent?.type || "SINGLE"];
  variantRatio.value = 0.5;
  variantDialog.value = true;
}
async function submit(
  body:
    | Omit<Extract<StartReview, { mode: "variant" }>, "knowledgeBaseId" | "requestId">
    | Omit<Extract<StartReview, { mode: "original" }>, "knowledgeBaseId" | "requestId">,
) {
  const kb = props.knowledgeBaseId;
  if (!kb || busy.value) return;
  busy.value = true;
  actionError.value = "";
  try {
    const target = await startReview({
      ...body,
      knowledgeBaseId: kb,
      requestId: requestId(JSON.stringify([kb, body])),
    });
    if (!alive || kb !== props.knowledgeBaseId) return;
    if (!target.practiceId && !target.taskId) throw new Error("未能开始复练，请重试");
    submitId = "";
    variantDialog.value = false;
    if (target.practiceId) emit("open-practice", target.practiceId);
    else {
      variantTaskId.value = target.taskId;
      variantTask.value = undefined;
      await refresh();
    }
  } catch (error) {
    if (alive && kb === props.knowledgeBaseId)
      actionError.value = message(error, "开启复练失败，请重试");
  } finally {
    if (alive) busy.value = false;
  }
}
function startOriginal(scope: "document" | "topic") {
  if (scope === "document" && document.value)
    void submit({ mode: "original", documentId: Number(document.value) });
  if (scope === "topic" && topic.value) void submit({ mode: "original", topic: topic.value });
}
function startVariant() {
  if (!currentTopic.value || !variantDocument.value || !counts.value) return;
  void submit({
    mode: "variant",
    topic: topic.value,
    documentId: variantDocument.value,
    ...counts.value,
  });
}
function openCategories() {
  categoryError.value = "";
  categoryLabel.value = "";
  categoryToDelete.value = undefined;
  categoriesDialog.value = true;
}
async function addCategory() {
  const kb = props.knowledgeBaseId;
  const label = categoryLabel.value.trim();
  if (!kb || !label || categoryBusy.value) return;
  categoryBusy.value = true;
  categoryError.value = "";
  try {
    const created = await createReviewCategory(kb, label);
    if (!alive || kb !== props.knowledgeBaseId) return;
    categoryLabel.value = "";
    if (data.value && !data.value.topics.some((entry) => entry.key === created.key))
      data.value.topics = [...data.value.topics, created];
    await refresh();
  } catch (error) {
    if (alive && kb === props.knowledgeBaseId)
      categoryError.value = message(error, "创建分类失败，请重试");
  } finally {
    if (alive && kb === props.knowledgeBaseId) categoryBusy.value = false;
  }
}
async function removePractice(id: number) {
  const kb = props.knowledgeBaseId;
  if (!kb || deletingPractice.value !== undefined) return;
  deletingPractice.value = id;
  try {
    const accepted = await confirm.danger(
      "确定删除这条复练记录？此操作会清除该次作答进度。",
      "删除复练记录",
    );
    if (!accepted || !alive || kb !== props.knowledgeBaseId) return;
    actionError.value = "";
    await deleteReviewPractice(id);
    if (!alive || kb !== props.knowledgeBaseId) return;
    if (data.value) data.value.practices = data.value.practices.filter((item) => item.id !== id);
    if (variantTask.value?.quizResult?.practiceId === id) {
      variantTask.value = undefined;
      variantTaskId.value = undefined;
    }
    await refresh();
  } catch (error) {
    if (alive && kb === props.knowledgeBaseId)
      actionError.value = message(error, "删除复练记录失败，请重试");
  } finally {
    deletingPractice.value = undefined;
  }
}
async function removeCategory(key: string) {
  const kb = props.knowledgeBaseId;
  if (!kb || categoryBusy.value) return;
  categoryBusy.value = true;
  categoryError.value = "";
  try {
    await deleteReviewCategory(kb, key);
    if (!alive || kb !== props.knowledgeBaseId) return;
    categoryToDelete.value = undefined;
    if (data.value) data.value.topics = data.value.topics.filter((entry) => entry.key !== key);
    if (topic.value === key) topic.value = "";
    else await refresh();
  } catch (error) {
    if (alive && kb === props.knowledgeBaseId)
      categoryError.value = message(error, "删除分类失败，请重试");
  } finally {
    if (alive && kb === props.knowledgeBaseId) categoryBusy.value = false;
  }
}
async function moveItem(item: ReviewItem, choice: string) {
  const kb = props.knowledgeBaseId;
  const key = choice === "unclassified" ? null : choice;
  if (!kb || key === item.topicKey || savingCategory.value !== undefined) return;
  savingCategory.value = item.id;
  actionError.value = "";
  try {
    const assigned = await assignReviewCategory(kb, item.id, key);
    if (!alive || kb !== props.knowledgeBaseId) return;
    item.topicKey = assigned.topicKey;
    item.topicLabel = assigned.topicLabel;
    await refresh();
  } catch (error) {
    if (alive && kb === props.knowledgeBaseId)
      actionError.value = message(error, "修改分类失败，请重试");
  } finally {
    if (alive && kb === props.knowledgeBaseId) savingCategory.value = undefined;
  }
}
async function taskAction(task: ReviewTask, action: "cancel" | "retry") {
  if (busy.value) return;
  const kb = props.knowledgeBaseId;
  busy.value = true;
  actionError.value = "";
  try {
    if (action === "retry") await retryTask(task.id);
    else await cancelTask(task.id, true);
    if (!alive || kb !== props.knowledgeBaseId) return;
    variantTaskId.value = task.id;
    await refresh();
  } catch (error) {
    if (alive && kb === props.knowledgeBaseId)
      actionError.value = message(error, "任务操作失败，请重试");
  } finally {
    if (alive) busy.value = false;
  }
}
watch(
  () => props.knowledgeBaseId,
  () => {
    generation++;
    controller?.abort();
    data.value = variantTask.value = undefined;
    variantTaskId.value = undefined;
    variantDialog.value = categoriesDialog.value = false;
    categoryBusy.value = false;
    savingCategory.value = undefined;
    loadError.value = actionError.value = submitId = "";
    status.value = "pending";
    topic.value = document.value = "";
    expanded.value.clear();
    page.value = 1;
    void refresh();
  },
  { immediate: true },
);
watch([status, topic, document], () => {
  page.value = 1;
  void refresh();
});
watch(page, () => void refresh());
watch(
  () => props.active,
  (active) => {
    if (active !== false) void refresh();
    else cancelPoll();
  },
);
onBeforeUnmount(() => {
  alive = false;
  cancelPoll();
  controller?.abort();
});
defineExpose({ refresh: () => refresh() });
</script>

<style lang="scss" src="./review-workbench.scss"></style>
