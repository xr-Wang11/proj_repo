"use strict";

const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "../..");
const webVueDir = path.resolve(projectRoot, "web-vue");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const {
  buildWebVueStandaloneHtml,
} = require(path.resolve(__dirname, "../../scripts/build-web-vue-standalone"));

execSync(`${npmCommand} run build`, {
  cwd: webVueDir,
  stdio: "pipe",
});

const result = buildWebVueStandaloneHtml();

assert.ok(fs.existsSync(result.outputFile));

const standaloneSource = fs.readFileSync(result.outputFile, "utf8");

assert.ok(standaloneSource.includes("<!DOCTYPE html>"));
assert.ok(standaloneSource.includes('data-inline-src="./calculator-runtime.js"'));
assert.ok(standaloneSource.includes('data-inline-href="./assets/'));
assert.ok(standaloneSource.includes('type="module" data-inline-src="./assets/'));
assert.ok(!standaloneSource.includes('<script src="./calculator-runtime.js"></script>'));
assert.ok(!standaloneSource.includes('rel="stylesheet" crossorigin href="./assets/'));

console.log("Vue standalone build tests passed.");
