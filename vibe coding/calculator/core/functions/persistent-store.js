"use strict";

const { createInMemoryUserFunctionStore } = require("./user-functions");

function createPersistentUserFunctionStore({
  store = createInMemoryUserFunctionStore(),
  persistence = null,
  autoLoad = true,
} = {}) {
  const adapter = persistence || {};
  let loaded = false;
  let lastLoadError = null;
  let lastSaveError = null;

  function ensureLoaded() {
    if (loaded) {
      return;
    }

    try {
      const records = typeof adapter.loadRecords === "function" ? adapter.loadRecords() : [];

      if (records !== undefined && records !== null) {
        store.loadRecords(records, { replace: true });
      }

      loaded = true;
      lastLoadError = null;
    } catch (error) {
      lastLoadError = error;
      loaded = true;
    }
  }

  function persist() {
    try {
      if (typeof adapter.saveRecords === "function") {
        adapter.saveRecords(store.exportRecords());
      }

      lastSaveError = null;
    } catch (error) {
      lastSaveError = error;
      throw error;
    }
  }

  function withLoad(callback) {
    ensureLoaded();
    return callback();
  }

  function withMutation(callback) {
    ensureLoaded();
    const result = callback();
    persist();
    return result;
  }

  if (autoLoad) {
    ensureLoaded();
  }

  return Object.freeze({
    define(spec, options = {}) {
      return withMutation(() => store.define(spec, options));
    },
    exportRecords() {
      return withLoad(() => store.exportRecords());
    },
    get(name) {
      return withLoad(() => store.get(name));
    },
    getPersistenceStatus() {
      return Object.freeze({
        loaded,
        lastLoadError,
        lastSaveError,
      });
    },
    has(name) {
      return withLoad(() => store.has(name));
    },
    list() {
      return withLoad(() => store.list());
    },
    loadRecords(records, options = {}) {
      return withMutation(() => store.loadRecords(records, options));
    },
    remove(name) {
      return withMutation(() => store.remove(name));
    },
    save(definition, options = {}) {
      return withMutation(() => store.save(definition, options));
    },
    toDefinitionTable() {
      return withLoad(() => store.toDefinitionTable());
    },
  });
}

module.exports = {
  createPersistentUserFunctionStore,
};
