<script setup>
defineProps({
  functionName: {
    type: String,
    required: true,
  },
  functionParams: {
    type: String,
    required: true,
  },
  functionStatus: {
    type: Object,
    required: true,
  },
});

defineEmits([
  "save",
  "reset",
  "update:functionName",
  "update:functionParams",
]);
</script>

<template>
  <div class="function-panel">
    <h2 class="panel-title">保存函数</h2>
    <div class="function-fields">
      <div>
        <label for="functionNameInput">函数名</label>
        <input
          id="functionNameInput"
          :value="functionName"
          class="field-input"
          placeholder="例如：f_power"
          @input="$emit('update:functionName', $event.target.value)"
        />
      </div>
      <div>
        <label for="functionParamsInput">参数列表</label>
        <input
          id="functionParamsInput"
          :value="functionParams"
          class="field-input"
          placeholder="例如：u, i_load"
          @input="$emit('update:functionParams', $event.target.value)"
        />
      </div>
    </div>
    <div class="hint">函数体直接使用当前表达式输入框中的内容。</div>
    <div class="function-actions">
      <button data-tone="accent" type="button" @click="$emit('save')">保存当前表达式为函数</button>
      <button type="button" @click="$emit('reset')">清空函数表单</button>
    </div>
    <div :data-tone="functionStatus.tone" class="function-status">{{ functionStatus.message }}</div>
  </div>
</template>
