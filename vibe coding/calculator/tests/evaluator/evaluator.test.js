"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { ANGLE_UNITS, DISPLAY_TYPES, createComplexValue } = require(path.resolve(__dirname, "../../core/model"));
const { evaluateSource, evaluateSourceToValue } = require(path.resolve(__dirname, "../../core/evaluator"));

function approxEqual(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}`);
}

function approxComplex(actual, expected, tolerance = 1e-10) {
  approxEqual(actual.re, expected.re, tolerance);
  approxEqual(actual.im, expected.im, tolerance);
}

approxComplex(evaluateSourceToValue("3 + 4*2"), { re: 11, im: 0 });
approxComplex(evaluateSourceToValue("(1+2*i)*(3-4*i)"), { re: 11, im: 2 });
approxComplex(evaluateSourceToValue("(1+2*j)*(3-4*j)"), { re: 11, im: 2 });
approxComplex(evaluateSourceToValue("i^2"), { re: -1, im: 0 });
approxComplex(evaluateSourceToValue("j^2"), { re: -1, im: 0 });
approxComplex(evaluateSourceToValue("rect(3,4)"), { re: 3, im: 4 });
approxComplex(evaluateSourceToValue("polar(5,53.13010235415598,deg)"), { re: 3, im: 4 });
approxComplex(evaluateSourceToValue("sin(pi/2)"), { re: 1, im: 0 });
approxComplex(evaluateSourceToValue("ln(e)"), { re: 1, im: 0 });
approxComplex(evaluateSourceToValue("lg(100)"), { re: 2, im: 0 });
approxComplex(evaluateSourceToValue("sqrt(-1)"), { re: 0, im: 1 });
approxComplex(evaluateSourceToValue("abs(3+4*i)"), { re: 5, im: 0 });
approxComplex(evaluateSourceToValue("arg(1+i,deg)"), { re: 45, im: 0 });
approxComplex(evaluateSourceToValue("re(3+4*i)"), { re: 3, im: 0 });
approxComplex(evaluateSourceToValue("im(3+4*i)"), { re: 4, im: 0 });
approxComplex(evaluateSourceToValue("conj(3+4*i)"), { re: 3, im: -4 });

const polarResult = evaluateSource("to_polar(3+4*i,deg)");
approxComplex(polarResult.value, { re: 3, im: 4 });
assert.equal(polarResult.displayType, DISPLAY_TYPES.COMPLEX_POLAR);
approxEqual(polarResult.metadata.polarValue.magnitude, 5);
approxEqual(polarResult.metadata.polarValue.angle, 53.13010235415598);
assert.equal(polarResult.metadata.preferredAngleUnit, ANGLE_UNITS.DEG);
assert.equal(polarResult.metadata.preferredImaginaryUnit, "i");

const jRectResult = evaluateSource("3 + 4*j");
approxComplex(jRectResult.value, { re: 3, im: 4 });
assert.equal(jRectResult.metadata.preferredImaginaryUnit, "j");

const defaultRectResult = evaluateSource("3 + 4");
approxComplex(defaultRectResult.value, { re: 7, im: 0 });
assert.equal(defaultRectResult.metadata.preferredImaginaryUnit, "i");

const rectResult = evaluateSource("to_rect(polar(5,53.13010235415598,deg))");
approxComplex(rectResult.value, { re: 3, im: 4 });
assert.equal(rectResult.displayType, DISPLAY_TYPES.COMPLEX_RECT);

approxComplex(
  evaluateSourceToValue("x + 2", {
    variables: {
      x: createComplexValue({ re: 5, im: 0 }),
    },
  }),
  { re: 7, im: 0 }
);

assert.throws(
  () => evaluateSource("log(10)"),
  (error) => error && error.kind === "NameError" && error.code === "NAME_UNKNOWN_FUNCTION"
);

assert.throws(
  () => evaluateSource("unknown_symbol + 1"),
  (error) => error && error.kind === "NameError" && error.code === "NAME_UNKNOWN_IDENTIFIER"
);

assert.throws(
  () => evaluateSource("abs()"),
  (error) => error && error.kind === "ArityError" && error.code === "ARITY_EXACT_MISMATCH"
);

assert.throws(
  () => evaluateSource("rect(1+i,2)"),
  (error) => error && error.kind === "MathDomainError" && error.code === "MATH_EXPECTED_REAL_ARGUMENT"
);

assert.throws(
  () => evaluateSource("i + j"),
  (error) => error && error.kind === "UnsupportedFeatureError" && error.code === "IMAGINARY_UNIT_MIXED"
);

assert.throws(
  () => evaluateSource("j(1)"),
  (error) => error && error.kind === "NameError" && error.code === "NAME_UNKNOWN_FUNCTION"
);

console.log("Evaluator tests passed.");
