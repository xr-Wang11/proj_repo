function getRuntime() {
  if (typeof window !== "undefined" && window.CalculatorRuntime) {
    return window.CalculatorRuntime;
  }

  throw new Error("CalculatorRuntime is not loaded. Please ensure /calculator-runtime.js is available before the Vue app starts.");
}

export function parseSource(...args) {
  return getRuntime().parseSource(...args);
}

export function evaluate(...args) {
  return getRuntime().evaluate(...args);
}

export function renderAstToLatex(...args) {
  return getRuntime().renderAstToLatex(...args);
}

export function renderEvaluationResultToLatex(...args) {
  return getRuntime().renderEvaluationResultToLatex(...args);
}

export function renderEvaluationResultToText(...args) {
  return getRuntime().renderEvaluationResultToText(...args);
}

export function toPhasorValue(...args) {
  return getRuntime().toPhasorValue(...args);
}

export function createWebInputProtocol(...args) {
  return getRuntime().createWebInputProtocol(...args);
}

export function createInMemoryUserFunctionStore(...args) {
  return getRuntime().createInMemoryUserFunctionStore(...args);
}

export function createPersistentUserFunctionStore(...args) {
  return getRuntime().createPersistentUserFunctionStore(...args);
}

export function createLocalStorageRecordPersistence(...args) {
  return getRuntime().createLocalStorageRecordPersistence(...args);
}

export const BUTTON_DEFINITIONS = Object.freeze({
  get abs() {
    return getRuntime().BUTTON_DEFINITIONS.abs;
  },
  get arg() {
    return getRuntime().BUTTON_DEFINITIONS.arg;
  },
  get comma() {
    return getRuntime().BUTTON_DEFINITIONS.comma;
  },
  get conj() {
    return getRuntime().BUTTON_DEFINITIONS.conj;
  },
  get cos() {
    return getRuntime().BUTTON_DEFINITIONS.cos;
  },
  get deg() {
    return getRuntime().BUTTON_DEFINITIONS.deg;
  },
  get divide() {
    return getRuntime().BUTTON_DEFINITIONS.divide;
  },
  get e() {
    return getRuntime().BUTTON_DEFINITIONS.e;
  },
  get exp() {
    return getRuntime().BUTTON_DEFINITIONS.exp;
  },
  get i() {
    return getRuntime().BUTTON_DEFINITIONS.i;
  },
  get im() {
    return getRuntime().BUTTON_DEFINITIONS.im;
  },
  get lg() {
    return getRuntime().BUTTON_DEFINITIONS.lg;
  },
  get ln() {
    return getRuntime().BUTTON_DEFINITIONS.ln;
  },
  get lparen() {
    return getRuntime().BUTTON_DEFINITIONS.lparen;
  },
  get minus() {
    return getRuntime().BUTTON_DEFINITIONS.minus;
  },
  get multiply() {
    return getRuntime().BUTTON_DEFINITIONS.multiply;
  },
  get pi() {
    return getRuntime().BUTTON_DEFINITIONS.pi;
  },
  get plus() {
    return getRuntime().BUTTON_DEFINITIONS.plus;
  },
  get polar() {
    return getRuntime().BUTTON_DEFINITIONS.polar;
  },
  get power() {
    return getRuntime().BUTTON_DEFINITIONS.power;
  },
  get rad() {
    return getRuntime().BUTTON_DEFINITIONS.rad;
  },
  get re() {
    return getRuntime().BUTTON_DEFINITIONS.re;
  },
  get rect() {
    return getRuntime().BUTTON_DEFINITIONS.rect;
  },
  get rparen() {
    return getRuntime().BUTTON_DEFINITIONS.rparen;
  },
  get sin() {
    return getRuntime().BUTTON_DEFINITIONS.sin;
  },
  get sqrt() {
    return getRuntime().BUTTON_DEFINITIONS.sqrt;
  },
  get tan() {
    return getRuntime().BUTTON_DEFINITIONS.tan;
  },
  get to_polar() {
    return getRuntime().BUTTON_DEFINITIONS.to_polar;
  },
  get to_rect() {
    return getRuntime().BUTTON_DEFINITIONS.to_rect;
  },
});
