<script setup>
defineProps({
  evaluationError: {
    type: Object,
    default: null,
  },
  parseError: {
    type: Object,
    default: null,
  },
});
</script>

<template>
  <section class="panel status-card">
    <h2 class="panel-title">错误状态</h2>
    <div class="status-box">
      <div class="status-label">解析错误</div>
      <div class="status-value error-value">
        {{ parseError ? `${parseError.code}: ${parseError.message}` : "无" }}
      </div>
    </div>
    <div class="status-box">
      <div class="status-label">求值错误</div>
      <div class="status-value error-value">
        {{ evaluationError ? `${evaluationError.code}: ${evaluationError.message}` : "无" }}
      </div>
    </div>
  </section>
</template>
