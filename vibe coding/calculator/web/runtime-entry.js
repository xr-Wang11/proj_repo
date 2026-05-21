"use strict";

const { evaluate } = require("../core/evaluator");
const { toPhasorValue } = require("../core/math");
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
const { BUTTON_DEFINITIONS, createWebInputProtocol } = require("./input-protocol");
const { createLocalStorageRecordPersistence } = require("./user-function-storage");

module.exports = {
  BUTTON_DEFINITIONS,
  createInMemoryUserFunctionStore,
  createLocalStorageRecordPersistence,
  createPersistentUserFunctionStore,
  createWebInputProtocol,
  evaluate,
  parseSource,
  renderAstToLatex,
  renderEvaluationResultToLatex,
  renderEvaluationResultToText,
  toPhasorValue,
};
