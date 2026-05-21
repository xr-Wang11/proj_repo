"use strict";

function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ensurePlainObject(value, label) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }

  return value;
}

function ensureString(value, label) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string.`);
  }

  return value;
}

function ensureNonEmptyString(value, label) {
  const text = ensureString(value, label).trim();

  if (!text) {
    throw new TypeError(`${label} cannot be empty.`);
  }

  return text;
}

function ensureFiniteNumber(value, label) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }

  return value;
}

function ensureInteger(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer.`);
  }

  return value;
}

function ensureNonNegativeInteger(value, label) {
  ensureInteger(value, label);

  if (value < 0) {
    throw new RangeError(`${label} cannot be negative.`);
  }

  return value;
}

function ensureOneOf(value, allowedValues, label) {
  const options = Array.isArray(allowedValues) ? allowedValues : Object.values(allowedValues);

  if (!options.includes(value)) {
    throw new RangeError(`${label} must be one of: ${options.join(", ")}.`);
  }

  return value;
}

function cloneRecord(record) {
  return Object.assign({}, record);
}

function freezeShallow(value) {
  return Object.freeze(value);
}

module.exports = {
  cloneRecord,
  ensureFiniteNumber,
  ensureInteger,
  ensureNonEmptyString,
  ensureNonNegativeInteger,
  ensureOneOf,
  ensurePlainObject,
  ensureString,
  freezeShallow,
  isPlainObject,
};
