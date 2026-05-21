"use strict";

const {
  ANGLE_UNITS,
  DEFAULT_PRECISION,
  DISPLAY_TYPES,
  OUTPUT_MODES,
  isComplexValue,
  isPhasorValue,
} = require("../model");
const { asComplexValue, toPhasorValue } = require("../math");
const { evaluateSource } = require("../evaluator");

function stripTrailingZeros(text) {
  return text.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "").replace(/\.$/u, "");
}

function normalizePrecision(precision = DEFAULT_PRECISION) {
  if (!Number.isInteger(precision) || precision < 0) {
    throw new RangeError("precision must be a non-negative integer.");
  }

  return precision;
}

function formatNumberToText(value, precision = DEFAULT_PRECISION) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new TypeError("formatNumberToText.value must be a finite number.");
  }

  const normalizedPrecision = normalizePrecision(precision);
  const normalizedValue = Object.is(value, -0) ? 0 : value;

  if (normalizedValue === 0) {
    return "0";
  }

  const absValue = Math.abs(normalizedValue);

  if (absValue >= 10 ** normalizedPrecision || absValue < 10 ** (-Math.max(1, normalizedPrecision))) {
    const [mantissaText, exponentText] = normalizedValue.toExponential(normalizedPrecision).split("e");
    return `${stripTrailingZeros(mantissaText)}e${Number(exponentText)}`;
  }

  return stripTrailingZeros(normalizedValue.toFixed(normalizedPrecision));
}

function resolveImaginaryUnitSymbol(options = {}) {
  return options.imaginaryUnit === "j" ? "j" : "i";
}

function renderComplexRectToText(value, options = {}) {
  if (!isComplexValue(value)) {
    throw new TypeError("renderComplexRectToText.value must be a ComplexValue.");
  }

  const precision = normalizePrecision(options.precision ?? DEFAULT_PRECISION);
  const imaginaryUnit = resolveImaginaryUnitSymbol(options);
  const re = value.re;
  const im = value.im;

  if (im === 0) {
    return formatNumberToText(re, precision);
  }

  const imagMagnitude = Math.abs(im);
  const imagText =
    imagMagnitude === 1
      ? imaginaryUnit
      : `${formatNumberToText(imagMagnitude, precision)}${imaginaryUnit}`;

  if (re === 0) {
    return im < 0 ? `-${imagText}` : imagText;
  }

  return `${formatNumberToText(re, precision)} ${im < 0 ? "-" : "+"} ${imagText}`;
}

function renderPhasorToText(value, options = {}) {
  if (!isPhasorValue(value)) {
    throw new TypeError("renderPhasorToText.value must be a PhasorValue.");
  }

  const precision = normalizePrecision(options.precision ?? DEFAULT_PRECISION);
  const magnitude = formatNumberToText(value.magnitude, precision);
  const angle = formatNumberToText(value.angle, precision);
  const unit = value.angleUnit === ANGLE_UNITS.DEG ? "deg" : "rad";

  return `${magnitude} ∠ ${angle} ${unit}`;
}

function renderDebugResultToText(result, options = {}) {
  const precision = normalizePrecision(options.precision ?? DEFAULT_PRECISION);
  const parts = [
    `displayType=${result.displayType}`,
  ];

  if (isComplexValue(result.value)) {
    parts.push(`value=Complex(${formatNumberToText(result.value.re, precision)}, ${formatNumberToText(result.value.im, precision)})`);
  } else if (isPhasorValue(result.value)) {
    parts.push(`value=Phasor(${formatNumberToText(result.value.magnitude, precision)}, ${formatNumberToText(result.value.angle, precision)}, ${result.value.angleUnit})`);
  } else {
    parts.push(`value=${String(result.value)}`);
  }

  if (result.metadata && Object.keys(result.metadata).length > 0) {
    parts.push(`metadataKeys=${Object.keys(result.metadata).join(",")}`);
  }

  return parts.join(" | ");
}

function resolvePreferredAngleUnit(result, options = {}) {
  if (options.angleUnit) {
    return options.angleUnit;
  }

  if (result.metadata && typeof result.metadata.preferredAngleUnit === "string") {
    return result.metadata.preferredAngleUnit;
  }

  return ANGLE_UNITS.RAD;
}

function chooseOutputMode(result, options = {}) {
  if (options.outputMode) {
    return options.outputMode;
  }

  if (result.displayType === DISPLAY_TYPES.COMPLEX_POLAR || result.displayType === DISPLAY_TYPES.PHASOR) {
    return OUTPUT_MODES.POLAR;
  }

  return OUTPUT_MODES.PLAIN;
}

function renderEvaluationResultToText(result, options = {}) {
  if (!result || typeof result !== "object") {
    throw new TypeError("renderEvaluationResultToText.result must be an object.");
  }

  const precision = normalizePrecision(options.precision ?? DEFAULT_PRECISION);
  const outputMode = chooseOutputMode(result, options);
  const imaginaryUnit = resolveImaginaryUnitSymbol({
    imaginaryUnit: options.imaginaryUnit || result.metadata?.preferredImaginaryUnit,
  });

  if (outputMode === OUTPUT_MODES.DEBUG) {
    return renderDebugResultToText(result, { precision });
  }

  if (outputMode === OUTPUT_MODES.POLAR) {
    if (result.metadata && result.metadata.polarValue && isPhasorValue(result.metadata.polarValue)) {
      return renderPhasorToText(result.metadata.polarValue, { precision });
    }

    if (isPhasorValue(result.value)) {
      return renderPhasorToText(result.value, { precision });
    }

    if (isComplexValue(result.value)) {
      return renderPhasorToText(
        toPhasorValue(result.value, resolvePreferredAngleUnit(result, options)),
        { precision }
      );
    }
  }

  if (isComplexValue(result.value) || isPhasorValue(result.value)) {
    return renderComplexRectToText(asComplexValue(result.value), {
      imaginaryUnit,
      precision,
    });
  }

  if (typeof result.text === "string" && result.text) {
    return result.text;
  }

  return "";
}

function evaluateSourceToText(input, context = {}, options = {}) {
  return renderEvaluationResultToText(evaluateSource(input, context), options);
}

module.exports = {
  evaluateSourceToText,
  formatNumberToText,
  renderComplexRectToText,
  renderDebugResultToText,
  renderEvaluationResultToText,
  renderPhasorToText,
};
