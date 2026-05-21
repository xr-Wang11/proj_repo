"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildBrowserBundle } = require(path.resolve(__dirname, "../../scripts/build-web-bundle"));

const result = buildBrowserBundle();

assert.equal(typeof result.moduleCount, "number");
assert.ok(result.moduleCount > 0);
assert.ok(fs.existsSync(result.outputFile));

const bundleSource = fs.readFileSync(result.outputFile, "utf8");
assert.ok(bundleSource.includes("CalculatorWebApp"));
assert.ok(bundleSource.includes("web/app-entry.js"));

console.log("Web bundle build tests passed.");
