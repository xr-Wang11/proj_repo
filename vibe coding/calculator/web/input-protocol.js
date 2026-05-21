"use strict";

const DEFAULT_DISPLAY_MODE = "plain";
const DEFAULT_ANGLE_UNIT = "rad";
const ALLOWED_DISPLAY_MODES = Object.freeze(["plain", "rect", "polar", "debug"]);
const ALLOWED_ANGLE_UNITS = Object.freeze(["deg", "rad"]);
const KEYBOARD_ALLOWED_PATTERN = /[0-9A-Za-z_.\s+\-*/^(),]/u;

const FULLWIDTH_ASCII_START = 65281;
const FULLWIDTH_ASCII_END = 65374;
const FULLWIDTH_OFFSET = 65248;

const SPECIAL_INPUT_NORMALIZATION_MAP = Object.freeze({
  "×": "*",
  "÷": "/",
  "−": "-",
  "—": "-",
  "–": "-",
  "，": ",",
  "。": ".",
  "　": " ",
});

const BUTTON_DEFINITIONS = Object.freeze({
  plus: Object.freeze({ key: "plus", label: "+", kind: "operator", insert: " + ", cursorOffset: 3 }),
  minus: Object.freeze({ key: "minus", label: "-", kind: "operator", insert: " - ", cursorOffset: 3 }),
  multiply: Object.freeze({ key: "multiply", label: "*", kind: "operator", insert: " * ", cursorOffset: 3 }),
  divide: Object.freeze({ key: "divide", label: "/", kind: "operator", insert: " / ", cursorOffset: 3 }),
  power: Object.freeze({ key: "power", label: "^", kind: "operator", insert: " ^ ", cursorOffset: 3 }),
  comma: Object.freeze({ key: "comma", label: ",", kind: "separator", insert: ", ", cursorOffset: 2 }),
  lparen: Object.freeze({ key: "lparen", label: "(", kind: "group", insert: "(", cursorOffset: 1 }),
  rparen: Object.freeze({ key: "rparen", label: ")", kind: "group", insert: ")", cursorOffset: 1 }),
  sin: Object.freeze({ key: "sin", label: "sin", kind: "function", insert: "sin()", cursorOffset: 4 }),
  cos: Object.freeze({ key: "cos", label: "cos", kind: "function", insert: "cos()", cursorOffset: 4 }),
  tan: Object.freeze({ key: "tan", label: "tan", kind: "function", insert: "tan()", cursorOffset: 4 }),
  sqrt: Object.freeze({ key: "sqrt", label: "sqrt", kind: "function", insert: "sqrt()", cursorOffset: 5 }),
  exp: Object.freeze({ key: "exp", label: "exp", kind: "function", insert: "exp()", cursorOffset: 4 }),
  lg: Object.freeze({ key: "lg", label: "lg", kind: "function", insert: "lg()", cursorOffset: 3 }),
  ln: Object.freeze({ key: "ln", label: "ln", kind: "function", insert: "ln()", cursorOffset: 3 }),
  re: Object.freeze({ key: "re", label: "re", kind: "function", insert: "re()", cursorOffset: 3 }),
  im: Object.freeze({ key: "im", label: "im", kind: "function", insert: "im()", cursorOffset: 3 }),
  abs: Object.freeze({ key: "abs", label: "abs", kind: "function", insert: "abs()", cursorOffset: 4 }),
  arg: Object.freeze({ key: "arg", label: "arg", kind: "function", insert: "arg()", cursorOffset: 4 }),
  conj: Object.freeze({ key: "conj", label: "conj", kind: "function", insert: "conj()", cursorOffset: 5 }),
  rect: Object.freeze({ key: "rect", label: "rect", kind: "function", insert: "rect(,)", cursorOffset: 5 }),
  polar: Object.freeze({ key: "polar", label: "polar", kind: "function", insert: "polar(,,)", cursorOffset: 6 }),
  to_rect: Object.freeze({ key: "to_rect", label: "to_rect", kind: "function", insert: "to_rect()", cursorOffset: 8 }),
  to_polar: Object.freeze({ key: "to_polar", label: "to_polar", kind: "function", insert: "to_polar()", cursorOffset: 9 }),
  pi: Object.freeze({ key: "pi", label: "pi", kind: "constant", insert: "pi", cursorOffset: 2 }),
  e: Object.freeze({ key: "e", label: "e", kind: "constant", insert: "e", cursorOffset: 1 }),
  i: Object.freeze({ key: "i", label: "i", kind: "constant", insert: "i", cursorOffset: 1 }),
  deg: Object.freeze({ key: "deg", label: "deg", kind: "constant", insert: "deg", cursorOffset: 3 }),
  rad: Object.freeze({ key: "rad", label: "rad", kind: "constant", insert: "rad", cursorOffset: 3 }),
});

function clampCursorPosition(rawInput, position) {
  const normalized = Number.isInteger(position) ? position : 0;
  return Math.max(0, Math.min(rawInput.length, normalized));
}

function simplifyError(error) {
  if (!error || typeof error !== "object") {
    return {
      kind: "Error",
      code: "UNKNOWN",
      message: String(error),
      hint: "",
      position: null,
    };
  }

  return {
    kind: error.kind || "Error",
    code: error.code || "UNKNOWN",
    message: error.message || "发生未知错误。",
    hint: error.hint || "",
    position: error.position || null,
  };
}

function defaultAdaptersFactory() {
  if (typeof require !== "function") {
    return null;
  }

  const parser = require("../core/parser");
  const evaluator = require("../core/evaluator");
  const format = require("../core/format");

  return {
    parseSource: parser.parseSource,
    evaluate: evaluator.evaluate,
    renderAstToLatex: format.renderAstToLatex,
    renderEvaluationResultToLatex: format.renderEvaluationResultToLatex,
    renderEvaluationResultToText: format.renderEvaluationResultToText,
  };
}

function resolveAdapters(adapters) {
  if (adapters) {
    return adapters;
  }

  return defaultAdaptersFactory();
}

function createInitialState(options = {}) {
  const rawInput = options.rawInput || "";
  const displayMode = options.displayMode || DEFAULT_DISPLAY_MODE;
  const angleUnit = options.angleUnit || DEFAULT_ANGLE_UNIT;

  if (!ALLOWED_DISPLAY_MODES.includes(displayMode)) {
    throw new RangeError(`Unsupported display mode: ${displayMode}`);
  }

  if (!ALLOWED_ANGLE_UNITS.includes(angleUnit)) {
    throw new RangeError(`Unsupported angle unit: ${angleUnit}`);
  }

  return {
    rawInput,
    cursorPosition: clampCursorPosition(rawInput, options.cursorPosition ?? rawInput.length),
    parsedAst: null,
    latexExpression: "",
    evaluationResult: null,
    resultText: "",
    resultLatex: "",
    parseError: null,
    evaluationError: null,
    displayMode,
    angleUnit,
    lastAction: null,
  };
}

function insertAt(rawInput, cursorPosition, insertedText) {
  return `${rawInput.slice(0, cursorPosition)}${insertedText}${rawInput.slice(cursorPosition)}`;
}

function normalizeKeyboardCharacter(char) {
  const source = String(char ?? "");

  if (!source) {
    return {
      accepted: false,
      original: source,
      normalized: "",
      normalizedFromFullWidth: false,
    };
  }

  const specialMapped = SPECIAL_INPUT_NORMALIZATION_MAP[source];

  if (specialMapped) {
    return {
      accepted: KEYBOARD_ALLOWED_PATTERN.test(specialMapped),
      original: source,
      normalized: specialMapped,
      normalizedFromFullWidth: true,
    };
  }

  const codePoint = source.codePointAt(0);
  let normalized = source;
  let normalizedFromFullWidth = false;

  if (codePoint >= FULLWIDTH_ASCII_START && codePoint <= FULLWIDTH_ASCII_END) {
    normalized = String.fromCodePoint(codePoint - FULLWIDTH_OFFSET);
    normalizedFromFullWidth = true;
  }

  return {
    accepted: KEYBOARD_ALLOWED_PATTERN.test(normalized),
    original: source,
    normalized: normalized,
    normalizedFromFullWidth,
  };
}

function buildEvaluationContext(adapters, state) {
  const extraContext = adapters && typeof adapters.getEvaluationContext === "function"
    ? adapters.getEvaluationContext(state) || {}
    : {};

  return {
    ...extraContext,
    options: {
      ...(extraContext.options || {}),
      angleUnit: state.angleUnit,
      outputMode: state.displayMode,
    },
  };
}

function recomputeDerivedState(state, adapters) {
  const nextState = {
    ...state,
    parsedAst: null,
    latexExpression: "",
    evaluationResult: null,
    resultText: "",
    resultLatex: "",
    parseError: null,
    evaluationError: null,
  };

  const trimmed = nextState.rawInput.trim();

  if (!trimmed || !adapters) {
    return nextState;
  }

  try {
    const ast = adapters.parseSource(nextState.rawInput);
    nextState.parsedAst = ast;

    if (typeof adapters.renderAstToLatex === "function") {
      nextState.latexExpression = adapters.renderAstToLatex(ast);
    }

    if (typeof adapters.evaluate === "function") {
      const evaluationContext = buildEvaluationContext(adapters, nextState);
      const result = adapters.evaluate(ast, evaluationContext, nextState);
      nextState.evaluationResult = result;

      if (typeof adapters.renderEvaluationResultToText === "function") {
        nextState.resultText = adapters.renderEvaluationResultToText(result, {
          outputMode: nextState.displayMode,
          angleUnit: nextState.angleUnit,
        });
      }

      if (typeof adapters.renderEvaluationResultToLatex === "function") {
        nextState.resultLatex = adapters.renderEvaluationResultToLatex(result);
      }
    }
  } catch (error) {
    const simplified = simplifyError(error);

    if (simplified.kind === "ParseError" || simplified.kind === "LexError") {
      nextState.parseError = simplified;
    } else {
      nextState.evaluationError = simplified;
    }
  }

  return nextState;
}

function createWebInputProtocol(customAdapters) {
  const adapters = resolveAdapters(customAdapters);

  function normalizeState(state) {
    const base = createInitialState(state || {});
    return recomputeDerivedState(base, adapters);
  }

  function withAction(state, patch, lastAction) {
    return recomputeDerivedState(
      {
        ...state,
        ...patch,
        lastAction,
      },
      adapters
    );
  }

  function applyKeyboardText(state, text) {
    const source = String(text ?? "");
    let accepted = "";
    let rejected = "";
    let normalizedOriginal = "";
    let normalizedText = "";

    for (const char of source) {
      const normalized = normalizeKeyboardCharacter(char);

      if (normalized.accepted) {
        accepted += normalized.normalized;

        if (normalized.normalizedFromFullWidth || normalized.original !== normalized.normalized) {
          normalizedOriginal += normalized.original;
          normalizedText += normalized.normalized;
        }
      } else {
        rejected += char;
      }
    }

    const rawInput = insertAt(state.rawInput, state.cursorPosition, accepted);
    const cursorPosition = state.cursorPosition + accepted.length;

    return withAction(
      state,
      {
        rawInput,
        cursorPosition,
      },
      {
        kind: "keyboard",
        input: source,
        acceptedText: accepted,
        rejectedText: rejected,
        normalizedOriginalText: normalizedOriginal,
        normalizedText,
      }
    );
  }

  function insertTemplate(state, insertedText, cursorOffset = null, metadata = {}) {
    const normalizedText = String(insertedText ?? "");
    const offset = Number.isInteger(cursorOffset) ? cursorOffset : normalizedText.length;
    const rawInput = insertAt(state.rawInput, state.cursorPosition, normalizedText);
    const cursorPosition = state.cursorPosition + Math.max(0, Math.min(normalizedText.length, offset));

    return withAction(
      state,
      {
        rawInput,
        cursorPosition,
      },
      {
        kind: "template",
        insertedText: normalizedText,
        ...metadata,
      }
    );
  }

  function insertButton(state, buttonKey) {
    const definition = BUTTON_DEFINITIONS[buttonKey];

    if (!definition) {
      throw new RangeError(`Unknown button key: ${buttonKey}`);
    }

    return insertTemplate(state, definition.insert, definition.cursorOffset, {
      kind: "button",
      buttonKey,
    });
  }

  function moveCursor(state, position) {
    return withAction(
      state,
      {
        cursorPosition: clampCursorPosition(state.rawInput, position),
      },
      {
        kind: "cursor",
        position: clampCursorPosition(state.rawInput, position),
      }
    );
  }

  function moveCursorBy(state, delta) {
    const normalizedDelta = Number.isInteger(delta) ? delta : 0;
    return moveCursor(state, state.cursorPosition + normalizedDelta);
  }

  function backspace(state) {
    if (state.cursorPosition === 0) {
      return withAction(state, {}, { kind: "backspace", changed: false });
    }

    const rawInput =
      state.rawInput.slice(0, state.cursorPosition - 1) + state.rawInput.slice(state.cursorPosition);

    return withAction(
      state,
      {
        rawInput,
        cursorPosition: state.cursorPosition - 1,
      },
      {
        kind: "backspace",
        changed: true,
      }
    );
  }

  function deleteForward(state) {
    if (state.cursorPosition >= state.rawInput.length) {
      return withAction(state, {}, { kind: "delete", changed: false });
    }

    const rawInput =
      state.rawInput.slice(0, state.cursorPosition) + state.rawInput.slice(state.cursorPosition + 1);

    return withAction(
      state,
      {
        rawInput,
      },
      {
        kind: "delete",
        changed: true,
      }
    );
  }

  function setDisplayMode(state, displayMode) {
    if (!ALLOWED_DISPLAY_MODES.includes(displayMode)) {
      throw new RangeError(`Unsupported display mode: ${displayMode}`);
    }

    return withAction(
      state,
      { displayMode },
      {
        kind: "displayMode",
        displayMode,
      }
    );
  }

  function setAngleUnit(state, angleUnit) {
    if (!ALLOWED_ANGLE_UNITS.includes(angleUnit)) {
      throw new RangeError(`Unsupported angle unit: ${angleUnit}`);
    }

    return withAction(
      state,
      { angleUnit },
      {
        kind: "angleUnit",
        angleUnit,
      }
    );
  }

  function replaceRawInput(state, rawInput) {
    const normalizedRawInput = String(rawInput ?? "");

    return withAction(
      state,
      {
        rawInput: normalizedRawInput,
        cursorPosition: normalizedRawInput.length,
      },
      {
        kind: "replace",
        rawInput: normalizedRawInput,
      }
    );
  }

  function refresh(state) {
    return withAction(state, {}, { kind: "refresh" });
  }

  function clear(state) {
    return withAction(
      state,
      {
        rawInput: "",
        cursorPosition: 0,
      },
      {
        kind: "clear",
      }
    );
  }

  return Object.freeze({
    BUTTON_DEFINITIONS,
    ALLOWED_ANGLE_UNITS,
    ALLOWED_DISPLAY_MODES,
    KEYBOARD_ALLOWED_PATTERN,
    applyKeyboardText,
    backspace,
    clear,
    createState: normalizeState,
    deleteForward,
    insertButton,
    insertTemplate,
    moveCursor,
    moveCursorBy,
    normalizeKeyboardCharacter,
    refresh,
    replaceRawInput,
    setAngleUnit,
    setDisplayMode,
  });
}

const api = {
  ALLOWED_ANGLE_UNITS,
  ALLOWED_DISPLAY_MODES,
  BUTTON_DEFINITIONS,
  KEYBOARD_ALLOWED_PATTERN,
  createWebInputProtocol,
  normalizeKeyboardCharacter,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}

if (typeof window !== "undefined") {
  window.WebInputProtocol = api;
}
