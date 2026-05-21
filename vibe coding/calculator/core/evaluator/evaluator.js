"use strict";

const {
  AST_NODE_TYPES,
  DEFAULT_CONSTANTS,
  DISPLAY_TYPES,
  createComplexValue,
  createArityError,
  createEvaluationContext,
  createEvaluationResult,
  createNameError,
  createUnsupportedFeatureError,
  isCalculatorError,
} = require("../model");
const {
  addComplex,
  asComplexValue,
  divideComplex,
  multiplyComplex,
  powerComplex,
  subtractComplex,
  toPhasorValue,
} = require("../math");
const { parseSource } = require("../parser");
const {
  createFunctionRegistry,
  createDisplayMetadataForPolar,
} = require("../functions");

const IMAGINARY_UNITS = Object.freeze(["i", "j"]);

function collectImaginaryUnitsFromAst(node, definitionTable, state = null) {
  if (!node || typeof node !== "object") {
    return state || new Set();
  }

  const usage = state || new Set();

  switch (node.kind) {
    case AST_NODE_TYPES.IDENTIFIER:
      if (IMAGINARY_UNITS.includes(node.name)) {
        usage.add(node.name);
      }
      return usage;
    case AST_NODE_TYPES.UNARY_EXPRESSION:
      return collectImaginaryUnitsFromAst(node.argument, definitionTable, usage);
    case AST_NODE_TYPES.BINARY_EXPRESSION:
      collectImaginaryUnitsFromAst(node.left, definitionTable, usage);
      collectImaginaryUnitsFromAst(node.right, definitionTable, usage);
      return usage;
    case AST_NODE_TYPES.FUNCTION_CALL: {
      for (const argument of node.args) {
        collectImaginaryUnitsFromAst(argument, definitionTable, usage);
      }

      const definition = definitionTable[node.callee?.name];

      if (definition && definition.kind === "user_defined" && definition.bodyAst) {
        collectImaginaryUnitsFromAst(definition.bodyAst, definitionTable, usage);
      }

      return usage;
    }
    case AST_NODE_TYPES.CONVERSION_EXPRESSION:
      return collectImaginaryUnitsFromAst(node.source, definitionTable, usage);
    default:
      return usage;
  }
}

function resolvePreferredImaginaryUnit(ast, definitionTable) {
  const usage = collectImaginaryUnitsFromAst(ast, definitionTable);

  if (usage.has("i") && usage.has("j")) {
    throw createUnsupportedFeatureError({
      code: "IMAGINARY_UNIT_MIXED",
      message: "表达式中不能混用 i 和 j 作为虚数单位。",
      context: {
        imaginaryUnits: Array.from(usage).sort(),
      },
      hint: "请统一使用 i 或 j；若表示乘法，请写成 3*i 或 3*j。",
    });
  }

  if (usage.has("j")) {
    return "j";
  }

  return "i";
}

function attachPreferredImaginaryUnit(result, preferredImaginaryUnit) {
  return createEvaluationResult({
    value: result.value,
    displayType: result.displayType,
    text: result.text,
    latex: result.latex,
    metadata: {
      ...(result.metadata || {}),
      preferredImaginaryUnit,
    },
  });
}

function resolveIdentifier(name, context, node) {
  if (Object.prototype.hasOwnProperty.call(context.variables, name)) {
    return createEvaluationResult({
      value: context.variables[name],
    });
  }

  if (Object.prototype.hasOwnProperty.call(context.constants, name)) {
    return createEvaluationResult({
      value: context.constants[name],
    });
  }

  throw createNameError({
    code: "NAME_UNKNOWN_IDENTIFIER",
    message: `未定义的标识符：${name}。`,
    position: node.span,
    context: { name },
    hint: "请检查变量名、常量名或函数参数是否已定义。",
  });
}

function evaluateUnary(node, context, functions) {
  const argument = evaluateNode(node.argument, context, functions).value;

  if (node.operator === "+") {
    return createEvaluationResult({
      value: asComplexValue(argument),
    });
  }

  if (node.operator === "-") {
    const complex = asComplexValue(argument);
    return createEvaluationResult({
      value: createComplexValue({
        re: -complex.re,
        im: -complex.im,
      }),
    });
  }

  throw createUnsupportedFeatureError({
    code: "EVAL_UNSUPPORTED_UNARY_OPERATOR",
    message: `暂不支持一元运算符 ${node.operator}。`,
    position: node.span,
    context: { operator: node.operator },
  });
}

function evaluateBinary(node, context, functions) {
  const left = evaluateNode(node.left, context, functions).value;
  const right = evaluateNode(node.right, context, functions).value;

  switch (node.operator) {
    case "+":
      return createEvaluationResult({ value: addComplex(left, right) });
    case "-":
      return createEvaluationResult({ value: subtractComplex(left, right) });
    case "*":
      return createEvaluationResult({ value: multiplyComplex(left, right) });
    case "/":
      return createEvaluationResult({ value: divideComplex(left, right, context.options.zeroTolerance) });
    case "^":
      return createEvaluationResult({ value: powerComplex(left, right) });
    default:
      throw createUnsupportedFeatureError({
        code: "EVAL_UNSUPPORTED_BINARY_OPERATOR",
        message: `暂不支持二元运算符 ${node.operator}。`,
        position: node.span,
        context: { operator: node.operator },
      });
  }
}

function createBuiltinHelpers(context, functionRegistry) {
  return {
    context,
    evaluateNode(node) {
      return evaluateNode(node, context, functionRegistry).value;
    },
    evaluateResult(node) {
      return evaluateNode(node, context, functionRegistry);
    },
  };
}

function evaluateFunctionCall(node, context, functionRegistry) {
  const definition = functionRegistry.requireFunction(node.callee.name);

  if (definition.kind === "builtin") {
    const value = definition.executor({
      argNodes: Array.from(node.args),
      context,
      helpers: createBuiltinHelpers(context, functionRegistry),
    });

    return createEvaluationResult({
      value: asComplexValue(value),
    });
  }

  return evaluateUserFunction(node, definition, context, functionRegistry);
}

function evaluateUserFunction(node, definition, context, functionRegistry) {
  if (definition.parameters.length !== node.args.length) {
    throw createArityError({
      code: "ARITY_EXACT_MISMATCH",
      message: `函数 ${definition.name} 需要 ${definition.parameters.length} 个参数，实际收到 ${node.args.length} 个。`,
      position: node.span,
      context: { functionName: definition.name, expectedCount: definition.parameters.length, actualCount: node.args.length },
      hint: "请检查调用参数个数。",
    });
  }

  const scopedVariables = {
    ...context.variables,
  };

  for (let index = 0; index < definition.parameters.length; index += 1) {
    const parameter = definition.parameters[index];
    scopedVariables[parameter.name] = asComplexValue(evaluateNode(node.args[index], context, functionRegistry).value);
  }

  const scopedContext = createEvaluationContext({
    constants: context.constants,
    variables: scopedVariables,
    functions: context.functions,
    options: context.options,
  });

  return evaluateNode(definition.bodyAst, scopedContext, functionRegistry);
}

function evaluateConversion(node, context, functionRegistry) {
  const sourceResult = evaluateNode(node.source, context, functionRegistry);
  const sourceValue = asComplexValue(sourceResult.value);

  if (node.targetForm === "rect") {
    return createEvaluationResult({
      value: sourceValue,
      displayType: DISPLAY_TYPES.COMPLEX_RECT,
      metadata: {
        preferredDisplayType: DISPLAY_TYPES.COMPLEX_RECT,
      },
    });
  }

  const angleUnit = node.angleUnit || context.options.angleUnit;

  return createEvaluationResult({
    value: sourceValue,
    displayType: DISPLAY_TYPES.COMPLEX_POLAR,
    metadata: createDisplayMetadataForPolar(sourceValue, angleUnit),
  });
}

function evaluateNode(node, context, functionRegistry) {
  try {
    switch (node.kind) {
      case AST_NODE_TYPES.NUMBER_LITERAL:
        return createEvaluationResult({
          value: createComplexValue({ re: node.value, im: 0 }),
        });
      case AST_NODE_TYPES.IDENTIFIER:
        return resolveIdentifier(node.name, context, node);
      case AST_NODE_TYPES.UNARY_EXPRESSION:
        return evaluateUnary(node, context, functionRegistry);
      case AST_NODE_TYPES.BINARY_EXPRESSION:
        return evaluateBinary(node, context, functionRegistry);
      case AST_NODE_TYPES.FUNCTION_CALL:
        return evaluateFunctionCall(node, context, functionRegistry);
      case AST_NODE_TYPES.CONVERSION_EXPRESSION:
        return evaluateConversion(node, context, functionRegistry);
      default:
        throw createUnsupportedFeatureError({
          code: "EVAL_UNSUPPORTED_AST_NODE",
          message: `暂不支持的 AST 节点类型：${node.kind}。`,
          position: node.span,
          context: { kind: node.kind },
        });
    }
  } catch (error) {
    if (isCalculatorError(error)) {
      throw error;
    }

    if (error && typeof error === "object" && typeof error.kind === "string" && typeof error.code === "string") {
      throw error;
    }

    throw error;
  }
}

function normalizeEvaluationContext(context = {}) {
  return createEvaluationContext({
    constants: context.constants || DEFAULT_CONSTANTS,
    variables: context.variables || {},
    functions: context.functions || {},
    options: context.options || undefined,
  });
}

function evaluate(ast, context = {}) {
  const normalizedContext = normalizeEvaluationContext(context);
  const functionRegistry = createFunctionRegistry();

  for (const definition of Object.values(normalizedContext.functions)) {
    if (definition.kind === "builtin") {
      functionRegistry.registerBuiltin(definition);
    } else {
      functionRegistry.registerUserFunction(definition);
    }
  }

  const preferredImaginaryUnit = resolvePreferredImaginaryUnit(ast, normalizedContext.functions || {});
  return attachPreferredImaginaryUnit(
    evaluateNode(ast, normalizedContext, functionRegistry),
    preferredImaginaryUnit
  );
}

function evaluateSource(input, context = {}) {
  return evaluate(parseSource(input), context);
}

function evaluateToValue(ast, context = {}) {
  return evaluate(ast, context).value;
}

function evaluateSourceToValue(input, context = {}) {
  return evaluateSource(input, context).value;
}

module.exports = {
  evaluate,
  evaluateSource,
  evaluateSourceToValue,
  evaluateToValue,
};
