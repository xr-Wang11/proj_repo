import {
  renderEvaluationResultToText,
  toPhasorValue,
} from "@/adapters/core-api.js";

const FRACTION_TOLERANCE = 1e-10;

function normalizeNearZero(value) {
  return Math.abs(value) <= FRACTION_TOLERANCE ? 0 : value;
}

function snapNearInteger(value, significantDigits = 10) {
  const normalized = normalizeNearZero(value);
  const integerCandidate = Math.round(normalized);
  const digits = normalizeSignificantDigits(significantDigits);
  const tolerance = Math.max(1e-12, 10 ** (-(digits + 1)));

  if (Math.abs(normalized - integerCandidate) <= tolerance) {
    return integerCandidate;
  }

  return normalized;
}

function gcd(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }

  return a || 1;
}

function normalizeSignificantDigits(value) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized < 0) {
    return 3;
  }

  return normalized;
}

function formatDecimalNumber(value, significantDigits = 10) {
  const normalized = snapNearInteger(value, significantDigits);
  const digits = normalizeSignificantDigits(significantDigits);

  if (normalized === 0) {
    return digits === 0 ? "0" : (0).toFixed(digits);
  }

  if (Math.abs(normalized) >= 1e12) {
    return normalized.toExponential(Math.max(0, digits)).replace(/e\+/u, "e");
  }

  return normalized.toFixed(digits);
}

function approximateFraction(value, significantDigits = 10) {
  const normalized = normalizeNearZero(value);
  const maxDenominator = Math.min(1_000_000, 10 ** Math.min(6, normalizeSignificantDigits(significantDigits)));

  if (normalized === 0) {
    return { denominator: 1, numerator: 0 };
  }

  let denominator = 1;
  let bestNumerator = Math.round(normalized);
  let bestError = Math.abs(normalized - bestNumerator);

  for (let currentDenominator = 1; currentDenominator <= maxDenominator; currentDenominator += 1) {
    const currentNumerator = Math.round(normalized * currentDenominator);
    const currentError = Math.abs(normalized - currentNumerator / currentDenominator);

    if (currentError < bestError) {
      bestError = currentError;
      denominator = currentDenominator;
      bestNumerator = currentNumerator;
    }

    if (currentError <= FRACTION_TOLERANCE) {
      denominator = currentDenominator;
      bestNumerator = currentNumerator;
      break;
    }
  }

  if (bestError > 1e-6) {
    return null;
  }

  const divisor = gcd(bestNumerator, denominator);
  return {
    denominator: denominator / divisor,
    numerator: bestNumerator / divisor,
  };
}

export function formatNumberByMode(value, numberMode, significantDigits = 10) {
  if (numberMode !== "fraction") {
    return formatDecimalNumber(value, significantDigits);
  }

  const fraction = approximateFraction(value, significantDigits);

  if (!fraction) {
    return formatDecimalNumber(value, significantDigits);
  }

  if (fraction.denominator === 1) {
    return String(fraction.numerator);
  }

  return `${fraction.numerator}/${fraction.denominator}`;
}

export function formatComplexRect(value, numberMode, significantDigits = 10, imaginaryUnit = "i") {
  const normalizedImaginaryUnit = imaginaryUnit === "j" ? "j" : "i";
  const real = snapNearInteger(value.re, significantDigits);
  const imaginary = snapNearInteger(value.im, significantDigits);

  if (imaginary === 0) {
    return formatNumberByMode(real, numberMode, significantDigits);
  }

  const imagMagnitude = Math.abs(imaginary);
  const imagText =
    imagMagnitude === 1
      ? normalizedImaginaryUnit
      : `${formatNumberByMode(imagMagnitude, numberMode, significantDigits)}${normalizedImaginaryUnit}`;

  if (real === 0) {
    return imaginary < 0 ? `-${imagText}` : imagText;
  }

  return `${formatNumberByMode(real, numberMode, significantDigits)} ${imaginary < 0 ? "-" : "+"} ${imagText}`;
}

export function formatComplexPolar(value, angleUnit, numberMode, significantDigits = 10) {
  const polarValue = toPhasorValue(value, angleUnit);
  const unitText = angleUnit === "deg" ? "度" : "弧度";
  return `${formatNumberByMode(polarValue.magnitude, numberMode, significantDigits)} ∠ ${formatNumberByMode(polarValue.angle, numberMode, significantDigits)} ${unitText}`;
}

export function formatEvaluationResultForDisplay(result, options) {
  if (!result) {
    return "";
  }

  const {
    angleUnit,
    displayMode,
    numberMode,
    significantDigits,
  } = options;
  const imaginaryUnit = result.metadata?.preferredImaginaryUnit === "j" ? "j" : "i";

  if (numberMode !== "fraction") {
    if (displayMode === "debug") {
      return renderEvaluationResultToText(result, {
        angleUnit,
        outputMode: displayMode,
        precision: significantDigits,
      });
    }

    if (!result.value || typeof result.value.re !== "number" || typeof result.value.im !== "number") {
      return renderEvaluationResultToText(result, {
        angleUnit,
        outputMode: displayMode,
        precision: significantDigits,
      });
    }

    if (displayMode === "polar") {
      return formatComplexPolar(result.value, angleUnit, numberMode, significantDigits);
    }

    return formatComplexRect(result.value, numberMode, significantDigits, imaginaryUnit);
  }

  if (displayMode === "debug") {
    return renderEvaluationResultToText(result, {
      angleUnit,
      outputMode: displayMode,
      precision: significantDigits,
    });
  }

  if (!result.value || typeof result.value.re !== "number" || typeof result.value.im !== "number") {
    return renderEvaluationResultToText(result, {
      angleUnit,
      outputMode: displayMode,
      precision: significantDigits,
    });
  }

  if (displayMode === "polar") {
    return formatComplexPolar(result.value, angleUnit, numberMode, significantDigits);
  }

  return formatComplexRect(result.value, numberMode, significantDigits, imaginaryUnit);
}
