"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { parseSource } = require(path.resolve(__dirname, "../../core/parser"));

function summarizeAst(node) {
  switch (node.kind) {
    case "NumberLiteral":
      return {
        kind: node.kind,
        raw: node.raw,
        value: node.value,
      };
    case "Identifier":
      return {
        kind: node.kind,
        name: node.name,
      };
    case "UnaryExpression":
      return {
        kind: node.kind,
        operator: node.operator,
        argument: summarizeAst(node.argument),
      };
    case "BinaryExpression":
      return {
        kind: node.kind,
        operator: node.operator,
        left: summarizeAst(node.left),
        right: summarizeAst(node.right),
      };
    case "FunctionCall":
      return {
        kind: node.kind,
        callee: summarizeAst(node.callee),
        args: node.args.map(summarizeAst),
      };
    case "ConversionExpression":
      return {
        kind: node.kind,
        targetForm: node.targetForm,
        angleUnit: node.angleUnit,
        source: summarizeAst(node.source),
      };
    default:
      throw new Error(`Unknown AST node kind: ${node.kind}`);
  }
}

function expectAst(input, expected) {
  assert.deepEqual(summarizeAst(parseSource(input)), expected);
}

function expectParseError(input, expectedCode) {
  assert.throws(
    () => parseSource(input),
    (error) => error && error.kind === "ParseError" && error.code === expectedCode
  );
}

expectAst("3 + 4*i", {
  kind: "BinaryExpression",
  operator: "+",
  left: { kind: "NumberLiteral", raw: "3", value: 3 },
  right: {
    kind: "BinaryExpression",
    operator: "*",
    left: { kind: "NumberLiteral", raw: "4", value: 4 },
    right: { kind: "Identifier", name: "i" },
  },
});

expectAst("-2^3^2", {
  kind: "UnaryExpression",
  operator: "-",
  argument: {
    kind: "BinaryExpression",
    operator: "^",
    left: { kind: "NumberLiteral", raw: "2", value: 2 },
    right: {
      kind: "BinaryExpression",
      operator: "^",
      left: { kind: "NumberLiteral", raw: "3", value: 3 },
      right: { kind: "NumberLiteral", raw: "2", value: 2 },
    },
  },
});

expectAst("sin(pi/4)", {
  kind: "FunctionCall",
  callee: { kind: "Identifier", name: "sin" },
  args: [
    {
      kind: "BinaryExpression",
      operator: "/",
      left: { kind: "Identifier", name: "pi" },
      right: { kind: "NumberLiteral", raw: "4", value: 4 },
    },
  ],
});

expectAst("to_polar(3+4*i,deg)", {
  kind: "ConversionExpression",
  targetForm: "polar",
  angleUnit: "deg",
  source: {
    kind: "BinaryExpression",
    operator: "+",
    left: { kind: "NumberLiteral", raw: "3", value: 3 },
    right: {
      kind: "BinaryExpression",
      operator: "*",
      left: { kind: "NumberLiteral", raw: "4", value: 4 },
      right: { kind: "Identifier", name: "i" },
    },
  },
});

expectAst("to_rect(polar(5,30,deg))", {
  kind: "ConversionExpression",
  targetForm: "rect",
  angleUnit: null,
  source: {
    kind: "FunctionCall",
    callee: { kind: "Identifier", name: "polar" },
    args: [
      { kind: "NumberLiteral", raw: "5", value: 5 },
      { kind: "NumberLiteral", raw: "30", value: 30 },
      { kind: "Identifier", name: "deg" },
    ],
  },
});

expectParseError("2 + * 3", "PARSE_UNEXPECTED_TOKEN");
expectParseError("polar(10,)", "PARSE_TRAILING_COMMA");
expectParseError("to_polar(z,foo)", "PARSE_INVALID_ANGLE_UNIT");
expectParseError("sin(pi/4", "PARSE_MISSING_RPAREN");

console.log("Parser tests passed.");
