"use strict";

const TOKEN_TYPES = Object.freeze({
  NUMBER: "NUMBER",
  IDENTIFIER: "IDENTIFIER",
  OPERATOR: "OPERATOR",
  LPAREN: "LPAREN",
  RPAREN: "RPAREN",
  COMMA: "COMMA",
  EOF: "EOF",
});

const AST_NODE_TYPES = Object.freeze({
  NUMBER_LITERAL: "NumberLiteral",
  IDENTIFIER: "Identifier",
  UNARY_EXPRESSION: "UnaryExpression",
  BINARY_EXPRESSION: "BinaryExpression",
  FUNCTION_CALL: "FunctionCall",
  CONVERSION_EXPRESSION: "ConversionExpression",
});

const VALUE_TYPES = Object.freeze({
  COMPLEX: "ComplexValue",
  PHASOR: "PhasorValue",
});

const DISPLAY_TYPES = Object.freeze({
  REAL: "real",
  COMPLEX_RECT: "complex_rect",
  COMPLEX_POLAR: "complex_polar",
  PHASOR: "phasor",
  ERROR: "error",
});

const OUTPUT_MODES = Object.freeze({
  PLAIN: "plain",
  RECT: "rect",
  POLAR: "polar",
  DEBUG: "debug",
});

const ANGLE_UNITS = Object.freeze({
  DEG: "deg",
  RAD: "rad",
});

const FUNCTION_KINDS = Object.freeze({
  BUILTIN: "builtin",
  USER_DEFINED: "user_defined",
});

const CONVERSION_TARGETS = Object.freeze({
  RECT: "rect",
  POLAR: "polar",
});

const ERROR_KINDS = Object.freeze({
  MODEL: "ModelError",
  LEX: "LexError",
  PARSE: "ParseError",
  NAME: "NameError",
  ARITY: "ArityError",
  MATH_DOMAIN: "MathDomainError",
  CONVERSION: "ConversionError",
  UNSUPPORTED_FEATURE: "UnsupportedFeatureError",
});

const DEFAULT_PRECISION = 12;
const DEFAULT_ZERO_TOLERANCE = 1e-12;
const DEFAULT_MAX_IDENTIFIER_LENGTH = 32;

module.exports = {
  ANGLE_UNITS,
  AST_NODE_TYPES,
  CONVERSION_TARGETS,
  DEFAULT_MAX_IDENTIFIER_LENGTH,
  DEFAULT_PRECISION,
  DEFAULT_ZERO_TOLERANCE,
  DISPLAY_TYPES,
  ERROR_KINDS,
  FUNCTION_KINDS,
  OUTPUT_MODES,
  TOKEN_TYPES,
  VALUE_TYPES,
};
