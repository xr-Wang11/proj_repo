"use strict";

const {
  ANGLE_UNITS,
  DISPLAY_TYPES,
  createArityError,
  createBuiltinFunctionDefinition,
  createComplexValue,
  createMathDomainError,
} = require("../model");
const {
  angleOfComplex,
  complexExp,
  complexLog,
  conjugateComplex,
  cosComplex,
  fromPhasorParts,
  fromRectangularParts,
  imaginaryPart,
  magnitudeOfComplex,
  realPart,
  sinComplex,
  sqrtComplex,
  tanComplex,
  toPhasorValue,
} = require("../math");

function requireArity(name, argNodes, expectedCount) {
  if (argNodes.length !== expectedCount) {
    throw createArityError({
      code: "ARITY_EXACT_MISMATCH",
      message: `函数 ${name} 需要 ${expectedCount} 个参数，实际收到 ${argNodes.length} 个。`,
      context: { functionName: name, expectedCount, actualCount: argNodes.length },
      hint: "请检查函数参数个数是否正确。",
    });
  }
}

function requireArityBetween(name, argNodes, minCount, maxCount) {
  if (argNodes.length < minCount || argNodes.length > maxCount) {
    throw createArityError({
      code: "ARITY_RANGE_MISMATCH",
      message: `函数 ${name} 需要 ${minCount} 到 ${maxCount} 个参数，实际收到 ${argNodes.length} 个。`,
      context: { functionName: name, minCount, maxCount, actualCount: argNodes.length },
      hint: "请检查函数参数个数是否正确。",
    });
  }
}

function requireRealNumber(name, argumentValue, parameterName) {
  if (argumentValue.im !== 0) {
    throw createMathDomainError({
      code: "MATH_EXPECTED_REAL_ARGUMENT",
      message: `函数 ${name} 的参数 ${parameterName} 必须是实数。`,
      context: { functionName: name, parameterName, argumentValue },
      hint: "请传入虚部为 0 的值。",
    });
  }

  return argumentValue.re;
}

function resolveAngleUnitNode(functionName, argNodes, index) {
  if (!argNodes[index]) {
    return ANGLE_UNITS.RAD;
  }

  const node = argNodes[index];

  if (node.kind !== "Identifier" || !Object.values(ANGLE_UNITS).includes(node.name)) {
    throw createMathDomainError({
      code: "MATH_INVALID_ANGLE_UNIT_ARGUMENT",
      message: `函数 ${functionName} 的角度单位参数必须是 deg 或 rad。`,
      context: { functionName, index },
      hint: "请将角度单位写成 deg 或 rad。",
    });
  }

  return node.name;
}

function createUnaryBuiltin(name, executor, metadata = {}) {
  return createBuiltinFunctionDefinition({
    name,
    parameters: ["value"],
    metadata,
    executor({ argNodes, helpers }) {
      requireArity(name, argNodes, 1);
      return executor(helpers.evaluateNode(argNodes[0]));
    },
  });
}

function createDefaultBuiltinFunctions() {
  const definitions = [
    createUnaryBuiltin("sin", sinComplex, { supportsComplex: true }),
    createUnaryBuiltin("cos", cosComplex, { supportsComplex: true }),
    createUnaryBuiltin("tan", tanComplex, { supportsComplex: true }),
    createUnaryBuiltin("sqrt", sqrtComplex, { supportsComplex: true }),
    createUnaryBuiltin("exp", complexExp, { supportsComplex: true }),
    createUnaryBuiltin("ln", complexLog, { supportsComplex: true }),
    createBuiltinFunctionDefinition({
      name: "lg",
      parameters: ["value"],
      metadata: { supportsComplex: true },
      executor({ argNodes, helpers }) {
        requireArity("lg", argNodes, 1);
        const value = complexLog(helpers.evaluateNode(argNodes[0]));
        return createComplexValue({
          re: value.re / Math.LN10,
          im: value.im / Math.LN10,
        });
      },
    }),
    createUnaryBuiltin("conj", conjugateComplex, { supportsComplex: true }),
    createBuiltinFunctionDefinition({
      name: "abs",
      parameters: ["value"],
      metadata: { supportsComplex: true },
      executor({ argNodes, helpers }) {
        requireArity("abs", argNodes, 1);
        return createComplexValue({
          re: magnitudeOfComplex(helpers.evaluateNode(argNodes[0])),
          im: 0,
        });
      },
    }),
    createBuiltinFunctionDefinition({
      name: "arg",
      parameters: ["value", "unit"],
      metadata: { supportsComplex: true },
      executor({ argNodes, helpers }) {
        requireArityBetween("arg", argNodes, 1, 2);
        const angleUnit = argNodes.length === 2 ? resolveAngleUnitNode("arg", argNodes, 1) : helpers.context.options.angleUnit;
        return createComplexValue({
          re: angleOfComplex(helpers.evaluateNode(argNodes[0]), angleUnit),
          im: 0,
        });
      },
    }),
    createBuiltinFunctionDefinition({
      name: "re",
      parameters: ["value"],
      metadata: { supportsComplex: true },
      executor({ argNodes, helpers }) {
        requireArity("re", argNodes, 1);
        return createComplexValue({
          re: realPart(helpers.evaluateNode(argNodes[0])),
          im: 0,
        });
      },
    }),
    createBuiltinFunctionDefinition({
      name: "im",
      parameters: ["value"],
      metadata: { supportsComplex: true },
      executor({ argNodes, helpers }) {
        requireArity("im", argNodes, 1);
        return createComplexValue({
          re: imaginaryPart(helpers.evaluateNode(argNodes[0])),
          im: 0,
        });
      },
    }),
    createBuiltinFunctionDefinition({
      name: "rect",
      parameters: ["x", "y"],
      metadata: { supportsComplex: false },
      executor({ argNodes, helpers }) {
        requireArity("rect", argNodes, 2);
        const re = requireRealNumber("rect", helpers.evaluateNode(argNodes[0]), "re");
        const im = requireRealNumber("rect", helpers.evaluateNode(argNodes[1]), "im");
        return fromRectangularParts(re, im);
      },
    }),
    createBuiltinFunctionDefinition({
      name: "polar",
      parameters: ["magnitude", "angle", "unit"],
      metadata: { supportsComplex: false, affectsDisplay: true },
      executor({ argNodes, helpers }) {
        requireArityBetween("polar", argNodes, 2, 3);
        const magnitude = requireRealNumber("polar", helpers.evaluateNode(argNodes[0]), "magnitude");
        const angle = requireRealNumber("polar", helpers.evaluateNode(argNodes[1]), "angle");
        const angleUnit = argNodes.length === 3 ? resolveAngleUnitNode("polar", argNodes, 2) : helpers.context.options.angleUnit;
        return fromPhasorParts(magnitude, angle, angleUnit);
      },
    }),
  ];

  const table = {};

  for (const definition of definitions) {
    table[definition.name] = definition;
  }

  return Object.freeze(table);
}

const DEFAULT_BUILTIN_FUNCTIONS = createDefaultBuiltinFunctions();

function createDisplayMetadataForPolar(value, angleUnit) {
  return Object.freeze({
    preferredAngleUnit: angleUnit,
    polarValue: toPhasorValue(value, angleUnit),
    preferredDisplayType: DISPLAY_TYPES.COMPLEX_POLAR,
  });
}

module.exports = {
  DEFAULT_BUILTIN_FUNCTIONS,
  createDefaultBuiltinFunctions,
  createDisplayMetadataForPolar,
};
