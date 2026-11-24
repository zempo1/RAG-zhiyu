<template>
  <section ref="showcase" class="showcase" aria-labelledby="features-title">
    <header id="features" class="showcase-header" tabindex="-1">
      <h2 id="features-title">从资料到自己的知识</h2>
      <p>把资料放进知识库，带着问题读原文，再用导图、卡片和测验巩固所学。</p>
      <nav class="chapter-links" aria-label="功能分类">
        <a v-for="group in groups" :key="group.id" :href="'#' + group.id">
          <el-icon aria-hidden="true"><component :is="group.icon" /></el-icon>
          {{ group.title }}
        </a>
      </nav>
    </header>

    <section
      v-for="group in groups"
      :id="group.id"
      :key="group.id"
      class="chapter"
      :aria-labelledby="group.id + '-title'"
      data-reveal
      tabindex="-1"
    >
      <div class="chapter-copy">
        <h2 :id="group.id + '-title'" class="chapter-title">
          <span class="chapter-icon"><el-icon aria-hidden="true"><component :is="group.icon" /></el-icon></span>
          {{ group.title }}
        </h2>
        <ul class="feature-list">
          <li v-for="feature in group.features" :key="feature.title">
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.description }}</p>
          </li>
        </ul>
      </div>

      <div class="chapter-art">
        <figure v-if="group.id === 'library'" class="example">
          <figcaption>
            <el-icon aria-hidden="true"><Collection /></el-icon>计算机基础
            <span class="example-tag">知识库示例</span>
          </figcaption>
          <ul class="example-files">
            <li>
              <el-icon aria-hidden="true"><Document /></el-icon>
              <div><strong>网络原理.pdf</strong><small>计算机网络</small></div>
              <span class="file-state">可问答</span>
            </li>
            <li>
              <el-icon aria-hidden="true"><Document /></el-icon>
              <div><strong>复习笔记.md</strong><small>课程笔记</small></div>
              <span class="file-state">可问答</span>
            </li>
            <li>
              <el-icon aria-hidden="true"><Document /></el-icon>
              <div>
                <strong>协议实验.pdf</strong>
                <progress value="68" max="100" aria-label="协议实验.pdf 索引进度">68%</progress>
              </div>
              <span class="file-state processing">索引中</span>
            </li>
          </ul>
        </figure>

        <figure v-else-if="group.id === 'answers'" class="example">
          <figcaption>
            <el-icon aria-hidden="true"><Reading /></el-icon>网络原理.pdf
            <span class="example-tag">第 12 页</span>
          </figcaption>
          <div class="example-page">
            <p class="document-heading">建立 TCP 连接</p>
            <blockquote>
              客户端发送 SYN，服务器返回 SYN-ACK，客户端再发送 ACK。
              <mark>双方在这一过程中确认收发能力，并同步初始序列号。</mark>
            </blockquote>
            <div class="example-citation">
              <el-icon aria-hidden="true"><Link /></el-icon>引用 [1] · 原文定位
            </div>
          </div>
        </figure>

        <figure v-else class="example">
          <figcaption>
            <el-icon aria-hidden="true"><Connection /></el-icon>TCP 连接与可靠传输
            <span class="example-tag">导图示例</span>
          </figcaption>
          <div class="example-map">
            <strong>TCP 协议</strong>
            <ul>
              <li>建立连接 · 三次握手</li>
              <li>可靠传输 · 确认与重传</li>
              <li>关闭连接 · 四次挥手</li>
            </ul>
          </div>
        </figure>
      </div>
    </section>

    <footer class="showcase-footer" data-reveal>
      <h2>从你的第一份资料开始</h2>
      <el-button type="primary" size="large" round @click="emit('start')">
        进入知屿 <el-icon class="el-icon--right" aria-hidden="true"><ArrowRight /></el-icon>
      </el-button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  ArrowRight,
  Collection,
  Connection,
  Document,
  Link,
  Reading,
} from "@element-plus/icons-vue";

const emit = defineEmits<{ start: [] }>();
const groups = [
  {
    id: "library",
    title: "整理资料",
    icon: Collection,
    features: [
      {
        title: "私有知识库",
        description: "按主题建立多个知识库，分类、筛选和管理文档。知识库按账号隔离。",
      },
      {
        title: "文档上传与索引",
        description: "支持 PDF、Markdown 和断点续传。可查看后台处理进度、重试任务及重建索引。",
      },
      {
        title: "PDF 智能解析",
        description: "提取原生文字，识别图表和扫描页，让这些内容也能参与检索。",
      },
    ],
  },
  {
    id: "answers",
    title: "问答与溯源",
    icon: Reading,
    features: [
      {
        title: "智能检索问答",
        description: "支持通用对话和指定文档问答。可查看检索与证据核查进度，长任务支持转入后台。",
      },
      {
        title: "原文阅读与引用",
        description: "从回答的引用跳到 PDF 原页，定位并高亮对应段落。历史会话可回看引用快照。",
      },
      {
        title: "文档摘要与概览",
        description: "可让 AI 通读整份文档，按章节梳理要点，并附上原文出处。",
      },
      {
        title: "模型设置",
        description: "按账号配置不同任务使用的模型、接口地址和 API Key。",
      },
    ],
  },
  {
    id: "learning",
    title: "学习与复习",
    icon: Connection,
    features: [
      {
        title: "思维导图",
        description: "从文档生成导图，编辑节点、全屏查看，或导出为 PNG。",
      },
      {
        title: "学习卡片",
        description: "把知识点整理成可翻面的问答卡片，便于反复回顾。",
      },
      {
        title: "智能测验",
        description: "按题型和数量生成练习，逐题判分、恢复作答，并在对话中追问题目解析。",
      },
      {
        title: "错题整理",
        description: "按知识点汇总错题，支持原题复练和生成变式。",
      },
    ],
  },
];

const showcase = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | undefined;

onMounted(() => {
  if (!showcase.value || !("IntersectionObserver" in window)) return;

  observer = new IntersectionObserver(
    (entries, currentObserver) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.remove("reveal-pending");
        currentObserver.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -32px" },
  );

  for (const section of showcase.value.querySelectorAll("[data-reveal]")) {
    section.classList.add("reveal-pending");
    observer.observe(section);
  }
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<style lang="scss" src="./LandingShowcase.scss" scoped></style>
