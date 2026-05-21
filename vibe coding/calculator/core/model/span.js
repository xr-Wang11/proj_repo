"use strict";

const {
  ensureNonNegativeInteger,
} = require("./shared");

function createSpan(start, end) {
  const normalizedStart = ensureNonNegativeInteger(start, "span.start");
  const normalizedEnd = ensureNonNegativeInteger(end, "span.end");

  if (normalizedEnd < normalizedStart) {
    throw new RangeError("span.end cannot be smaller than span.start.");
  }

  return Object.freeze({
    start: normalizedStart,
    end: normalizedEnd,
  });
}

function createPointSpan(index) {
  const normalizedIndex = ensureNonNegativeInteger(index, "span.index");
  return createSpan(normalizedIndex, normalizedIndex);
}

function isSpan(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      Number.isInteger(value.start) &&
      Number.isInteger(value.end) &&
      value.start >= 0 &&
      value.end >= value.start
  );
}

function normalizeSpan(value, fallbackStart = 0, fallbackEnd = fallbackStart) {
  if (isSpan(value)) {
    return createSpan(value.start, value.end);
  }

  return createSpan(fallbackStart, fallbackEnd);
}

function mergeSpans(leftSpan, rightSpan) {
  const left = normalizeSpan(leftSpan);
  const right = normalizeSpan(rightSpan, left.end, left.end);
  return createSpan(left.start, right.end);
}

module.exports = {
  createPointSpan,
  createSpan,
  isSpan,
  mergeSpans,
  normalizeSpan,
};
