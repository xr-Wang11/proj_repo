import { ref } from "vue";
import {
  createWebInputProtocol,
  evaluate,
  parseSource,
  renderAstToLatex,
  renderEvaluationResultToLatex,
  renderEvaluationResultToText,
} from "@/adapters/core-api.js";

export function useCalculatorProtocol(userStore) {
  const protocol = createWebInputProtocol({
    evaluate,
    getEvaluationContext() {
      return {
        functions: userStore.toDefinitionTable(),
      };
    },
    parseSource,
    renderAstToLatex,
    renderEvaluationResultToLatex,
    renderEvaluationResultToText,
  });

  const state = ref(protocol.createState());

  function apply(nextState) {
    state.value = nextState;
    return state.value;
  }

  return {
    protocol,
    state,
    applyKeyboardText(text) {
      return apply(protocol.applyKeyboardText(state.value, text));
    },
    backspace() {
      return apply(protocol.backspace(state.value));
    },
    clear() {
      return apply(protocol.clear(state.value));
    },
    deleteForward() {
      return apply(protocol.deleteForward(state.value));
    },
    insertButton(buttonKey) {
      return apply(protocol.insertButton(state.value, buttonKey));
    },
    insertTemplate(text, cursorOffset = null, metadata = {}) {
      return apply(protocol.insertTemplate(state.value, text, cursorOffset, metadata));
    },
    moveCursor(position) {
      return apply(protocol.moveCursor(state.value, position));
    },
    moveCursorBy(delta) {
      return apply(protocol.moveCursorBy(state.value, delta));
    },
    refresh() {
      return apply(protocol.refresh(state.value));
    },
    replaceRawInput(rawInput) {
      return apply(protocol.replaceRawInput(state.value, rawInput));
    },
    setAngleUnit(angleUnit) {
      return apply(protocol.setAngleUnit(state.value, angleUnit));
    },
    setDisplayMode(displayMode) {
      return apply(protocol.setDisplayMode(state.value, displayMode));
    },
  };
}
