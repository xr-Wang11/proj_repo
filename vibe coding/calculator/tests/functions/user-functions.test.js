"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const {
  DEFAULT_BUILTIN_FUNCTIONS,
  compileUserFunctionDefinition,
  createFunctionRegistry,
  createInMemoryUserFunctionStore,
  deserializeUserFunctionRecord,
  serializeUserFunctionDefinition,
  validateUserFunctionSpec,
} = require(path.resolve(__dirname, "../../core/functions"));

const compiled = compileUserFunctionDefinition({
  name: "f_power",
  parameters: ["u", "i_load"],
  bodySource: "u * conj(i_load)",
  metadata: {
    description: "Complex power",
    tags: ["power"],
  },
});

assert.equal(compiled.kind, "user_defined");
assert.equal(compiled.name, "f_power");
assert.equal(compiled.parameters.length, 2);
assert.equal(compiled.metadata.source, "u * conj(i_load)");

const serialized = serializeUserFunctionDefinition(compiled);
assert.equal(serialized.name, "f_power");
assert.equal(serialized.bodySource, "u * conj(i_load)");
assert.deepEqual(serialized.parameters.map((parameter) => parameter.name), ["u", "i_load"]);

const deserialized = deserializeUserFunctionRecord(serialized);
assert.equal(deserialized.name, "f_power");
assert.equal(deserialized.metadata.source, "u * conj(i_load)");

const store = createInMemoryUserFunctionStore();
store.save(compiled);
assert.equal(store.has("f_power"), true);
assert.equal(store.get("f_power").name, "f_power");
assert.deepEqual(store.list().map((definition) => definition.name), ["f_power"]);
assert.deepEqual(store.exportRecords().map((record) => record.name), ["f_power"]);

store.define({
  name: "f_sum",
  parameters: ["x", "y"],
  bodySource: "x + y",
});
assert.deepEqual(store.list().map((definition) => definition.name), ["f_power", "f_sum"]);

assert.equal(store.remove("f_sum"), true);
assert.equal(store.has("f_sum"), false);
assert.equal(store.remove("f_sum"), false);

store.define({
  name: "f_sum",
  parameters: ["x", "y"],
  bodySource: "x - y",
});
assert.equal(store.get("f_sum").metadata.source, "x - y");

store.save(
  compileUserFunctionDefinition({
    name: "f_sum",
    parameters: ["x", "y"],
    bodySource: "x + y",
  }),
  { replace: true }
);
assert.equal(store.get("f_sum").metadata.source, "x + y");

const importedStore = createInMemoryUserFunctionStore();
importedStore.loadRecords(store.exportRecords());
assert.deepEqual(importedStore.list().map((definition) => definition.name), ["f_power", "f_sum"]);

const registry = createFunctionRegistry({
  builtinDefinitions: DEFAULT_BUILTIN_FUNCTIONS,
});

const validSpec = validateUserFunctionSpec(
  {
    name: "f_drop",
    parameters: ["z"],
    bodySource: "abs(z)",
  },
  { registry }
);
assert.equal(validSpec.valid, true);

const duplicateSpec = validateUserFunctionSpec(
  {
    name: "sin",
    parameters: ["x"],
    bodySource: "x",
  },
  { registry }
);
assert.equal(duplicateSpec.valid, false);

assert.throws(
  () =>
    compileUserFunctionDefinition({
      name: "j",
      parameters: ["x"],
      bodySource: "x",
    }),
  /reserved/u
);

assert.throws(
  () =>
    compileUserFunctionDefinition({
      name: "f_bad",
      parameters: ["j"],
      bodySource: "j + 1",
    }),
  /Invalid parameter name/u
);

assert.throws(
  () =>
    compileUserFunctionDefinition({
      name: "f_self",
      parameters: ["x"],
      bodySource: "f_self(x)",
    }),
  (error) =>
    error &&
    error.kind === "UnsupportedFeatureError" &&
    error.code === "USER_FUNCTION_DIRECT_RECURSION_UNSUPPORTED"
);

assert.throws(
  () =>
    store.save(
      compileUserFunctionDefinition({
        name: "f_power",
        parameters: ["x"],
        bodySource: "x",
      })
    ),
  (error) => error && error.kind === "NameError" && error.code === "NAME_DUPLICATE_USER_FUNCTION"
);

console.log("User function interface tests passed.");
