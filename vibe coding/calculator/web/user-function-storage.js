"use strict";

const DEFAULT_STORAGE_KEY = "latex_calculator_user_functions";

function resolveStorage(storage) {
  if (storage) {
    return storage;
  }

  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }

  return null;
}

function createLocalStorageRecordPersistence({
  storage = null,
  storageKey = DEFAULT_STORAGE_KEY,
} = {}) {
  const targetStorage = resolveStorage(storage);

  function loadRecords() {
    if (!targetStorage) {
      return [];
    }

    const source = targetStorage.getItem(storageKey);

    if (!source) {
      return [];
    }

    const records = JSON.parse(source);

    if (!Array.isArray(records)) {
      throw new TypeError("Persisted user function data must be a JSON array.");
    }

    return records;
  }

  function saveRecords(records) {
    if (!targetStorage) {
      return;
    }

    targetStorage.setItem(storageKey, JSON.stringify(records));
  }

  return Object.freeze({
    storageKey,
    loadRecords,
    saveRecords,
  });
}

module.exports = {
  DEFAULT_STORAGE_KEY,
  createLocalStorageRecordPersistence,
};
