"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { evaluate } = require(path.resolve(__dirname, "../../core/evaluator"));
const {
  renderAstToLatex,
  renderEvaluationResultToLatex,
  renderEvaluationResultToText,
} = require(path.resolve(__dirname, "../../core/format"));
const {
  createInMemoryUserFunctionStore,
} = require(path.resolve(__dirname, "../../core/functions"));
const { parseSource } = require(path.resolve(__dirname, "../../core/parser"));
const { createWebInputProtocol } = require(path.resolve(__dirname, "../../web/input-protocol"));

const userStore = createInMemoryUserFunctionStore();
const protocol = createWebInputProtocol({
  evaluate,
  getEvaluationContext() {
    return {
      functions: userStore.toDefinitionTable(),
    };
  },
  parseSource,
  renderAstToLatex,
  renderEvaluationResultToLatex,
  renderEvaluationResultToText,
});

let state = protocol.createState();
assert.equal(state.rawInput, "");
assert.equal(state.cursorPosition, 0);
assert.equal(state.displayMode, "plain");
assert.equal(state.angleUnit, "rad");

state = protocol.applyKeyboardText(state, "34");
assert.equal(state.rawInput, "34");
assert.equal(state.cursorPosition, 2);
assert.equal(state.resultText, "34");

state = protocol.applyKeyboardText(state, "+4*i");
assert.equal(state.rawInput, "34+4*i");
assert.equal(state.lastAction.acceptedText, "+4*i");
assert.equal(state.resultText, "34 + 4i");
assert.equal(state.latexExpression, "34 + 4 \\cdot i");

state = protocol.moveCursor(state, 0);
state = protocol.insertButton(state, "lparen");
state = protocol.moveCursor(state, state.rawInput.length);
state = protocol.insertButton(state, "rparen");
assert.equal(state.rawInput, "(34+4*i)");

state = protocol.replaceRawInput(state, "");
state = protocol.insertButton(state, "sin");
assert.equal(state.rawInput, "sin()");
assert.equal(state.cursorPosition, 4);

state = protocol.applyKeyboardText(state, "pi/2");
assert.equal(state.rawInput, "sin(pi/2)");
assert.equal(state.resultText, "1");

state = protocol.replaceRawInput(state, "");
state = protocol.insertButton(state, "exp");
assert.equal(state.rawInput, "exp()");
assert.equal(state.cursorPosition, 4);

state = protocol.applyKeyboardText(state, "0");
assert.equal(state.resultText, "1");

state = protocol.replaceRawInput(state, "");
state = protocol.insertButton(state, "polar");
assert.equal(state.rawInput, "polar(,,)");
assert.equal(state.cursorPosition, 6);

state = protocol.applyKeyboardText(state, "5");
state = protocol.moveCursorBy(state, 1);
state = protocol.applyKeyboardText(state, "53.13");
state = protocol.moveCursor(state, state.rawInput.length - 1);
state = protocol.insertButton(state, "deg");
assert.equal(state.rawInput, "polar(5,53.13,deg)");
assert.match(state.resultText, /^3\.00000714566\d \+ 3\.99999464074\di$/u);

state = protocol.setDisplayMode(state, "polar");
assert.equal(state.displayMode, "polar");
assert.match(state.resultText, /^5 ∠ 0\.927293\d+ rad$/u);

state = protocol.setAngleUnit(state, "deg");
assert.equal(state.angleUnit, "deg");
assert.equal(state.resultText, "5 ∠ 53.13 deg");

state = protocol.replaceRawInput(state, "");
state = protocol.applyKeyboardText(state, "３＋４＊ｉ");
assert.equal(state.lastAction.acceptedText, "3+4*i");
assert.equal(state.lastAction.normalizedOriginalText, "３＋４＊ｉ");
assert.equal(state.lastAction.normalizedText, "3+4*i");
assert.equal(state.rawInput, "3+4*i");
assert.equal(state.resultText, "5 ∠ 53.130102354156 deg");

state = protocol.insertButton(state, "plus");
state = protocol.insertButton(state, "multiply");
assert.equal(state.parseError.kind, "ParseError");

state = protocol.backspace(state);
state = protocol.backspace(state);
state = protocol.backspace(state);
assert.equal(state.parseError.kind, "ParseError");
state = protocol.backspace(state);
state = protocol.backspace(state);
state = protocol.backspace(state);
assert.equal(state.parseError, null);

state = protocol.deleteForward(protocol.moveCursor(state, state.rawInput.length));
assert.equal(state.lastAction.kind, "delete");

state = protocol.clear(state);
state = protocol.insertTemplate(state, "f_square()", 9, { source: "saved-function" });
assert.equal(state.rawInput, "f_square()");
assert.equal(state.cursorPosition, 9);
assert.equal(state.evaluationError.code, "NAME_UNKNOWN_FUNCTION");

userStore.define({
  name: "f_square",
  parameters: ["x"],
  bodySource: "x ^ 2",
});
state = protocol.replaceRawInput(state, "f_square(3)");
assert.equal(state.resultText, "9 ∠ 0 deg");

state = protocol.replaceRawInput(state, "f_cube(2)");
assert.equal(state.evaluationError.code, "NAME_UNKNOWN_FUNCTION");
userStore.define({
  name: "f_cube",
  parameters: ["x"],
  bodySource: "x ^ 3",
});
state = protocol.refresh(state);
assert.equal(state.resultText, "8 ∠ 0 deg");

state = protocol.replaceRawInput(state, "");
state = protocol.insertButton(state, "ln");
assert.equal(state.rawInput, "ln()");
state = protocol.applyKeyboardText(state, "e");
assert.equal(state.resultText, "1 ∠ 0 deg");

state = protocol.replaceRawInput(state, "");
state = protocol.applyKeyboardText(state, "lg(100)");
assert.equal(state.resultText, "2 ∠ 0 deg");

state = protocol.replaceRawInput(state, "re(3+4*i)");
assert.equal(state.resultText, "3 ∠ 0 deg");

state = protocol.clear(state);
assert.equal(state.rawInput, "");
assert.equal(state.resultText, "");
assert.equal(state.latexExpression, "");

console.log("Web input protocol tests passed.");
