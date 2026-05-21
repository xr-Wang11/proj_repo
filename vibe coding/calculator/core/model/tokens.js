"use strict";

const { TOKEN_TYPES } = require("./constants");
const { createSpan } = require("./span");
const {
  ensureNonNegativeInteger,
  ensureOneOf,
  ensureString,
} = require("./shared");

function createToken({ type, value, start, end }) {
  const normalizedType = ensureOneOf(type, TOKEN_TYPES, "token.type");
  const normalizedValue = ensureString(value, "token.value");
  const normalizedStart = ensureNonNegativeInteger(start, "token.start");
  const normalizedEnd = ensureNonNegativeInteger(end, "token.end");

  if (normalizedEnd < normalizedStart) {
    throw new RangeError("token.end cannot be smaller than token.start.");
  }

  return Object.freeze({
    type: normalizedType,
    value: normalizedValue,
    start: normalizedStart,
    end: normalizedEnd,
    span: createSpan(normalizedStart, normalizedEnd),
  });
}

function createEOFToken(position) {
  const normalizedPosition = ensureNonNegativeInteger(position, "token.position");
  return createToken({
    type: TOKEN_TYPES.EOF,
    value: "",
    start: normalizedPosition,
    end: normalizedPosition,
  });
}

function isToken(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      Object.values(TOKEN_TYPES).includes(value.type) &&
      typeof value.value === "string" &&
      Number.isInteger(value.start) &&
      Number.isInteger(value.end)
  );
}

module.exports = {
  createEOFToken,
  createToken,
  isToken,
};
