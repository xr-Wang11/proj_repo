import { evaluate, parseSource } from "@/adapters/core-api.js";

const DEFAULT_VIEWPORT = Object.freeze({
  maxX: 6,
  maxY: 6,
  minX: -6,
  minY: -6,
});

const PLOT_COLORS = Object.freeze([
  "#b64926",
  "#2a6f97",
  "#52796f",
  "#8f5a2a",
  "#7b2cbf",
  "#3a5a40",
]);

const SAMPLE_GRID = 84;
const INTERSECTION_TOLERANCE = 1e-8;
const REAL_TOLERANCE = 1e-7;
const ZERO_TOLERANCE = 1e-8;

function normalizeNearZero(value) {
  return Math.abs(value) <= ZERO_TOLERANCE ? 0 : value;
}

function addComplex(left, right) {
  return {
    im: normalizeNearZero(left.im + right.im),
    re: normalizeNearZero(left.re + right.re),
  };
}

function subtractComplex(left, right) {
  return {
    im: normalizeNearZero(left.im - right.im),
    re: normalizeNearZero(left.re - right.re),
  };
}

function multiplyComplex(left, right) {
  return {
    im: normalizeNearZero(left.re * right.im + left.im * right.re),
    re: normalizeNearZero(left.re * right.re - left.im * right.im),
  };
}

function divideComplex(left, right) {
  const denominator = right.re * right.re + right.im * right.im;

  if (Math.abs(denominator) <= ZERO_TOLERANCE) {
    throw new Error("Plot division by zero.");
  }

  return {
    im: normalizeNearZero((left.im * right.re - left.re * right.im) / denominator),
    re: normalizeNearZero((left.re * right.re + left.im * right.im) / denominator),
  };
}

function scaleComplex(value, scalar) {
  return multiplyComplex(value, scalar);
}

function isZeroComplex(value) {
  return Math.abs(value.re) <= ZERO_TOLERANCE && Math.abs(value.im) <= ZERO_TOLERANCE;
}

function isNearReal(value) {
  return Math.abs(value.im) <= REAL_TOLERANCE;
}

function toRealScalar(value) {
  return isNearReal(value) ? normalizeNearZero(value.re) : null;
}

function toComplexVariable(value) {
  return {
    kind: "ComplexValue",
    im: 0,
    re: normalizeNearZero(value),
  };
}

function splitEquation(source) {
  const text = String(source ?? "").trim();

  if (!text) {
    return null;
  }

  const parts = text.split("=");

  if (parts.length !== 2) {
    return null;
  }

  const left = parts[0].trim();
  const right = parts[1].trim();

  if (!left || !right) {
    return null;
  }

  return { left, right, source: text };
}

function parseVariableNames(source) {
  return String(source ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAxisSelection(variableNames, xAxisVariable, yAxisVariable) {
  const options = variableNames.slice(0, 2);

  if (options.length < 2) {
    return {
      xAxisVariable: "",
      yAxisVariable: "",
    };
  }

  let xAxis = options.includes(xAxisVariable) ? xAxisVariable : options[0];
  let yAxis = options.includes(yAxisVariable) ? yAxisVariable : options[1];

  if (xAxis === yAxis) {
    yAxis = options.find((item) => item !== xAxis) || options[1];
  }

  return {
    xAxisVariable: xAxis,
    yAxisVariable: yAxis,
  };
}

function normalizeViewportInput(viewportInput) {
  const rawMinX = viewportInput?.minX;
  const rawMaxX = viewportInput?.maxX;
  const rawMinY = viewportInput?.minY;
  const rawMaxY = viewportInput?.maxY;

  if (
    rawMinX === null || rawMinX === "" || rawMinX === undefined
    || rawMaxX === null || rawMaxX === "" || rawMaxX === undefined
    || rawMinY === null || rawMinY === "" || rawMinY === undefined
    || rawMaxY === null || rawMaxY === "" || rawMaxY === undefined
  ) {
    return null;
  }

  const minX = Number(rawMinX);
  const maxX = Number(rawMaxX);
  const minY = Number(rawMinY);
  const maxY = Number(rawMaxY);

  if (
    !Number.isFinite(minX)
    || !Number.isFinite(maxX)
    || !Number.isFinite(minY)
    || !Number.isFinite(maxY)
    || minX >= maxX
    || minY >= maxY
  ) {
    return null;
  }

  return {
    maxX,
    maxY,
    minX,
    minY,
  };
}

function createVariables(xAxisVariable, yAxisVariable, xValue, yValue) {
  return {
    [xAxisVariable]: toComplexVariable(xValue),
    [yAxisVariable]: toComplexVariable(yValue),
  };
}

function evaluateConstantNode(node, context) {
  return evaluate(node, {
    functions: context.functions,
    options: {
      angleUnit: context.angleUnit,
      outputMode: "plain",
    },
  }).value;
}

function containsAxisVariable(node, axisSet) {
  if (!node || typeof node !== "object") {
    return false;
  }

  switch (node.kind) {
    case "Identifier":
      return axisSet.has(node.name);
    case "UnaryExpression":
      return containsAxisVariable(node.argument, axisSet);
    case "BinaryExpression":
      return containsAxisVariable(node.left, axisSet) || containsAxisVariable(node.right, axisSet);
    case "FunctionCall":
      return containsAxisVariable(node.callee, axisSet)
        || node.args.some((item) => containsAxisVariable(item, axisSet));
    case "ConversionExpression":
      return containsAxisVariable(node.source, axisSet);
    default:
      return false;
  }
}

function createAffineTerm() {
  return {
    constant: { re: 0, im: 0 },
    xCoeff: { re: 0, im: 0 },
    yCoeff: { re: 0, im: 0 },
  };
}

function addAffine(left, right) {
  return {
    constant: addComplex(left.constant, right.constant),
    xCoeff: addComplex(left.xCoeff, right.xCoeff),
    yCoeff: addComplex(left.yCoeff, right.yCoeff),
  };
}

function subtractAffine(left, right) {
  return {
    constant: subtractComplex(left.constant, right.constant),
    xCoeff: subtractComplex(left.xCoeff, right.xCoeff),
    yCoeff: subtractComplex(left.yCoeff, right.yCoeff),
  };
}

function scaleAffine(term, scalar) {
  return {
    constant: multiplyComplex(term.constant, scalar),
    xCoeff: multiplyComplex(term.xCoeff, scalar),
    yCoeff: multiplyComplex(term.yCoeff, scalar),
  };
}

function divideAffine(term, scalar) {
  return {
    constant: divideComplex(term.constant, scalar),
    xCoeff: divideComplex(term.xCoeff, scalar),
    yCoeff: divideComplex(term.yCoeff, scalar),
  };
}

function isScalarAffine(term) {
  return isZeroComplex(term.xCoeff) && isZeroComplex(term.yCoeff);
}

function linearizeNode(node, context) {
  switch (node.kind) {
    case "NumberLiteral": {
      const term = createAffineTerm();
      term.constant = { re: node.value, im: 0 };
      return term;
    }
    case "Identifier": {
      const term = createAffineTerm();

      if (node.name === context.xAxisVariable) {
        term.xCoeff = { re: 1, im: 0 };
        return term;
      }

      if (node.name === context.yAxisVariable) {
        term.yCoeff = { re: 1, im: 0 };
        return term;
      }

      term.constant = evaluateConstantNode(node, context);
      return term;
    }
    case "UnaryExpression": {
      const argument = linearizeNode(node.argument, context);

      if (node.operator === "+") {
        return argument;
      }

      if (node.operator === "-") {
        return scaleAffine(argument, { re: -1, im: 0 });
      }

      throw new Error("Unsupported unary operator.");
    }
    case "BinaryExpression": {
      const left = linearizeNode(node.left, context);
      const right = linearizeNode(node.right, context);

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

          throw new Error("Nonlinear term.");
        case "/":
          if (!isScalarAffine(right)) {
            throw new Error("Variable in denominator.");
          }

          return divideAffine(left, right.constant);
        case "^":
          if (!isScalarAffine(right) || right.constant.im !== 0) {
            throw new Error("Unsupported exponent.");
          }

          if (isScalarAffine(left)) {
            const term = createAffineTerm();
            term.constant = evaluateConstantNode(node, context);
            return term;
          }

          if (right.constant.re === 1) {
            return left;
          }

          if (right.constant.re === 0) {
            const term = createAffineTerm();
            term.constant = { re: 1, im: 0 };
            return term;
          }

          throw new Error("Nonlinear power.");
        default:
          throw new Error("Unsupported binary operator.");
      }
    }
    case "FunctionCall":
    case "ConversionExpression":
      if (containsAxisVariable(node, context.axisVariableSet)) {
        throw new Error("Unsupported variable function.");
      }

      return {
        constant: evaluateConstantNode(node, context),
        xCoeff: { re: 0, im: 0 },
        yCoeff: { re: 0, im: 0 },
      };
    default:
      throw new Error("Unsupported AST.");
  }
}

function extractLinearEquation(leftAst, rightAst, context) {
  try {
    const left = linearizeNode(leftAst, context);
    const right = linearizeNode(rightAst, context);
    const normalized = subtractAffine(left, right);

    if (!isNearReal(normalized.xCoeff) || !isNearReal(normalized.yCoeff) || !isNearReal(normalized.constant)) {
      return null;
    }

    const a = normalizeNearZero(normalized.xCoeff.re);
    const b = normalizeNearZero(normalized.yCoeff.re);
    const c = normalizeNearZero(normalized.constant.re);

    if (Math.abs(a) <= ZERO_TOLERANCE && Math.abs(b) <= ZERO_TOLERANCE) {
      return null;
    }

    return { a, b, c };
  } catch {
    return null;
  }
}

function createCompiledEquation(entry, index, context) {
  try {
    const leftAst = parseSource(entry.left);
    const rightAst = parseSource(entry.right);
    const line = extractLinearEquation(leftAst, rightAst, context);

    return {
      color: PLOT_COLORS[index % PLOT_COLORS.length],
      evaluateResidual(xValue, yValue) {
        try {
          const variables = createVariables(context.xAxisVariable, context.yAxisVariable, xValue, yValue);
          const leftResult = evaluate(leftAst, {
            functions: context.functions,
            options: {
              angleUnit: context.angleUnit,
              outputMode: "plain",
            },
            variables,
          }).value;
          const rightResult = evaluate(rightAst, {
            functions: context.functions,
            options: {
              angleUnit: context.angleUnit,
              outputMode: "plain",
            },
            variables,
          }).value;

          return subtractComplex(leftResult, rightResult);
        } catch {
          return null;
        }
      },
      isLinear: Boolean(line),
      label: `方程 ${index + 1}`,
      line,
      source: entry.source,
    };
  } catch {
    return null;
  }
}

function collectRealSolutionPairs(result, xAxisVariable, yAxisVariable) {
  if (result.status === "pair-solutions") {
    return (result.solutionPairs || [])
      .map((pair) => {
        const xEntry = pair.values?.find((item) => item.name === xAxisVariable);
        const yEntry = pair.values?.find((item) => item.name === yAxisVariable);

        if (!xEntry || !yEntry || !isNearReal(xEntry.value) || !isNearReal(yEntry.value)) {
          return null;
        }

        return {
          x: normalizeNearZero(xEntry.value.re),
          y: normalizeNearZero(yEntry.value.re),
        };
      })
      .filter(Boolean);
  }

  if (result.status === "unique-solution" && Array.isArray(result.solutions) && result.solutions.length >= 2) {
    const xEntry = result.solutions.find((item) => item.name === xAxisVariable);
    const yEntry = result.solutions.find((item) => item.name === yAxisVariable);

    if (xEntry && yEntry && isNearReal(xEntry.value) && isNearReal(yEntry.value)) {
      return [
        {
          x: normalizeNearZero(xEntry.value.re),
          y: normalizeNearZero(yEntry.value.re),
        },
      ];
    }
  }

  return [];
}

function createViewportFromSolutions(solutionPoints) {
  if (solutionPoints.length === 0) {
    return { ...DEFAULT_VIEWPORT };
  }

  const xs = solutionPoints.map((item) => item.x);
  const ys = solutionPoints.map((item) => item.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const marginX = Math.max(2, spanX * 0.75);
  const marginY = Math.max(2, spanY * 0.75);

  return {
    maxX: maxX + marginX,
    maxY: maxY + marginY,
    minX: minX - marginX,
    minY: minY - marginY,
  };
}

function pushUniquePoint(points, point) {
  const exists = points.some((item) =>
    Math.abs(item.x - point.x) <= INTERSECTION_TOLERANCE
      && Math.abs(item.y - point.y) <= INTERSECTION_TOLERANCE
  );

  if (!exists) {
    points.push(point);
  }
}

function lineSegmentForViewport(line, viewport) {
  const intersections = [];

  if (Math.abs(line.b) > ZERO_TOLERANCE) {
    const yAtMinX = -(line.a * viewport.minX + line.c) / line.b;
    const yAtMaxX = -(line.a * viewport.maxX + line.c) / line.b;

    if (yAtMinX >= viewport.minY - ZERO_TOLERANCE && yAtMinX <= viewport.maxY + ZERO_TOLERANCE) {
      pushUniquePoint(intersections, { x: viewport.minX, y: normalizeNearZero(yAtMinX) });
    }

    if (yAtMaxX >= viewport.minY - ZERO_TOLERANCE && yAtMaxX <= viewport.maxY + ZERO_TOLERANCE) {
      pushUniquePoint(intersections, { x: viewport.maxX, y: normalizeNearZero(yAtMaxX) });
    }
  }

  if (Math.abs(line.a) > ZERO_TOLERANCE) {
    const xAtMinY = -(line.b * viewport.minY + line.c) / line.a;
    const xAtMaxY = -(line.b * viewport.maxY + line.c) / line.a;

    if (xAtMinY >= viewport.minX - ZERO_TOLERANCE && xAtMinY <= viewport.maxX + ZERO_TOLERANCE) {
      pushUniquePoint(intersections, { x: normalizeNearZero(xAtMinY), y: viewport.minY });
    }

    if (xAtMaxY >= viewport.minX - ZERO_TOLERANCE && xAtMaxY <= viewport.maxX + ZERO_TOLERANCE) {
      pushUniquePoint(intersections, { x: normalizeNearZero(xAtMaxY), y: viewport.maxY });
    }
  }

  if (intersections.length < 2) {
    return [];
  }

  if (intersections.length === 2) {
    return [[intersections[0], intersections[1]]];
  }

  let bestPair = [intersections[0], intersections[1]];
  let bestDistance = 0;

  for (let leftIndex = 0; leftIndex < intersections.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < intersections.length; rightIndex += 1) {
      const left = intersections[leftIndex];
      const right = intersections[rightIndex];
      const distance = Math.hypot(left.x - right.x, left.y - right.y);

      if (distance > bestDistance) {
        bestDistance = distance;
        bestPair = [left, right];
      }
    }
  }

  return [bestPair];
}

function interpolateEdge(pointA, pointB, valueA, valueB) {
  const denominator = valueB - valueA;
  const t = Math.abs(denominator) <= INTERSECTION_TOLERANCE ? 0.5 : valueA / (valueA - valueB);

  return {
    x: pointA.x + (pointB.x - pointA.x) * t,
    y: pointA.y + (pointB.y - pointA.y) * t,
  };
}

function buildSegmentsForCell(corners, values) {
  const edges = [];
  const pairs = [
    [0, 1],
    [1, 3],
    [2, 3],
    [0, 2],
  ];

  for (const [leftIndex, rightIndex] of pairs) {
    const leftValue = values[leftIndex];
    const rightValue = values[rightIndex];

    if (leftValue === null || rightValue === null) {
      continue;
    }

    if (Math.abs(leftValue) <= INTERSECTION_TOLERANCE && Math.abs(rightValue) <= INTERSECTION_TOLERANCE) {
      edges.push(corners[leftIndex], corners[rightIndex]);
      continue;
    }

    if ((leftValue < 0 && rightValue > 0) || (leftValue > 0 && rightValue < 0) || Math.abs(leftValue) <= INTERSECTION_TOLERANCE || Math.abs(rightValue) <= INTERSECTION_TOLERANCE) {
      edges.push(interpolateEdge(corners[leftIndex], corners[rightIndex], leftValue, rightValue));
    }
  }

  const uniqueEdges = [];

  for (const edge of edges) {
    pushUniquePoint(uniqueEdges, edge);
  }

  if (uniqueEdges.length < 2) {
    return [];
  }

  if (uniqueEdges.length === 2) {
    return [[uniqueEdges[0], uniqueEdges[1]]];
  }

  if (uniqueEdges.length === 4) {
    return [
      [uniqueEdges[0], uniqueEdges[1]],
      [uniqueEdges[2], uniqueEdges[3]],
    ];
  }

  return [];
}

function sampleEquationSegments(equation, viewport) {
  const values = [];
  const segments = [];
  const stepX = (viewport.maxX - viewport.minX) / (SAMPLE_GRID - 1);
  const stepY = (viewport.maxY - viewport.minY) / (SAMPLE_GRID - 1);

  for (let yIndex = 0; yIndex < SAMPLE_GRID; yIndex += 1) {
    const row = [];
    const yValue = viewport.maxY - yIndex * stepY;

    for (let xIndex = 0; xIndex < SAMPLE_GRID; xIndex += 1) {
      const xValue = viewport.minX + xIndex * stepX;
      const residual = equation.evaluateResidual(xValue, yValue);
      row.push(residual ? toRealScalar(residual) : null);
    }

    values.push(row);
  }

  for (let yIndex = 0; yIndex < SAMPLE_GRID - 1; yIndex += 1) {
    for (let xIndex = 0; xIndex < SAMPLE_GRID - 1; xIndex += 1) {
      const corners = [
        { x: viewport.minX + xIndex * stepX, y: viewport.maxY - yIndex * stepY },
        { x: viewport.minX + (xIndex + 1) * stepX, y: viewport.maxY - yIndex * stepY },
        { x: viewport.minX + xIndex * stepX, y: viewport.maxY - (yIndex + 1) * stepY },
        { x: viewport.minX + (xIndex + 1) * stepX, y: viewport.maxY - (yIndex + 1) * stepY },
      ];
      const cellValues = [
        values[yIndex][xIndex],
        values[yIndex][xIndex + 1],
        values[yIndex + 1][xIndex],
        values[yIndex + 1][xIndex + 1],
      ];

      segments.push(...buildSegmentsForCell(corners, cellValues));
    }
  }

  return segments;
}

export function createEquationPlotPort(config = {}) {
  return Object.freeze({
    canOpenStandalone: Boolean(config.canOpenStandalone),
    mode: config.mode || "embedded",
    target: config.target || "equation-plot",
  });
}

export function buildEquationPlotModel({
  angleUnit = "rad",
  equations,
  functions = {},
  result = null,
  variableSource,
  viewportInput = null,
  xAxisVariable = "",
  yAxisVariable = "",
}) {
  const variableNames = parseVariableNames(variableSource);

  if (variableNames.length !== 2) {
    return {
      axisVariableOptions: variableNames,
      curves: [],
      message: variableNames.length >= 3
        ? "当前仅在双变量方程组下显示二维图像。"
        : "声明两个变量后可显示二维图像。",
      port: createEquationPlotPort(),
      solutionPoints: [],
      variableNames,
      viewport: { ...DEFAULT_VIEWPORT },
      viewportMode: "auto",
      visible: false,
      xAxisVariable: "",
      yAxisVariable: "",
    };
  }

  const normalizedAxes = normalizeAxisSelection(variableNames, xAxisVariable, yAxisVariable);
  const parsedEquations = (equations || [])
    .map((equation) => splitEquation(equation))
    .filter(Boolean);

  if (parsedEquations.length === 0) {
    return {
      axisVariableOptions: variableNames,
      curves: [],
      message: "输入有效方程后可显示二维图像。",
      port: createEquationPlotPort(),
      solutionPoints: [],
      variableNames,
      viewport: { ...DEFAULT_VIEWPORT },
      viewportMode: "auto",
      visible: true,
      xAxisVariable: normalizedAxes.xAxisVariable,
      yAxisVariable: normalizedAxes.yAxisVariable,
    };
  }

  const compileContext = {
    angleUnit,
    axisVariableSet: new Set([normalizedAxes.xAxisVariable, normalizedAxes.yAxisVariable]),
    functions,
    xAxisVariable: normalizedAxes.xAxisVariable,
    yAxisVariable: normalizedAxes.yAxisVariable,
  };
  const compiled = parsedEquations
    .map((entry, index) => createCompiledEquation(entry, index, compileContext))
    .filter(Boolean);

  if (compiled.length === 0) {
    return {
      axisVariableOptions: variableNames,
      curves: [],
      message: "当前方程暂时无法绘图。",
      port: createEquationPlotPort(),
      solutionPoints: [],
      variableNames,
      viewport: { ...DEFAULT_VIEWPORT },
      viewportMode: "auto",
      visible: true,
      xAxisVariable: normalizedAxes.xAxisVariable,
      yAxisVariable: normalizedAxes.yAxisVariable,
    };
  }

  const solutionPoints = collectRealSolutionPairs(
    result || {},
    normalizedAxes.xAxisVariable,
    normalizedAxes.yAxisVariable
  );
  const autoViewport = createViewportFromSolutions(solutionPoints);
  const manualViewport = normalizeViewportInput(viewportInput);
  const viewport = manualViewport || autoViewport;
  const curves = compiled.map((equation) => ({
    color: equation.color,
    isLinear: equation.isLinear,
    label: equation.label,
    segments: equation.line
      ? lineSegmentForViewport(equation.line, viewport)
      : sampleEquationSegments(equation, viewport),
    source: equation.source,
  }));

  return {
    axisVariableOptions: variableNames,
    curves,
    message: "可选已声明变量作为横纵轴；坐标轴数值会随视窗缩放自动调整精度。",
    port: createEquationPlotPort(),
    solutionPoints,
    variableNames,
    viewport,
    viewportMode: manualViewport ? "manual" : "auto",
    visible: true,
    xAxisVariable: normalizedAxes.xAxisVariable,
    yAxisVariable: normalizedAxes.yAxisVariable,
  };
}
