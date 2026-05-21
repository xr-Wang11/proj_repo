import { evaluate, parseSource } from "@/adapters/core-api.js";
import { translateErrorMessage } from "@/utils/error-display.js";

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/u;
const RESERVED_IDENTIFIERS = new Set([
  "pi",
  "e",
  "i",
  "j",
  "deg",
  "rad",
  "sin",
  "cos",
  "tan",
  "sqrt",
  "exp",
  "lg",
  "ln",
  "abs",
  "arg",
  "re",
  "im",
  "conj",
  "rect",
  "polar",
  "to_rect",
  "to_polar",
  "ans",
  "history",
]);

const ZERO_TOLERANCE = 1e-10;
const ROOT_TOLERANCE = 1e-7;
const MAX_LAGUERRE_ITERATIONS = 80;
const MAX_SYSTEM_NEWTON_ITERATIONS = 60;
const MAX_SYSTEM_SEEDS = 240;

function createError(code, message, detail = {}) {
  const error = new Error(translateErrorMessage(message));
  error.code = code;
  error.detail = detail;
  return error;
}

function wrapError(error, fallbackCode, fallbackMessage, detail = {}) {
  return createError(
    error?.code || fallbackCode,
    error?.message || fallbackMessage,
    {
      ...(error?.detail || {}),
      ...detail,
      originalCode: error?.code || null,
    }
  );
}

function normalizeNearZero(value) {
  return Math.abs(value) <= ZERO_TOLERANCE ? 0 : value;
}

function toComplex(value) {
  if (value && typeof value === "object" && typeof value.re === "number" && typeof value.im === "number") {
    return {
      re: normalizeNearZero(value.re),
      im: normalizeNearZero(value.im),
    };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { re: normalizeNearZero(value), im: 0 };
  }

  throw createError("EQUATION_INVALID_COMPLEX", "无法将结果转换为复数。");
}

function complexAbs(value) {
  return Math.hypot(value.re, value.im);
}

function isZeroComplex(value, tolerance = ZERO_TOLERANCE) {
  return Math.abs(value.re) <= tolerance && Math.abs(value.im) <= tolerance;
}

function addComplex(left, right) {
  return {
    re: normalizeNearZero(left.re + right.re),
    im: normalizeNearZero(left.im + right.im),
  };
}

function subtractComplex(left, right) {
  return {
    re: normalizeNearZero(left.re - right.re),
    im: normalizeNearZero(left.im - right.im),
  };
}

function multiplyComplex(left, right) {
  return {
    re: normalizeNearZero(left.re * right.re - left.im * right.im),
    im: normalizeNearZero(left.re * right.im + left.im * right.re),
  };
}

function divideComplex(left, right) {
  const denominator = right.re * right.re + right.im * right.im;

  if (Math.abs(denominator) <= ZERO_TOLERANCE) {
    throw createError("EQUATION_DIVISION_BY_ZERO", "求解过程中出现了除以零。");
  }

  return {
    re: normalizeNearZero((left.re * right.re + left.im * right.im) / denominator),
    im: normalizeNearZero((left.im * right.re - left.re * right.im) / denominator),
  };
}

function negateComplex(value) {
  return {
    re: normalizeNearZero(-value.re),
    im: normalizeNearZero(-value.im),
  };
}

function scaleComplex(value, scalar) {
  return multiplyComplex(value, scalar);
}

function sqrtComplex(value) {
  if (isZeroComplex(value)) {
    return { re: 0, im: 0 };
  }

  const magnitude = complexAbs(value);
  const real = Math.sqrt((magnitude + value.re) / 2);
  const imaginary = (value.im < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (magnitude - value.re) / 2));
  return {
    re: normalizeNearZero(real),
    im: normalizeNearZero(imaginary),
  };
}

function complexDistance(left, right) {
  return complexAbs(subtractComplex(left, right));
}

function evaluateConstantNode(node, options) {
  try {
    return toComplex(
      evaluate(node, {
        functions: options.functions,
        options: {
          angleUnit: options.angleUnit,
          outputMode: "plain",
        },
      }).value
    );
  } catch (error) {
    if (error?.code === "NAME_UNKNOWN_IDENTIFIER") {
      throw createError(
        "EQUATION_UNDECLARED_IDENTIFIER",
        `方程中出现了未声明变量或未知标识符：${error.context?.name || ""}。`,
        { originalError: error }
      );
    }

    throw createError(
      "EQUATION_CONSTANT_EVALUATION_FAILED",
      error?.message || "常量子表达式求值失败。",
      { originalError: error }
    );
  }
}

function validateVariableName(name) {
  const normalized = String(name ?? "").trim();

  if (!normalized) {
    throw createError("EQUATION_VARIABLE_EMPTY", "变量名不能为空。");
  }

  if (!IDENTIFIER_PATTERN.test(normalized) || normalized.endsWith("_") || normalized.includes("__")) {
    throw createError("EQUATION_VARIABLE_INVALID", `变量名 ${normalized} 不合法。`, {
      variable: normalized,
    });
  }

  if (RESERVED_IDENTIFIERS.has(normalized)) {
    throw createError("EQUATION_VARIABLE_RESERVED", `变量名 ${normalized} 是保留字。`, {
      variable: normalized,
    });
  }

  return normalized;
}

function parseVariableNames(source) {
  const raw = String(source ?? "").trim();

  if (!raw) {
    throw createError("EQUATION_VARIABLES_REQUIRED", "请先声明要求解的变量，例如 x, y。");
  }

  const names = raw
    .split(",")
    .map((item) => validateVariableName(item))
    .filter(Boolean);

  const unique = new Set();

  for (const name of names) {
    if (unique.has(name)) {
      throw createError("EQUATION_VARIABLE_DUPLICATE", `变量 ${name} 被重复声明了。`, {
        variable: name,
      });
    }

    unique.add(name);
  }

  return names;
}

function splitEquationSource(source, index) {
  const text = String(source ?? "").trim();

  if (!text) {
    throw createError("EQUATION_EMPTY", `第 ${index + 1} 条方程为空。`, {
      equationIndex: index,
    });
  }

  const parts = text.split("=");

  if (parts.length !== 2) {
    throw createError("EQUATION_EQUALS_REQUIRED", `第 ${index + 1} 条方程必须且只能包含一个 = 号。`, {
      equationIndex: index,
    });
  }

  const [left, right] = parts.map((item) => item.trim());

  if (!left || !right) {
    throw createError("EQUATION_SIDE_EMPTY", `第 ${index + 1} 条方程的等号两边都必须填写。`, {
      equationIndex: index,
    });
  }

  return { left, right };
}

function containsDeclaredVariable(node, variableSet) {
  if (!node || typeof node !== "object") {
    return false;
  }

  switch (node.kind) {
    case "Identifier":
      return variableSet.has(node.name);
    case "UnaryExpression":
      return containsDeclaredVariable(node.argument, variableSet);
    case "BinaryExpression":
      return containsDeclaredVariable(node.left, variableSet) || containsDeclaredVariable(node.right, variableSet);
    case "FunctionCall":
      return containsDeclaredVariable(node.callee, variableSet)
        || node.args.some((arg) => containsDeclaredVariable(arg, variableSet));
    case "ConversionExpression":
      return containsDeclaredVariable(node.source, variableSet);
    default:
      return false;
  }
}

function trimPolynomial(coefficients) {
  const next = coefficients.map((coefficient) => ({
    re: normalizeNearZero(coefficient.re),
    im: normalizeNearZero(coefficient.im),
  }));

  while (next.length > 1 && isZeroComplex(next[next.length - 1])) {
    next.pop();
  }

  return next;
}

function polynomialDegree(coefficients) {
  return trimPolynomial(coefficients).length - 1;
}

function constantPolynomial(value) {
  return [{ ...value }];
}

function variablePolynomial() {
  return [
    { re: 0, im: 0 },
    { re: 1, im: 0 },
  ];
}

function addPolynomial(left, right) {
  const maxLength = Math.max(left.length, right.length);
  const result = [];

  for (let index = 0; index < maxLength; index += 1) {
    result.push(
      addComplex(left[index] || { re: 0, im: 0 }, right[index] || { re: 0, im: 0 })
    );
  }

  return trimPolynomial(result);
}

function subtractPolynomial(left, right) {
  const maxLength = Math.max(left.length, right.length);
  const result = [];

  for (let index = 0; index < maxLength; index += 1) {
    result.push(
      subtractComplex(left[index] || { re: 0, im: 0 }, right[index] || { re: 0, im: 0 })
    );
  }

  return trimPolynomial(result);
}

function multiplyPolynomial(left, right) {
  const result = Array.from(
    { length: Math.max(1, left.length + right.length - 1) },
    () => ({ re: 0, im: 0 })
  );

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      result[leftIndex + rightIndex] = addComplex(
        result[leftIndex + rightIndex],
        multiplyComplex(left[leftIndex], right[rightIndex])
      );
    }
  }

  return trimPolynomial(result);
}

function dividePolynomialByScalar(polynomial, scalar) {
  return trimPolynomial(polynomial.map((coefficient) => divideComplex(coefficient, scalar)));
}

function powerPolynomial(base, exponent) {
  if (!Number.isInteger(exponent) || exponent < 0) {
    throw createError("POLYNOMIAL_INVALID_EXPONENT", "高次方程模式只支持非负整数次幂。");
  }

  let result = constantPolynomial({ re: 1, im: 0 });
  let factor = trimPolynomial(base);
  let currentExponent = exponent;

  while (currentExponent > 0) {
    if (currentExponent % 2 === 1) {
      result = multiplyPolynomial(result, factor);
    }

    currentExponent = Math.floor(currentExponent / 2);

    if (currentExponent > 0) {
      factor = multiplyPolynomial(factor, factor);
    }
  }

  return trimPolynomial(result);
}

function evaluatePolynomial(coefficients, value) {
  let result = { re: 0, im: 0 };

  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    result = addComplex(multiplyComplex(result, value), coefficients[index]);
  }

  return result;
}

function derivativePolynomial(coefficients) {
  if (coefficients.length <= 1) {
    return constantPolynomial({ re: 0, im: 0 });
  }

  const derivative = [];

  for (let index = 1; index < coefficients.length; index += 1) {
    derivative.push(scaleComplex(coefficients[index], { re: index, im: 0 }));
  }

  return trimPolynomial(derivative);
}

function polynomialFromNode(node, context) {
  switch (node.kind) {
    case "NumberLiteral":
      return constantPolynomial({ re: node.value, im: 0 });
    case "Identifier":
      if (node.name === context.variableName) {
        return variablePolynomial();
      }
      return constantPolynomial(evaluateConstantNode(node, context));
    case "UnaryExpression": {
      const argument = polynomialFromNode(node.argument, context);

      if (node.operator === "+") {
        return argument;
      }

      if (node.operator === "-") {
        return multiplyPolynomial(argument, constantPolynomial({ re: -1, im: 0 }));
      }

      throw createError("POLYNOMIAL_UNSUPPORTED_UNARY_OPERATOR", `暂不支持一元运算符 ${node.operator}。`);
    }
    case "BinaryExpression": {
      const left = polynomialFromNode(node.left, context);
      const right = polynomialFromNode(node.right, context);

      switch (node.operator) {
        case "+":
          return addPolynomial(left, right);
        case "-":
          return subtractPolynomial(left, right);
        case "*":
          return multiplyPolynomial(left, right);
        case "/":
          if (polynomialDegree(right) !== 0) {
            throw createError("POLYNOMIAL_NONPOLYNOMIAL", "高次方程模式暂不支持变量出现在分母中。");
          }
          return dividePolynomialByScalar(left, right[0]);
        case "^": {
          if (polynomialDegree(right) !== 0 || right[0].im !== 0) {
            throw createError("POLYNOMIAL_INVALID_EXPONENT", "高次方程模式只支持实数整数次幂。");
          }

          const exponent = Math.round(right[0].re);

          if (Math.abs(exponent - right[0].re) > ZERO_TOLERANCE) {
            throw createError("POLYNOMIAL_INVALID_EXPONENT", "高次方程模式只支持整数次幂。");
          }

          return powerPolynomial(left, exponent);
        }
        default:
          throw createError("POLYNOMIAL_UNSUPPORTED_OPERATOR", `暂不支持运算符 ${node.operator}。`);
      }
    }
    case "FunctionCall":
    case "ConversionExpression":
      if (containsDeclaredVariable(node, new Set([context.variableName]))) {
        throw createError(
          "POLYNOMIAL_UNSUPPORTED_FUNCTION",
          "当前高次方程模式暂不支持带变量的函数调用或形式转换。"
        );
      }
      return constantPolynomial(evaluateConstantNode(node, context));
    default:
      throw createError("POLYNOMIAL_UNSUPPORTED_AST", `暂不支持语法节点 ${node.kind}。`);
  }
}

function dividePolynomialByLinearFactor(coefficients, root) {
  const degree = coefficients.length - 1;

  if (degree < 1) {
    return {
      quotient: constantPolynomial({ re: 0, im: 0 }),
      remainder: coefficients[0] || { re: 0, im: 0 },
    };
  }

  const quotient = Array.from({ length: degree }, () => ({ re: 0, im: 0 }));
  quotient[degree - 1] = { ...coefficients[degree] };

  for (let index = degree - 2; index >= 0; index -= 1) {
    quotient[index] = addComplex(coefficients[index + 1], multiplyComplex(root, quotient[index + 1]));
  }

  const remainder = addComplex(coefficients[0], multiplyComplex(root, quotient[0]));

  return {
    quotient: trimPolynomial(quotient),
    remainder,
  };
}

function leadingCoefficient(coefficients) {
  const normalized = trimPolynomial(coefficients);
  return normalized[normalized.length - 1];
}

function normalizePolynomial(coefficients) {
  const normalized = trimPolynomial(coefficients);
  return dividePolynomialByScalar(normalized, leadingCoefficient(normalized));
}

function makeInitialGuess(index, degree, radius) {
  const angle = (2 * Math.PI * index) / degree;
  return {
    re: radius * Math.cos(angle),
    im: radius * Math.sin(angle),
  };
}

function estimateRootRadius(coefficients) {
  const normalized = normalizePolynomial(coefficients);
  let maxRatio = 0;

  for (let index = 0; index < normalized.length - 1; index += 1) {
    maxRatio = Math.max(maxRatio, complexAbs(normalized[index]));
  }

  return 1 + maxRatio;
}

function laguerreFindRoot(coefficients, initialGuess) {
  const degree = polynomialDegree(coefficients);

  if (degree < 1) {
    throw createError("POLYNOMIAL_DEGREE_INVALID", "无法对常数多项式执行求根。");
  }

  const firstDerivative = derivativePolynomial(coefficients);
  const secondDerivative = derivativePolynomial(firstDerivative);
  let current = { ...initialGuess };

  for (let iteration = 0; iteration < MAX_LAGUERRE_ITERATIONS; iteration += 1) {
    const value = evaluatePolynomial(coefficients, current);

    if (complexAbs(value) <= ROOT_TOLERANCE) {
      return current;
    }

    const g = divideComplex(evaluatePolynomial(firstDerivative, current), value);
    const h = subtractComplex(
      multiplyComplex(g, g),
      divideComplex(evaluatePolynomial(secondDerivative, current), value)
    );
    const degreeComplex = { re: degree, im: 0 };
    const degreeMinusOne = { re: degree - 1, im: 0 };
    const radical = sqrtComplex(
      multiplyComplex(
        degreeMinusOne,
        subtractComplex(multiplyComplex(degreeComplex, h), multiplyComplex(g, g))
      )
    );
    const plus = addComplex(g, radical);
    const minus = subtractComplex(g, radical);
    const denominator = complexAbs(plus) > complexAbs(minus) ? plus : minus;

    if (isZeroComplex(denominator, ROOT_TOLERANCE)) {
      current = addComplex(current, { re: iteration + 1, im: iteration + 1 });
      continue;
    }

    const delta = divideComplex(degreeComplex, denominator);
    current = subtractComplex(current, delta);

    if (complexAbs(delta) <= ROOT_TOLERANCE) {
      return current;
    }
  }

  return current;
}

function solveQuadratic(coefficients) {
  const [c0, c1, c2] = coefficients;
  const discriminant = subtractComplex(
    multiplyComplex(c1, c1),
    multiplyComplex({ re: 4, im: 0 }, multiplyComplex(c2, c0))
  );
  const sqrtDiscriminant = sqrtComplex(discriminant);
  const denominator = multiplyComplex({ re: 2, im: 0 }, c2);

  return [
    divideComplex(subtractComplex(negateComplex(c1), sqrtDiscriminant), denominator),
    divideComplex(addComplex(negateComplex(c1), sqrtDiscriminant), denominator),
  ];
}

function solvePolynomialRoots(coefficients) {
  const normalized = normalizePolynomial(coefficients);
  const degree = polynomialDegree(normalized);

  if (degree === 0) {
    if (isZeroComplex(normalized[0])) {
      throw createError("POLYNOMIAL_INFINITE_SOLUTIONS", "该方程恒成立，当前版本暂未支持进一步展示。");
    }

    return [];
  }

  if (degree === 1) {
    return [divideComplex(negateComplex(normalized[0]), normalized[1])];
  }

  if (degree === 2) {
    return solveQuadratic(normalized);
  }

  const roots = [];
  let working = normalized;
  let currentDegree = polynomialDegree(working);
  let seedIndex = 0;
  const radius = estimateRootRadius(normalized);

  while (currentDegree > 2) {
    const guess = makeInitialGuess(seedIndex + 1, Math.max(3, currentDegree), radius);
    const root = laguerreFindRoot(working, guess);
    const polished = laguerreFindRoot(normalized, root);
    roots.push(polished);
    working = dividePolynomialByLinearFactor(working, polished).quotient;
    currentDegree = polynomialDegree(working);
    seedIndex += 1;
  }

  if (currentDegree === 2) {
    roots.push(...solveQuadratic(working));
  } else if (currentDegree === 1) {
    roots.push(divideComplex(negateComplex(working[0]), working[1]));
  }

  return roots.map((root) => ({
    re: normalizeNearZero(root.re),
    im: normalizeNearZero(root.im),
  }));
}

function clusterRoots(roots, tolerance = 1e-5) {
  const clusters = [];

  for (const root of roots) {
    const existing = clusters.find((cluster) => complexDistance(cluster.value, root) <= tolerance);

    if (existing) {
      existing.members.push(root);
      const scale = existing.members.length;
      existing.value = {
        re: normalizeNearZero((existing.value.re * (scale - 1) + root.re) / scale),
        im: normalizeNearZero((existing.value.im * (scale - 1) + root.im) / scale),
      };
      continue;
    }

    clusters.push({
      members: [root],
      value: { ...root },
    });
  }

  return clusters.map((cluster) => ({
    multiplicity: cluster.members.length,
    value: cluster.value,
  }));
}

function makeBivariateKey(xExponent, yExponent) {
  return `${xExponent}|${yExponent}`;
}

function parseBivariateKey(key) {
  const [xExponent, yExponent] = String(key).split("|").map(Number);
  return { xExponent, yExponent };
}

function createEmptyBivariatePolynomial() {
  return new Map();
}

function cloneBivariatePolynomial(polynomial) {
  const next = createEmptyBivariatePolynomial();

  for (const [key, value] of polynomial.entries()) {
    next.set(key, { ...value });
  }

  return next;
}

function addBivariateTerm(polynomial, xExponent, yExponent, coefficient) {
  const normalized = {
    re: normalizeNearZero(coefficient.re),
    im: normalizeNearZero(coefficient.im),
  };

  const key = makeBivariateKey(xExponent, yExponent);
  const existing = polynomial.get(key) || { re: 0, im: 0 };
  const next = addComplex(existing, normalized);

  if (isZeroComplex(next)) {
    polynomial.delete(key);
    return polynomial;
  }

  polynomial.set(key, next);
  return polynomial;
}

function constantBivariatePolynomial(value) {
  const polynomial = createEmptyBivariatePolynomial();
  addBivariateTerm(polynomial, 0, 0, value);
  return polynomial;
}

function variableBivariatePolynomial(variableIndex) {
  const polynomial = createEmptyBivariatePolynomial();

  if (variableIndex === 0) {
    addBivariateTerm(polynomial, 1, 0, { re: 1, im: 0 });
  } else {
    addBivariateTerm(polynomial, 0, 1, { re: 1, im: 0 });
  }

  return polynomial;
}

function trimBivariatePolynomial(polynomial) {
  const next = createEmptyBivariatePolynomial();

  for (const [key, coefficient] of polynomial.entries()) {
    if (!isZeroComplex(coefficient)) {
      next.set(key, {
        re: normalizeNearZero(coefficient.re),
        im: normalizeNearZero(coefficient.im),
      });
    }
  }

  return next;
}

function isZeroBivariatePolynomial(polynomial) {
  return trimBivariatePolynomial(polynomial).size === 0;
}

function isConstantBivariatePolynomial(polynomial) {
  const normalized = trimBivariatePolynomial(polynomial);

  if (normalized.size === 0) {
    return true;
  }

  return [...normalized.keys()].every((key) => {
    const { xExponent, yExponent } = parseBivariateKey(key);
    return xExponent === 0 && yExponent === 0;
  });
}

function getBivariateConstant(polynomial) {
  if (!isConstantBivariatePolynomial(polynomial)) {
    throw createError("BIVARIATE_NON_CONSTANT", "多项式不是常量，无法直接取常量值。");
  }

  return trimBivariatePolynomial(polynomial).get(makeBivariateKey(0, 0)) || { re: 0, im: 0 };
}

function addBivariatePolynomial(left, right) {
  const result = cloneBivariatePolynomial(trimBivariatePolynomial(left));

  for (const [key, coefficient] of trimBivariatePolynomial(right).entries()) {
    const { xExponent, yExponent } = parseBivariateKey(key);
    addBivariateTerm(result, xExponent, yExponent, coefficient);
  }

  return trimBivariatePolynomial(result);
}

function subtractBivariatePolynomial(left, right) {
  const result = cloneBivariatePolynomial(trimBivariatePolynomial(left));

  for (const [key, coefficient] of trimBivariatePolynomial(right).entries()) {
    const { xExponent, yExponent } = parseBivariateKey(key);
    addBivariateTerm(result, xExponent, yExponent, negateComplex(coefficient));
  }

  return trimBivariatePolynomial(result);
}

function multiplyBivariatePolynomial(left, right) {
  const result = createEmptyBivariatePolynomial();
  const normalizedLeft = trimBivariatePolynomial(left);
  const normalizedRight = trimBivariatePolynomial(right);

  for (const [leftKey, leftCoefficient] of normalizedLeft.entries()) {
    const leftTerm = parseBivariateKey(leftKey);

    for (const [rightKey, rightCoefficient] of normalizedRight.entries()) {
      const rightTerm = parseBivariateKey(rightKey);
      addBivariateTerm(
        result,
        leftTerm.xExponent + rightTerm.xExponent,
        leftTerm.yExponent + rightTerm.yExponent,
        multiplyComplex(leftCoefficient, rightCoefficient)
      );
    }
  }

  return trimBivariatePolynomial(result);
}

function divideBivariatePolynomialByScalar(polynomial, scalar) {
  const result = createEmptyBivariatePolynomial();

  for (const [key, coefficient] of trimBivariatePolynomial(polynomial).entries()) {
    const { xExponent, yExponent } = parseBivariateKey(key);
    addBivariateTerm(result, xExponent, yExponent, divideComplex(coefficient, scalar));
  }

  return trimBivariatePolynomial(result);
}

function powerBivariatePolynomial(base, exponent) {
  if (!Number.isInteger(exponent) || exponent < 0) {
    throw createError("BIVARIATE_INVALID_EXPONENT", "双变量高次方程组只支持非负整数次幂。");
  }

  let result = constantBivariatePolynomial({ re: 1, im: 0 });
  let factor = trimBivariatePolynomial(base);
  let currentExponent = exponent;

  while (currentExponent > 0) {
    if (currentExponent % 2 === 1) {
      result = multiplyBivariatePolynomial(result, factor);
    }

    currentExponent = Math.floor(currentExponent / 2);

    if (currentExponent > 0) {
      factor = multiplyBivariatePolynomial(factor, factor);
    }
  }

  return trimBivariatePolynomial(result);
}

function bivariateDegreeIn(polynomial, variableIndex) {
  const normalized = trimBivariatePolynomial(polynomial);
  let degree = 0;

  for (const key of normalized.keys()) {
    const term = parseBivariateKey(key);
    degree = Math.max(degree, variableIndex === 0 ? term.xExponent : term.yExponent);
  }

  return degree;
}

function bivariateTotalDegree(polynomial) {
  const normalized = trimBivariatePolynomial(polynomial);
  let degree = 0;

  for (const key of normalized.keys()) {
    const term = parseBivariateKey(key);
    degree = Math.max(degree, term.xExponent + term.yExponent);
  }

  return degree;
}

function bivariateCoefficientNorm(polynomial) {
  const normalized = trimBivariatePolynomial(polynomial);
  let norm = 0;

  for (const coefficient of normalized.values()) {
    norm = Math.max(norm, complexAbs(coefficient));
  }

  return Math.max(1, norm);
}

function isLinearBivariatePolynomial(polynomial) {
  return bivariateTotalDegree(polynomial) <= 1;
}

function complexPow(base, exponent) {
  let result = { re: 1, im: 0 };

  for (let index = 0; index < exponent; index += 1) {
    result = multiplyComplex(result, base);
  }

  return result;
}

function evaluateBivariatePolynomial(polynomial, point) {
  const normalized = trimBivariatePolynomial(polynomial);
  let result = { re: 0, im: 0 };

  for (const [key, coefficient] of normalized.entries()) {
    const { xExponent, yExponent } = parseBivariateKey(key);
    const xFactor = complexPow(point.x, xExponent);
    const yFactor = complexPow(point.y, yExponent);
    const term = multiplyComplex(coefficient, multiplyComplex(xFactor, yFactor));
    result = addComplex(result, term);
  }

  return result;
}

function derivativeBivariatePolynomial(polynomial, variableIndex) {
  const result = createEmptyBivariatePolynomial();

  for (const [key, coefficient] of trimBivariatePolynomial(polynomial).entries()) {
    const term = parseBivariateKey(key);
    const exponent = variableIndex === 0 ? term.xExponent : term.yExponent;

    if (exponent === 0) {
      continue;
    }

    addBivariateTerm(
      result,
      variableIndex === 0 ? term.xExponent - 1 : term.xExponent,
      variableIndex === 1 ? term.yExponent - 1 : term.yExponent,
      scaleComplex(coefficient, { re: exponent, im: 0 })
    );
  }

  return trimBivariatePolynomial(result);
}

function areBivariatePolynomialsProportional(left, right) {
  const normalizedLeft = trimBivariatePolynomial(left);
  const normalizedRight = trimBivariatePolynomial(right);

  if (normalizedLeft.size === 0 && normalizedRight.size === 0) {
    return true;
  }

  if (normalizedLeft.size === 0 || normalizedRight.size === 0) {
    return false;
  }

  const keys = new Set([...normalizedLeft.keys(), ...normalizedRight.keys()]);
  let ratio = null;

  for (const key of keys) {
    const leftValue = normalizedLeft.get(key) || { re: 0, im: 0 };
    const rightValue = normalizedRight.get(key) || { re: 0, im: 0 };

    if (isZeroComplex(leftValue) && isZeroComplex(rightValue)) {
      continue;
    }

    if (isZeroComplex(leftValue) || isZeroComplex(rightValue)) {
      return false;
    }

    const currentRatio = divideComplex(leftValue, rightValue);

    if (!ratio) {
      ratio = currentRatio;
      continue;
    }

    if (complexDistance(ratio, currentRatio) > 1e-6) {
      return false;
    }
  }

  return ratio !== null;
}

function bivariatePolynomialFromNode(node, context) {
  switch (node.kind) {
    case "NumberLiteral":
      return constantBivariatePolynomial({ re: node.value, im: 0 });
    case "Identifier": {
      const variableIndex = context.variableNames.indexOf(node.name);

      if (variableIndex !== -1) {
        return variableBivariatePolynomial(variableIndex);
      }

      return constantBivariatePolynomial(evaluateConstantNode(node, context));
    }
    case "UnaryExpression": {
      const argument = bivariatePolynomialFromNode(node.argument, context);

      if (node.operator === "+") {
        return argument;
      }

      if (node.operator === "-") {
        return multiplyBivariatePolynomial(argument, constantBivariatePolynomial({ re: -1, im: 0 }));
      }

      throw createError("BIVARIATE_UNSUPPORTED_UNARY_OPERATOR", `暂不支持一元运算符 ${node.operator}。`);
    }
    case "BinaryExpression": {
      const left = bivariatePolynomialFromNode(node.left, context);
      const right = bivariatePolynomialFromNode(node.right, context);

      switch (node.operator) {
        case "+":
          return addBivariatePolynomial(left, right);
        case "-":
          return subtractBivariatePolynomial(left, right);
        case "*":
          return multiplyBivariatePolynomial(left, right);
        case "/":
          if (!isConstantBivariatePolynomial(right)) {
            throw createError("BIVARIATE_NONPOLYNOMIAL", "双变量高次方程组暂不支持变量出现在分母中。");
          }
          return divideBivariatePolynomialByScalar(left, getBivariateConstant(right));
        case "^": {
          if (!isConstantBivariatePolynomial(right)) {
            throw createError("BIVARIATE_INVALID_EXPONENT", "双变量高次方程组只支持常量整数次幂。");
          }

          const exponentValue = getBivariateConstant(right);

          if (exponentValue.im !== 0) {
            throw createError("BIVARIATE_INVALID_EXPONENT", "双变量高次方程组只支持实数整数次幂。");
          }

          const exponent = Math.round(exponentValue.re);

          if (Math.abs(exponent - exponentValue.re) > ZERO_TOLERANCE) {
            throw createError("BIVARIATE_INVALID_EXPONENT", "双变量高次方程组只支持整数次幂。");
          }

          return powerBivariatePolynomial(left, exponent);
        }
        default:
          throw createError("BIVARIATE_UNSUPPORTED_OPERATOR", `暂不支持运算符 ${node.operator}。`);
      }
    }
    case "FunctionCall":
    case "ConversionExpression":
      if (containsDeclaredVariable(node, new Set(context.variableNames))) {
        throw createError(
          "BIVARIATE_UNSUPPORTED_FUNCTION",
          "当前双变量高次方程组模式暂不支持带变量的函数调用或形式转换。"
        );
      }

      return constantBivariatePolynomial(evaluateConstantNode(node, context));
    default:
      throw createError("BIVARIATE_UNSUPPORTED_AST", `暂不支持语法节点 ${node.kind}。`);
  }
}

function estimateSystemRadius(polynomials, variableIndex) {
  let radius = 1;

  for (const polynomial of polynomials) {
    const normalized = trimBivariatePolynomial(polynomial);
    const maxExponent = bivariateDegreeIn(normalized, variableIndex);

    if (maxExponent <= 0) {
      continue;
    }

    let leadingMagnitude = 0;
    let otherMagnitude = 0;

    for (const [key, coefficient] of normalized.entries()) {
      const term = parseBivariateKey(key);
      const exponent = variableIndex === 0 ? term.xExponent : term.yExponent;
      const magnitude = complexAbs(coefficient);

      if (exponent === maxExponent) {
        leadingMagnitude = Math.max(leadingMagnitude, magnitude);
      } else {
        otherMagnitude = Math.max(otherMagnitude, magnitude);
      }
    }

    if (leadingMagnitude > ZERO_TOLERANCE) {
      radius = Math.max(radius, 1 + otherMagnitude / leadingMagnitude);
    }
  }

  return Math.min(Math.max(radius, 1), 24);
}

function createSystemSeeds(seedCount, radiusX, radiusY) {
  const seeds = [
    { x: { re: 0, im: 0 }, y: { re: 0, im: 0 } },
    { x: { re: radiusX, im: 0 }, y: { re: radiusY, im: 0 } },
    { x: { re: -radiusX, im: 0 }, y: { re: radiusY, im: 0 } },
    { x: { re: radiusX, im: 0 }, y: { re: -radiusY, im: 0 } },
    { x: { re: -radiusX, im: 0 }, y: { re: -radiusY, im: 0 } },
    { x: { re: 0, im: radiusX }, y: { re: 0, im: radiusY } },
    { x: { re: 0, im: -radiusX }, y: { re: 0, im: radiusY } },
    { x: { re: 0, im: radiusX }, y: { re: 0, im: -radiusY } },
    { x: { re: 0, im: -radiusX }, y: { re: 0, im: -radiusY } },
  ];

  const phi1 = 0.6180339887498949;
  const phi2 = 0.7548776662466927;
  const phi3 = 0.5698402909980532;
  const phi4 = 0.4384471871911697;

  for (let index = 0; index < seedCount; index += 1) {
    const t1 = ((index + 1) * phi1) % 1;
    const t2 = ((index + 1) * phi2) % 1;
    const t3 = ((index + 1) * phi3) % 1;
    const t4 = ((index + 1) * phi4) % 1;
    const angleX = 2 * Math.PI * t1;
    const angleY = 2 * Math.PI * t2;
    const magnitudeX = radiusX * (0.15 + 1.85 * Math.sqrt(t3));
    const magnitudeY = radiusY * (0.15 + 1.85 * Math.sqrt(t4));

    seeds.push({
      x: {
        re: magnitudeX * Math.cos(angleX),
        im: magnitudeX * Math.sin(angleX),
      },
      y: {
        re: magnitudeY * Math.cos(angleY),
        im: magnitudeY * Math.sin(angleY),
      },
    });
  }

  return seeds;
}

function isFiniteComplex(value) {
  return Number.isFinite(value.re) && Number.isFinite(value.im);
}

function solveTwoVariableNewton(primary, secondary, derivatives, seed) {
  let x = { ...seed.x };
  let y = { ...seed.y };

  for (let iteration = 0; iteration < MAX_SYSTEM_NEWTON_ITERATIONS; iteration += 1) {
    const point = { x, y };
    const f = evaluateBivariatePolynomial(primary, point);
    const g = evaluateBivariatePolynomial(secondary, point);
    const residual = Math.max(complexAbs(f), complexAbs(g));

    if (residual <= ROOT_TOLERANCE * 10) {
      return { point, residual };
    }

    const fx = evaluateBivariatePolynomial(derivatives.fx, point);
    const fy = evaluateBivariatePolynomial(derivatives.fy, point);
    const gx = evaluateBivariatePolynomial(derivatives.gx, point);
    const gy = evaluateBivariatePolynomial(derivatives.gy, point);
    const determinant = subtractComplex(
      multiplyComplex(fx, gy),
      multiplyComplex(fy, gx)
    );

    if (complexAbs(determinant) <= ROOT_TOLERANCE * ROOT_TOLERANCE) {
      return null;
    }

    const deltaX = divideComplex(
      subtractComplex(multiplyComplex(f, gy), multiplyComplex(g, fy)),
      determinant
    );
    const deltaY = divideComplex(
      subtractComplex(multiplyComplex(fx, g), multiplyComplex(gx, f)),
      determinant
    );

    x = subtractComplex(x, deltaX);
    y = subtractComplex(y, deltaY);

    if (!isFiniteComplex(x) || !isFiniteComplex(y)) {
      return null;
    }

    if (Math.max(complexAbs(deltaX), complexAbs(deltaY)) <= ROOT_TOLERANCE && residual <= 1e-5) {
      return { point: { x, y }, residual };
    }
  }

  const point = { x, y };
  const f = evaluateBivariatePolynomial(primary, point);
  const g = evaluateBivariatePolynomial(secondary, point);
  const residual = Math.max(complexAbs(f), complexAbs(g));

  if (residual <= ROOT_TOLERANCE * 20) {
    return { point, residual };
  }

  return null;
}

function systemPointDistance(left, right) {
  return Math.hypot(
    complexDistance(left.x, right.x),
    complexDistance(left.y, right.y)
  );
}

function clusterSystemSolutions(candidates, tolerance = 1e-5) {
  const clusters = [];

  for (const candidate of candidates) {
    const existing = clusters.find((cluster) => systemPointDistance(cluster.value, candidate) <= tolerance);

    if (existing) {
      existing.members.push(candidate);
      const scale = existing.members.length;
      existing.value = {
        x: {
          re: normalizeNearZero((existing.value.x.re * (scale - 1) + candidate.x.re) / scale),
          im: normalizeNearZero((existing.value.x.im * (scale - 1) + candidate.x.im) / scale),
        },
        y: {
          re: normalizeNearZero((existing.value.y.re * (scale - 1) + candidate.y.re) / scale),
          im: normalizeNearZero((existing.value.y.im * (scale - 1) + candidate.y.im) / scale),
        },
      };
      continue;
    }

    clusters.push({
      members: [candidate],
      value: {
        x: { ...candidate.x },
        y: { ...candidate.y },
      },
    });
  }

  return clusters.map((cluster) => cluster.value);
}

function compareComplexValues(left, right) {
  if (Math.abs(left.re - right.re) > 1e-7) {
    return left.re - right.re;
  }

  return left.im - right.im;
}

function buildLinearRowFromBivariate(polynomial) {
  const coefficients = [
    { re: 0, im: 0 },
    { re: 0, im: 0 },
  ];
  let constant = { re: 0, im: 0 };

  for (const [key, coefficient] of trimBivariatePolynomial(polynomial).entries()) {
    const { xExponent, yExponent } = parseBivariateKey(key);

    if (xExponent === 0 && yExponent === 0) {
      constant = addComplex(constant, coefficient);
      continue;
    }

    if (xExponent === 1 && yExponent === 0) {
      coefficients[0] = addComplex(coefficients[0], coefficient);
      continue;
    }

    if (xExponent === 0 && yExponent === 1) {
      coefficients[1] = addComplex(coefficients[1], coefficient);
      continue;
    }

    throw createError("LINEAR_SYSTEM_NONLINEAR_TERM", "当前方程组模式只支持一次项，暂不支持更高次项。");
  }

  return {
    coefficients,
    constant: negateComplex(constant),
  };
}

function solveTwoVariablePolynomialSystem(polynomials, variableNames) {
  const normalizedPolynomials = polynomials
    .map((item) => ({
      ...item,
      coefficients: trimBivariatePolynomial(item.coefficients),
    }));

  if (normalizedPolynomials.some((item) => isConstantBivariatePolynomial(item.coefficients) && !isZeroComplex(getBivariateConstant(item.coefficients)))) {
    return {
      message: "该方程组无解。",
      status: "no-solution",
      variableNames,
    };
  }

  const nonZeroPolynomials = normalizedPolynomials.filter((item) => !isZeroBivariatePolynomial(item.coefficients));

  if (nonZeroPolynomials.length === 0) {
    throw createError("BIVARIATE_INFINITE_SOLUTIONS", "该方程组恒成立，当前版本暂未支持进一步展示。");
  }

  if (nonZeroPolynomials.length === 1) {
    throw createError("BIVARIATE_INFINITE_SOLUTIONS", "双变量方程组仅提供了一条独立方程，当前按无穷多解处理。");
  }

  let primaryPair = null;

  for (let leftIndex = 0; leftIndex < nonZeroPolynomials.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nonZeroPolynomials.length; rightIndex += 1) {
      if (!areBivariatePolynomialsProportional(
        nonZeroPolynomials[leftIndex].coefficients,
        nonZeroPolynomials[rightIndex].coefficients
      )) {
        primaryPair = [nonZeroPolynomials[leftIndex], nonZeroPolynomials[rightIndex]];
        break;
      }
    }

    if (primaryPair) {
      break;
    }
  }

  if (!primaryPair) {
    throw createError("BIVARIATE_INFINITE_SOLUTIONS", "双变量方程组中的方程彼此等价，当前按无穷多解处理。");
  }

  const [primary, secondary] = primaryPair;
  const derivatives = {
    fx: derivativeBivariatePolynomial(primary.coefficients, 0),
    fy: derivativeBivariatePolynomial(primary.coefficients, 1),
    gx: derivativeBivariatePolynomial(secondary.coefficients, 0),
    gy: derivativeBivariatePolynomial(secondary.coefficients, 1),
  };

  const degreeBound = Math.max(
    2,
    bivariateTotalDegree(primary.coefficients) * bivariateTotalDegree(secondary.coefficients)
  );
  const seedCount = Math.min(MAX_SYSTEM_SEEDS, Math.max(48, degreeBound * 24));
  const radiusX = estimateSystemRadius(nonZeroPolynomials.map((item) => item.coefficients), 0);
  const radiusY = estimateSystemRadius(nonZeroPolynomials.map((item) => item.coefficients), 1);
  const seeds = createSystemSeeds(seedCount, radiusX, radiusY);
  const candidates = [];

  for (const seed of seeds) {
    const solved = solveTwoVariableNewton(primary.coefficients, secondary.coefficients, derivatives, seed);

    if (!solved) {
      continue;
    }

    const point = solved.point;
    const valid = normalizedPolynomials.every((item) => {
      const residual = complexAbs(evaluateBivariatePolynomial(item.coefficients, point));
      return residual <= ROOT_TOLERANCE * 40 * bivariateCoefficientNorm(item.coefficients);
    });

    if (valid) {
      candidates.push({
        x: {
          re: normalizeNearZero(point.x.re),
          im: normalizeNearZero(point.x.im),
        },
        y: {
          re: normalizeNearZero(point.y.re),
          im: normalizeNearZero(point.y.im),
        },
      });
    }
  }

  const solutions = clusterSystemSolutions(candidates).sort((left, right) => {
    const xCompare = compareComplexValues(left.x, right.x);
    return xCompare !== 0 ? xCompare : compareComplexValues(left.y, right.y);
  });

  if (solutions.length === 0) {
    return {
      message: "该方程组无解。",
      status: "no-solution",
      variableNames,
    };
  }

  return {
    message: `已求得 ${solutions.length} 组解。`,
    solutionPairs: solutions.map((solution, index) => ({
      label: `解 ${index + 1}`,
      values: [
        { name: variableNames[0], value: solution.x },
        { name: variableNames[1], value: solution.y },
      ],
    })),
    status: "pair-solutions",
    variableNames,
  };
}

function buildLinearRow(leftAst, rightAst, context) {
  function createAffineTerm(variableCount) {
    return {
      coefficients: Array.from({ length: variableCount }, () => ({ re: 0, im: 0 })),
      constant: { re: 0, im: 0 },
    };
  }

  function isScalarAffine(term) {
    return term.coefficients.every((coefficient) => isZeroComplex(coefficient));
  }

  function addAffine(left, right) {
    return {
      coefficients: left.coefficients.map((coefficient, index) => addComplex(coefficient, right.coefficients[index])),
      constant: addComplex(left.constant, right.constant),
    };
  }

  function subtractAffine(left, right) {
    return {
      coefficients: left.coefficients.map((coefficient, index) => subtractComplex(coefficient, right.coefficients[index])),
      constant: subtractComplex(left.constant, right.constant),
    };
  }

  function scaleAffine(term, scalar) {
    return {
      coefficients: term.coefficients.map((coefficient) => multiplyComplex(coefficient, scalar)),
      constant: multiplyComplex(term.constant, scalar),
    };
  }

  function divideAffine(term, scalar) {
    return {
      coefficients: term.coefficients.map((coefficient) => divideComplex(coefficient, scalar)),
      constant: divideComplex(term.constant, scalar),
    };
  }

  function parseNumericExponent(value) {
    if (value.im !== 0) {
      return null;
    }

    return value.re;
  }

  function linearizeNode(node) {
    const empty = () => createAffineTerm(context.variableNames.length);

    switch (node.kind) {
      case "NumberLiteral": {
        const term = empty();
        term.constant = { re: node.value, im: 0 };
        return term;
      }
      case "Identifier": {
        const variableIndex = context.variableIndex.get(node.name);

        if (variableIndex !== undefined) {
          const term = empty();
          term.coefficients[variableIndex] = { re: 1, im: 0 };
          return term;
        }

        const term = empty();
        term.constant = evaluateConstantNode(node, context);
        return term;
      }
      case "UnaryExpression": {
        const argument = linearizeNode(node.argument);

        if (node.operator === "+") {
          return argument;
        }

        if (node.operator === "-") {
          return scaleAffine(argument, { re: -1, im: 0 });
        }

        throw createError("LINEAR_SYSTEM_UNSUPPORTED_UNARY_OPERATOR", `暂不支持一元运算符 ${node.operator}。`);
      }
      case "BinaryExpression": {
        const left = linearizeNode(node.left);
        const right = linearizeNode(node.right);

        switch (node.operator) {
          case "+":
            return addAffine(left, right);
          case "-":
            return subtractAffine(left, right);
          case "*":
            if (isScalarAffine(left)) {
              return scaleAffine(right, left.constant);
            }

            if (isScalarAffine(right)) {
              return scaleAffine(left, right.constant);
            }

            throw createError("LINEAR_SYSTEM_NONLINEAR_TERM", "当前方程组模式只支持线性项，暂不支持变量与变量相乘。");
          case "/":
            if (!isScalarAffine(right)) {
              throw createError("LINEAR_SYSTEM_NONLINEAR_TERM", "当前方程组模式只支持线性项，暂不支持变量出现在分母中。");
            }

            return divideAffine(left, right.constant);
          case "^": {
            const exponent = parseNumericExponent(right.constant);

            if (!isScalarAffine(right) || exponent === null) {
              throw createError("LINEAR_SYSTEM_NONLINEAR_TERM", "当前方程组模式只支持线性项，暂不支持复指数或变量指数。");
            }

            if (isScalarAffine(left)) {
              const term = empty();
              term.constant = evaluateConstantNode(node, context);
              return term;
            }

            if (exponent === 1) {
              return left;
            }

            if (exponent === 0) {
              const term = empty();
              term.constant = { re: 1, im: 0 };
              return term;
            }

            throw createError("LINEAR_SYSTEM_NONLINEAR_TERM", "当前方程组模式只支持一次项，暂不支持变量的高次幂。");
          }
          default:
            throw createError("LINEAR_SYSTEM_UNSUPPORTED_OPERATOR", `暂不支持运算符 ${node.operator}。`);
        }
      }
      case "FunctionCall":
      case "ConversionExpression":
        if (containsDeclaredVariable(node, context.variableSet)) {
          throw createError("LINEAR_SYSTEM_UNSUPPORTED_FUNCTION", "当前方程组模式暂不支持带变量的函数调用或形式转换。");
        }

        return {
          coefficients: Array.from({ length: context.variableNames.length }, () => ({ re: 0, im: 0 })),
          constant: evaluateConstantNode(node, context),
        };
      default:
        throw createError("LINEAR_SYSTEM_UNSUPPORTED_AST", `暂不支持语法节点 ${node.kind}。`);
    }
  }

  const leftAffine = linearizeNode(leftAst);
  const rightAffine = linearizeNode(rightAst);
  const normalized = subtractAffine(leftAffine, rightAffine);

  return {
    coefficients: normalized.coefficients,
    constant: negateComplex(normalized.constant),
  };
}

function solveLinearSystem(rows, variableNames) {
  const matrix = rows.map((row) => [...row.coefficients.map((item) => ({ ...item })), { ...row.constant }]);
  const rowCount = matrix.length;
  const columnCount = variableNames.length;
  let pivotRow = 0;
  const pivotColumns = [];

  for (let column = 0; column < columnCount && pivotRow < rowCount; column += 1) {
    let foundRow = -1;

    for (let row = pivotRow; row < rowCount; row += 1) {
      if (!isZeroComplex(matrix[row][column])) {
        foundRow = row;
        break;
      }
    }

    if (foundRow === -1) {
      continue;
    }

    if (foundRow !== pivotRow) {
      const temp = matrix[pivotRow];
      matrix[pivotRow] = matrix[foundRow];
      matrix[foundRow] = temp;
    }

    const pivot = matrix[pivotRow][column];
    for (let currentColumn = column; currentColumn <= columnCount; currentColumn += 1) {
      matrix[pivotRow][currentColumn] = divideComplex(matrix[pivotRow][currentColumn], pivot);
    }

    for (let row = 0; row < rowCount; row += 1) {
      if (row === pivotRow || isZeroComplex(matrix[row][column])) {
        continue;
      }

      const factor = matrix[row][column];

      for (let currentColumn = column; currentColumn <= columnCount; currentColumn += 1) {
        matrix[row][currentColumn] = subtractComplex(
          matrix[row][currentColumn],
          multiplyComplex(factor, matrix[pivotRow][currentColumn])
        );
      }
    }

    pivotColumns.push(column);
    pivotRow += 1;
  }

  for (let row = 0; row < rowCount; row += 1) {
    const allZero = matrix[row].slice(0, columnCount).every((value) => isZeroComplex(value));

    if (allZero && !isZeroComplex(matrix[row][columnCount])) {
      return {
        message: "该方程组无解。",
        status: "no-solution",
        variableNames,
      };
    }
  }

  if (pivotColumns.length < columnCount) {
    throw createError("LINEAR_SYSTEM_INFINITE_SOLUTIONS", "该方程组存在无穷多解，当前版本暂未支持进一步展示。");
  }

  return {
    message: "已求得唯一解。",
    solutions: variableNames.map((name, index) => ({
      label: name,
      multiplicity: 1,
      name,
      value: { ...matrix[index][columnCount] },
    })),
    status: "unique-solution",
    variableNames,
  };
}

function solvePolynomialEquationSet(polynomials, variableName) {
  const basePolynomial = polynomials.find((item) => polynomialDegree(item.coefficients) > 0);

  if (!basePolynomial) {
    const hasContradiction = polynomials.some((item) => {
      const normalized = trimPolynomial(item.coefficients);
      return normalized.length === 1 && !isZeroComplex(normalized[0]);
    });

    if (hasContradiction) {
      return {
        message: "该方程组无解。",
        status: "no-solution",
        variableNames: [variableName],
      };
    }

    throw createError("POLYNOMIAL_INFINITE_SOLUTIONS", "该方程恒成立，当前版本暂未支持进一步展示。");
  }

  const allRoots = solvePolynomialRoots(basePolynomial.coefficients);
  const validRoots = allRoots.filter((root) =>
    polynomials.every((item) => complexAbs(evaluatePolynomial(item.coefficients, root)) <= ROOT_TOLERANCE * 10)
  );

  if (validRoots.length === 0) {
    return {
      message: "该方程组无解。",
      status: "no-solution",
      variableNames: [variableName],
    };
  }

  const clusteredRoots = clusterRoots(validRoots);

  return {
    message: `已求得 ${clusteredRoots.length} 个根。`,
    roots: clusteredRoots.map((item, index) => ({
      label: `${variableName}${index + 1}`,
      multiplicity: item.multiplicity,
      value: item.value,
    })),
    status: "polynomial-solutions",
    variableNames: [variableName],
  };
}

export function solveEquationInputs({
  angleUnit = "rad",
  equations,
  functions = {},
  variableSource,
}) {
  const variableNames = parseVariableNames(variableSource);
  const normalizedEquations = equations
    .map((equation) => String(equation ?? "").trim())
    .filter(Boolean);

  if (normalizedEquations.length === 0) {
    throw createError("EQUATION_REQUIRED", "请至少输入一条方程。");
  }

  const variableIndex = new Map(variableNames.map((name, index) => [name, index]));
  const variableSet = new Set(variableNames);
  const parsedEquations = normalizedEquations.map((equation, index) => {
    const { left, right } = splitEquationSource(equation, index);

    try {
      return {
        leftAst: parseSource(left),
        rightAst: parseSource(right),
        source: equation,
      };
    } catch (error) {
      throw wrapError(error, "EQUATION_PARSE_FAILED", "方程解析失败。", {
        equationIndex: index,
        source: equation,
      });
    }
  });

  if (variableNames.length === 1) {
    const variableName = variableNames[0];
    const context = {
      angleUnit,
      functions,
      variableName,
    };

    const polynomials = parsedEquations.map((item, index) => {
      try {
        const leftPolynomial = polynomialFromNode(item.leftAst, context);
        const rightPolynomial = polynomialFromNode(item.rightAst, context);
        return {
          coefficients: subtractPolynomial(leftPolynomial, rightPolynomial),
          source: item.source,
        };
      } catch (error) {
        throw wrapError(error, "POLYNOMIAL_PARSE_FAILED", "高次方程解析失败。", {
          equationIndex: index,
          source: item.source,
        });
      }
    });

    return solvePolynomialEquationSet(polynomials, variableName);
  }

  if (variableNames.length === 2) {
    if (normalizedEquations.length < 2) {
      throw createError("BIVARIATE_TOO_FEW_EQUATIONS", "双变量方程组至少需要两条方程。");
    }

    const context = {
      angleUnit,
      functions,
      variableNames,
    };

    const polynomials = parsedEquations.map((item, index) => {
      try {
        const leftPolynomial = bivariatePolynomialFromNode(item.leftAst, context);
        const rightPolynomial = bivariatePolynomialFromNode(item.rightAst, context);
        return {
          coefficients: subtractBivariatePolynomial(leftPolynomial, rightPolynomial),
          source: item.source,
        };
      } catch (error) {
        throw wrapError(error, "BIVARIATE_PARSE_FAILED", "双变量高次方程组解析失败。", {
          equationIndex: index,
          source: item.source,
        });
      }
    });

    const activePolynomials = polynomials.filter((item) => !isZeroBivariatePolynomial(item.coefficients));

    if (activePolynomials.length > 0 && activePolynomials.every((item) => isLinearBivariatePolynomial(item.coefficients))) {
      const rows = activePolynomials.map((item, index) => {
        try {
          return buildLinearRowFromBivariate(item.coefficients);
        } catch (error) {
          throw wrapError(error, "LINEAR_SYSTEM_EQUATION_INVALID", "方程解析失败。", {
            equationIndex: index,
            source: item.source,
          });
        }
      });

      return solveLinearSystem(rows, variableNames);
    }

    return solveTwoVariablePolynomialSystem(polynomials, variableNames);
  }

  if (normalizedEquations.length < 2) {
    throw createError("LINEAR_SYSTEM_TOO_FEW_EQUATIONS", "多变量方程组至少需要两条方程。");
  }

  const linearContext = {
    angleUnit,
    functions,
    variableIndex,
    variableNames,
    variableSet,
  };

  const rows = parsedEquations.map((item, index) => {
    try {
      return buildLinearRow(item.leftAst, item.rightAst, linearContext);
    } catch (error) {
      throw wrapError(error, "LINEAR_SYSTEM_EQUATION_INVALID", "方程解析失败。", {
        equationIndex: index,
        source: item.source,
      });
    }
  });

  return solveLinearSystem(rows, variableNames);
}
