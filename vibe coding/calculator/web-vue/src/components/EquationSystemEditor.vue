<script setup>
import { computed } from "vue";

const props = defineProps({
  angleUnit: {
    type: String,
    required: true,
  },
  equationCount: {
    type: Number,
    required: true,
  },
  equations: {
    type: Array,
    required: true,
  },
  numberMode: {
    type: String,
    required: true,
  },
  variableSource: {
    type: String,
    required: true,
  },
});

defineEmits([
  "add-equation",
  "remove-equation",
  "update:angleUnit",
  "update:equation",
  "update:numberMode",
  "update:variableSource",
]);

const braceSize = computed(() => `${Math.max(140, props.equationCount * 74)}px`);
</script>

<template>
  <section class="panel workspace">
    <h2 class="panel-title">方程组输入</h2>

    <div class="system-controls">
      <div class="select-card">
        <label for="systemVariables">声明变量</label>
        <input
          id="systemVariables"
          :value="variableSource"
          class="field-input"
          placeholder="例如：x, y"
          @input="$emit('update:variableSource', $event.target.value)"
        />
        <div class="hint">变量需手动声明，使用英文逗号分隔，例如 `x, y, z`。</div>
      </div>

      <div class="system-counter">
        <div class="system-counter-label">方程数量：{{ equationCount }}</div>
        <div class="system-counter-actions">
          <button type="button" @click="$emit('remove-equation')">减少</button>
          <button data-tone="accent" type="button" @click="$emit('add-equation')">增加</button>
        </div>
      </div>
    </div>

    <div class="system-toggle-row">
      <div class="system-toggle-card">
        <div class="system-toggle-label">结果显示</div>
        <div class="result-mode-switch">
          <button
            :data-active="numberMode === 'decimal' ? 'true' : 'false'"
            type="button"
            @click="$emit('update:numberMode', 'decimal')"
          >
            小数
          </button>
          <button
            :data-active="numberMode === 'fraction' ? 'true' : 'false'"
            type="button"
            @click="$emit('update:numberMode', 'fraction')"
          >
            分数
          </button>
        </div>
      </div>

      <div class="system-toggle-card">
        <div class="system-toggle-label">角度单位</div>
        <div class="result-mode-switch">
          <button
            :data-active="angleUnit === 'rad' ? 'true' : 'false'"
            type="button"
            @click="$emit('update:angleUnit', 'rad')"
          >
            弧度
          </button>
          <button
            :data-active="angleUnit === 'deg' ? 'true' : 'false'"
            type="button"
            @click="$emit('update:angleUnit', 'deg')"
          >
            角度
          </button>
        </div>
      </div>
    </div>

    <div class="system-brace-layout">
      <div :style="{ fontSize: braceSize }" class="system-brace" aria-hidden="true">{</div>
      <div class="system-equation-stack">
        <div
          v-for="(equation, index) in equations"
          :key="index"
          class="system-equation-row"
        >
          <label :for="`equation-${index}`">方程 {{ index + 1 }}</label>
          <input
            :id="`equation-${index}`"
            :value="equation"
            class="field-input system-equation-input"
            placeholder="例如：2*x + y = 5"
            spellcheck="false"
            @input="$emit('update:equation', { index, value: $event.target.value })"
          />
        </div>
      </div>
    </div>
  </section>
</template>
