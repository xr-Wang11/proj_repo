"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { ANGLE_UNITS, DISPLAY_TYPES, createComplexValue, createEvaluationResult, createPhasorValue } = require(path.resolve(__dirname, "../../core/model"));
const { parseSource } = require(path.resolve(__dirname, "../../core/parser"));
const {
  evaluateSourceToLatex,
  renderAstToLatex,
  renderComplexRectToLatex,
  renderEvaluationResultToLatex,
  renderPhasorToLatex,
  renderSourceToLatex,
} = require(path.resolve(__dirname, "../../core/format"));

assert.equal(renderSourceToLatex("3 + 4*i"), "3 + 4 \\cdot i");
assert.equal(renderSourceToLatex("3 + 4*j"), "3 + 4 \\cdot j");
assert.equal(renderSourceToLatex("sin(pi/4)"), "\\sin\\left(\\frac{\\pi}{4}\\right)");
assert.equal(renderSourceToLatex("ln(e)"), "\\ln\\left(e\\right)");
assert.equal(renderSourceToLatex("lg(100)"), "\\lg\\left(100\\right)");
assert.equal(renderSourceToLatex("sqrt(-1)"), "\\sqrt{-1}");
assert.equal(renderSourceToLatex("to_polar(3+4*i,deg)"), "\\operatorname{to\\_polar}\\left(3 + 4 \\cdot i, \\mathrm{deg}\\right)");
assert.equal(renderSourceToLatex("(1+2*i)*(3-4*i)"), "\\left(1 + 2 \\cdot i\\right) \\cdot \\left(3 - 4 \\cdot i\\right)");

const ast = parseSource("-2^3^2");
assert.equal(renderAstToLatex(ast), "-2^{3^{2}}");

assert.equal(renderComplexRectToLatex(createComplexValue({ re: 3, im: 4 })), "3 + 4i");
assert.equal(renderComplexRectToLatex(createComplexValue({ re: 3, im: 4 }), { imaginaryUnit: "j" }), "3 + 4j");
assert.equal(renderComplexRectToLatex(createComplexValue({ re: 0, im: -1 })), "-i");
assert.equal(renderComplexRectToLatex(createComplexValue({ re: 0, im: -1 }), { imaginaryUnit: "j" }), "-j");

assert.equal(
  renderPhasorToLatex(createPhasorValue({ magnitude: 5, angle: 53.13, angleUnit: ANGLE_UNITS.DEG })),
  "5 \\angle 53.13^{\\circ}"
);

assert.equal(
  renderEvaluationResultToLatex(
    createEvaluationResult({
      value: createComplexValue({ re: 3, im: 4 }),
      displayType: DISPLAY_TYPES.COMPLEX_RECT,
      metadata: {
        preferredImaginaryUnit: "j",
      },
    })
  ),
  "3 + 4j"
);

assert.equal(
  renderEvaluationResultToLatex(
    createEvaluationResult({
      value: createComplexValue({ re: 3, im: 4 }),
      displayType: DISPLAY_TYPES.COMPLEX_POLAR,
      metadata: {
        polarValue: createPhasorValue({ magnitude: 5, angle: 53.13, angleUnit: ANGLE_UNITS.DEG }),
      },
    })
  ),
  "5 \\angle 53.13^{\\circ}"
);

assert.equal(evaluateSourceToLatex("to_polar(3+4*i,deg)"), "5 \\angle 53.13010235415598^{\\circ}");
assert.equal(evaluateSourceToLatex("rect(3,4)"), "3 + 4i");
assert.equal(evaluateSourceToLatex("3 + 4*j"), "3 + 4j");

console.log("Latex format tests passed.");
