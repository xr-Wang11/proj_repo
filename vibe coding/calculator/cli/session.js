"use strict";

const {
  ANGLE_UNITS,
  OUTPUT_MODES,
} = require("../core/model");
const {
  createFunctionRegistry,
  createInMemoryUserFunctionStore,
  createPersistentUserFunctionStore,
} = require("../core/functions");
const { evaluateSource } = require("../core/evaluator");
const {
  renderEvaluationResultToLatex,
  renderEvaluationResultToText,
} = require("../core/format");

const HELP_LINES = Object.freeze([
  "可用命令：",
  ":help               显示帮助",
  ":quit               退出 CLI",
  ":mode <plain|rect|polar|debug>",
  ":angle <deg|rad>    设置角度单位",
  ":latex <on|off>     开关 LaTeX 输出",
  ":functions          列出当前可用函数",
  ":fn-save <name>(<params>) = <expr>  保存或更新用户函数",
  ":fn-show <name>     查看用户函数定义",
  ":fn-delete <name>   删除用户函数",
  ":fn-export          导出用户函数 JSON",
  ":fn-import <json>   从 JSON 导入用户函数",
  ":history            查看历史输入",
]);

function createSessionState(options = {}) {
  return {
    angleUnit: options.angleUnit || ANGLE_UNITS.RAD,
    outputMode: options.outputMode || OUTPUT_MODES.PLAIN,
    showLatex: options.showLatex === true,
    history: [],
  };
}

function formatCalculatorError(error) {
  const lines = [];
  const kind = error && error.kind ? error.kind : "Error";
  const code = error && error.code ? error.code : "UNKNOWN";
  const message = error && error.message ? error.message : "发生未知错误。";
  lines.push(`错误 [${kind}/${code}] ${message}`);

  if (error && error.position && typeof error.position.start === "number") {
    lines.push(`位置: ${error.position.start}-${error.position.end}`);
  }

  if (error && error.hint) {
    lines.push(`提示: ${error.hint}`);
  }

  return lines;
}

function createContextFromState(state, userStore) {
  return {
    functions: userStore.toDefinitionTable(),
    options: {
      angleUnit: state.angleUnit,
      outputMode: state.outputMode,
    },
  };
}

function buildFunctionListLines(userStore) {
  const registry = createFunctionRegistry({
    userDefinitions: userStore.toDefinitionTable(),
  });
  const definitions = registry.listFunctions();

  if (definitions.length === 0) {
    return ["当前没有可用函数。"];
  }

  const lines = ["可用函数："];

  for (const definition of definitions) {
    const parameters = definition.parameters.map((parameter) => parameter.name).join(", ");
    const kindLabel = definition.kind === "builtin" ? "内建" : "用户";
    lines.push(`- ${definition.name}(${parameters}) [${kindLabel}]`);
  }

  return lines;
}

function buildHistoryLines(history) {
  if (history.length === 0) {
    return ["历史记录为空。"];
  }

  return history.map((entry, index) => `${index + 1}. ${entry}`);
}

function parseCommand(input) {
  const source = input.slice(1).trim();
  const firstWhitespaceIndex = source.search(/\s/u);

  if (firstWhitespaceIndex < 0) {
    return {
      command: source,
      argument: "",
    };
  }

  return {
    command: source.slice(0, firstWhitespaceIndex),
    argument: source.slice(firstWhitespaceIndex + 1).trim(),
  };
}

function parseFunctionDefinitionArgument(argument) {
  const match = /^(?<name>[a-z][a-z0-9_]*)\s*\((?<params>[^)]*)\)\s*=\s*(?<body>.+)$/u.exec(argument);

  if (!match || !match.groups) {
    throw new Error("函数定义格式必须是 <name>(<params>) = <expr>。");
  }

  const paramsSource = match.groups.params.trim();

  return {
    name: match.groups.name,
    parameters: paramsSource ? paramsSource.split(",").map((item) => item.trim()) : [],
    bodySource: match.groups.body.trim(),
  };
}

function createCliSession(options = {}) {
  const state = createSessionState(options);
  const userStore = options.userStore ||
    createPersistentUserFunctionStore({
      store: createInMemoryUserFunctionStore({
        definitions: options.userDefinitions || {},
      }),
      persistence: options.persistence || null,
      autoLoad: options.autoLoadUserFunctions !== false,
    });

  function setMode(mode) {
    if (!Object.values(OUTPUT_MODES).includes(mode)) {
      return {
        kind: "error",
        lines: [`不支持的输出模式: ${mode}`],
      };
    }

    state.outputMode = mode;
    return {
      kind: "command",
      lines: [`输出模式已切换为 ${mode}`],
    };
  }

  function setAngleUnit(unit) {
    if (!Object.values(ANGLE_UNITS).includes(unit)) {
      return {
        kind: "error",
        lines: [`不支持的角度单位: ${unit}`],
      };
    }

    state.angleUnit = unit;
    return {
      kind: "command",
      lines: [`角度单位已切换为 ${unit}`],
    };
  }

  function setLatexMode(flag) {
    if (flag !== "on" && flag !== "off") {
      return {
        kind: "error",
        lines: ["LaTeX 开关只支持 on 或 off。"],
      };
    }

    state.showLatex = flag === "on";
    return {
      kind: "command",
      lines: [`LaTeX 输出已${state.showLatex ? "开启" : "关闭"}`],
    };
  }

  function saveUserFunction(argument) {
    try {
      const spec = parseFunctionDefinitionArgument(argument);
      const replacing = userStore.has(spec.name);
      const definition = userStore.define(spec, { replace: replacing });
      const parameterList = definition.parameters.map((parameter) => parameter.name).join(", ");

      return {
        kind: "command",
        lines: [
          `${replacing ? "已更新" : "已保存"}用户函数 ${definition.name}(${parameterList})`,
          `公式: ${definition.metadata.source}`,
        ],
      };
    } catch (error) {
      return {
        kind: "error",
        lines: formatCalculatorError(error),
        error,
      };
    }
  }

  function showUserFunction(argument) {
    const name = argument.trim();
    const definition = userStore.get(name);

    if (!definition) {
      return {
        kind: "error",
        lines: [`未找到用户函数: ${name || "(空)"}`],
      };
    }

    const signature = `${definition.name}(${definition.parameters.map((parameter) => parameter.name).join(", ")})`;

    return {
      kind: "command",
      lines: [
        signature,
        `公式: ${definition.metadata.source}`,
      ],
    };
  }

  function deleteUserFunction(argument) {
    const name = argument.trim();

    if (!name) {
      return {
        kind: "error",
        lines: ["删除函数时必须提供函数名。"],
      };
    }

    return userStore.remove(name)
      ? {
          kind: "command",
          lines: [`已删除用户函数 ${name}`],
        }
      : {
          kind: "error",
          lines: [`未找到用户函数: ${name}`],
        };
  }

  function exportUserFunctions() {
    return {
      kind: "command",
      lines: JSON.stringify(userStore.exportRecords(), null, 2).split(/\r?\n/u),
    };
  }

  function importUserFunctions(argument) {
    try {
      const records = JSON.parse(argument);
      const loaded = userStore.loadRecords(records, { replace: true });

      return {
        kind: "command",
        lines: [`已导入 ${loaded.length} 个用户函数。`],
      };
    } catch (error) {
      return {
        kind: "error",
        lines: formatCalculatorError(error),
        error,
      };
    }
  }

  function executeCommand(input) {
    const { command, argument } = parseCommand(input);

    switch (command) {
      case "help":
        return { kind: "command", lines: Array.from(HELP_LINES) };
      case "quit":
      case "exit":
        return { kind: "exit", lines: ["CLI 已退出。"] };
      case "mode":
        return setMode(argument);
      case "angle":
        return setAngleUnit(argument);
      case "latex":
        return setLatexMode(argument);
      case "functions":
        return { kind: "command", lines: buildFunctionListLines(userStore) };
      case "fn-save":
        return saveUserFunction(argument);
      case "fn-show":
        return showUserFunction(argument);
      case "fn-delete":
        return deleteUserFunction(argument);
      case "fn-export":
        return exportUserFunctions();
      case "fn-import":
        return importUserFunctions(argument);
      case "history":
        return { kind: "command", lines: buildHistoryLines(state.history) };
      default:
        return {
          kind: "error",
          lines: [`未知命令: ${command || ""}`, "输入 :help 查看可用命令。"],
        };
    }
  }

  function executeExpression(input) {
    const context = createContextFromState(state, userStore);

    try {
      const result = evaluateSource(input, context);
      const lines = [
        `= ${renderEvaluationResultToText(result, {
          outputMode: state.outputMode,
          angleUnit: state.angleUnit,
        })}`,
      ];

      if (state.showLatex) {
        lines.push(`latex: ${renderEvaluationResultToLatex(result)}`);
      }

      return {
        kind: "result",
        lines,
        result,
      };
    } catch (error) {
      return {
        kind: "error",
        lines: formatCalculatorError(error),
        error,
      };
    }
  }

  function executeLine(rawInput) {
    const input = String(rawInput ?? "");
    const trimmed = input.trim();

    if (!trimmed) {
      return { kind: "empty", lines: [] };
    }

    state.history.push(trimmed);

    if (trimmed.startsWith(":")) {
      return executeCommand(trimmed);
    }

    return executeExpression(trimmed);
  }

  function getSnapshot() {
    return Object.freeze({
      angleUnit: state.angleUnit,
      outputMode: state.outputMode,
      showLatex: state.showLatex,
      history: state.history.slice(),
    });
  }

  return Object.freeze({
    executeLine,
    getSnapshot,
    userStore,
  });
}

function runSessionLines(lines, options = {}) {
  const session = createCliSession(options);
  return lines.map((line) => session.executeLine(line));
}

module.exports = {
  createCliSession,
  runSessionLines,
};
