"use strict";

const {
  ANGLE_UNITS,
  AST_NODE_TYPES,
  CONVERSION_TARGETS,
} = require("./constants");
const { createSpan, mergeSpans, normalizeSpan } = require("./span");
const {
  ensureFiniteNumber,
  ensureNonEmptyString,
  ensureOneOf,
} = require("./shared");

function createBaseNode(kind, span) {
  return {
    kind: ensureOneOf(kind, AST_NODE_TYPES, "node.kind"),
    span: normalizeSpan(span),
  };
}

function createNumberLiteral({ raw, value, span }) {
  return Object.freeze({
    ...createBaseNode(AST_NODE_TYPES.NUMBER_LITERAL, span),
    raw: ensureNonEmptyString(raw, "numberLiteral.raw"),
    value: ensureFiniteNumber(value, "numberLiteral.value"),
  });
}

function createIdentifier({ name, span }) {
  return Object.freeze({
    ...createBaseNode(AST_NODE_TYPES.IDENTIFIER, span),
    name: ensureNonEmptyString(name, "identifier.name"),
  });
}

function normalizeIdentifierNode(candidate, label) {
  if (isAstNode(candidate) && candidate.kind === AST_NODE_TYPES.IDENTIFIER) {
    return candidate;
  }

  if (typeof candidate === "string") {
    return createIdentifier({
      name: candidate,
      span: createSpan(0, 0),
    });
  }

  throw new TypeError(`${label} must be an Identifier node or a string.`);
}

function createUnaryExpression({ operator, argument, span }) {
  if (!isAstNode(argument)) {
    throw new TypeError("unaryExpression.argument must be an AST node.");
  }

  return Object.freeze({
    ...createBaseNode(AST_NODE_TYPES.UNARY_EXPRESSION, span || argument.span),
    operator: ensureNonEmptyString(operator, "unaryExpression.operator"),
    argument,
  });
}

function createBinaryExpression({ operator, left, right, span }) {
  if (!isAstNode(left)) {
    throw new TypeError("binaryExpression.left must be an AST node.");
  }

  if (!isAstNode(right)) {
    throw new TypeError("binaryExpression.right must be an AST node.");
  }

  return Object.freeze({
    ...createBaseNode(AST_NODE_TYPES.BINARY_EXPRESSION, span || mergeSpans(left.span, right.span)),
    operator: ensureNonEmptyString(operator, "binaryExpression.operator"),
    left,
    right,
  });
}

function createFunctionCall({ callee, args, span }) {
  const normalizedCallee = normalizeIdentifierNode(callee, "functionCall.callee");
  const normalizedArgs = Array.isArray(args) ? args.slice() : [];

  for (const argument of normalizedArgs) {
    if (!isAstNode(argument)) {
      throw new TypeError("functionCall.args must contain only AST nodes.");
    }
  }

  const lastArgumentSpan =
    normalizedArgs.length > 0 ? normalizedArgs[normalizedArgs.length - 1].span : normalizedCallee.span;

  return Object.freeze({
    ...createBaseNode(
      AST_NODE_TYPES.FUNCTION_CALL,
      span || mergeSpans(normalizedCallee.span, lastArgumentSpan)
    ),
    callee: normalizedCallee,
    args: Object.freeze(normalizedArgs),
  });
}

function createConversionExpression({ source, targetForm, angleUnit = null, span }) {
  if (!isAstNode(source)) {
    throw new TypeError("conversionExpression.source must be an AST node.");
  }

  return Object.freeze({
    ...createBaseNode(AST_NODE_TYPES.CONVERSION_EXPRESSION, span || source.span),
    source,
    targetForm: ensureOneOf(targetForm, CONVERSION_TARGETS, "conversionExpression.targetForm"),
    angleUnit: angleUnit === null ? null : ensureOneOf(angleUnit, ANGLE_UNITS, "conversionExpression.angleUnit"),
  });
}

function isAstNode(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      Object.values(AST_NODE_TYPES).includes(value.kind) &&
      value.span
  );
}

module.exports = {
  createBinaryExpression,
  createConversionExpression,
  createFunctionCall,
  createIdentifier,
  createNumberLiteral,
  createUnaryExpression,
  isAstNode,
};
