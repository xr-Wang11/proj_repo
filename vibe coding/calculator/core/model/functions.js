"use strict";

const {
  FUNCTION_KINDS,
} = require("./constants");
const { isAstNode } = require("./ast");
const {
  IDENTIFIER_PATTERN,
  getReservedGroup,
  validateVariableName,
} = require("./identifierRules");
const {
  ensureNonEmptyString,
  ensurePlainObject,
  ensureString,
} = require("./shared");

function validateCallableName(name, kind) {
  const normalizedName = ensureNonEmptyString(name, "function.name");

  if (!IDENTIFIER_PATTERN.test(normalizedName)) {
    throw new TypeError("Function names must start with a lowercase letter and use only lowercase letters, digits, or underscores.");
  }

  const reservedGroup = getReservedGroup(normalizedName);

  if (kind === FUNCTION_KINDS.USER_DEFINED && reservedGroup) {
    throw new RangeError(`Function name "${normalizedName}" is reserved for ${reservedGroup}.`);
  }

  return normalizedName;
}

function createFunctionParameter({
  name,
  description = "",
} = {}) {
  const validation = validateVariableName(name);

  if (!validation.valid) {
    throw new TypeError(`Invalid parameter name "${name}": ${validation.reasons.join(" ")}`);
  }

  return Object.freeze({
    name: validation.normalizedName,
    description: ensureString(description, "functionParameter.description"),
  });
}

function normalizeParameters(parameters = []) {
  if (!Array.isArray(parameters)) {
    throw new TypeError("function.parameters must be an array.");
  }

  const normalizedParameters = parameters.map((parameter) =>
    typeof parameter === "string"
      ? createFunctionParameter({ name: parameter })
      : createFunctionParameter(parameter)
  );

  const seenNames = new Set();

  for (const parameter of normalizedParameters) {
    if (seenNames.has(parameter.name)) {
      throw new RangeError(`Duplicate function parameter "${parameter.name}" is not allowed.`);
    }

    seenNames.add(parameter.name);
  }

  return Object.freeze(normalizedParameters);
}

function createFunctionMetadata(metadata = {}) {
  ensurePlainObject(metadata, "function.metadata");

  return Object.freeze({
    description: typeof metadata.description === "string" ? metadata.description : "",
    supportsComplex: metadata.supportsComplex !== false,
    affectsDisplay: Boolean(metadata.affectsDisplay),
    source: typeof metadata.source === "string" ? metadata.source : "",
    tags: Array.isArray(metadata.tags) ? Object.freeze(metadata.tags.slice()) : Object.freeze([]),
  });
}

function createBuiltinFunctionDefinition({
  name,
  parameters = [],
  executor,
  metadata = {},
} = {}) {
  if (typeof executor !== "function") {
    throw new TypeError("builtinFunction.executor must be a function.");
  }

  return Object.freeze({
    kind: FUNCTION_KINDS.BUILTIN,
    name: validateCallableName(name, FUNCTION_KINDS.BUILTIN),
    parameters: normalizeParameters(parameters),
    bodyAst: null,
    executor,
    metadata: createFunctionMetadata(metadata),
  });
}

function createUserFunctionDefinition({
  name,
  parameters = [],
  bodyAst,
  metadata = {},
} = {}) {
  if (!isAstNode(bodyAst)) {
    throw new TypeError("userFunction.bodyAst must be an AST node.");
  }

  return Object.freeze({
    kind: FUNCTION_KINDS.USER_DEFINED,
    name: validateCallableName(name, FUNCTION_KINDS.USER_DEFINED),
    parameters: normalizeParameters(parameters),
    bodyAst,
    executor: null,
    metadata: createFunctionMetadata(metadata),
  });
}

function isFunctionDefinition(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      Object.values(FUNCTION_KINDS).includes(value.kind) &&
      typeof value.name === "string" &&
      Array.isArray(value.parameters)
  );
}

module.exports = {
  createBuiltinFunctionDefinition,
  createFunctionMetadata,
  createFunctionParameter,
  createUserFunctionDefinition,
  isFunctionDefinition,
  normalizeParameters,
};
