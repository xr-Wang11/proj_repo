"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const {
  ANGLE_UNITS,
  createComplexValue,
  createPhasorValue,
} = require(path.resolve(__dirname, "../../core/model"));
const {
  addComplex,
  angleOfComplex,
  asComplexValue,
  conjugateComplex,
  divideComplex,
  fromPhasorParts,
  imaginaryPart,
  magnitudeOfComplex,
  multiplyComplex,
  powerComplex,
  radiansToDegrees,
  realPart,
  subtractComplex,
  toPhasorValue,
} = require(path.resolve(__dirname, "../../core/math"));

function approxEqual(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}`);
}

function approxComplex(actual, expected, tolerance = 1e-10) {
  approxEqual(actual.re, expected.re, tolerance);
  approxEqual(actual.im, expected.im, tolerance);
}

approxComplex(
  addComplex(createComplexValue({ re: 3, im: 4 }), createComplexValue({ re: -1, im: 2 })),
  { re: 2, im: 6 }
);

approxComplex(
  subtractComplex(createComplexValue({ re: 3, im: 4 }), createComplexValue({ re: -1, im: 2 })),
  { re: 4, im: 2 }
);

approxComplex(
  multiplyComplex(createComplexValue({ re: 1, im: 2 }), createComplexValue({ re: 3, im: -4 })),
  { re: 11, im: 2 }
);

approxComplex(
  divideComplex(createComplexValue({ re: 1, im: 2 }), createComplexValue({ re: 3, im: -4 })),
  { re: -0.2, im: 0.4 }
);

approxEqual(magnitudeOfComplex(createComplexValue({ re: 3, im: 4 })), 5);
approxEqual(angleOfComplex(createComplexValue({ re: 1, im: 1 }), ANGLE_UNITS.DEG), 45);

approxComplex(
  conjugateComplex(createComplexValue({ re: 3, im: -4 })),
  { re: 3, im: 4 }
);

approxComplex(
  fromPhasorParts(5, 53.13010235415598, ANGLE_UNITS.DEG),
  { re: 3, im: 4 }
);

const phasor = toPhasorValue(createComplexValue({ re: 3, im: 4 }), ANGLE_UNITS.DEG);
approxEqual(phasor.magnitude, 5);
approxEqual(phasor.angle, 53.13010235415598);

approxComplex(
  powerComplex(createComplexValue({ re: 0, im: 1 }), 2),
  { re: -1, im: 0 }
);

assert.equal(realPart(asComplexValue(2)), 2);
assert.equal(imaginaryPart(asComplexValue(2)), 0);
assert.equal(radiansToDegrees(Math.PI / 2), 90);

assert.throws(
  () => divideComplex(createComplexValue({ re: 1, im: 0 }), createComplexValue({ re: 0, im: 0 })),
  (error) => error && error.kind === "MathDomainError" && error.code === "MATH_DIVISION_BY_ZERO"
);

assert.throws(
  () => angleOfComplex(createComplexValue({ re: 0, im: 0 })),
  (error) => error && error.kind === "ConversionError" && error.code === "CONVERSION_ZERO_ANGLE_UNDEFINED"
);

assert.throws(
  () => powerComplex(createComplexValue({ re: 0, im: 0 }), createComplexValue({ re: 0, im: 0 })),
  (error) => error && error.kind === "MathDomainError" && error.code === "MATH_ZERO_TO_ZERO_UNDEFINED"
);

const phasorValue = createPhasorValue({ magnitude: 2, angle: 90, angleUnit: ANGLE_UNITS.DEG });
approxComplex(asComplexValue(phasorValue), { re: 0, im: 2 });

console.log("Complex math tests passed.");
