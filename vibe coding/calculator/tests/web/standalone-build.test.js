"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildBrowserBundle,
  buildStandaloneHtml,
} = require(path.resolve(__dirname, "../../scripts/build-web-bundle"));

const bundleResult = buildBrowserBundle();
const standaloneResult = buildStandaloneHtml(bundleResult);

assert.ok(fs.existsSync(standaloneResult.outputFile));

const standaloneSource = fs.readFileSync(standaloneResult.outputFile, "utf8");

assert.ok(standaloneSource.includes("<!DOCTYPE html>"));
assert.ok(standaloneSource.includes("CalculatorWebApp"));
assert.ok(standaloneSource.includes("web/app-entry.js"));
assert.ok(!standaloneSource.includes('<script src="./app.bundle.js"></script>'));

console.log("Standalone web build tests passed.");
