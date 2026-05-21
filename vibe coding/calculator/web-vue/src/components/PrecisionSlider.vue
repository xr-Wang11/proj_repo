<script setup>
defineProps({
  label: {
    type: String,
    default: "保留小数位数",
  },
  max: {
    type: Number,
    default: 10,
  },
  min: {
    type: Number,
    default: 0,
  },
  modelValue: {
    type: Number,
    required: true,
  },
});

defineEmits(["update:modelValue"]);
</script>

<template>
  <div class="precision-slider">
    <div class="precision-slider-header">
      <span>{{ label }}</span>
      <strong>{{ modelValue }}</strong>
    </div>
    <input
      :max="max"
      :min="min"
      :value="modelValue"
      class="precision-slider-input"
      type="range"
      @input="$emit('update:modelValue', Number($event.target.value))"
    />
  </div>
</template>
