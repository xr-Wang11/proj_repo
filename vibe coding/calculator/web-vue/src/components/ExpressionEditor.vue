<script setup>
import { nextTick, onMounted, ref, watch } from "vue";

const props = defineProps({
  rawInput: {
    type: String,
    required: true,
  },
  cursorPosition: {
    type: Number,
    required: true,
  },
});

const emit = defineEmits([
  "apply-keyboard-text",
  "backspace",
  "delete-forward",
  "move-cursor",
  "move-cursor-by",
]);

const textareaRef = ref(null);

function syncCursor() {
  const textarea = textareaRef.value;

  if (!textarea || document.activeElement !== textarea) {
    return;
  }

  try {
    textarea.setSelectionRange(props.cursorPosition, props.cursorPosition);
  } catch {
    // Ignore unsupported cursor updates.
  }
}

function focusAtCursor() {
  const textarea = textareaRef.value;

  if (!textarea) {
    return;
  }

  textarea.focus();
  syncCursor();
}

function updateCursorFromDom() {
  const textarea = textareaRef.value;
  emit("move-cursor", textarea ? textarea.selectionStart || 0 : 0);
}

function handleKeydown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  switch (event.key) {
    case "ArrowLeft":
      event.preventDefault();
      emit("move-cursor-by", -1);
      return;
    case "ArrowRight":
      event.preventDefault();
      emit("move-cursor-by", 1);
      return;
    case "Home":
      event.preventDefault();
      emit("move-cursor", 0);
      return;
    case "End":
      event.preventDefault();
      emit("move-cursor", props.rawInput.length);
      return;
    case "Backspace":
      event.preventDefault();
      emit("backspace");
      return;
    case "Delete":
      event.preventDefault();
      emit("delete-forward");
      return;
    default:
      break;
  }

  if (event.key.length === 1) {
    event.preventDefault();
    emit("apply-keyboard-text", event.key);
  }
}

function handlePaste(event) {
  event.preventDefault();
  const pastedText = event.clipboardData ? event.clipboardData.getData("text") : "";
  emit("apply-keyboard-text", pastedText);
}

watch(() => props.cursorPosition, () => {
  void nextTick(syncCursor);
});

watch(() => props.rawInput, () => {
  void nextTick(syncCursor);
});

onMounted(() => {
  focusAtCursor();
});

defineExpose({
  focusAtCursor,
});
</script>

<template>
  <div class="expression-wrap">
    <textarea
      ref="textareaRef"
      :value="rawInput"
      spellcheck="false"
      placeholder="例如：3 + 4*i；i、j 需写成 3*i、3*j"
      @click="updateCursorFromDom"
      @keydown="handleKeydown"
      @keyup="updateCursorFromDom"
      @paste="handlePaste"
    />
  </div>
</template>
