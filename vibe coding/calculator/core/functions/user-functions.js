"use strict";

const {
  AST_NODE_TYPES,
  createNameError,
  createUnsupportedFeatureError,
  createUserFunctionDefinition,
  isFunctionDefinition,
} = require("../model");
const { parseSource } = require("../parser");
const { createFunctionRegistry } = require("./registry");

function walkAst(node, visitor) {
  visitor(node);

  switch (node.kind) {
    case AST_NODE_TYPES.NUMBER_LITERAL:
    case AST_NODE_TYPES.IDENTIFIER:
      return;
    case AST_NODE_TYPES.UNARY_EXPRESSION:
      walkAst(node.argument, visitor);
      return;
    case AST_NODE_TYPES.BINARY_EXPRESSION:
      walkAst(node.left, visitor);
      walkAst(node.right, visitor);
      return;
    case AST_NODE_TYPES.FUNCTION_CALL:
      walkAst(node.callee, visitor);
      for (const argument of node.args) {
        walkAst(argument, visitor);
      }
      return;
    case AST_NODE_TYPES.CONVERSION_EXPRESSION:
      walkAst(node.source, visitor);
      return;
    default:
      throw createUnsupportedFeatureError({
        code: "USER_FUNCTION_UNSUPPORTED_AST_NODE",
        message: `用户函数分析阶段遇到了不支持的节点类型：${node.kind}。`,
        context: { kind: node.kind },
      });
  }
}

function collectReferencedFunctionNames(bodyAst) {
  const names = new Set();

  walkAst(bodyAst, (node) => {
    if (node.kind === AST_NODE_TYPES.FUNCTION_CALL && node.callee && typeof node.callee.name === "string") {
      names.add(node.callee.name);
    }
  });

  return Object.freeze(Array.from(names).sort());
}

function assertNoDirectRecursion(functionName, bodyAst) {
  let foundDirectRecursion = false;
  let recursionSpan = null;

  walkAst(bodyAst, (node) => {
    if (node.kind === AST_NODE_TYPES.FUNCTION_CALL && node.callee.name === functionName) {
      foundDirectRecursion = true;
      recursionSpan = node.callee.span;
    }
  });

  if (foundDirectRecursion) {
    throw createUnsupportedFeatureError({
      code: "USER_FUNCTION_DIRECT_RECURSION_UNSUPPORTED",
      message: `当前阶段不支持用户函数 ${functionName} 直接递归调用自身。`,
      position: recursionSpan,
      context: { name: functionName },
      hint: "请先改写公式，避免在函数体中直接调用自身。",
    });
  }
}

function assertNoRecursiveCycle(definitions, changedFunctionName = "") {
  const visiting = new Set();
  const visited = new Set();
  const definitionTable = definitions || {};

  function visit(name, stack) {
    if (visited.has(name) || !definitionTable[name]) {
      return;
    }

    if (visiting.has(name)) {
      const cycleStart = stack.indexOf(name);
      const cyclePath = cycleStart >= 0 ? stack.slice(cycleStart).concat(name) : stack.concat(name);

      throw createUnsupportedFeatureError({
        code: "USER_FUNCTION_RECURSION_CYCLE_UNSUPPORTED",
        message: `当前阶段不支持用户函数之间形成递归调用环：${cyclePath.join(" -> ")}。`,
        context: {
          cyclePath,
          changedFunctionName,
        },
        hint: "请改写函数依赖关系，避免用户函数直接或间接循环调用。",
      });
    }

    visiting.add(name);

    const dependencies = collectReferencedFunctionNames(definitionTable[name].bodyAst)
      .filter((dependencyName) => Boolean(definitionTable[dependencyName]));

    for (const dependencyName of dependencies) {
      visit(dependencyName, stack.concat(name));
    }

    visiting.delete(name);
    visited.add(name);
  }

  for (const name of Object.keys(definitionTable)) {
    visit(name, []);
  }
}

function compileUserFunctionDefinition({
  name,
  parameters = [],
  bodySource,
  metadata = {},
} = {}) {
  if (typeof bodySource !== "string" || !bodySource.trim()) {
    throw new TypeError("userFunction.bodySource must be a non-empty string.");
  }

  const bodyAst = parseSource(bodySource);
  assertNoDirectRecursion(name, bodyAst);

  return createUserFunctionDefinition({
    name,
    parameters,
    bodyAst,
    metadata: {
      ...metadata,
      source: bodySource,
    },
  });
}

function validateUserFunctionSpec(spec, options = {}) {
  const registry = options.registry || createFunctionRegistry();

  try {
    const definition = compileUserFunctionDefinition(spec);

    if (registry.hasFunction(definition.name)) {
      throw createNameError({
        code: "NAME_DUPLICATE_FUNCTION",
        message: `函数名 ${definition.name} 已存在，不能重复定义。`,
        context: { name: definition.name },
        hint: "请更换用户函数名，或在替换时显式开启 replace。",
      });
    }

    return Object.freeze({
      valid: true,
      definition,
      error: null,
    });
  } catch (error) {
    return Object.freeze({
      valid: false,
      definition: null,
      error,
    });
  }
}

function serializeUserFunctionDefinition(definition) {
  if (!isFunctionDefinition(definition) || definition.kind !== "user_defined") {
    throw new TypeError("serializeUserFunctionDefinition.definition must be a user-defined function definition.");
  }

  return Object.freeze({
    name: definition.name,
    parameters: definition.parameters.map((parameter) => ({
      name: parameter.name,
      description: parameter.description,
    })),
    bodySource: definition.metadata.source || "",
    metadata: {
      description: definition.metadata.description,
      supportsComplex: definition.metadata.supportsComplex,
      affectsDisplay: definition.metadata.affectsDisplay,
      source: definition.metadata.source,
      tags: Array.from(definition.metadata.tags || []),
    },
  });
}

function deserializeUserFunctionRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("deserializeUserFunctionRecord.record must be a plain object.");
  }

  return compileUserFunctionDefinition({
    name: record.name,
    parameters: record.parameters || [],
    bodySource: record.bodySource,
    metadata: record.metadata || {},
  });
}

function normalizeUserDefinitionTable(definitions = {}) {
  if (!definitions || typeof definitions !== "object" || Array.isArray(definitions)) {
    throw new TypeError("definitions must be a plain object.");
  }

  const table = {};

  for (const [name, definition] of Object.entries(definitions)) {
    if (!isFunctionDefinition(definition) || definition.kind !== "user_defined") {
      throw new TypeError(`definitions.${name} is not a valid user function definition.`);
    }

    table[name] = definition;
  }

  return table;
}

function createInMemoryUserFunctionStore({
  definitions = {},
  registry = createFunctionRegistry(),
} = {}) {
  const internalRegistry = registry;
  const table = normalizeUserDefinitionTable(definitions);

  for (const definition of Object.values(table)) {
    if (!internalRegistry.hasFunction(definition.name)) {
      internalRegistry.registerUserFunction(definition);
    }
  }

  function get(name) {
    return table[name] || null;
  }

  function has(name) {
    return Boolean(table[name]);
  }

  function list() {
    return Object.values(table).sort((left, right) => left.name.localeCompare(right.name));
  }

  function save(definition, options = {}) {
    if (!isFunctionDefinition(definition) || definition.kind !== "user_defined") {
      throw new TypeError("save.definition must be a user-defined function definition.");
    }

    const replace = options.replace === true;

    if (table[definition.name] && !replace) {
      throw createNameError({
        code: "NAME_DUPLICATE_USER_FUNCTION",
        message: `用户函数 ${definition.name} 已存在。`,
        context: { name: definition.name },
        hint: "如需覆盖，请显式传入 replace: true。",
      });
    }

    const nextTable = {
      ...table,
      [definition.name]: definition,
    };

    assertNoRecursiveCycle(nextTable, definition.name);

    if (!table[definition.name]) {
      internalRegistry.registerUserFunction(definition);
    } else {
      internalRegistry.registerUserFunction(definition, { replace: true });
    }

    table[definition.name] = definition;
    return definition;
  }

  function define(spec, options = {}) {
    const definition = compileUserFunctionDefinition(spec);
    return save(definition, options);
  }

  function remove(name) {
    if (!table[name]) {
      return false;
    }

    delete table[name];
    if (typeof internalRegistry.removeUserFunction === "function") {
      internalRegistry.removeUserFunction(name);
    }
    return true;
  }

  function exportRecords() {
    return Object.freeze(list().map((definition) => serializeUserFunctionDefinition(definition)));
  }

  function loadRecords(records, options = {}) {
    if (!Array.isArray(records)) {
      throw new TypeError("loadRecords.records must be an array.");
    }

    const loaded = [];

    for (const record of records) {
      loaded.push(save(deserializeUserFunctionRecord(record), options));
    }

    return Object.freeze(loaded);
  }

  function toDefinitionTable() {
    return Object.freeze({ ...table });
  }

  return Object.freeze({
    define,
    exportRecords,
    get,
    has,
    list,
    loadRecords,
    remove,
    save,
    toDefinitionTable,
  });
}

module.exports = {
  assertNoRecursiveCycle,
  assertNoDirectRecursion,
  collectReferencedFunctionNames,
  compileUserFunctionDefinition,
  createInMemoryUserFunctionStore,
  deserializeUserFunctionRecord,
  serializeUserFunctionDefinition,
  validateUserFunctionSpec,
  walkAst,
};
