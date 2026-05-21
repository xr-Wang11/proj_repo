"use strict";

const {
  createComplexValue,
  createEvaluationOptions,
  DEFAULT_EVALUATION_OPTIONS,
  isComplexValue,
} = require("./values");
const { isFunctionDefinition } = require("./functions");
const { ensurePlainObject } = require("./shared");

const DEFAULT_CONSTANTS = Object.freeze({
  pi: createComplexValue({ re: Math.PI, im: 0 }),
  e: createComplexValue({ re: Math.E, im: 0 }),
  i: createComplexValue({ re: 0, im: 1 }),
  j: createComplexValue({ re: 0, im: 1 }),
});

function cloneValueRecord(record, label, validator) {
  ensurePlainObject(record, label);
  const normalizedRecord = {};

  for (const [key, value] of Object.entries(record)) {
    if (!validator(value)) {
      throw new TypeError(`${label}.${key} is not a valid value.`);
    }

    normalizedRecord[key] = value;
  }

  return Object.freeze(normalizedRecord);
}

function createEvaluationContext({
  constants = DEFAULT_CONSTANTS,
  variables = {},
  functions = {},
  options = DEFAULT_EVALUATION_OPTIONS,
} = {}) {
  ensurePlainObject(functions, "evaluationContext.functions");

  const normalizedFunctions = {};

  for (const [name, definition] of Object.entries(functions)) {
    if (!isFunctionDefinition(definition)) {
      throw new TypeError(`evaluationContext.functions.${name} is not a valid function definition.`);
    }

    normalizedFunctions[name] = definition;
  }

  return Object.freeze({
    constants: cloneValueRecord(constants, "evaluationContext.constants", isComplexValue),
    variables: cloneValueRecord(variables, "evaluationContext.variables", isComplexValue),
    functions: Object.freeze(normalizedFunctions),
    options: createEvaluationOptions(options),
  });
}

module.exports = {
  DEFAULT_CONSTANTS,
  createEvaluationContext,
};
