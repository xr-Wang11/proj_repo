"use strict";

const { ERROR_KINDS } = require("./constants");
const { normalizeSpan } = require("./span");
const {
  ensureNonEmptyString,
  ensureOneOf,
  ensurePlainObject,
} = require("./shared");

function createCalculatorError({
  kind = ERROR_KINDS.MODEL,
  code,
  message,
  position = null,
  context = {},
  hint = "",
  cause = null,
} = {}) {
  ensurePlainObject(context, "calculatorError.context");

  return Object.freeze({
    kind: ensureOneOf(kind, ERROR_KINDS, "calculatorError.kind"),
    code: ensureNonEmptyString(code, "calculatorError.code"),
    message: ensureNonEmptyString(message, "calculatorError.message"),
    position: position === null ? null : normalizeSpan(position),
    context: Object.freeze({ ...context }),
    hint: typeof hint === "string" ? hint : String(hint),
    cause: cause || null,
  });
}

function createLexError(options) {
  return createCalculatorError({
    kind: ERROR_KINDS.LEX,
    ...options,
  });
}

function createParseError(options) {
  return createCalculatorError({
    kind: ERROR_KINDS.PARSE,
    ...options,
  });
}

function createNameError(options) {
  return createCalculatorError({
    kind: ERROR_KINDS.NAME,
    ...options,
  });
}

function createArityError(options) {
  return createCalculatorError({
    kind: ERROR_KINDS.ARITY,
    ...options,
  });
}

function createMathDomainError(options) {
  return createCalculatorError({
    kind: ERROR_KINDS.MATH_DOMAIN,
    ...options,
  });
}

function createConversionError(options) {
  return createCalculatorError({
    kind: ERROR_KINDS.CONVERSION,
    ...options,
  });
}

function createUnsupportedFeatureError(options) {
  return createCalculatorError({
    kind: ERROR_KINDS.UNSUPPORTED_FEATURE,
    ...options,
  });
}

function isCalculatorError(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      Object.values(ERROR_KINDS).includes(value.kind) &&
      typeof value.code === "string" &&
      typeof value.message === "string"
  );
}

module.exports = {
  createArityError,
  createCalculatorError,
  createConversionError,
  createLexError,
  createMathDomainError,
  createNameError,
  createParseError,
  createUnsupportedFeatureError,
  isCalculatorError,
};
