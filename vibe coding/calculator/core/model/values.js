"use strict";

const {
  ANGLE_UNITS,
  DEFAULT_PRECISION,
  DEFAULT_ZERO_TOLERANCE,
  DISPLAY_TYPES,
  OUTPUT_MODES,
  VALUE_TYPES,
} = require("./constants");
const {
  ensureFiniteNumber,
  ensureOneOf,
  ensurePlainObject,
} = require("./shared");

function normalizeNearZero(value, tolerance = DEFAULT_ZERO_TOLERANCE) {
  const normalizedTolerance = ensureFiniteNumber(tolerance, "tolerance");
  const normalizedValue = ensureFiniteNumber(value, "value");

  if (Math.abs(normalizedValue) <= normalizedTolerance) {
    return 0;
  }

  return Object.is(normalizedValue, -0) ? 0 : normalizedValue;
}

function createComplexValue({ re = 0, im = 0, tolerance = DEFAULT_ZERO_TOLERANCE } = {}) {
  return Object.freeze({
    kind: VALUE_TYPES.COMPLEX,
    re: normalizeNearZero(re, tolerance),
    im: normalizeNearZero(im, tolerance),
  });
}

function isComplexValue(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.kind === VALUE_TYPES.COMPLEX &&
      typeof value.re === "number" &&
      typeof value.im === "number"
  );
}

function createPhasorValue({
  magnitude,
  angle,
  angleUnit = ANGLE_UNITS.RAD,
} = {}) {
  const normalizedMagnitude = ensureFiniteNumber(magnitude, "phasorValue.magnitude");

  if (normalizedMagnitude < 0) {
    throw new RangeError("phasorValue.magnitude cannot be negative.");
  }

  return Object.freeze({
    kind: VALUE_TYPES.PHASOR,
    magnitude: normalizedMagnitude,
    angle: ensureFiniteNumber(angle, "phasorValue.angle"),
    angleUnit: ensureOneOf(angleUnit, ANGLE_UNITS, "phasorValue.angleUnit"),
  });
}

function isPhasorValue(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.kind === VALUE_TYPES.PHASOR &&
      typeof value.magnitude === "number" &&
      typeof value.angle === "number"
  );
}

function inferDisplayType(value) {
  if (isPhasorValue(value)) {
    return DISPLAY_TYPES.PHASOR;
  }

  if (isComplexValue(value)) {
    return value.im === 0 ? DISPLAY_TYPES.REAL : DISPLAY_TYPES.COMPLEX_RECT;
  }

  return DISPLAY_TYPES.ERROR;
}

function createEvaluationResult({
  value = null,
  displayType = inferDisplayType(value),
  text = "",
  latex = "",
  metadata = {},
} = {}) {
  ensurePlainObject(metadata, "evaluationResult.metadata");

  return Object.freeze({
    value,
    displayType: ensureOneOf(displayType, DISPLAY_TYPES, "evaluationResult.displayType"),
    text: typeof text === "string" ? text : String(text),
    latex: typeof latex === "string" ? latex : String(latex),
    metadata: Object.freeze({ ...metadata }),
  });
}

function createEvaluationOptions({
  angleUnit = ANGLE_UNITS.RAD,
  outputMode = OUTPUT_MODES.PLAIN,
  precision = DEFAULT_PRECISION,
  zeroTolerance = DEFAULT_ZERO_TOLERANCE,
} = {}) {
  const normalizedPrecision = ensureFiniteNumber(precision, "evaluationOptions.precision");

  if (!Number.isInteger(normalizedPrecision) || normalizedPrecision < 0) {
    throw new RangeError("evaluationOptions.precision must be a non-negative integer.");
  }

  return Object.freeze({
    angleUnit: ensureOneOf(angleUnit, ANGLE_UNITS, "evaluationOptions.angleUnit"),
    outputMode: ensureOneOf(outputMode, OUTPUT_MODES, "evaluationOptions.outputMode"),
    precision: normalizedPrecision,
    zeroTolerance: ensureFiniteNumber(zeroTolerance, "evaluationOptions.zeroTolerance"),
  });
}

const DEFAULT_EVALUATION_OPTIONS = createEvaluationOptions();

module.exports = {
  createComplexValue,
  createEvaluationOptions,
  createEvaluationResult,
  createPhasorValue,
  DEFAULT_EVALUATION_OPTIONS,
  inferDisplayType,
  isComplexValue,
  isPhasorValue,
  normalizeNearZero,
};
