"use strict";

const { evaluate } = require("../core/evaluator");
const { parseSource } = require("../core/parser");
const {
  renderAstToLatex,
  renderEvaluationResultToLatex,
  renderEvaluationResultToText,
} = require("../core/format");
const {
  createInMemoryUserFunctionStore,
  createPersistentUserFunctionStore,
} = require("../core/functions");
const { createWebInputProtocol } = require("./input-protocol");
const { createLocalStorageRecordPersistence } = require("./user-function-storage");

function setCursor(input, position) {
  try {
    input.setSelectionRange(position, position);
  } catch (error) {
    // Ignore unsupported cursor updates.
  }
}

function focusExpressionInput(input, cursorPosition) {
  input.focus();
  setCursor(input, cursorPosition);
}

function createProtocolForUserStore(userStore) {
  return createWebInputProtocol({
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
}

function splitParameterInput(value) {
  const source = String(value ?? "").trim();
  return source ? source.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function buildInvocationTemplate(definition) {
  const parameterCount = definition.parameters.length;

  if (parameterCount === 0) {
    return {
      text: `${definition.name}()`,
      cursorOffset: definition.name.length + 2,
    };
  }

  return {
    text: `${definition.name}(${",".repeat(Math.max(0, parameterCount - 1))})`,
    cursorOffset: definition.name.length + 1,
  };
}

const DEFAULT_BUTTON_HINT = "将光标移到按钮上可查看其作用说明。";

const BUTTON_HELP_TEXTS = Object.freeze({
  plus: "加法运算符，用于计算左值与右值之和。",
  minus: "减法运算符，用于计算左值减去右值。",
  multiply: "乘法运算符，用于计算两个数或表达式的乘积。",
  divide: "除法运算符，用于计算左值除以右值。",
  power: "幂运算符，a ^ b 表示 a 的 b 次方。",
  lparen: "左括号，用于控制表达式优先级或函数参数范围。",
  rparen: "右括号，用于结束括号表达式或函数参数列表。",
  comma: "逗号，用于分隔函数的多个参数。",
  sin: "正弦函数，sin(x) 为求 x 的正弦值。",
  cos: "余弦函数，cos(x) 为求 x 的余弦值。",
  tan: "正切函数，tan(x) 为求 x 的正切值。",
  sqrt: "平方根函数，sqrt(x) 为求 x 的平方根。",
  exp: "指数函数，exp(x) 表示 e 的 x 次方。",
  lg: "常用对数函数，lg(x) 为求 x 的 10 为底对数。",
  ln: "自然对数函数，ln(x) 为求 x 的 e 为底对数。",
  re: "实部函数，re(z) 为求复数 z 的实部。",
  im: "虚部函数，im(z) 为求复数 z 的虚部。",
  abs: "模长函数，abs(z) 为求复数 z 的模。",
  arg: "幅角函数，arg(z) 为求复数 z 的相角。",
  conj: "共轭函数，conj(z) 为求复数 z 的共轭。",
  rect: "直角坐标构造函数，rect(x, y) 表示 x + y*i。",
  polar: "相量构造函数，polar(r, theta, unit) 按幅值与角度生成复数。",
  to_rect: "转换函数，to_rect(z) 将结果按直角坐标形式显示。",
  to_polar: "转换函数，to_polar(z) 将结果按相量形式显示。",
  pi: "圆周率，约为 3.141592653589793。",
  e: "自然常数 e，约为 2.718281828459045。",
  i: "虚数单位，满足 i^2 = -1。",
  deg: "角度单位常量，表示 degree（度）。",
  rad: "角度单位常量，表示 radian（弧度）。",
  backspaceButton: "退格，删除光标前的一个字符。",
  clearButton: "清空，删除当前输入框中的全部内容。",
});

function mountCalculatorApp(doc = document) {
  const userStore = createPersistentUserFunctionStore({
    autoLoad: false,
    persistence: createLocalStorageRecordPersistence(),
    store: createInMemoryUserFunctionStore(),
  });
  const protocol = createProtocolForUserStore(userStore);
  let state = protocol.createState();

  const expressionInput = doc.getElementById("expressionInput");
  const latexExpression = doc.getElementById("latexExpression");
  const resultText = doc.getElementById("resultText");
  const resultLatex = doc.getElementById("resultLatex");
  const parseError = doc.getElementById("parseError");
  const evaluationError = doc.getElementById("evaluationError");
  const displayMode = doc.getElementById("displayMode");
  const angleUnit = doc.getElementById("angleUnit");
  const keyboardHint = doc.getElementById("keyboardHint");
  const buttonHint = doc.getElementById("buttonHint");
  const buttonBar = doc.getElementById("buttonBar");
  const clearButton = doc.getElementById("clearButton");
  const backspaceButton = doc.getElementById("backspaceButton");

  const functionNameInput = doc.getElementById("functionNameInput");
  const functionParamsInput = doc.getElementById("functionParamsInput");
  const functionSaveButton = doc.getElementById("functionSaveButton");
  const functionResetButton = doc.getElementById("functionResetButton");
  const functionStatus = doc.getElementById("functionStatus");
  const savedFunctionList = doc.getElementById("savedFunctionList");
  const functionJsonArea = doc.getElementById("functionJsonArea");
  const exportFunctionsButton = doc.getElementById("exportFunctionsButton");
  const importFunctionsButton = doc.getElementById("importFunctionsButton");

  if (!expressionInput) {
    throw new Error("Missing #expressionInput root element.");
  }

  function setFunctionStatus(message, tone = "muted") {
    if (!functionStatus) {
      return;
    }

    functionStatus.textContent = message;
    functionStatus.dataset.tone = tone;
  }

  function setButtonHint(message = DEFAULT_BUTTON_HINT) {
    if (!buttonHint) {
      return;
    }

    buttonHint.textContent = message;
  }

  function getButtonHelpText(button) {
    if (!button) {
      return "";
    }

    if (button.dataset && button.dataset.buttonKey && BUTTON_HELP_TEXTS[button.dataset.buttonKey]) {
      return BUTTON_HELP_TEXTS[button.dataset.buttonKey];
    }

    if (button.id && BUTTON_HELP_TEXTS[button.id]) {
      return BUTTON_HELP_TEXTS[button.id];
    }

    return "";
  }

  function applyButtonHelpMetadata() {
    const buttons = buttonBar ? Array.from(buttonBar.querySelectorAll("button")) : [];

    for (const button of buttons) {
      const helpText = getButtonHelpText(button);

      if (!helpText) {
        continue;
      }

      button.title = helpText;
      button.setAttribute("aria-label", helpText);
    }
  }

  function showButtonHintForElement(button) {
    const helpText = getButtonHelpText(button);
    setButtonHint(helpText || DEFAULT_BUTTON_HINT);
  }

  function loadPersistedFunctions() {
    userStore.list();
    const persistenceStatus = userStore.getPersistenceStatus();

    if (persistenceStatus.lastLoadError) {
      setFunctionStatus(`本地存储加载失败，已忽略旧数据: ${persistenceStatus.lastLoadError.message}`, "error");
      return;
    }

    setFunctionStatus("已从浏览器本地存储加载用户函数。", "success");
  }

  function renderFunctionList() {
    if (!savedFunctionList) {
      return;
    }

    const definitions = userStore.list();
    savedFunctionList.innerHTML = "";

    if (definitions.length === 0) {
      const empty = doc.createElement("div");
      empty.className = "function-empty";
      empty.textContent = "当前还没有已保存函数。";
      savedFunctionList.appendChild(empty);
      return;
    }

    for (const definition of definitions) {
      const item = doc.createElement("div");
      item.className = "function-item";

      const header = doc.createElement("div");
      header.className = "function-item-header";

      const title = doc.createElement("div");
      title.className = "function-item-title";
      title.textContent = `${definition.name}(${definition.parameters.map((parameter) => parameter.name).join(", ")})`;

      const actions = doc.createElement("div");
      actions.className = "function-item-actions";

      const editButton = doc.createElement("button");
      editButton.type = "button";
      editButton.textContent = "编辑";
      editButton.dataset.action = "edit";
      editButton.dataset.functionName = definition.name;

      const insertButton = doc.createElement("button");
      insertButton.type = "button";
      insertButton.textContent = "插入调用";
      insertButton.dataset.action = "insert";
      insertButton.dataset.functionName = definition.name;

      const deleteButton = doc.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "删除";
      deleteButton.dataset.action = "delete";
      deleteButton.dataset.functionName = definition.name;
      deleteButton.dataset.tone = "danger";

      actions.appendChild(editButton);
      actions.appendChild(insertButton);
      actions.appendChild(deleteButton);
      header.appendChild(title);
      header.appendChild(actions);

      const body = doc.createElement("div");
      body.className = "function-item-body";
      body.textContent = definition.metadata.source;

      item.appendChild(header);
      item.appendChild(body);
      savedFunctionList.appendChild(item);
    }
  }

  function render() {
    if (expressionInput.value !== state.rawInput) {
      expressionInput.value = state.rawInput;
    }

    if (doc.activeElement === expressionInput) {
      setCursor(expressionInput, state.cursorPosition);
    }

    latexExpression.textContent = state.latexExpression || "等待表达式输入";
    resultText.textContent = state.resultText || "等待结果";
    resultLatex.textContent = state.resultLatex || "等待 LaTeX 结果";

    parseError.textContent = state.parseError ? `${state.parseError.code}: ${state.parseError.message}` : "无";
    evaluationError.textContent = state.evaluationError
      ? `${state.evaluationError.code}: ${state.evaluationError.message}`
      : "无";

    displayMode.value = state.displayMode;
    angleUnit.value = state.angleUnit;

    keyboardHint.textContent = state.lastAction && state.lastAction.rejectedText
      ? `已忽略不支持的输入: ${state.lastAction.rejectedText}`
      : state.lastAction && state.lastAction.normalizedOriginalText
        ? `已将全角或特殊符号 ${state.lastAction.normalizedOriginalText} 自动转换为 ${state.lastAction.normalizedText}`
        : "数字、字母、运算符、括号和逗号都可直接键盘输入；检测到全角符号时会自动转为半角。";
  }

  function apply(nextState) {
    state = nextState;
    render();
  }

  function refreshCalculator() {
    apply(protocol.refresh(state));
    renderFunctionList();
  }

  function resetFunctionForm() {
    functionNameInput.value = "";
    functionParamsInput.value = "";
  }

  function saveFunctionFromCurrentExpression() {
    try {
      const name = functionNameInput.value.trim();
      const parameters = splitParameterInput(functionParamsInput.value);
      const bodySource = state.rawInput.trim();
      const replacing = userStore.has(name);

      const definition = userStore.define(
        {
          name,
          parameters,
          bodySource,
        },
        { replace: replacing }
      );

      setFunctionStatus(`${replacing ? "已更新" : "已保存"}函数 ${definition.name}。`, "success");
      refreshCalculator();
    } catch (error) {
      setFunctionStatus(`保存失败: ${error.message}`, "error");
    }
  }

  function editFunction(name) {
    const definition = userStore.get(name);

    if (!definition) {
      setFunctionStatus(`未找到函数 ${name}。`, "error");
      return;
    }

    functionNameInput.value = definition.name;
    functionParamsInput.value = definition.parameters.map((parameter) => parameter.name).join(", ");
    apply(protocol.replaceRawInput(state, definition.metadata.source || ""));
    expressionInput.focus();
    setFunctionStatus(`已载入函数 ${name}，现在可以编辑并重新保存。`, "success");
  }

  function insertFunctionCall(name) {
    const definition = userStore.get(name);

    if (!definition) {
      setFunctionStatus(`未找到函数 ${name}。`, "error");
      return;
    }

    const template = buildInvocationTemplate(definition);
    apply(
      protocol.insertTemplate(state, template.text, template.cursorOffset, {
        kind: "savedFunctionInsert",
        functionName: name,
      })
    );
    focusExpressionInput(expressionInput, state.cursorPosition);
  }

  function deleteFunction(name) {
    if (!userStore.remove(name)) {
      setFunctionStatus(`未找到函数 ${name}。`, "error");
      return;
    }

    setFunctionStatus(`已删除函数 ${name}。`, "success");
    refreshCalculator();
  }

  function exportFunctions() {
    functionJsonArea.value = JSON.stringify(userStore.exportRecords(), null, 2);
    setFunctionStatus("已导出函数 JSON。", "success");
  }

  function importFunctions() {
    try {
      const records = JSON.parse(functionJsonArea.value || "[]");
      const loaded = userStore.loadRecords(records, { replace: true });
      setFunctionStatus(`已导入 ${loaded.length} 个函数。`, "success");
      refreshCalculator();
    } catch (error) {
      setFunctionStatus(`导入失败: ${error.message}`, "error");
    }
  }

  expressionInput.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        apply(protocol.moveCursorBy(state, -1));
        return;
      case "ArrowRight":
        event.preventDefault();
        apply(protocol.moveCursorBy(state, 1));
        return;
      case "Home":
        event.preventDefault();
        apply(protocol.moveCursor(state, 0));
        return;
      case "End":
        event.preventDefault();
        apply(protocol.moveCursor(state, state.rawInput.length));
        return;
      case "Backspace":
        event.preventDefault();
        apply(protocol.backspace(state));
        return;
      case "Delete":
        event.preventDefault();
        apply(protocol.deleteForward(state));
        return;
      default:
        break;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      apply(protocol.applyKeyboardText(state, event.key));
    }
  });

  expressionInput.addEventListener("click", () => {
    apply(protocol.moveCursor(state, expressionInput.selectionStart || 0));
  });

  expressionInput.addEventListener("keyup", () => {
    apply(protocol.moveCursor(state, expressionInput.selectionStart || 0));
  });

  expressionInput.addEventListener("paste", (event) => {
    event.preventDefault();
    const pastedText = event.clipboardData ? event.clipboardData.getData("text") : "";
    apply(protocol.applyKeyboardText(state, pastedText));
  });

  buttonBar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-button-key]");

    if (!button) {
      return;
    }

    apply(protocol.insertButton(state, button.dataset.buttonKey));
    focusExpressionInput(expressionInput, state.cursorPosition);
  });

  buttonBar.addEventListener("mouseover", (event) => {
    const button = event.target.closest("button");

    if (!button || !buttonBar.contains(button)) {
      return;
    }

    showButtonHintForElement(button);
  });

  buttonBar.addEventListener("focusin", (event) => {
    const button = event.target.closest("button");

    if (!button || !buttonBar.contains(button)) {
      return;
    }

    showButtonHintForElement(button);
  });

  buttonBar.addEventListener("mouseout", (event) => {
    const button = event.target.closest("button");

    if (!button || !buttonBar.contains(button)) {
      return;
    }

    const relatedTarget = event.relatedTarget;

    if (relatedTarget && button.contains(relatedTarget)) {
      return;
    }

    if (relatedTarget && buttonBar.contains(relatedTarget)) {
      return;
    }

    setButtonHint();
  });

  buttonBar.addEventListener("focusout", (event) => {
    const nextFocused = event.relatedTarget;

    if (nextFocused && buttonBar.contains(nextFocused)) {
      return;
    }

    setButtonHint();
  });

  clearButton.addEventListener("click", () => {
    apply(protocol.clear(state));
    focusExpressionInput(expressionInput, state.cursorPosition);
  });

  backspaceButton.addEventListener("click", () => {
    apply(protocol.backspace(state));
    focusExpressionInput(expressionInput, state.cursorPosition);
  });

  displayMode.addEventListener("change", () => {
    apply(protocol.setDisplayMode(state, displayMode.value));
  });

  angleUnit.addEventListener("change", () => {
    apply(protocol.setAngleUnit(state, angleUnit.value));
  });

  functionSaveButton.addEventListener("click", () => {
    saveFunctionFromCurrentExpression();
  });

  functionResetButton.addEventListener("click", () => {
    resetFunctionForm();
    setFunctionStatus("已清空函数编辑表单。", "muted");
  });

  savedFunctionList.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");

    if (!actionButton) {
      return;
    }

    const { action, functionName } = actionButton.dataset;

    switch (action) {
      case "edit":
        editFunction(functionName);
        return;
      case "insert":
        insertFunctionCall(functionName);
        return;
      case "delete":
        deleteFunction(functionName);
        return;
      default:
        return;
    }
  });

  exportFunctionsButton.addEventListener("click", exportFunctions);
  importFunctionsButton.addEventListener("click", importFunctions);

  loadPersistedFunctions();
  applyButtonHelpMetadata();
  setButtonHint();
  refreshCalculator();

  return {
    getState() {
      return state;
    },
    protocol,
    userStore,
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    mountCalculatorApp(window.document);
  });
}

module.exports = {
  buildInvocationTemplate,
  mountCalculatorApp,
  splitParameterInput,
};
