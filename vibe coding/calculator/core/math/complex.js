"use strict";

const {
  ANGLE_UNITS,
  DEFAULT_ZERO_TOLERANCE,
  createComplexValue,
  createConversionError,
  createMathDomainError,
  createPhasorValue,
  isComplexValue,
  isPhasorValue,
  normalizeNearZero,
} = require("../model");

function degreesToRadians(degrees) {
  if (typeof degrees !== "number" || Number.isNaN(degrees) || !Number.isFinite(degrees)) {
    throw new TypeError("degreesToRadians.degrees must be a finite number.");
  }

  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians) {
  if (typeof radians !== "number" || Number.isNaN(radians) || !Number.isFinite(radians)) {
    throw new TypeError("radiansToDegrees.radians must be a finite number.");
  }

  return (radians * 180) / Math.PI;
}

function normalizeAngle(angle, angleUnit = ANGLE_UNITS.RAD) {
  if (typeof angle !== "number" || Number.isNaN(angle) || !Number.isFinite(angle)) {
    throw new TypeError("normalizeAngle.angle must be a finite number.");
  }

  if (!Object.values(ANGLE_UNITS).includes(angleUnit)) {
    throw new RangeError("normalizeAngle.angleUnit must be deg or rad.");
  }

  return angleUnit === ANGLE_UNITS.DEG ? degreesToRadians(angle) : angle;
}

function toAngleUnit(angleInRadians, angleUnit = ANGLE_UNITS.RAD) {
  if (!Object.values(ANGLE_UNITS).includes(angleUnit)) {
    throw new RangeError("toAngleUnit.angleUnit must be deg or rad.");
  }

  return angleUnit === ANGLE_UNITS.DEG ? radiansToDegrees(angleInRadians) : angleInRadians;
}

function asComplexValue(value) {
  if (isComplexValue(value)) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return createComplexValue({ re: value, im: 0 });
  }

  if (isPhasorValue(value)) {
    return fromPhasorValue(value);
  }

  throw new TypeError("Value cannot be converted to ComplexValue.");
}

function isNearlyZero(value, tolerance = DEFAULT_ZERO_TOLERANCE) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new TypeError("isNearlyZero.value must be a finite number.");
  }

  if (typeof tolerance !== "number" || Number.isNaN(tolerance) || !Number.isFinite(tolerance)) {
    throw new TypeError("isNearlyZero.tolerance must be a finite number.");
  }

  return Math.abs(value) <= tolerance;
}

function isZeroComplex(value, tolerance = DEFAULT_ZERO_TOLERANCE) {
  const complex = asComplexValue(value);
  return isNearlyZero(complex.re, tolerance) && isNearlyZero(complex.im, tolerance);
}

function addComplex(left, right) {
  const a = asComplexValue(left);
  const b = asComplexValue(right);

  return createComplexValue({
    re: a.re + b.re,
    im: a.im + b.im,
  });
}

function subtractComplex(left, right) {
  const a = asComplexValue(left);
  const b = asComplexValue(right);

  return createComplexValue({
    re: a.re - b.re,
    im: a.im - b.im,
  });
}

function multiplyComplex(left, right) {
  const a = asComplexValue(left);
  const b = asComplexValue(right);

  return createComplexValue({
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  });
}

function divideComplex(left, right, tolerance = DEFAULT_ZERO_TOLERANCE) {
  const a = asComplexValue(left);
  const b = asComplexValue(right);
  const denominator = b.re * b.re + b.im * b.im;

  if (isNearlyZero(denominator, tolerance)) {
    throw createMathDomainError({
      code: "MATH_DIVISION_BY_ZERO",
      message: "复数除法的分母不能为 0。",
      context: { left: a, right: b },
      hint: "请检查除数是否为 0 或极接近 0。",
    });
  }

  return createComplexValue({
    re: (a.re * b.re + a.im * b.im) / denominator,
    im: (a.im * b.re - a.re * b.im) / denominator,
  });
}

function conjugateComplex(value) {
  const complex = asComplexValue(value);
  return createComplexValue({
    re: complex.re,
    im: -complex.im,
  });
}

function magnitudeOfComplex(value) {
  const complex = asComplexValue(value);
  return normalizeNearZero(Math.hypot(complex.re, complex.im));
}

function angleOfComplex(value, angleUnit = ANGLE_UNITS.RAD) {
  const complex = asComplexValue(value);

  if (isZeroComplex(complex)) {
    throw createConversionError({
      code: "CONVERSION_ZERO_ANGLE_UNDEFINED",
      message: "零复数的相角未定义。",
      context: { value: complex },
      hint: "请避免对 0 求相角，或在业务层单独约定其显示方式。",
    });
  }

  return normalizeNearZero(toAngleUnit(Math.atan2(complex.im, complex.re), angleUnit));
}

function fromRectangularParts(re, im) {
  return createComplexValue({ re, im });
}

function fromPhasorParts(magnitude, angle, angleUnit = ANGLE_UNITS.RAD) {
  return fromPhasorValue(
    createPhasorValue({
      magnitude,
      angle,
      angleUnit,
    })
  );
}

function fromPhasorValue(phasor) {
  if (!isPhasorValue(phasor)) {
    throw new TypeError("fromPhasorValue.phasor must be a PhasorValue.");
  }

  const angleInRadians = normalizeAngle(phasor.angle, phasor.angleUnit);

  return createComplexValue({
    re: phasor.magnitude * Math.cos(angleInRadians),
    im: phasor.magnitude * Math.sin(angleInRadians),
  });
}

function toPhasorValue(value, angleUnit = ANGLE_UNITS.RAD) {
  const complex = asComplexValue(value);

  return createPhasorValue({
    magnitude: magnitudeOfComplex(complex),
    angle: isZeroComplex(complex) ? 0 : angleOfComplex(complex, angleUnit),
    angleUnit,
  });
}

function complexExp(value) {
  const complex = asComplexValue(value);
  const factor = Math.exp(complex.re);

  return createComplexValue({
    re: factor * Math.cos(complex.im),
    im: factor * Math.sin(complex.im),
  });
}

function complexLog(value, angleUnit = ANGLE_UNITS.RAD) {
  const complex = asComplexValue(value);
  const magnitude = magnitudeOfComplex(complex);

  if (isNearlyZero(magnitude)) {
    throw createMathDomainError({
      code: "MATH_LOG_ZERO_UNDEFINED",
      message: "0 的复对数未定义。",
      context: { value: complex },
      hint: "请避免对 0 求对数。",
    });
  }

  return createComplexValue({
    re: Math.log(magnitude),
    im: angleOfComplex(complex, angleUnit),
  });
}

function sqrtComplex(value) {
  const complex = asComplexValue(value);

  if (isZeroComplex(complex)) {
    return createComplexValue({ re: 0, im: 0 });
  }

  const magnitude = magnitudeOfComplex(complex);
  const real = Math.sqrt((magnitude + complex.re) / 2);
  const imaginarySign = complex.im < 0 ? -1 : 1;
  const imaginary = imaginarySign * Math.sqrt(Math.max(0, (magnitude - complex.re) / 2));

  return createComplexValue({
    re: real,
    im: imaginary,
  });
}

function sinComplex(value) {
  const complex = asComplexValue(value);

  return createComplexValue({
    re: Math.sin(complex.re) * Math.cosh(complex.im),
    im: Math.cos(complex.re) * Math.sinh(complex.im),
  });
}

function cosComplex(value) {
  const complex = asComplexValue(value);

  return createComplexValue({
    re: Math.cos(complex.re) * Math.cosh(complex.im),
    im: -Math.sin(complex.re) * Math.sinh(complex.im),
  });
}

function tanComplex(value, tolerance = DEFAULT_ZERO_TOLERANCE) {
  return divideComplex(sinComplex(value), cosComplex(value), tolerance);
}

function powerComplex(base, exponent) {
  const normalizedBase = asComplexValue(base);
  const normalizedExponent = asComplexValue(exponent);

  if (isZeroComplex(normalizedExponent)) {
    if (isZeroComplex(normalizedBase)) {
      throw createMathDomainError({
        code: "MATH_ZERO_TO_ZERO_UNDEFINED",
        message: "0^0 未定义。",
        context: { base: normalizedBase, exponent: normalizedExponent },
        hint: "请在业务层为 0^0 明确约定，或避免这种输入。",
      });
    }

    return createComplexValue({ re: 1, im: 0 });
  }

  if (isZeroComplex(normalizedBase)) {
    if (normalizedExponent.im !== 0 || normalizedExponent.re < 0) {
      throw createMathDomainError({
        code: "MATH_INVALID_ZERO_POWER",
        message: "0 不能被提升到负指数或复指数。",
        context: { base: normalizedBase, exponent: normalizedExponent },
        hint: "请检查指数是否为正实数。",
      });
    }

    return createComplexValue({ re: 0, im: 0 });
  }

  return complexExp(multiplyComplex(normalizedExponent, complexLog(normalizedBase)));
}

function realPart(value) {
  return asComplexValue(value).re;
}

function imaginaryPart(value) {
  return asComplexValue(value).im;
}

module.exports = {
  addComplex,
  angleOfComplex,
  asComplexValue,
  complexExp,
  complexLog,
  cosComplex,
  conjugateComplex,
  degreesToRadians,
  divideComplex,
  fromPhasorParts,
  fromPhasorValue,
  fromRectangularParts,
  imaginaryPart,
  isNearlyZero,
  isZeroComplex,
  magnitudeOfComplex,
  multiplyComplex,
  normalizeAngle,
  powerComplex,
  radiansToDegrees,
  realPart,
  sinComplex,
  subtractComplex,
  sqrtComplex,
  tanComplex,
  toAngleUnit,
  toPhasorValue,
};
