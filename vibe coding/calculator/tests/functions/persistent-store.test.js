"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const {
  createInMemoryUserFunctionStore,
  createPersistentUserFunctionStore,
} = require(path.resolve(__dirname, "../../core/functions"));

let persistedJson = "[]";

const persistence = {
  loadRecords() {
    return JSON.parse(persistedJson);
  },
  saveRecords(records) {
    persistedJson = JSON.stringify(records);
  },
};

const store = createPersistentUserFunctionStore({
  persistence,
  store: createInMemoryUserFunctionStore(),
});

store.define({
  name: "f_add",
  parameters: ["x", "y"],
  bodySource: "x + y",
});

assert.equal(store.has("f_add"), true);
assert.equal(store.list().length, 1);
assert.ok(persistedJson.includes("\"f_add\""));

const reloaded = createPersistentUserFunctionStore({
  persistence,
  store: createInMemoryUserFunctionStore(),
});
assert.equal(reloaded.has("f_add"), true);
assert.equal(reloaded.get("f_add").metadata.source, "x + y");

const invalidPersistence = {
  loadRecords() {
    throw new Error("bad persisted data");
  },
  saveRecords() {},
};

const recoveredStore = createPersistentUserFunctionStore({
  persistence: invalidPersistence,
  store: createInMemoryUserFunctionStore(),
});
assert.equal(recoveredStore.list().length, 0);
assert.equal(recoveredStore.getPersistenceStatus().lastLoadError.message, "bad persisted data");

recoveredStore.define({
  name: "f_ok",
  parameters: ["x"],
  bodySource: "x",
});
assert.equal(recoveredStore.has("f_ok"), true);

const cycleStore = createPersistentUserFunctionStore({
  store: createInMemoryUserFunctionStore(),
});
cycleStore.define({
  name: "f_a",
  parameters: ["x"],
  bodySource: "f_b(x)",
});

assert.throws(
  () =>
    cycleStore.define({
      name: "f_b",
      parameters: ["x"],
      bodySource: "f_a(x)",
    }),
  (error) =>
    error &&
    error.kind === "UnsupportedFeatureError" &&
    error.code === "USER_FUNCTION_RECURSION_CYCLE_UNSUPPORTED"
);

console.log("Persistent user function store tests passed.");
