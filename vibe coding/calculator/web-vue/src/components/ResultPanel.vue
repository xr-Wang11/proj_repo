<script setup>
import { computed, ref } from "vue";
import PrecisionSlider from "@/components/PrecisionSlider.vue";
import { formatEvaluationResultForDisplay } from "@/utils/result-display.js";

const props = defineProps({
  angleUnit: {
    type: String,
    required: true,
  },
  displayMode: {
    type: String,
    required: true,
  },
  evaluationResult: {
    type: Object,
    default: null,
  },
  latexExpression: {
    type: String,
    required: true,
  },
  resultLatex: {
    type: String,
    required: true,
  },
  resultText: {
    type: String,
    required: true,
  },
  significantDigits: {
    type: Number,
    required: true,
  },
});

defineEmits(["update:significantDigits"]);

const numberMode = ref("decimal");

const displayedResultText = computed(() => {
  if (!props.evaluationResult) {
    return props.resultText;
  }

  return formatEvaluationResultForDisplay(props.evaluationResult, {
    angleUnit: props.angleUnit,
    displayMode: props.displayMode,
    numberMode: numberMode.value,
    significantDigits: props.significantDigits,
  });
});
</script>

<template>
  <section class="panel status-card">
    <div class="status-header">
      <h2 class="panel-title">结果区</h2>
      <div class="result-mode-switch">
        <button
          :data-active="numberMode === 'decimal' ? 'true' : 'false'"
          type="button"
          @click="numberMode = 'decimal'"
        >
          小数
        </button>
        <button
          :data-active="numberMode === 'fraction' ? 'true' : 'false'"
          type="button"
          @click="numberMode = 'fraction'"
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
      <div class="status-label">表达式 LaTeX</div>
      <div class="status-value">{{ latexExpression || "等待表达式输入" }}</div>
    </div>
    <div class="status-box">
      <div class="status-label">结果文本</div>
      <div class="status-value">{{ displayedResultText || "等待结果" }}</div>
    </div>
    <div class="status-box">
      <div class="status-label">结果 LaTeX</div>
      <div class="status-value">{{ resultLatex || "等待 LaTeX 结果" }}</div>
    </div>
  </section>
</template>
