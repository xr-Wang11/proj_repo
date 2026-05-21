"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { tokenizeToDebug } = require(path.resolve(__dirname, "../../core/lexer"));

function expectTokens(input, expected) {
  const actual = tokenizeToDebug(input);
  assert.deepEqual(actual, expected);
}

function expectLexError(input, expectedCode) {
  assert.throws(
    () => tokenizeToDebug(input),
    (error) => error && error.kind === "LexError" && error.code === expectedCode
  );
}

expectTokens("3 + 4*i", [
  { type: "NUMBER", value: "3", start: 0, end: 1 },
  { type: "OPERATOR", value: "+", start: 2, end: 3 },
  { type: "NUMBER", value: "4", start: 4, end: 5 },
  { type: "OPERATOR", value: "*", start: 5, end: 6 },
  { type: "IDENTIFIER", value: "i", start: 6, end: 7 },
  { type: "EOF", value: "", start: 7, end: 7 },
]);

expectTokens("polar(5, 30, deg)", [
  { type: "IDENTIFIER", value: "polar", start: 0, end: 5 },
  { type: "LPAREN", value: "(", start: 5, end: 6 },
  { type: "NUMBER", value: "5", start: 6, end: 7 },
  { type: "COMMA", value: ",", start: 7, end: 8 },
  { type: "NUMBER", value: "30", start: 9, end: 11 },
  { type: "COMMA", value: ",", start: 11, end: 12 },
  { type: "IDENTIFIER", value: "deg", start: 13, end: 16 },
  { type: "RPAREN", value: ")", start: 16, end: 17 },
  { type: "EOF", value: "", start: 17, end: 17 },
]);

expectTokens(".5e-2 + foo_bar9", [
  { type: "NUMBER", value: ".5e-2", start: 0, end: 5 },
  { type: "OPERATOR", value: "+", start: 6, end: 7 },
  { type: "IDENTIFIER", value: "foo_bar9", start: 8, end: 16 },
  { type: "EOF", value: "", start: 16, end: 16 },
]);

expectLexError("1e", "LEX_INVALID_EXPONENT");
expectLexError("5∠30", "LEX_INVALID_CHARACTER");

console.log("Tokenizer tests passed.");
