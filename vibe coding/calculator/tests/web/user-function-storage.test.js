"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { buildInvocationTemplate, splitParameterInput } = require(path.resolve(__dirname, "../../web/app-entry"));
const {
  DEFAULT_STORAGE_KEY,
  createLocalStorageRecordPersistence,
} = require(path.resolve(__dirname, "../../web/user-function-storage"));

const backingStore = new Map();
const mockStorage = {
  getItem(key) {
    return backingStore.has(key) ? backingStore.get(key) : null;
  },
  setItem(key, value) {
    backingStore.set(key, String(value));
  },
};

const persistence = createLocalStorageRecordPersistence({
  storage: mockStorage,
});

persistence.saveRecords([
  {
    name: "f_sum",
    parameters: [{ name: "x" }, { name: "y" }],
    bodySource: "x + y",
    metadata: { source: "x + y" },
  },
]);

assert.equal(persistence.storageKey, DEFAULT_STORAGE_KEY);
assert.equal(persistence.loadRecords()[0].name, "f_sum");

assert.deepEqual(splitParameterInput("u, i_load , angle"), ["u", "i_load", "angle"]);
assert.deepEqual(splitParameterInput(""), []);

const noArgTemplate = buildInvocationTemplate({
  name: "f_zero",
  parameters: [],
});
assert.deepEqual(noArgTemplate, {
  text: "f_zero()",
  cursorOffset: 8,
});

const multiArgTemplate = buildInvocationTemplate({
  name: "f_sum",
  parameters: [{ name: "x" }, { name: "y" }, { name: "z" }],
});
assert.deepEqual(multiArgTemplate, {
  text: "f_sum(,,)",
  cursorOffset: 6,
});

console.log("Web user function storage tests passed.");
