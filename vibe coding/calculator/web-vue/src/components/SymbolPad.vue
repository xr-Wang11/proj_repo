<script setup>
const props = defineProps({
  buttonGroups: {
    type: Array,
    required: true,
  },
  buttonHint: {
    type: String,
    required: true,
  },
  getButtonHelpText: {
    type: Function,
    required: true,
  },
});

const emit = defineEmits(["insert-button", "trigger-command", "show-button-hint", "reset-button-hint"]);

function handleClick(button) {
  if (button.command) {
    emit("trigger-command", button.command);
    return;
  }

  emit("insert-button", button.key);
}

function handleShowHint(button) {
  emit("show-button-hint", button.helpKey || button.key || button.command);
}
</script>

<template>
  <div class="button-panel">
    <div
      v-for="group in buttonGroups"
      :key="group.label"
      class="button-group"
    >
      <div class="group-label">{{ group.label }}</div>
      <div class="button-row">
        <button
          v-for="button in group.buttons"
          :key="button.key || button.command"
          :aria-label="getButtonHelpText(button.helpKey || button.key || button.command)"
          :data-tone="button.tone || null"
          :title="getButtonHelpText(button.helpKey || button.key || button.command)"
          type="button"
          @blur="$emit('reset-button-hint')"
          @click="handleClick(button)"
          @focus="handleShowHint(button)"
          @mousedown.prevent
          @mouseleave="$emit('reset-button-hint')"
          @mouseover="handleShowHint(button)"
        >
          {{ button.label }}
        </button>
      </div>
    </div>
  </div>

  <div class="hint">{{ buttonHint }}</div>
</template>
