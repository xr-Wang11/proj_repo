"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const {
  createBuiltinFunctionDefinition,
  createIdentifier,
  createUserFunctionDefinition,
} = require(path.resolve(__dirname, "../../core/model"));
const {
  DEFAULT_BUILTIN_FUNCTIONS,
  createFunctionRegistry,
} = require(path.resolve(__dirname, "../../core/functions"));

const registry = createFunctionRegistry({
  builtinDefinitions: DEFAULT_BUILTIN_FUNCTIONS,
});

assert.equal(registry.hasFunction("sin"), true);
assert.equal(registry.hasFunction("ln"), true);
assert.equal(registry.hasFunction("lg"), true);
assert.equal(registry.hasFunction("log"), false);
assert.equal(registry.hasFunction("unknown"), false);
assert.equal(registry.getFunction("cos").name, "cos");

const userDefinition = createUserFunctionDefinition({
  name: "f_test",
  parameters: ["x"],
  bodyAst: createIdentifier({ name: "x", span: { start: 0, end: 1 } }),
});

registry.registerUserFunction(userDefinition);
assert.equal(registry.hasFunction("f_test"), true);
assert.equal(registry.getFunction("f_test").kind, "user_defined");

const userList = registry.listFunctions({ includeBuiltins: false });
assert.deepEqual(userList.map((definition) => definition.name), ["f_test"]);

const builtinList = registry.listFunctions({ includeUsers: false });
assert.ok(builtinList.some((definition) => definition.name === "sin"));

assert.throws(
  () =>
    registry.registerUserFunction(
      createUserFunctionDefinition({
        name: "f_test",
        parameters: ["x"],
        bodyAst: createIdentifier({ name: "x", span: { start: 0, end: 1 } }),
      })
    ),
  (error) => error && error.kind === "NameError" && error.code === "NAME_DUPLICATE_USER_FUNCTION"
);

const anotherUserDefinition = createUserFunctionDefinition({
  name: "custom_sin",
  parameters: ["x"],
  bodyAst: createIdentifier({ name: "x", span: { start: 0, end: 1 } }),
});

registry.registerUserFunction(anotherUserDefinition);
assert.equal(registry.getFunction("custom_sin").kind, "user_defined");

assert.throws(
  () => registry.registerBuiltin(DEFAULT_BUILTIN_FUNCTIONS.sin),
  (error) => error instanceof RangeError
);

assert.throws(
  () => registry.requireFunction("missing_fn"),
  (error) => error && error.kind === "NameError" && error.code === "NAME_UNKNOWN_FUNCTION"
);

assert.throws(
  () => registry.validateInvocationArity("f_test", 2, { exact: 1 }),
  (error) => error && error.kind === "ArityError" && error.code === "ARITY_EXACT_MISMATCH"
);

const builtinsPlusUsers = registry.toTable();
assert.equal(typeof builtinsPlusUsers.sin.executor, "function");
assert.equal(builtinsPlusUsers.f_test.name, "f_test");

const customBuiltin = createBuiltinFunctionDefinition({
  name: "custom_builtin",
  parameters: ["value"],
  executor() {
    return 1;
  },
});

registry.registerBuiltin(customBuiltin);
assert.equal(registry.getFunction("custom_builtin").kind, "builtin");

console.log("Function registry tests passed.");
