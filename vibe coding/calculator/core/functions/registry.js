"use strict";

const {
  FUNCTION_KINDS,
  createArityError,
  createNameError,
  isFunctionDefinition,
} = require("../model");
const { DEFAULT_BUILTIN_FUNCTIONS } = require("./builtins");

function cloneDefinitionTable(source, label) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError(`${label} must be a plain object.`);
  }

  const table = {};

  for (const [name, definition] of Object.entries(source)) {
    if (!isFunctionDefinition(definition)) {
      throw new TypeError(`${label}.${name} is not a valid function definition.`);
    }

    table[name] = definition;
  }

  return table;
}

function sortByName(definitions) {
  return definitions.slice().sort((left, right) => left.name.localeCompare(right.name));
}

function createFunctionRegistry({
  builtinDefinitions = DEFAULT_BUILTIN_FUNCTIONS,
  userDefinitions = {},
} = {}) {
  const builtins = cloneDefinitionTable(builtinDefinitions, "builtinDefinitions");
  const users = cloneDefinitionTable(userDefinitions, "userDefinitions");

  for (const name of Object.keys(users)) {
    if (builtins[name]) {
      throw new RangeError(`Function name "${name}" is already occupied by a builtin definition.`);
    }
  }

  function assertDefinition(definition, expectedKind, label) {
    if (!isFunctionDefinition(definition)) {
      throw new TypeError(`${label} must be a valid function definition.`);
    }

    if (definition.kind !== expectedKind) {
      throw new TypeError(`${label} must have kind "${expectedKind}".`);
    }
  }

  function registerBuiltin(definition) {
    assertDefinition(definition, FUNCTION_KINDS.BUILTIN, "builtin definition");

    if (builtins[definition.name] || users[definition.name]) {
      throw new RangeError(`Function "${definition.name}" is already registered.`);
    }

    builtins[definition.name] = definition;
    return definition;
  }

  function registerUserFunction(definition, options = {}) {
    assertDefinition(definition, FUNCTION_KINDS.USER_DEFINED, "user function definition");
    const replace = options.replace === true;

    if (builtins[definition.name]) {
      throw createNameError({
        code: "NAME_BUILTIN_FUNCTION_CONFLICT",
        message: `函数名 ${definition.name} 已被内建函数占用。`,
        context: { name: definition.name },
        hint: "请换一个用户函数名，避免覆盖内建函数。",
      });
    }

    if (users[definition.name] && !replace) {
      throw createNameError({
        code: "NAME_DUPLICATE_USER_FUNCTION",
        message: `用户函数 ${definition.name} 已存在。`,
        context: { name: definition.name },
        hint: "请换一个新的函数名，或先显式替换旧定义。",
      });
    }

    users[definition.name] = definition;
    return definition;
  }

  function removeUserFunction(name) {
    if (!users[name]) {
      return false;
    }

    delete users[name];
    return true;
  }

  function hasFunction(name) {
    return Boolean(builtins[name] || users[name]);
  }

  function getFunction(name) {
    return users[name] || builtins[name] || null;
  }

  function requireFunction(name) {
    const definition = getFunction(name);

    if (!definition) {
      throw createNameError({
        code: "NAME_UNKNOWN_FUNCTION",
        message: `未定义的函数：${name}。`,
        context: { name },
        hint: "请检查函数名是否正确，或确认该函数是否已经注册。",
      });
    }

    return definition;
  }

  function listFunctions(options = {}) {
    const includeBuiltins = options.includeBuiltins !== false;
    const includeUsers = options.includeUsers !== false;
    const definitions = [];

    if (includeBuiltins) {
      definitions.push(...Object.values(builtins));
    }

    if (includeUsers) {
      definitions.push(...Object.values(users));
    }

    return sortByName(definitions);
  }

  function getBuiltinDefinitions() {
    return Object.freeze({ ...builtins });
  }

  function getUserDefinitions() {
    return Object.freeze({ ...users });
  }

  function toTable() {
    return Object.freeze({
      ...builtins,
      ...users,
    });
  }

  function validateInvocationArity(name, actualCount, { exact = null, min = null, max = null } = {}) {
    if (exact !== null && actualCount !== exact) {
      throw createArityError({
        code: "ARITY_EXACT_MISMATCH",
        message: `函数 ${name} 需要 ${exact} 个参数，实际收到 ${actualCount} 个。`,
        context: { functionName: name, expectedCount: exact, actualCount },
        hint: "请检查函数参数个数是否正确。",
      });
    }

    if ((min !== null && actualCount < min) || (max !== null && actualCount > max)) {
      throw createArityError({
        code: "ARITY_RANGE_MISMATCH",
        message: `函数 ${name} 需要 ${min} 到 ${max} 个参数，实际收到 ${actualCount} 个。`,
        context: { functionName: name, minCount: min, maxCount: max, actualCount },
        hint: "请检查函数参数个数是否正确。",
      });
    }
  }

  return Object.freeze({
    getBuiltinDefinitions,
    getFunction,
    getUserDefinitions,
    hasFunction,
    listFunctions,
    registerBuiltin,
    registerUserFunction,
    removeUserFunction,
    requireFunction,
    toTable,
    validateInvocationArity,
  });
}

module.exports = {
  createFunctionRegistry,
};
