const ERROR_MESSAGE_TRANSLATIONS = [
  {
    match(message) {
      return /Cannot add property detail, object is not extensible/u.test(message);
    },
    text: "内部错误：错误对象是只读的，无法补充详情。",
  },
  {
    match(message) {
      return /Cannot read properties of undefined/u.test(message);
    },
    text: "内部错误：程序读取了未定义的数据。",
  },
  {
    match(message) {
      return /Assignment to constant variable/u.test(message);
    },
    text: "内部错误：尝试修改只读常量。",
  },
  {
    match(message) {
      return /Value cannot be converted to ComplexValue/u.test(message);
    },
    text: "内部错误：值无法转换为复数。",
  },
  {
    match(message) {
      return /Unhandled promise rejection/u.test(message);
    },
    text: "出现了未处理的 Promise 异常。",
  },
];

export function translateErrorMessage(message) {
  const source = String(message ?? "").trim();

  if (!source) {
    return "发生了未知错误。";
  }

  const matched = ERROR_MESSAGE_TRANSLATIONS.find((item) => item.match(source));
  return matched ? matched.text : source;
}

export function summarizeDiagnosticLevel(level) {
  switch (level) {
    case "error":
      return "错误";
    case "warn":
      return "警告";
    default:
      return "信息";
  }
}

export function summarizeDiagnosticCategory(category) {
  switch (category) {
    case "app":
      return "应用";
    case "diagnostics":
      return "诊断";
    case "evaluation":
      return "求值";
    case "function":
      return "函数";
    case "function-transfer":
      return "函数导入导出";
    case "input":
      return "输入";
    case "mode":
      return "模式";
    case "parse":
      return "解析";
    case "promise":
      return "异步";
    case "system":
      return "方程组";
    case "ui-action":
      return "界面";
    case "vue":
      return "Vue";
    case "window":
      return "窗口";
    default:
      return String(category || "其他");
  }
}
