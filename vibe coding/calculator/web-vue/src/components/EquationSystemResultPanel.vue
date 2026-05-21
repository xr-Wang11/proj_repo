<script setup>
import { computed } from "vue";
import PrecisionSlider from "@/components/PrecisionSlider.vue";
import { formatComplexRect } from "@/utils/result-display.js";

const props = defineProps({
  numberMode: {
    type: String,
    required: true,
  },
  result: {
    type: Object,
    required: true,
  },
  significantDigits: {
    type: Number,
    required: true,
  },
});

defineEmits(["update:numberMode", "update:significantDigits"]);

const displayedItems = computed(() => {
  const source = props.result.status === "polynomial-solutions"
    ? props.result.roots
    : props.result.status === "unique-solution"
      ? props.result.solutions
      : [];

  return source.map((item) => ({
    ...item,
    valueText: formatComplexRect(item.value, props.numberMode, props.significantDigits),
  }));
});

const displayedPairs = computed(() => {
  if (props.result.status !== "pair-solutions") {
    return [];
  }

  return (props.result.solutionPairs || []).map((pair) => ({
    ...pair,
    entries: (pair.values || []).map((item) => ({
      ...item,
      valueText: formatComplexRect(item.value, props.numberMode, props.significantDigits),
    })),
  }));
});
</script>

<template>
  <section class="panel status-card">
    <div class="status-header">
      <h2 class="panel-title">方程结果</h2>
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

    <PrecisionSlider
      :model-value="significantDigits"
      @update:model-value="$emit('update:significantDigits', $event)"
    />

    <div class="status-box">
      <div class="status-label">求解状态</div>
      <div
        :data-level="result.status"
        class="status-value system-status-value"
      >
        {{ result.message }}
      </div>
    </div>

    <div
      v-if="displayedItems.length > 0"
      class="system-solution-list"
    >
      <div
        v-for="item in displayedItems"
        :key="item.label"
        class="status-box"
      >
        <div class="status-label">
          {{ item.label }}
          <span v-if="item.multiplicity > 1">（重数 {{ item.multiplicity }}）</span>
        </div>
        <div class="status-value">{{ item.valueText }}</div>
      </div>
    </div>

    <div
      v-if="displayedPairs.length > 0"
      class="system-solution-list"
    >
      <div
        v-for="pair in displayedPairs"
        :key="pair.label"
        class="status-box"
      >
        <div class="status-label">{{ pair.label }}</div>
        <div class="system-pair-list">
          <div
            v-for="entry in pair.entries"
            :key="`${pair.label}-${entry.name}`"
            class="system-pair-row"
          >
            <span class="system-pair-name">{{ entry.name }}</span>
            <span class="status-value">{{ entry.valueText }}</span>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="result.status === 'error' && result.error"
      class="status-box"
    >
      <div class="status-label">错误代码</div>
      <div class="status-value error-value">{{ result.error.code || "未知错误" }}</div>
    </div>
  </section>
</template>
