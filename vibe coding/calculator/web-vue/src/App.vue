<script setup>
import { computed, nextTick, ref, watch } from "vue";
import DiagnosticPanel from "@/components/DiagnosticPanel.vue";
import DisplayControls from "@/components/DisplayControls.vue";
import EquationSystemEditor from "@/components/EquationSystemEditor.vue";
import EquationPlotPanel from "@/components/EquationPlotPanel.vue";
import EquationSystemResultPanel from "@/components/EquationSystemResultPanel.vue";
import ErrorPanel from "@/components/ErrorPanel.vue";
import ExpressionEditor from "@/components/ExpressionEditor.vue";
import FunctionEditor from "@/components/FunctionEditor.vue";
import FunctionList from "@/components/FunctionList.vue";
import JsonTransferPanel from "@/components/JsonTransferPanel.vue";
import ModeSwitch from "@/components/ModeSwitch.vue";
import ResultPanel from "@/components/ResultPanel.vue";
import SymbolPad from "@/components/SymbolPad.vue";
import {
  createInMemoryUserFunctionStore,
  createLocalStorageRecordPersistence,
  createPersistentUserFunctionStore,
} from "@/adapters/core-api.js";
import { useButtonHints } from "@/composables/useButtonHints.js";
import { useCalculatorProtocol } from "@/composables/useCalculatorProtocol.js";
import { useDiagnostics } from "@/composables/useDiagnostics.js";
import { useEquationSystem } from "@/composables/useEquationSystem.js";
import { useUserFunctions } from "@/composables/useUserFunctions.js";

const expressionEditorRef = ref(null);
const currentMode = ref("calculator");
const systemNumberMode = ref("decimal");
const significantDigits = ref(3);

const userStore = createPersistentUserFunctionStore({
  autoLoad: false,
  persistence: createLocalStorageRecordPersistence(),
  store: createInMemoryUserFunctionStore(),
});

const calculator = useCalculatorProtocol(userStore);
const state = calculator.state;

const {
  buttonHint,
  getButtonHelpText,
  resetButtonHint,
  showButtonHint,
} = useButtonHints();

const diagnostics = useDiagnostics();
const {
  clearEntries,
  downloadEntries,
  entries: diagnosticEntries,
  record,
  recordError,
  setContext,
} = diagnostics;

const equationSystem = useEquationSystem(userStore);
const {
  addEquation,
  angleUnit: systemAngleUnit,
  equationCount,
  equationInputs,
  removeEquation,
  plot: systemPlot,
  plotViewportInput,
  result: systemResult,
  resetPlotViewport,
  setEquationInput,
  setPlotViewportInput,
  setPlotXAxisVariable,
  setPlotYAxisVariable,
  variableSource,
} = equationSystem;

const userFunctions = useUserFunctions(userStore, {
  getRawInput() {
    return state.value.rawInput;
  },
  insertTemplate(text, cursorOffset, metadata) {
    calculator.insertTemplate(text, cursorOffset, metadata);
    void focusEditor();
  },
  refresh() {
    calculator.refresh();
  },
  replaceRawInput(rawInput) {
    calculator.replaceRawInput(rawInput);
    void focusEditor();
  },
});

const {
  deleteFunction,
  editFunction,
  exportFunctions,
  functionJsonText,
  functionName,
  functionParams,
  functionStatus,
  functions,
  importFunctions,
  insertFunctionCall,
  loadPersistedFunctions,
  resetForm,
  saveCurrentExpression,
} = userFunctions;

const buttonGroups = Object.freeze([
  {
    label: "运算符",
    buttons: [
      { key: "plus", label: "+" },
      { key: "minus", label: "-" },
      { key: "multiply", label: "*" },
      { key: "divide", label: "/" },
      { key: "power", label: "^" },
    ],
  },
  {
    label: "结构",
    buttons: [
      { key: "lparen", label: "(" },
      { key: "rparen", label: ")" },
      { key: "comma", label: "," },
      { command: "backspace", helpKey: "backspace", label: "退格", tone: "accent" },
      { command: "clear", helpKey: "clear", label: "清空", tone: "accent" },
    ],
  },
  {
    label: "常用函数",
    buttons: [
      { key: "sin", label: "sin" },
      { key: "cos", label: "cos" },
      { key: "tan", label: "tan" },
      { key: "sqrt", label: "sqrt" },
      { key: "exp", label: "exp" },
    ],
  },
  {
    label: "对数与分量",
    buttons: [
      { key: "ln", label: "ln" },
      { key: "lg", label: "lg" },
      { key: "re", label: "re" },
      { key: "im", label: "im" },
    ],
  },
  {
    label: "复数与转换",
    buttons: [
      { key: "abs", label: "abs" },
      { key: "arg", label: "arg" },
      { key: "conj", label: "conj" },
      { key: "rect", label: "rect" },
      { key: "polar", label: "polar" },
    ],
  },
  {
    label: "常量与显示",
    buttons: [
      { key: "to_rect", label: "转直角" },
      { key: "to_polar", label: "转相量" },
      { key: "pi", label: "π" },
      { key: "e", label: "e" },
      { key: "i", label: "i" },
    ],
  },
  {
    label: "角度单位",
    buttons: [
      { key: "deg", label: "度" },
      { key: "rad", label: "弧度" },
    ],
  },
]);

const inputHintText = computed(() => {
  const lastAction = state.value.lastAction;

  if (lastAction?.rejectedText) {
    return `已忽略不支持的输入：${lastAction.rejectedText}`;
  }

  if (lastAction?.normalizedOriginalText) {
    return `已自动把 ${lastAction.normalizedOriginalText} 转换为 ${lastAction.normalizedText}`;
  }

  return "数字、字母、运算符、括号和逗号都可以直接键盘输入；i、j 都可作为虚数单位，但同一条表达式不能混用，且需写成 3*i、3*j；检测到全角符号时会自动转换为半角。";
});

function focusEditor() {
  return nextTick(() => {
    expressionEditorRef.value?.focusAtCursor();
  });
}

function executeAndRefocus(action, logOptions = null) {
  try {
    action();

    if (logOptions) {
      record({
        category: logOptions.category,
        level: logOptions.level || "info",
        message: logOptions.message,
      });
    }
  } catch (error) {
    recordError("ui-action", error, {
      message: logOptions?.errorMessage || "界面操作失败",
    });
    throw error;
  } finally {
    void focusEditor();
  }
}

function handleCommand(command) {
  switch (command) {
    case "backspace":
      executeAndRefocus(() => calculator.backspace(), {
        category: "input",
        message: "执行退格操作",
      });
      return;
    case "clear":
      executeAndRefocus(() => calculator.clear(), {
        category: "input",
        message: "清空输入表达式",
      });
      return;
    default:
      return;
  }
}

function handleInsertButton(buttonKey) {
  executeAndRefocus(() => calculator.insertButton(buttonKey), {
    category: "input",
    message: `点击符号按钮：${buttonKey}`,
  });
}

function handleSaveCurrentExpression() {
  saveCurrentExpression();
  record({
    category: "function",
    level: functionStatus.value.tone === "error" ? "error" : "info",
    message: functionStatus.value.message,
  });
}

function handleResetForm() {
  resetForm();
  record({
    category: "function",
    message: "清空函数编辑表单",
  });
}

function handleEditFunction(name) {
  editFunction(name);
  record({
    category: "function",
    level: functionStatus.value.tone === "error" ? "error" : "info",
    message: functionStatus.value.message,
  });
}

function handleInsertFunctionCall(name) {
  insertFunctionCall(name);
  record({
    category: "function",
    level: functionStatus.value.tone === "error" ? "error" : "info",
    message: functionStatus.value.message,
  });
}

function handleDeleteFunction(name) {
  deleteFunction(name);
  record({
    category: "function",
    level: functionStatus.value.tone === "error" ? "error" : "info",
    message: functionStatus.value.message,
  });
}

function handleExportFunctions() {
  exportFunctions();
  record({
    category: "function-transfer",
    message: functionStatus.value.message,
  });
}

function handleImportFunctions() {
  importFunctions();
  record({
    category: "function-transfer",
    level: functionStatus.value.tone === "error" ? "error" : "info",
    message: functionStatus.value.message,
  });
}

function handleExportDiagnostics() {
  if (downloadEntries()) {
    record({
      category: "diagnostics",
      message: "导出诊断日志 JSON",
    });
  }
}

function handleModeChange(nextMode) {
  currentMode.value = nextMode;
  record({
    category: "mode",
    message: nextMode === "system" ? "切换到方程模式" : "切换到普通计算模式",
  });
}

function handleEquationInputUpdate(payload) {
  setEquationInput(payload.index, payload.value);
}

function handleAddEquation() {
  addEquation();
  record({
    category: "system",
    message: "增加一条方程输入行",
  });
}

function handleRemoveEquation() {
  removeEquation();
  record({
    category: "system",
    message: "减少一条方程输入行",
  });
}

watch(
  () => ({
    angleUnit: currentMode.value === "calculator" ? state.value.angleUnit : systemAngleUnit.value,
    calcMode: currentMode.value,
    cursorPosition: state.value.cursorPosition,
    displayMode: state.value.displayMode,
    equationCount: equationCount.value,
    evaluationError: state.value.evaluationError
      ? `${state.value.evaluationError.code}: ${state.value.evaluationError.message}`
      : null,
    functionName: functionName.value,
    functionParams: functionParams.value,
    parseError: state.value.parseError
      ? `${state.value.parseError.code}: ${state.value.parseError.message}`
      : null,
    rawInput: currentMode.value === "calculator"
      ? state.value.rawInput
      : equationInputs.value.join(" | "),
    significantDigits: significantDigits.value,
    systemVariables: variableSource.value,
  }),
  (nextContext) => {
    setContext(nextContext);
  },
  { deep: true, immediate: true }
);

watch(
  () => state.value.parseError
    ? `${state.value.parseError.code}:${state.value.parseError.message}`
    : "",
  (nextSignature, previousSignature) => {
    if (!nextSignature || nextSignature === previousSignature) {
      return;
    }

    record({
      category: "parse",
      level: "error",
      message: `解析错误：${state.value.parseError.code}`,
      detail: state.value.parseError,
    });
  }
);

watch(
  () => state.value.evaluationError
    ? `${state.value.evaluationError.code}:${state.value.evaluationError.message}`
    : "",
  (nextSignature, previousSignature) => {
    if (!nextSignature || nextSignature === previousSignature) {
      return;
    }

    record({
      category: "evaluation",
      level: "error",
      message: `求值错误：${state.value.evaluationError.code}`,
      detail: state.value.evaluationError,
    });
  }
);

watch(
  () => systemResult.value.status === "error"
    ? `${systemResult.value.error?.code || "UNKNOWN"}:${systemResult.value.message}`
    : systemResult.value.status,
  (nextSignature, previousSignature) => {
    if (!nextSignature || nextSignature === previousSignature || currentMode.value !== "system") {
      return;
    }

    if (systemResult.value.status === "error") {
      record({
        category: "system",
        detail: systemResult.value.error?.detail || null,
        level: "error",
        message: systemResult.value.message,
      });
      return;
    }

    if (systemResult.value.status === "no-solution") {
      record({
        category: "system",
        level: "info",
        message: systemResult.value.message,
      });
      return;
    }

    if (
      systemResult.value.status === "unique-solution"
      || systemResult.value.status === "polynomial-solutions"
      || systemResult.value.status === "pair-solutions"
    ) {
      record({
        category: "system",
        level: "info",
        message: systemResult.value.message,
      });
    }
  }
);

loadPersistedFunctions();
record({
  category: "app",
  message: "Vue 计算器模块已初始化",
});
</script>

<template>
  <div class="shell">
    <div class="header">
      <div>
        <h1 class="title">LaTeX 计算器 Vue 版</h1>
        <p class="subtitle">
          当前支持普通计算、复数/相量转换、单变量高次方程求根、双变量高次方程组求解，以及多变量线性方程组求解。
        </p>
      </div>

      <ModeSwitch
        :model-value="currentMode"
        @update:model-value="handleModeChange"
      />
    </div>

    <div class="grid">
      <template v-if="currentMode === 'calculator'">
        <section class="panel workspace">
          <h2 class="panel-title">输入区</h2>
          <ExpressionEditor
            ref="expressionEditorRef"
            :cursor-position="state.cursorPosition"
            :raw-input="state.rawInput"
            @apply-keyboard-text="calculator.applyKeyboardText"
            @backspace="calculator.backspace"
            @delete-forward="calculator.deleteForward"
            @move-cursor="calculator.moveCursor"
            @move-cursor-by="calculator.moveCursorBy"
          />

          <div class="hint">{{ inputHintText }}</div>

          <DisplayControls
            :angle-unit="state.angleUnit"
            :display-mode="state.displayMode"
            @update:angle-unit="calculator.setAngleUnit"
            @update:display-mode="calculator.setDisplayMode"
          />

          <SymbolPad
            :button-groups="buttonGroups"
            :button-hint="buttonHint"
            :get-button-help-text="getButtonHelpText"
            @insert-button="handleInsertButton"
            @reset-button-hint="resetButtonHint"
            @show-button-hint="showButtonHint"
            @trigger-command="handleCommand"
          />

          <FunctionEditor
            :function-name="functionName"
            :function-params="functionParams"
            :function-status="functionStatus"
            @reset="handleResetForm"
            @save="handleSaveCurrentExpression"
            @update:function-name="functionName = $event"
            @update:function-params="functionParams = $event"
          />
        </section>

        <aside class="sidebar">
          <ResultPanel
            :angle-unit="state.angleUnit"
            :display-mode="state.displayMode"
            :evaluation-result="state.evaluationResult"
            :latex-expression="state.latexExpression"
            :result-latex="state.resultLatex"
            :result-text="state.resultText"
            :significant-digits="significantDigits"
            @update:significant-digits="significantDigits = $event"
          />

          <ErrorPanel
            :evaluation-error="state.evaluationError"
            :parse-error="state.parseError"
          />

          <FunctionList
            :functions="functions"
            @delete="handleDeleteFunction"
            @edit="handleEditFunction"
            @insert="handleInsertFunctionCall"
          />

          <JsonTransferPanel
            :model-value="functionJsonText"
            @export="handleExportFunctions"
            @import="handleImportFunctions"
            @update:model-value="functionJsonText = $event"
          />

          <DiagnosticPanel
            :entries="diagnosticEntries"
            @clear="clearEntries"
            @export="handleExportDiagnostics"
          />

          <section class="panel info-card">
            <h2 class="panel-title">说明</h2>
            <ul class="info-list">
              <li>普通计算模式沿用现有核心表达式求值与用户函数能力。</li>
              <li>结果区支持小数/分数切换，并可用滑块调节保留小数位数。</li>
              <li>诊断日志仅保存在本地浏览器中，默认仅展开最新五条记录。</li>
            </ul>
          </section>
        </aside>
      </template>

      <template v-else>
        <EquationSystemEditor
          :angle-unit="systemAngleUnit"
          :equation-count="equationCount"
          :equations="equationInputs"
          :number-mode="systemNumberMode"
          :variable-source="variableSource"
          @add-equation="handleAddEquation"
          @remove-equation="handleRemoveEquation"
          @update:angle-unit="systemAngleUnit = $event"
          @update:equation="handleEquationInputUpdate"
          @update:number-mode="systemNumberMode = $event"
          @update:variable-source="variableSource = $event"
        />

        <aside class="sidebar">
          <EquationSystemResultPanel
            :number-mode="systemNumberMode"
            :result="systemResult"
            :significant-digits="significantDigits"
            @update:number-mode="systemNumberMode = $event"
            @update:significant-digits="significantDigits = $event"
          />

          <EquationPlotPanel
            :plot="systemPlot"
            :viewport-input="plotViewportInput"
            @reset-viewport="resetPlotViewport"
            @update:viewport-input="setPlotViewportInput"
            @update:x-axis-variable="setPlotXAxisVariable"
            @update:y-axis-variable="setPlotYAxisVariable"
          />

          <DiagnosticPanel
            :entries="diagnosticEntries"
            @clear="clearEntries"
            @export="handleExportDiagnostics"
          />

          <section class="panel info-card">
            <h2 class="panel-title">说明</h2>
            <ul class="info-list">
              <li>当只声明一个变量时，方程模式会进入单变量高次方程求根流程，并显示全部复数根。</li>
              <li>当声明两个变量时，系统会优先尝试双变量多项式方程组求解；若都是一次项，则仍按线性方程组精确求解。</li>
              <li>双变量模式下会在结果区下方显示二维图像，默认以第一个变量为横轴、第二个变量为纵轴，仅绘制实平面。</li>
              <li>当声明三个及以上变量时，方程模式仍按线性方程组处理，暂不支持更高维非线性项。</li>
              <li>无解会直接提示；无穷多解当前仍按报错处理，后续可继续扩展。</li>
            </ul>
          </section>
        </aside>
      </template>
    </div>
  </div>
</template>
