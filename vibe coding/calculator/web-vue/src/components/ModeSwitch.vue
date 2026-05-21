<script setup>
defineProps({
  modelValue: {
    type: String,
    required: true,
  },
});

defineEmits(["update:modelValue"]);
</script>

<template>
  <div class="mode-switch">
    <button
      :data-active="modelValue === 'calculator' ? 'true' : 'false'"
      type="button"
      @click="$emit('update:modelValue', 'calculator')"
    >
      普通计算
    </button>
    <button
      :data-active="modelValue === 'system' ? 'true' : 'false'"
      type="button"
      @click="$emit('update:modelValue', 'system')"
    >
      方程组
    </button>
  </div>
</template>
