"use strict";

const {
  TOKEN_TYPES,
  createEOFToken,
  createLexError,
  createToken,
} = require("../model");

const SINGLE_CHAR_TOKENS = Object.freeze({
  "(": TOKEN_TYPES.LPAREN,
  ")": TOKEN_TYPES.RPAREN,
  ",": TOKEN_TYPES.COMMA,
  "+": TOKEN_TYPES.OPERATOR,
  "-": TOKEN_TYPES.OPERATOR,
  "*": TOKEN_TYPES.OPERATOR,
  "/": TOKEN_TYPES.OPERATOR,
  "^": TOKEN_TYPES.OPERATOR,
});

function isWhitespace(char) {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function isDigit(char) {
  return char >= "0" && char <= "9";
}

function isIdentifierStart(char) {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char) {
  return /[A-Za-z0-9_]/.test(char);
}

function createLexerState(input) {
  return {
    input,
    length: input.length,
    index: 0,
    tokens: [],
  };
}

function peek(state, offset = 0) {
  const nextIndex = state.index + offset;
  return nextIndex >= state.length ? "" : state.input[nextIndex];
}

function advance(state, count = 1) {
  state.index += count;
}

function addToken(state, type, value, start, end) {
  state.tokens.push(
    createToken({
      type,
      value,
      start,
      end,
    })
  );
}

function failLex(state, code, message, start, end, context = {}, hint = "") {
  throw createLexError({
    code,
    message,
    position: { start, end },
    context,
    hint,
  });
}

function readIdentifier(state) {
  const start = state.index;
  let value = "";

  while (state.index < state.length && isIdentifierPart(peek(state))) {
    value += peek(state);
    advance(state);
  }

  addToken(state, TOKEN_TYPES.IDENTIFIER, value, start, state.index);
}

function readExponentPart(state, start) {
  let exponentText = peek(state);
  advance(state);

  if (peek(state) === "+" || peek(state) === "-") {
    exponentText += peek(state);
    advance(state);
  }

  if (!isDigit(peek(state))) {
    failLex(
      state,
      "LEX_INVALID_EXPONENT",
      "科学计数法的指数部分缺少数字。",
      start,
      state.index,
      { fragment: state.input.slice(start, state.index) },
      "请检查 e 或 E 后是否跟了整数，例如 1e3 或 2.5e-4。"
    );
  }

  while (isDigit(peek(state))) {
    exponentText += peek(state);
    advance(state);
  }

  return exponentText;
}

function readNumber(state) {
  const start = state.index;
  let value = "";
  let hasIntegerPart = false;
  let hasFractionPart = false;

  while (isDigit(peek(state))) {
    hasIntegerPart = true;
    value += peek(state);
    advance(state);
  }

  if (peek(state) === ".") {
    value += ".";
    advance(state);

    while (isDigit(peek(state))) {
      hasFractionPart = true;
      value += peek(state);
      advance(state);
    }
  }

  if (!hasIntegerPart && !hasFractionPart) {
    failLex(
      state,
      "LEX_INVALID_NUMBER",
      "无法识别数字字面量。",
      start,
      state.index,
      { fragment: state.input.slice(start, state.index + 1) },
      "数字可以是整数、小数或科学计数法。"
    );
  }

  if (peek(state) === "e" || peek(state) === "E") {
    value += readExponentPart(state, start);
  }

  addToken(state, TOKEN_TYPES.NUMBER, value, start, state.index);
}

function tokenize(input, options = {}) {
  if (typeof input !== "string") {
    throw new TypeError("tokenize.input must be a string.");
  }

  const state = createLexerState(input);
  const includeEOF = options.includeEOF !== false;

  while (state.index < state.length) {
    const current = peek(state);

    if (isWhitespace(current)) {
      advance(state);
      continue;
    }

    if (isDigit(current) || (current === "." && isDigit(peek(state, 1)))) {
      readNumber(state);
      continue;
    }

    if (isIdentifierStart(current)) {
      readIdentifier(state);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(SINGLE_CHAR_TOKENS, current)) {
      const start = state.index;
      advance(state);
      addToken(state, SINGLE_CHAR_TOKENS[current], current, start, state.index);
      continue;
    }

    failLex(
      state,
      "LEX_INVALID_CHARACTER",
      `发现不支持的字符 "${current}"。`,
      state.index,
      state.index + 1,
      { character: current },
      "当前仅支持数字、字母、下划线、空白、括号、逗号以及 + - * / ^ 运算符。"
    );
  }

  if (includeEOF) {
    state.tokens.push(createEOFToken(state.index));
  }

  return Object.freeze(state.tokens.slice());
}

function tokenizeToDebug(input, options = {}) {
  return tokenize(input, options).map((token) => ({
    type: token.type,
    value: token.value,
    start: token.start,
    end: token.end,
  }));
}

module.exports = {
  tokenize,
  tokenizeToDebug,
};
