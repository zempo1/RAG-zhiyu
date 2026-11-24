<template>
  <div class="landing-container">
    <!-- Background Accents -->
    <div class="bg-blob blob-1" aria-hidden="true"></div>
    <div class="bg-blob blob-3" aria-hidden="true"></div>

    <nav class="navbar" aria-label="登录页导航">
      <div class="brand">
        <div class="ai-logo" aria-hidden="true">屿</div>
        <span>知屿 · Islet</span>
      </div>
      <div class="nav-links">
        <a class="nav-anchor" href="#features">功能</a>
        <a class="nav-anchor" href="#preview">演示</a>
        <button
          type="button"
          class="theme-toggle"
          :aria-label="theme === 'light' ? '切换到深色模式' : '切换到浅色模式'"
          :title="theme === 'light' ? '切换到深色模式' : '切换到浅色模式'"
          @click="setTheme(theme === 'light' ? 'dark' : 'light')"
        >
          <el-icon><Moon v-if="theme === 'light'" /><Sunny v-else /></el-icon>
        </button>
        <el-button type="primary" round class="nav-cta" @click="showAuth = true"
          >立即开始</el-button
        >
      </div>
    </nav>

    <main>
      <div class="hero-section">
        <div class="hero-content">
          <p class="brand-tagline" lang="en">A PLACE FOR THOUGHTS</p>
          <h1 class="hero-title">知屿 · <span class="gradient-text">Islet</span></h1>
          <p class="hero-subtitle">让每一份知识，都有自己的归处。</p>
          <p class="brand-values">简约 · 沉淀 · 探索 · 成长</p>
          <div class="hero-btns">
            <el-button type="primary" size="large" round class="main-btn" @click="showAuth = true">
              开始体验 <el-icon class="el-icon--right" aria-hidden="true"><ArrowRight /></el-icon>
            </el-button>
            <a class="secondary-btn" href="#preview">查看演示</a>
          </div>
        </div>

        <section
          id="preview"
          ref="preview"
          class="preview-window"
          aria-label="知屿工作区预览"
          tabindex="-1"
        >
          <div class="window-header">
            <div class="dots" aria-hidden="true"><span></span><span></span><span></span></div>
            <div class="window-title">知屿工作区预览</div>
          </div>
          <div class="window-body">
            <div class="workspace-side">
              <div class="workspace-label">知识库</div>
              <div class="workspace-item selected">
                <el-icon aria-hidden="true"><Collection /></el-icon>计算机基础
              </div>
              <div class="workspace-item">
                <el-icon aria-hidden="true"><Document /></el-icon>网络原理.pdf
              </div>
              <div class="workspace-item">
                <el-icon aria-hidden="true"><Document /></el-icon>复习笔记.md
              </div>
            </div>
            <div class="workspace-chat">
              <div class="workspace-label">知识库问答</div>
              <p class="question-bubble">TCP 为什么需要三次握手？</p>
              <div class="answer-bubble">
                <span class="preview-avatar" aria-hidden="true">屿</span>
                <p class="preview-answer">
                  <span class="answer-layout">{{ demoAnswer }}</span>
                  <span class="typed-answer" :class="{ 'is-typing': isTyping }" aria-hidden="true">{{
                    displayedAnswer
                  }}</span>
                </p>
              </div>
            </div>
            <div class="workspace-side workspace-tools">
              <div class="workspace-label">学习工作台</div>
              <div v-for="item in previewTools" :key="item.label" class="workspace-item">
                <el-icon aria-hidden="true"><component :is="item.icon" /></el-icon>{{ item.label }}
              </div>
            </div>
          </div>
        </section>

        <a class="browse-link" href="#features">
          浏览全部功能 <el-icon aria-hidden="true"><ArrowDown /></el-icon>
        </a>
      </div>

      <LandingShowcase @start="showAuth = true" />
    </main>

    <!-- Auth Overlay -->
    <Transition name="fade">
      <div v-if="showAuth" class="auth-overlay" @click.self="showAuth = false">
        <div class="auth-card">
          <div class="auth-header">
            <h2>{{ isLogin ? "登录" : "注册" }}</h2>
            <p>
              {{ isLogin ? "继续您的 AI 探索之路" : "创建账号，开启您的智能空间" }}
            </p>
          </div>

          <el-form :model="form" class="auth-form" @submit.prevent="handleAuth">
            <el-form-item>
              <el-input
                v-model="form.username"
                placeholder="用户名"
                prefix-icon="User"
                size="large"
              />
            </el-form-item>
            <el-form-item>
              <el-input
                v-model="form.password"
                type="password"
                placeholder="密码"
                prefix-icon="Lock"
                show-password
                size="large"
              />
            </el-form-item>
            <el-button
              type="primary"
              class="auth-btn"
              size="large"
              :loading="loading"
              @click="handleAuth"
            >
              {{ isLogin ? "登录" : "注册" }}
            </el-button>
          </el-form>

          <div class="auth-footer">
            <span>{{ isLogin ? "还没有账号？" : "已有账号？" }}</span>
            <el-button link type="primary" @click="isLogin = !isLogin">
              {{ isLogin ? "立即注册" : "返回登录" }}
            </el-button>
          </div>

          <el-button class="close-btn" circle @click="showAuth = false">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from "vue";
import {
  ArrowDown,
  ArrowRight,
  Close,
  Collection,
  Connection,
  Document,
  EditPen,
  Moon,
  Notebook,
  Sunny,
  Tickets,
} from "@element-plus/icons-vue";
import { theme, setTheme } from "../../composables/useTheme";
import request from "../../utils/request";
import { useToast } from "../../composables/useToast";
import LandingShowcase from "./LandingShowcase.vue";

const showAuth = ref(false);
const isLogin = ref(true);
const loading = ref(false);
const preview = ref<HTMLElement | null>(null);
const demoAnswer = "三次握手让客户端和服务器确认双方的收发能力，并同步初始序列号。";
const displayedAnswer = ref(demoAnswer);
const isTyping = ref(false);
const previewTools = [
  { label: "思维导图", icon: Connection },
  { label: "学习卡片", icon: Tickets },
  { label: "智能测验", icon: EditPen },
  { label: "错题整理", icon: Notebook },
];

let typingTimer: number | undefined;
let previewObserver: IntersectionObserver | undefined;
let motionPreference: MediaQueryList | undefined;
let previewVisible = false;

function typeAnswer(length = 0) {
  displayedAnswer.value = demoAnswer.slice(0, length);
  isTyping.value = length < demoAnswer.length;
  typingTimer = isTyping.value
    ? window.setTimeout(() => typeAnswer(length + 1), 55)
    : window.setTimeout(() => typeAnswer(), 4200);
}

function updatePreviewAnimation() {
  window.clearTimeout(typingTimer);
  if (previewVisible && !motionPreference?.matches && !document.hidden) {
    typeAnswer();
    return;
  }
  displayedAnswer.value = demoAnswer;
  isTyping.value = false;
}

onMounted(() => {
  if (!preview.value || !("IntersectionObserver" in window)) return;

  motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  motionPreference.addEventListener("change", updatePreviewAnimation);
  document.addEventListener("visibilitychange", updatePreviewAnimation);
  previewObserver = new IntersectionObserver(
    ([entry]) => {
      const visible = entry.isIntersecting && entry.intersectionRatio >= 0.25;
      if (visible === previewVisible) return;
      previewVisible = visible;
      updatePreviewAnimation();
    },
    { threshold: 0.25 },
  );
  previewObserver.observe(preview.value);
});

onBeforeUnmount(() => {
  window.clearTimeout(typingTimer);
  previewObserver?.disconnect();
  motionPreference?.removeEventListener("change", updatePreviewAnimation);
  document.removeEventListener("visibilitychange", updatePreviewAnimation);
});

const form = reactive({
  username: "",
  password: "",
});

const emit = defineEmits(["success"]);
const toast = useToast();

const handleAuth = async () => {
  if (!form.username || !form.password) {
    toast.warning("请输入用户名和密码");
    return;
  }

  loading.value = true;
  const endpoint = isLogin.value ? "/api/auth/login" : "/api/auth/register";

  try {
    const res: any = await request.post(endpoint, form);
    localStorage.setItem("token", res.token);
    localStorage.setItem("username", res.username);
    toast.success(isLogin.value ? "登录成功" : "注册成功");
    emit("success", res.username);
  } catch (e: any) {
    toast.error(e?.response?.data?.message || e?.message || "操作失败");
  } finally {
    loading.value = false;
  }
};
</script>

<style lang="scss" src="./LoginLanding.scss" scoped></style>
