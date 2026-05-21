"use strict";

const MAX_IDENTIFIER_LENGTH = 32;
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

const RESERVED_GROUPS = {
  constants: ["pi", "e", "i", "j"],
  angleUnits: ["deg", "rad"],
  builtins: [
    "sin",
    "cos",
    "tan",
    "sqrt",
    "exp",
    "lg",
    "ln",
    "abs",
    "arg",
    "re",
    "im",
    "conj",
    "rect",
    "polar",
    "to_rect",
    "to_polar",
  ],
  futureCommands: ["ans", "history"],
};

const RESERVED_LOOKUP = Object.entries(RESERVED_GROUPS).reduce(
  (lookup, [groupName, names]) => {
    for (const name of names) {
      lookup[name] = groupName;
    }
    return lookup;
  },
  {}
);

const RULE_SUMMARY = [
  "只能使用小写字母、数字和下划线。",
  "必须以字母开头。",
  "长度不能超过 32 个字符。",
  "不能以下划线结尾。",
  "不能出现连续下划线。",
  "不能使用 pi、i、j、sin、rect、deg 等保留名称。",
];

function buildSuccessMessage(name) {
  return `"${name}" 可以作为用户自定义变量名使用。`;
}

function buildReservedMessage(name, groupName) {
  const groupLabelMap = {
    constants: "常量",
    angleUnits: "角度单位",
    builtins: "内建函数",
    futureCommands: "预留会话名称",
  };

  const label = groupLabelMap[groupName] || groupName;
  return `"${name}" 是${label}保留名称，不能重复作为变量名使用。`;
}

function validateVariableName(name) {
  const reasons = [];
  const rawName = String(name ?? "");
  const trimmedName = rawName.trim();

  if (trimmedName.length === 0) {
    reasons.push("变量名不能为空。");
  }

  if (rawName !== trimmedName) {
    reasons.push("变量名前后不能包含空格。");
  }

  if (trimmedName.length > MAX_IDENTIFIER_LENGTH) {
    reasons.push(`变量名长度不能超过 ${MAX_IDENTIFIER_LENGTH} 个字符。`);
  }

  if (trimmedName.length > 0 && !IDENTIFIER_PATTERN.test(trimmedName)) {
    reasons.push(
      "变量名必须以小写字母开头，且只能包含小写字母、数字或下划线。"
    );
  }

  if (trimmedName.endsWith("_")) {
    reasons.push("变量名不能以下划线结尾。");
  }

  if (trimmedName.includes("__")) {
    reasons.push("变量名不能包含连续下划线。");
  }

  if (RESERVED_LOOKUP[trimmedName]) {
    reasons.push(buildReservedMessage(trimmedName, RESERVED_LOOKUP[trimmedName]));
  }

  return {
    valid: reasons.length === 0,
    normalizedName: trimmedName,
    message:
      reasons.length === 0 ? buildSuccessMessage(trimmedName) : "变量名不合法。",
    reasons,
    rules: RULE_SUMMARY.slice(),
  };
}

function getReservedGroups() {
  return JSON.parse(JSON.stringify(RESERVED_GROUPS));
}

function getReservedGroup(name) {
  const normalizedName = String(name ?? "").trim();
  return RESERVED_LOOKUP[normalizedName] || null;
}

function isReservedIdentifier(name) {
  return getReservedGroup(name) !== null;
}

const api = {
  MAX_IDENTIFIER_LENGTH,
  IDENTIFIER_PATTERN,
  RULE_SUMMARY,
  RESERVED_GROUPS,
  getReservedGroup,
  isReservedIdentifier,
  validateVariableName,
  getReservedGroups,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}

if (typeof window !== "undefined") {
  window.IdentifierRules = api;
}
