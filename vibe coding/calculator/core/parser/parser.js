"use strict";

const {
  ANGLE_UNITS,
  CONVERSION_TARGETS,
  TOKEN_TYPES,
  createBinaryExpression,
  createConversionExpression,
  createFunctionCall,
  createIdentifier,
  createNumberLiteral,
  createParseError,
  createUnaryExpression,
  mergeSpans,
} = require("../model");
const { tokenize } = require("../lexer");

function createParserState(tokens) {
  if (!Array.isArray(tokens)) {
    throw new TypeError("parse.tokens must be an array.");
  }

  return {
    tokens,
    index: 0,
  };
}

function current(state) {
  return state.tokens[state.index] || null;
}

function previous(state) {
  return state.tokens[state.index - 1] || null;
}

function advance(state) {
  const token = current(state);

  if (state.index < state.tokens.length) {
    state.index += 1;
  }

  return token;
}

function check(state, type, value = undefined) {
  const token = current(state);

  if (!token || token.type !== type) {
    return false;
  }

  if (value !== undefined && token.value !== value) {
    return false;
  }

  return true;
}

function match(state, type, value = undefined) {
  if (!check(state, type, value)) {
    return false;
  }

  advance(state);
  return true;
}

function makeTokenPosition(token) {
  if (!token) {
    return { start: 0, end: 0 };
  }

  return {
    start: token.start,
    end: token.end,
  };
}

function failParse(state, code, message, token = current(state), context = {}, hint = "") {
  throw createParseError({
    code,
    message,
    position: makeTokenPosition(token),
    context,
    hint,
  });
}

function expect(state, type, value = undefined, options = {}) {
  if (check(state, type, value)) {
    return advance(state);
  }

  const token = current(state);
  const expectedLabel =
    value !== undefined ? `${type}(${value})` : type;

  failParse(
    state,
    options.code || "PARSE_UNEXPECTED_TOKEN",
    options.message || `期望看到 ${expectedLabel}，但读取到了其他内容。`,
    token,
    {
      expected: expectedLabel,
      actual: token ? `${token.type}(${token.value})` : "EOF",
      ...options.context,
    },
    options.hint || ""
  );
}

function parse(tokens) {
  const state = createParserState(tokens);
  const expression = parseExpression(state);

  expect(state, TOKEN_TYPES.EOF, undefined, {
    code: "PARSE_EXPECTED_EOF",
    message: "表达式结束后仍然存在未消费的 token。",
    hint: "请检查是否遗漏了运算符或多写了不完整片段。",
  });

  return expression;
}

function parseSource(input) {
  return parse(tokenize(input));
}

function parseExpression(state) {
  return parseAdditive(state);
}

function parseAdditive(state) {
  let expression = parseMultiplicative(state);

  while (check(state, TOKEN_TYPES.OPERATOR, "+") || check(state, TOKEN_TYPES.OPERATOR, "-")) {
    const operatorToken = advance(state);
    const right = parseMultiplicative(state);

    expression = createBinaryExpression({
      operator: operatorToken.value,
      left: expression,
      right,
      span: mergeSpans(expression.span, right.span),
    });
  }

  return expression;
}

function parseMultiplicative(state) {
  let expression = parseUnary(state);

  while (check(state, TOKEN_TYPES.OPERATOR, "*") || check(state, TOKEN_TYPES.OPERATOR, "/")) {
    const operatorToken = advance(state);
    const right = parseUnary(state);

    expression = createBinaryExpression({
      operator: operatorToken.value,
      left: expression,
      right,
      span: mergeSpans(expression.span, right.span),
    });
  }

  return expression;
}

function parseUnary(state) {
  if (check(state, TOKEN_TYPES.OPERATOR, "+") || check(state, TOKEN_TYPES.OPERATOR, "-")) {
    const operatorToken = advance(state);
    const argument = parseUnary(state);

    return createUnaryExpression({
      operator: operatorToken.value,
      argument,
      span: mergeSpans(makeTokenPosition(operatorToken), argument.span),
    });
  }

  return parsePower(state);
}

function parsePower(state) {
  const left = parseCall(state);

  if (check(state, TOKEN_TYPES.OPERATOR, "^")) {
    const operatorToken = advance(state);
    const right = parsePower(state);

    return createBinaryExpression({
      operator: operatorToken.value,
      left,
      right,
      span: mergeSpans(left.span, right.span),
    });
  }

  return left;
}

function parseCall(state) {
  let expression = parsePrimary(state);

  while (check(state, TOKEN_TYPES.LPAREN)) {
    if (expression.kind !== "Identifier") {
      failParse(
        state,
        "PARSE_INVALID_CALLEE",
        "只有标识符可以作为函数调用目标。",
        current(state),
        {},
        "请写成类似 sin(x) 或 polar(5,30,deg) 的形式。"
      );
    }

    advance(state);
    const args = parseArguments(state, expression.name);
    const closeParenToken = expect(state, TOKEN_TYPES.RPAREN, undefined, {
      code: "PARSE_MISSING_RPAREN",
      message: "函数调用缺少右括号。",
      hint: "请检查左括号是否已经闭合。",
    });

    expression = buildCallLikeNode(expression, args, closeParenToken);
  }

  return expression;
}

function parseArguments(state, calleeName) {
  if (check(state, TOKEN_TYPES.RPAREN)) {
    return [];
  }

  const args = [];

  while (true) {
    if (check(state, TOKEN_TYPES.COMMA)) {
      failParse(
        state,
        "PARSE_MISSING_ARGUMENT",
        `函数 ${calleeName} 在当前位置缺少参数。`,
        current(state),
        { callee: calleeName, argumentIndex: args.length + 1 },
        "逗号前后都必须是完整表达式。"
      );
    }

    args.push(parseExpression(state));

    if (!match(state, TOKEN_TYPES.COMMA)) {
      break;
    }

    if (check(state, TOKEN_TYPES.RPAREN)) {
      failParse(
        state,
        "PARSE_TRAILING_COMMA",
        `函数 ${calleeName} 的最后一个逗号后缺少参数。`,
        current(state),
        { callee: calleeName, argumentIndex: args.length + 1 },
        "请删除多余逗号，或补上最后一个参数。"
      );
    }
  }

  return args;
}

function buildCallLikeNode(calleeNode, args, closeParenToken) {
  const span = mergeSpans(calleeNode.span, makeTokenPosition(closeParenToken));

  if (calleeNode.name === "to_rect") {
    return buildConversionNode(calleeNode, args, CONVERSION_TARGETS.RECT, span);
  }

  if (calleeNode.name === "to_polar") {
    return buildConversionNode(calleeNode, args, CONVERSION_TARGETS.POLAR, span);
  }

  return createFunctionCall({
    callee: calleeNode,
    args,
    span,
  });
}

function buildConversionNode(calleeNode, args, targetForm, span) {
  if (args.length === 0) {
    throw createParseError({
      code: "PARSE_MISSING_ARGUMENT",
      message: `转换函数 ${calleeNode.name} 至少需要一个参数。`,
      position: calleeNode.span,
      context: { callee: calleeNode.name },
      hint: "请至少提供需要转换的表达式，例如 to_polar(z, deg)。",
    });
  }

  if (args.length > 2) {
    throw createParseError({
      code: "PARSE_TOO_MANY_ARGUMENTS",
      message: `转换函数 ${calleeNode.name} 最多只接受两个参数。`,
      position: span,
      context: { callee: calleeNode.name, actualArity: args.length },
      hint: "格式应为 to_rect(z) 或 to_polar(z, deg)。",
    });
  }

  let angleUnit = null;

  if (args.length === 2) {
    const angleUnitNode = args[1];

    if (angleUnitNode.kind !== "Identifier" || !Object.values(ANGLE_UNITS).includes(angleUnitNode.name)) {
      throw createParseError({
        code: "PARSE_INVALID_ANGLE_UNIT",
        message: `转换函数 ${calleeNode.name} 的角度单位必须是 deg 或 rad。`,
        position: angleUnitNode.span,
        context: { callee: calleeNode.name },
        hint: "请将第二个参数写成 deg 或 rad。",
      });
    }

    angleUnit = angleUnitNode.name;
  }

  return createConversionExpression({
    source: args[0],
    targetForm,
    angleUnit,
    span,
  });
}

function parsePrimary(state) {
  const token = current(state);

  if (!token) {
    failParse(
      state,
      "PARSE_UNEXPECTED_EOF",
      "表达式意外结束。",
      null,
      {},
      "请检查是否缺少数字、变量、函数或右括号。"
    );
  }

  if (token.type === TOKEN_TYPES.EOF) {
    failParse(
      state,
      "PARSE_UNEXPECTED_EOF",
      "表达式意外结束。",
      token,
      {},
      "请检查是否缺少数字、变量、函数参数或右括号。"
    );
  }

  if (match(state, TOKEN_TYPES.NUMBER)) {
    return createNumberLiteral({
      raw: token.value,
      value: Number(token.value),
      span: token.span,
    });
  }

  if (match(state, TOKEN_TYPES.IDENTIFIER)) {
    return createIdentifier({
      name: token.value,
      span: token.span,
    });
  }

  if (match(state, TOKEN_TYPES.LPAREN)) {
    const leftParenToken = token;
    const expression = parseExpression(state);
    const rightParenToken = expect(state, TOKEN_TYPES.RPAREN, undefined, {
      code: "PARSE_MISSING_RPAREN",
      message: "括号表达式缺少右括号。",
      hint: "请检查左括号后面的表达式是否已经完整闭合。",
    });

    return withUpdatedSpan(expression, mergeSpans(makeTokenPosition(leftParenToken), makeTokenPosition(rightParenToken)));
  }

  failParse(
    state,
    "PARSE_UNEXPECTED_TOKEN",
    `当前位置无法开始一个表达式：${token.type}(${token.value})。`,
    token,
    { tokenType: token.type, tokenValue: token.value },
    "表达式通常应从数字、标识符、前缀运算符或左括号开始。"
  );
}

function withUpdatedSpan(node, span) {
  switch (node.kind) {
    case "NumberLiteral":
      return createNumberLiteral({
        raw: node.raw,
        value: node.value,
        span,
      });
    case "Identifier":
      return createIdentifier({
        name: node.name,
        span,
      });
    case "UnaryExpression":
      return createUnaryExpression({
        operator: node.operator,
        argument: node.argument,
        span,
      });
    case "BinaryExpression":
      return createBinaryExpression({
        operator: node.operator,
        left: node.left,
        right: node.right,
        span,
      });
    case "FunctionCall":
      return createFunctionCall({
        callee: node.callee,
        args: Array.from(node.args),
        span,
      });
    case "ConversionExpression":
      return createConversionExpression({
        source: node.source,
        targetForm: node.targetForm,
        angleUnit: node.angleUnit,
        span,
      });
    default:
      return node;
  }
}

module.exports = {
  parse,
  parseSource,
};
