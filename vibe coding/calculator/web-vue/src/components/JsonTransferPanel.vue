<script setup>
defineProps({
  modelValue: {
    type: String,
    required: true,
  },
});

defineEmits(["export", "import", "update:modelValue"]);
</script>

<template>
  <section class="panel info-card">
    <h2 class="panel-title">导入导出</h2>
    <div class="json-panel">
      <label for="functionJsonArea">用户函数 JSON</label>
      <textarea
        id="functionJsonArea"
        :value="modelValue"
        class="json-textarea"
        spellcheck="false"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <div class="json-actions">
        <button type="button" @click="$emit('export')">导出到文本框</button>
        <button type="button" @click="$emit('import')">从文本框导入</button>
      </div>
    </div>
  </section>
</template>
