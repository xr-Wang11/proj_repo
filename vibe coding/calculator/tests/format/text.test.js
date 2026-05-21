"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const {
  ANGLE_UNITS,
  DISPLAY_TYPES,
  OUTPUT_MODES,
  createComplexValue,
  createEvaluationResult,
  createPhasorValue,
} = require(path.resolve(__dirname, "../../core/model"));
const {
  evaluateSourceToText,
  formatNumberToText,
  renderComplexRectToText,
  renderDebugResultToText,
  renderEvaluationResultToText,
  renderPhasorToText,
} = require(path.resolve(__dirname, "../../core/format"));

assert.equal(formatNumberToText(3.14), "3.14");
assert.equal(formatNumberToText(1.2300000000001, 6), "1.23");
assert.equal(formatNumberToText(0.0000001234, 6), "1.234e-7");

assert.equal(renderComplexRectToText(createComplexValue({ re: 3, im: 4 })), "3 + 4i");
assert.equal(renderComplexRectToText(createComplexValue({ re: 3, im: 4 }), { imaginaryUnit: "j" }), "3 + 4j");
assert.equal(renderComplexRectToText(createComplexValue({ re: 0, im: -1 })), "-i");
assert.equal(renderComplexRectToText(createComplexValue({ re: 0, im: -1 }), { imaginaryUnit: "j" }), "-j");
assert.equal(renderComplexRectToText(createComplexValue({ re: 5, im: 0 })), "5");

assert.equal(
  renderPhasorToText(createPhasorValue({ magnitude: 5, angle: 53.13, angleUnit: ANGLE_UNITS.DEG })),
  "5 ∠ 53.13 deg"
);

const rectResult = createEvaluationResult({
  value: createComplexValue({ re: 3, im: 4 }),
  displayType: DISPLAY_TYPES.COMPLEX_RECT,
});
assert.equal(renderEvaluationResultToText(rectResult), "3 + 4i");

const rectJResult = createEvaluationResult({
  value: createComplexValue({ re: 3, im: 4 }),
  displayType: DISPLAY_TYPES.COMPLEX_RECT,
  metadata: {
    preferredImaginaryUnit: "j",
  },
});
assert.equal(renderEvaluationResultToText(rectJResult), "3 + 4j");

const polarResult = createEvaluationResult({
  value: createComplexValue({ re: 3, im: 4 }),
  displayType: DISPLAY_TYPES.COMPLEX_POLAR,
  metadata: {
    preferredAngleUnit: ANGLE_UNITS.DEG,
    polarValue: createPhasorValue({ magnitude: 5, angle: 53.13, angleUnit: ANGLE_UNITS.DEG }),
  },
});
assert.equal(renderEvaluationResultToText(polarResult), "5 ∠ 53.13 deg");
assert.equal(
  renderEvaluationResultToText(polarResult, { outputMode: OUTPUT_MODES.RECT }),
  "3 + 4i"
);
assert.match(
  renderDebugResultToText(polarResult),
  /displayType=complex_polar/
);

assert.equal(evaluateSourceToText("3 + 4*i"), "3 + 4i");
assert.equal(evaluateSourceToText("3 + 4*j"), "3 + 4j");
assert.equal(evaluateSourceToText("to_polar(3+4*i,deg)"), "5 ∠ 53.130102354156 deg");
assert.equal(
  evaluateSourceToText("to_polar(3+4*i,deg)", {}, { outputMode: OUTPUT_MODES.RECT }),
  "3 + 4i"
);
assert.equal(
  evaluateSourceToText("3+4*i", {}, { outputMode: OUTPUT_MODES.POLAR, angleUnit: ANGLE_UNITS.DEG }),
  "5 ∠ 53.130102354156 deg"
);
assert.throws(
  () => evaluateSourceToText("i + j"),
  (error) => error && error.kind === "UnsupportedFeatureError" && error.code === "IMAGINARY_UNIT_MIXED"
);

console.log("Text format tests passed.");
