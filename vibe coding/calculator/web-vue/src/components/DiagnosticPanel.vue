<script setup>
import { computed } from "vue";
import {
  summarizeDiagnosticCategory,
  summarizeDiagnosticLevel,
} from "@/utils/error-display.js";

function formatTimestamp(value) {
  try {
    return new Date(value).toLocaleString("zh-CN", {
      hour12: false,
    });
  } catch {
    return value;
  }
}

const props = defineProps({
  entries: {
    type: Array,
    required: true,
  },
});

defineEmits(["clear", "export"]);

const visibleEntries = computed(() => props.entries.slice(0, 5));
const foldedEntries = computed(() => props.entries.slice(5));
</script>

<template>
  <section class="panel info-card">
    <div class="diagnostic-header">
      <div>
        <h2 class="panel-title">诊断日志</h2>
        <div class="diagnostic-summary">最近保留 {{ entries.length }} 条本地日志</div>
      </div>
      <div class="diagnostic-actions">
        <button type="button" @click="$emit('export')">导出 JSON</button>
        <button type="button" @click="$emit('clear')">清空日志</button>
      </div>
    </div>

    <div v-if="entries.length === 0" class="function-empty">当前没有诊断日志。</div>

    <div v-else class="diagnostic-list">
      <article
        v-for="entry in visibleEntries"
        :key="entry.id"
        class="diagnostic-item"
      >
        <div class="diagnostic-meta">
          <span class="diagnostic-time">{{ formatTimestamp(entry.timestamp) }}</span>
          <span :data-level="entry.level" class="diagnostic-level">{{ summarizeDiagnosticLevel(entry.level) }}</span>
          <span class="diagnostic-category">{{ summarizeDiagnosticCategory(entry.category) }}</span>
        </div>
        <div class="diagnostic-message">{{ entry.message }}</div>
        <div class="diagnostic-context">
          输入：{{ entry.context.rawInput || "(空)" }}
          ｜ 模式：{{ entry.context.calcMode === "system" ? "方程组" : "普通计算" }}
          ｜ 角度：{{ entry.context.angleUnit }}
        </div>
        <pre
          v-if="entry.detail"
          class="diagnostic-detail"
        >{{ JSON.stringify(entry.detail, null, 2) }}</pre>
      </article>

      <details
        v-if="foldedEntries.length > 0"
        class="diagnostic-folded"
      >
        <summary>展开更早的 {{ foldedEntries.length }} 条日志</summary>
        <div class="diagnostic-folded-list">
          <article
            v-for="entry in foldedEntries"
            :key="entry.id"
            class="diagnostic-item"
          >
            <div class="diagnostic-meta">
              <span class="diagnostic-time">{{ formatTimestamp(entry.timestamp) }}</span>
              <span :data-level="entry.level" class="diagnostic-level">{{ summarizeDiagnosticLevel(entry.level) }}</span>
              <span class="diagnostic-category">{{ summarizeDiagnosticCategory(entry.category) }}</span>
            </div>
            <div class="diagnostic-message">{{ entry.message }}</div>
            <div class="diagnostic-context">
              输入：{{ entry.context.rawInput || "(空)" }}
              ｜ 模式：{{ entry.context.calcMode === "system" ? "方程组" : "普通计算" }}
              ｜ 角度：{{ entry.context.angleUnit }}
            </div>
            <pre
              v-if="entry.detail"
              class="diagnostic-detail"
            >{{ JSON.stringify(entry.detail, null, 2) }}</pre>
          </article>
        </div>
      </details>
    </div>
  </section>
</template>
