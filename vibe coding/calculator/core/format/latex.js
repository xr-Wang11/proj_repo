"use strict";

const {
  ANGLE_UNITS,
  AST_NODE_TYPES,
  DISPLAY_TYPES,
  isComplexValue,
  isPhasorValue,
} = require("../model");
const { parseSource } = require("../parser");
const { evaluateSource } = require("../evaluator");

const PRECEDENCE = Object.freeze({
  additive: 1,
  multiplicative: 2,
  unary: 3,
  power: 4,
  primary: 5,
});

const FUNCTION_LATEX_NAMES = Object.freeze({
  sin: "\\sin",
  cos: "\\cos",
  tan: "\\tan",
  lg: "\\lg",
  ln: "\\ln",
  exp: "\\exp",
  sqrt: "\\sqrt",
  arg: "\\arg",
});

function escapeLatexText(value) {
  return String(value).replace(/_/g, "\\_");
}

function numberToLatex(value) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new TypeError("numberToLatex.value must be a finite number.");
  }

  const text = String(value);
  const scientificMatch = text.match(/^(-?\d+(?:\.\d+)?)e([+-]?\d+)$/i);

  if (scientificMatch) {
    return `${scientificMatch[1]} \\times 10^{${Number(scientificMatch[2])}}`;
  }

  return text;
}

function identifierToLatex(name) {
  switch (name) {
    case "pi":
      return "\\pi";
    case "deg":
      return "\\mathrm{deg}";
    case "rad":
      return "\\mathrm{rad}";
    case "e":
      return "e";
    case "i":
      return "i";
    case "j":
      return "j";
    default:
      return `\\mathrm{${escapeLatexText(name)}}`;
  }
}

function resolveImaginaryUnitSymbol(options = {}) {
  return options.imaginaryUnit === "j" ? "j" : "i";
}

function getPrecedence(node) {
  switch (node.kind) {
    case AST_NODE_TYPES.BINARY_EXPRESSION:
      switch (node.operator) {
        case "+":
        case "-":
          return PRECEDENCE.additive;
        case "*":
        case "/":
          return PRECEDENCE.multiplicative;
        case "^":
          return PRECEDENCE.power;
        default:
          return PRECEDENCE.primary;
      }
    case AST_NODE_TYPES.UNARY_EXPRESSION:
      return PRECEDENCE.unary;
    default:
      return PRECEDENCE.primary;
  }
}

function wrapIfNeeded(latex, condition) {
  return condition ? `\\left(${latex}\\right)` : latex;
}

function renderFunctionName(name) {
  if (FUNCTION_LATEX_NAMES[name]) {
    return FUNCTION_LATEX_NAMES[name];
  }

  return `\\operatorname{${escapeLatexText(name)}}`;
}

function renderFunctionCall(node) {
  const name = node.callee.name;
  const args = Array.from(node.args).map((argument) => renderAstToLatex(argument));

  if (name === "sqrt" && args.length === 1) {
    return `\\sqrt{${args[0]}}`;
  }

  if (name === "abs" && args.length === 1) {
    return `\\left|${args[0]}\\right|`;
  }

  if (name === "conj" && args.length === 1) {
    return `\\overline{${args[0]}}`;
  }

  const latexName = renderFunctionName(name);
  return `${latexName}\\left(${args.join(", ")}\\right)`;
}

function renderUnaryExpression(node) {
  const argument = renderAstToLatex(node.argument);
  const needsWrap = getPrecedence(node.argument) < PRECEDENCE.unary;
  return `${node.operator}${wrapIfNeeded(argument, needsWrap)}`;
}

function renderBinaryExpression(node) {
  if (node.operator === "/") {
    return `\\frac{${renderAstToLatex(node.left)}}{${renderAstToLatex(node.right)}}`;
  }

  if (node.operator === "^") {
    const baseNeedsWrap = getPrecedence(node.left) < PRECEDENCE.power;
    const exponentLatex = renderAstToLatex(node.right);
    return `${wrapIfNeeded(renderAstToLatex(node.left), baseNeedsWrap)}^{${exponentLatex}}`;
  }

  const currentPrecedence = getPrecedence(node);
  const leftLatex = renderAstToLatex(node.left);
  const rightLatex = renderAstToLatex(node.right);

  const leftNeedsWrap = getPrecedence(node.left) < currentPrecedence;
  const rightNeedsWrap =
    getPrecedence(node.right) < currentPrecedence ||
    (node.operator === "-" && getPrecedence(node.right) === currentPrecedence);

  const operatorLatex = node.operator === "*" ? "\\cdot" : node.operator;

  return `${wrapIfNeeded(leftLatex, leftNeedsWrap)} ${operatorLatex} ${wrapIfNeeded(rightLatex, rightNeedsWrap)}`;
}

function renderConversionExpression(node) {
  const source = renderAstToLatex(node.source);

  if (node.targetForm === "rect") {
    return `\\operatorname{to\\_rect}\\left(${source}\\right)`;
  }

  if (node.angleUnit) {
    return `\\operatorname{to\\_polar}\\left(${source}, ${identifierToLatex(node.angleUnit)}\\right)`;
  }

  return `\\operatorname{to\\_polar}\\left(${source}\\right)`;
}

function renderAstToLatex(node) {
  switch (node.kind) {
    case AST_NODE_TYPES.NUMBER_LITERAL:
      return numberToLatex(node.value);
    case AST_NODE_TYPES.IDENTIFIER:
      return identifierToLatex(node.name);
    case AST_NODE_TYPES.UNARY_EXPRESSION:
      return renderUnaryExpression(node);
    case AST_NODE_TYPES.BINARY_EXPRESSION:
      return renderBinaryExpression(node);
    case AST_NODE_TYPES.FUNCTION_CALL:
      return renderFunctionCall(node);
    case AST_NODE_TYPES.CONVERSION_EXPRESSION:
      return renderConversionExpression(node);
    default:
      throw new TypeError(`Unsupported AST node kind: ${node.kind}`);
  }
}

function renderComplexRectToLatex(value, options = {}) {
  if (!isComplexValue(value)) {
    throw new TypeError("renderComplexRectToLatex.value must be a ComplexValue.");
  }

  const imaginaryUnit = resolveImaginaryUnitSymbol(options);
  const re = value.re;
  const im = value.im;

  if (im === 0) {
    return numberToLatex(re);
  }

  const imagMagnitude = Math.abs(im);
  const imagPart =
    imagMagnitude === 1 ? imaginaryUnit : `${numberToLatex(imagMagnitude)}${imaginaryUnit}`;

  if (re === 0) {
    return im < 0 ? `-${imagPart}` : imagPart;
  }

  return `${numberToLatex(re)} ${im < 0 ? "-" : "+"} ${imagPart}`;
}

function renderPhasorToLatex(value) {
  if (!isPhasorValue(value)) {
    throw new TypeError("renderPhasorToLatex.value must be a PhasorValue.");
  }

  const magnitude = numberToLatex(value.magnitude);
  const angle = numberToLatex(value.angle);

  if (value.angleUnit === ANGLE_UNITS.DEG) {
    return `${magnitude} \\angle ${angle}^{\\circ}`;
  }

  return `${magnitude} \\angle ${angle}\\,\\mathrm{rad}`;
}

function renderEvaluationResultToLatex(result) {
  if (!result || typeof result !== "object") {
    throw new TypeError("renderEvaluationResultToLatex.result must be an object.");
  }

  if (result.displayType === DISPLAY_TYPES.COMPLEX_POLAR && result.metadata && result.metadata.polarValue) {
    return renderPhasorToLatex(result.metadata.polarValue);
  }

  if (isPhasorValue(result.value)) {
    return renderPhasorToLatex(result.value);
  }

  if (isComplexValue(result.value)) {
    return renderComplexRectToLatex(result.value, {
      imaginaryUnit: result.metadata?.preferredImaginaryUnit,
    });
  }

  if (typeof result.latex === "string" && result.latex) {
    return result.latex;
  }

  return "";
}

function renderSourceToLatex(input) {
  return renderAstToLatex(parseSource(input));
}

function evaluateSourceToLatex(input, context = {}) {
  return renderEvaluationResultToLatex(evaluateSource(input, context));
}

module.exports = {
  evaluateSourceToLatex,
  identifierToLatex,
  numberToLatex,
  renderAstToLatex,
  renderComplexRectToLatex,
  renderEvaluationResultToLatex,
  renderPhasorToLatex,
  renderSourceToLatex,
};
