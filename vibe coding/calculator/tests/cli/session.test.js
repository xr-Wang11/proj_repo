"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { ANGLE_UNITS, OUTPUT_MODES } = require(path.resolve(__dirname, "../../core/model"));
const { createCliSession, runSessionLines } = require(path.resolve(__dirname, "../../cli/session"));

const responses = runSessionLines([
  ":help",
  ":fn-save f_sum(x, y) = x + y",
  ":fn-show f_sum",
  "f_sum(3,4)",
  ":functions",
  ":mode polar",
  ":angle deg",
  "3 + 4*i",
  ":latex on",
  "to_polar(3+4*i,deg)",
  ":fn-delete f_sum",
  "f_sum(1,2)",
  ":fn-import [{\"name\":\"f_mul\",\"parameters\":[{\"name\":\"x\"},{\"name\":\"y\"}],\"bodySource\":\"x * y\",\"metadata\":{\"source\":\"x * y\"}}]",
  "f_mul(5,6)",
  ":history",
  ":quit",
]);

assert.equal(responses[0].kind, "command");
assert.ok(responses[0].lines.some((line) => line.includes(":fn-save")));

assert.equal(responses[1].kind, "command");
assert.ok(responses[1].lines[0].includes("f_sum(x, y)"));

assert.equal(responses[2].kind, "command");
assert.equal(responses[2].lines[0], "f_sum(x, y)");
assert.equal(responses[2].lines[1], "公式: x + y");

assert.equal(responses[3].kind, "result");
assert.deepEqual(responses[3].lines, ["= 7"]);

assert.equal(responses[4].kind, "command");
assert.ok(responses[4].lines.some((line) => line.includes("f_sum(x, y) [用户]")));
assert.ok(responses[4].lines.some((line) => line.includes("sin(value) [内建]")));

assert.equal(responses[5].kind, "command");
assert.deepEqual(responses[5].lines, ["输出模式已切换为 polar"]);

assert.equal(responses[6].kind, "command");
assert.deepEqual(responses[6].lines, ["角度单位已切换为 deg"]);

assert.equal(responses[7].kind, "result");
assert.deepEqual(responses[7].lines, ["= 5 ∠ 53.130102354156 deg"]);

assert.equal(responses[8].kind, "command");
assert.deepEqual(responses[8].lines, ["LaTeX 输出已开启"]);

assert.equal(responses[9].kind, "result");
assert.equal(responses[9].lines[0], "= 5 ∠ 53.130102354156 deg");
assert.equal(responses[9].lines[1], "latex: 5 \\angle 53.13010235415598^{\\circ}");

assert.equal(responses[10].kind, "command");
assert.deepEqual(responses[10].lines, ["已删除用户函数 f_sum"]);

assert.equal(responses[11].kind, "error");
assert.ok(responses[11].lines[0].includes("NAME_UNKNOWN_FUNCTION"));

assert.equal(responses[12].kind, "command");
assert.deepEqual(responses[12].lines, ["已导入 1 个用户函数。"]);

assert.equal(responses[13].kind, "result");
assert.deepEqual(responses[13].lines, ["= 30 ∠ 0 deg", "latex: 30"]);

assert.equal(responses[14].kind, "command");
assert.ok(responses[14].lines.some((line) => line.includes("2. :fn-save f_sum(x, y) = x + y")));
assert.ok(responses[14].lines.some((line) => line.includes("14. f_mul(5,6)")));

assert.equal(responses[15].kind, "exit");

const invalidMode = runSessionLines([":mode impossible"])[0];
assert.equal(invalidMode.kind, "error");

const invalidAngle = runSessionLines([":angle bad"])[0];
assert.equal(invalidAngle.kind, "error");

const invalidLatex = runSessionLines([":latex maybe"])[0];
assert.equal(invalidLatex.kind, "error");

const invalidFunctionSpec = runSessionLines([":fn-save bad spec"])[0];
assert.equal(invalidFunctionSpec.kind, "error");

const snapshotSession = createCliSession({
  angleUnit: ANGLE_UNITS.DEG,
  outputMode: OUTPUT_MODES.DEBUG,
  showLatex: true,
});
snapshotSession.executeLine("3+4*i");
const snapshot = snapshotSession.getSnapshot();
assert.equal(snapshot.angleUnit, ANGLE_UNITS.DEG);
assert.equal(snapshot.outputMode, OUTPUT_MODES.DEBUG);
assert.equal(snapshot.showLatex, true);
assert.deepEqual(snapshot.history, ["3+4*i"]);

console.log("CLI session tests passed.");
