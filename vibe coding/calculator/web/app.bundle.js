(function(modules, entryId) {
  var cache = {};

  function requireModule(id) {
    if (cache[id]) {
      return cache[id].exports;
    }

    if (!modules[id]) {
      throw new Error("Module not found in browser bundle: " + id);
    }

    var module = { exports: {} };
    cache[id] = module;

    var factory = modules[id][0];
    var dependencies = modules[id][1];

    function localRequire(request) {
      if (!dependencies[request]) {
        throw new Error("Unknown dependency '" + request + "' from module " + id);
      }

      return requireModule(dependencies[request]);
    }

    factory(module, module.exports, localRequire);
    return module.exports;
  }

  var entry = requireModule(entryId);

  if (typeof window !== "undefined") {
    window.CalculatorWebApp = entry;
  }
})(
  {
    "core/evaluator/builtins.js": [
      function(module, exports, require) {
        "use strict";
        
        module.exports = require("../functions/builtins");
        
      },
            {
        "../functions/builtins": "core/functions/builtins.js"
      }
    ],
    "core/evaluator/evaluator.js": [
      function(module, exports, require) {
        "use strict";
        
        const {
          AST_NODE_TYPES,
          DEFAULT_CONSTANTS,
          DISPLAY_TYPES,
          createComplexValue,
          createArityError,
          createEvaluationContext,
          createEvaluationResult,
          createNameError,
          createUnsupportedFeatureError,
          isCalculatorError,
        } = require("../model");
        const {
          addComplex,
          asComplexValue,
          divideComplex,
          multiplyComplex,
          powerComplex,
          subtractComplex,
          toPhasorValue,
        } = require("../math");
        const { parseSource } = require("../parser");
        const {
          createFunctionRegistry,
          createDisplayMetadataForPolar,
        } = require("../functions");
        
        function resolveIdentifier(name, context, node) {
          if (Object.prototype.hasOwnProperty.call(context.variables, name)) {
            return createEvaluationResult({
              value: context.variables[name],
            });
          }
        
          if (Object.prototype.hasOwnProperty.call(context.constants, name)) {
            return createEvaluationResult({
              value: context.constants[name],
            });
          }
        
          throw createNameError({
            code: "NAME_UNKNOWN_IDENTIFIER",
            message: `未定义的标识符：${name}。`,
            position: node.span,
            context: { name },
            hint: "请检查变量名、常量名或函数参数是否已定义。",
          });
        }
        
        function evaluateUnary(node, context, functions) {
          const argument = evaluateNode(node.argument, context, functions).value;
        
          if (node.operator === "+") {
            return createEvaluationResult({
              value: asComplexValue(argument),
            });
          }
        
          if (node.operator === "-") {
            const complex = asComplexValue(argument);
            return createEvaluationResult({
              value: createComplexValue({
                re: -complex.re,
                im: -complex.im,
              }),
            });
          }
        
          throw createUnsupportedFeatureError({
            code: "EVAL_UNSUPPORTED_UNARY_OPERATOR",
            message: `暂不支持一元运算符 ${node.operator}。`,
            position: node.span,
            context: { operator: node.operator },
          });
        }
        
        function evaluateBinary(node, context, functions) {
          const left = evaluateNode(node.left, context, functions).value;
          const right = evaluateNode(node.right, context, functions).value;
        
          switch (node.operator) {
            case "+":
              return createEvaluationResult({ value: addComplex(left, right) });
            case "-":
              return createEvaluationResult({ value: subtractComplex(left, right) });
            case "*":
              return createEvaluationResult({ value: multiplyComplex(left, right) });
            case "/":
              return createEvaluationResult({ value: divideComplex(left, right, context.options.zeroTolerance) });
            case "^":
              return createEvaluationResult({ value: powerComplex(left, right) });
            default:
              throw createUnsupportedFeatureError({
                code: "EVAL_UNSUPPORTED_BINARY_OPERATOR",
                message: `暂不支持二元运算符 ${node.operator}。`,
                position: node.span,
                context: { operator: node.operator },
              });
          }
        }
        
        function createBuiltinHelpers(context, functionRegistry) {
          return {
            context,
            evaluateNode(node) {
              return evaluateNode(node, context, functionRegistry).value;
            },
            evaluateResult(node) {
              return evaluateNode(node, context, functionRegistry);
            },
          };
        }
        
        function evaluateFunctionCall(node, context, functionRegistry) {
          const definition = functionRegistry.requireFunction(node.callee.name);
        
          if (definition.kind === "builtin") {
            const value = definition.executor({
              argNodes: Array.from(node.args),
              context,
              helpers: createBuiltinHelpers(context, functionRegistry),
            });
        
            return createEvaluationResult({
              value: asComplexValue(value),
            });
          }
        
          return evaluateUserFunction(node, definition, context, functionRegistry);
        }
        
        function evaluateUserFunction(node, definition, context, functionRegistry) {
          if (definition.parameters.length !== node.args.length) {
            throw createArityError({
              code: "ARITY_EXACT_MISMATCH",
              message: `函数 ${definition.name} 需要 ${definition.parameters.length} 个参数，实际收到 ${node.args.length} 个。`,
              position: node.span,
              context: { functionName: definition.name, expectedCount: definition.parameters.length, actualCount: node.args.length },
              hint: "请检查调用参数个数。",
            });
          }
        
          const scopedVariables = {
            ...context.variables,
          };
        
          for (let index = 0; index < definition.parameters.length; index += 1) {
            const parameter = definition.parameters[index];
            scopedVariables[parameter.name] = asComplexValue(evaluateNode(node.args[index], context, functionRegistry).value);
          }
        
          const scopedContext = createEvaluationContext({
            constants: context.constants,
            variables: scopedVariables,
            functions: context.functions,
            options: context.options,
          });
        
          return evaluateNode(definition.bodyAst, scopedContext, functionRegistry);
        }
        
        function evaluateConversion(node, context, functionRegistry) {
          const sourceResult = evaluateNode(node.source, context, functionRegistry);
          const sourceValue = asComplexValue(sourceResult.value);
        
          if (node.targetForm === "rect") {
            return createEvaluationResult({
              value: sourceValue,
              displayType: DISPLAY_TYPES.COMPLEX_RECT,
              metadata: {
                preferredDisplayType: DISPLAY_TYPES.COMPLEX_RECT,
              },
            });
          }
        
          const angleUnit = node.angleUnit || context.options.angleUnit;
        
          return createEvaluationResult({
            value: sourceValue,
            displayType: DISPLAY_TYPES.COMPLEX_POLAR,
            metadata: createDisplayMetadataForPolar(sourceValue, angleUnit),
          });
        }
        
        function evaluateNode(node, context, functionRegistry) {
          try {
            switch (node.kind) {
              case AST_NODE_TYPES.NUMBER_LITERAL:
                return createEvaluationResult({
                  value: createComplexValue({ re: node.value, im: 0 }),
                });
              case AST_NODE_TYPES.IDENTIFIER:
                return resolveIdentifier(node.name, context, node);
              case AST_NODE_TYPES.UNARY_EXPRESSION:
                return evaluateUnary(node, context, functionRegistry);
              case AST_NODE_TYPES.BINARY_EXPRESSION:
                return evaluateBinary(node, context, functionRegistry);
              case AST_NODE_TYPES.FUNCTION_CALL:
                return evaluateFunctionCall(node, context, functionRegistry);
              case AST_NODE_TYPES.CONVERSION_EXPRESSION:
                return evaluateConversion(node, context, functionRegistry);
              default:
                throw createUnsupportedFeatureError({
                  code: "EVAL_UNSUPPORTED_AST_NODE",
                  message: `暂不支持的 AST 节点类型：${node.kind}。`,
                  position: node.span,
                  context: { kind: node.kind },
                });
            }
          } catch (error) {
            if (isCalculatorError(error)) {
              throw error;
            }
        
            if (error && typeof error === "object" && typeof error.kind === "string" && typeof error.code === "string") {
              throw error;
            }
        
            throw error;
          }
        }
        
        function normalizeEvaluationContext(context = {}) {
          return createEvaluationContext({
            constants: context.constants || DEFAULT_CONSTANTS,
            variables: context.variables || {},
            functions: context.functions || {},
            options: context.options || undefined,
          });
        }
        
        function evaluate(ast, context = {}) {
          const normalizedContext = normalizeEvaluationContext(context);
          const functionRegistry = createFunctionRegistry();
        
          for (const definition of Object.values(normalizedContext.functions)) {
            if (definition.kind === "builtin") {
              functionRegistry.registerBuiltin(definition);
            } else {
              functionRegistry.registerUserFunction(definition);
            }
          }
        
          return evaluateNode(ast, normalizedContext, functionRegistry);
        }
        
        function evaluateSource(input, context = {}) {
          return evaluate(parseSource(input), context);
        }
        
        function evaluateToValue(ast, context = {}) {
          return evaluate(ast, context).value;
        }
        
        function evaluateSourceToValue(input, context = {}) {
          return evaluateSource(input, context).value;
        }
        
        module.exports = {
          evaluate,
          evaluateSource,
          evaluateSourceToValue,
          evaluateToValue,
        };
        
      },
            {
        "../model": "core/model/index.js",
        "../math": "core/math/index.js",
        "../parser": "core/parser/index.js",
        "../functions": "core/functions/index.js"
      }
    ],
    "core/evaluator/index.js": [
      function(module, exports, require) {
        "use strict";
        
        module.exports = {
          ...require("./builtins"),
          ...require("./evaluator"),
        };
        
      },
            {
        "./builtins": "core/evaluator/builtins.js",
        "./evaluator": "core/evaluator/evaluator.js"
      }
    ],
    "core/format/index.js": [
      function(module, exports, require) {
        "use strict";
        
        module.exports = {
          ...require("./text"),
          ...require("./latex"),
        };
        
      },
            {
        "./text": "core/format/text.js",
        "./latex": "core/format/latex.js"
      }
    ],
    "core/format/latex.js": [
      function(module, exports, require) {
        "use strict";
        
        const {
          ANGLE_UNITS,
          AST_NODE_TYPES,
          DISPLAY_TYPES,
          isComplexValue,
          isPhasorValue,
        } = require("../model");
        const { parseSource } = require("../parser");
        const { evaluateSource } = require("../evaluator");
        
        const PRECEDENCE = Object.freeze({
          additive: 1,
          multiplicative: 2,
          unary: 3,
          power: 4,
          primary: 5,
        });
        
        const FUNCTION_LATEX_NAMES = Object.freeze({
          sin: "\\sin",
          cos: "\\cos",
          tan: "\\tan",
          lg: "\\lg",
          ln: "\\ln",
          exp: "\\exp",
          sqrt: "\\sqrt",
          arg: "\\arg",
        });
        
        function escapeLatexText(value) {
          return String(value).replace(/_/g, "\\_");
        }
        
        function numberToLatex(value) {
          if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
            throw new TypeError("numberToLatex.value must be a finite number.");
          }
        
          const text = String(value);
          const scientificMatch = text.match(/^(-?\d+(?:\.\d+)?)e([+-]?\d+)$/i);
        
          if (scientificMatch) {
            return `${scientificMatch[1]} \\times 10^{${Number(scientificMatch[2])}}`;
          }
        
          return text;
        }
        
        function identifierToLatex(name) {
          switch (name) {
            case "pi":
              return "\\pi";
            case "deg":
              return "\\mathrm{deg}";
            case "rad":
              return "\\mathrm{rad}";
            case "e":
              return "e";
            case "i":
              return "i";
            default:
              return `\\mathrm{${escapeLatexText(name)}}`;
          }
        }
        
        function getPrecedence(node) {
          switch (node.kind) {
            case AST_NODE_TYPES.BINARY_EXPRESSION:
              switch (node.operator) {
                case "+":
                case "-":
                  return PRECEDENCE.additive;
                case "*":
                case "/":
                  return PRECEDENCE.multiplicative;
                case "^":
                  return PRECEDENCE.power;
                default:
                  return PRECEDENCE.primary;
              }
            case AST_NODE_TYPES.UNARY_EXPRESSION:
              return PRECEDENCE.unary;
            default:
              return PRECEDENCE.primary;
          }
        }
        
        function wrapIfNeeded(latex, condition) {
          return condition ? `\\left(${latex}\\right)` : latex;
        }
        
        function renderFunctionName(name) {
          if (FUNCTION_LATEX_NAMES[name]) {
            return FUNCTION_LATEX_NAMES[name];
          }
        
          return `\\operatorname{${escapeLatexText(name)}}`;
        }
        
        function renderFunctionCall(node) {
          const name = node.callee.name;
          const args = Array.from(node.args).map((argument) => renderAstToLatex(argument));
        
          if (name === "sqrt" && args.length === 1) {
            return `\\sqrt{${args[0]}}`;
          }
        
          if (name === "abs" && args.length === 1) {
            return `\\left|${args[0]}\\right|`;
          }
        
          if (name === "conj" && args.length === 1) {
            return `\\overline{${args[0]}}`;
          }
        
          const latexName = renderFunctionName(name);
          return `${latexName}\\left(${args.join(", ")}\\right)`;
        }
        
        function renderUnaryExpression(node) {
          const argument = renderAstToLatex(node.argument);
          const needsWrap = getPrecedence(node.argument) < PRECEDENCE.unary;
          return `${node.operator}${wrapIfNeeded(argument, needsWrap)}`;
        }
        
        function renderBinaryExpression(node) {
          if (node.operator === "/") {
            return `\\frac{${renderAstToLatex(node.left)}}{${renderAstToLatex(node.right)}}`;
          }
        
          if (node.operator === "^") {
            const baseNeedsWrap = getPrecedence(node.left) < PRECEDENCE.power;
            const exponentLatex = renderAstToLatex(node.right);
            return `${wrapIfNeeded(renderAstToLatex(node.left), baseNeedsWrap)}^{${exponentLatex}}`;
          }
        
          const currentPrecedence = getPrecedence(node);
          const leftLatex = renderAstToLatex(node.left);
          const rightLatex = renderAstToLatex(node.right);
        
          const leftNeedsWrap = getPrecedence(node.left) < currentPrecedence;
          const rightNeedsWrap =
            getPrecedence(node.right) < currentPrecedence ||
            (node.operator === "-" && getPrecedence(node.right) === currentPrecedence);
        
          const operatorLatex = node.operator === "*" ? "\\cdot" : node.operator;
        
          return `${wrapIfNeeded(leftLatex, leftNeedsWrap)} ${operatorLatex} ${wrapIfNeeded(rightLatex, rightNeedsWrap)}`;
        }
        
        function renderConversionExpression(node) {
          const source = renderAstToLatex(node.source);
        
          if (node.targetForm === "rect") {
            return `\\operatorname{to\\_rect}\\left(${source}\\right)`;
          }
        
          if (node.angleUnit) {
            return `\\operatorname{to\\_polar}\\left(${source}, ${identifierToLatex(node.angleUnit)}\\right)`;
          }
        
          return `\\operatorname{to\\_polar}\\left(${source}\\right)`;
        }
        
        function renderAstToLatex(node) {
          switch (node.kind) {
            case AST_NODE_TYPES.NUMBER_LITERAL:
              return numberToLatex(node.value);
            case AST_NODE_TYPES.IDENTIFIER:
              return identifierToLatex(node.name);
            case AST_NODE_TYPES.UNARY_EXPRESSION:
              return renderUnaryExpression(node);
            case AST_NODE_TYPES.BINARY_EXPRESSION:
              return renderBinaryExpression(node);
            case AST_NODE_TYPES.FUNCTION_CALL:
              return renderFunctionCall(node);
            case AST_NODE_TYPES.CONVERSION_EXPRESSION:
              return renderConversionExpression(node);
            default:
              throw new TypeError(`Unsupported AST node kind: ${node.kind}`);
          }
        }
        
        function renderComplexRectToLatex(value) {
          if (!isComplexValue(value)) {
            throw new TypeError("renderComplexRectToLatex.value must be a ComplexValue.");
          }
        
          const re = value.re;
          const im = value.im;
        
          if (im === 0) {
            return numberToLatex(re);
          }
        
          const imagMagnitude = Math.abs(im);
          const imagPart =
            imagMagnitude === 1 ? "i" : `${numberToLatex(imagMagnitude)}i`;
        
          if (re === 0) {
            return im < 0 ? `-${imagPart}` : imagPart;
          }
        
          return `${numberToLatex(re)} ${im < 0 ? "-" : "+"} ${imagPart}`;
        }
        
        function renderPhasorToLatex(value) {
          if (!isPhasorValue(value)) {
            throw new TypeError("renderPhasorToLatex.value must be a PhasorValue.");
          }
        
          const magnitude = numberToLatex(value.magnitude);
          const angle = numberToLatex(value.angle);
        
          if (value.angleUnit === ANGLE_UNITS.DEG) {
            return `${magnitude} \\angle ${angle}^{\\circ}`;
          }
        
          return `${magnitude} \\angle ${angle}\\,\\mathrm{rad}`;
        }
        
        function renderEvaluationResultToLatex(result) {
          if (!result || typeof result !== "object") {
            throw new TypeError("renderEvaluationResultToLatex.result must be an object.");
          }
        
          if (result.displayType === DISPLAY_TYPES.COMPLEX_POLAR && result.metadata && result.metadata.polarValue) {
            return renderPhasorToLatex(result.metadata.polarValue);
          }
        
          if (isPhasorValue(result.value)) {
            return renderPhasorToLatex(result.value);
          }
        
          if (isComplexValue(result.value)) {
            return renderComplexRectToLatex(result.value);
          }
        
          if (typeof result.latex === "string" && result.latex) {
            return result.latex;
          }
        
          return "";
        }
        
        function renderSourceToLatex(input) {
          return renderAstToLatex(parseSource(input));
        }
        
        function evaluateSourceToLatex(input, context = {}) {
          return renderEvaluationResultToLatex(evaluateSource(input, context));
        }
        
        module.exports = {
          evaluateSourceToLatex,
          identifierToLatex,
          numberToLatex,
          renderAstToLatex,
          renderComplexRectToLatex,
          renderEvaluationResultToLatex,
          renderPhasorToLatex,
          renderSourceToLatex,
        };
        
      },
            {
        "../model": "core/model/index.js",
        "../parser": "core/parser/index.js",
        "../evaluator": "core/evaluator/index.js"
      }
    ],
    "core/format/text.js": [
      function(module, exports, require) {
        "use strict";
        
        const {
          ANGLE_UNITS,
          DEFAULT_PRECISION,
          DISPLAY_TYPES,
          OUTPUT_MODES,
          isComplexValue,
          isPhasorValue,
        } = require("../model");
        const { asComplexValue, toPhasorValue } = require("../math");
        const { evaluateSource } = require("../evaluator");
        
        function stripTrailingZeros(text) {
          return text.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "").replace(/\.$/u, "");
        }
        
        function normalizePrecision(precision = DEFAULT_PRECISION) {
          if (!Number.isInteger(precision) || precision < 0) {
            throw new RangeError("precision must be a non-negative integer.");
          }
        
          return precision;
        }
        
        function formatNumberToText(value, precision = DEFAULT_PRECISION) {
          if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
            throw new TypeError("formatNumberToText.value must be a finite number.");
          }
        
          const normalizedPrecision = normalizePrecision(precision);
          const normalizedValue = Object.is(value, -0) ? 0 : value;
        
          if (normalizedValue === 0) {
            return "0";
          }
        
          const absValue = Math.abs(normalizedValue);
        
          if (absValue >= 10 ** normalizedPrecision || absValue < 10 ** (-Math.max(1, normalizedPrecision))) {
            const [mantissaText, exponentText] = normalizedValue.toExponential(normalizedPrecision).split("e");
            return `${stripTrailingZeros(mantissaText)}e${Number(exponentText)}`;
          }
        
          return stripTrailingZeros(normalizedValue.toFixed(normalizedPrecision));
        }
        
        function renderComplexRectToText(value, options = {}) {
          if (!isComplexValue(value)) {
            throw new TypeError("renderComplexRectToText.value must be a ComplexValue.");
          }
        
          const precision = normalizePrecision(options.precision ?? DEFAULT_PRECISION);
          const re = value.re;
          const im = value.im;
        
          if (im === 0) {
            return formatNumberToText(re, precision);
          }
        
          const imagMagnitude = Math.abs(im);
          const imagText = imagMagnitude === 1 ? "i" : `${formatNumberToText(imagMagnitude, precision)}i`;
        
          if (re === 0) {
            return im < 0 ? `-${imagText}` : imagText;
          }
        
          return `${formatNumberToText(re, precision)} ${im < 0 ? "-" : "+"} ${imagText}`;
        }
        
        function renderPhasorToText(value, options = {}) {
          if (!isPhasorValue(value)) {
            throw new TypeError("renderPhasorToText.value must be a PhasorValue.");
          }
        
          const precision = normalizePrecision(options.precision ?? DEFAULT_PRECISION);
          const magnitude = formatNumberToText(value.magnitude, precision);
          const angle = formatNumberToText(value.angle, precision);
          const unit = value.angleUnit === ANGLE_UNITS.DEG ? "deg" : "rad";
        
          return `${magnitude} ∠ ${angle} ${unit}`;
        }
        
        function renderDebugResultToText(result, options = {}) {
          const precision = normalizePrecision(options.precision ?? DEFAULT_PRECISION);
          const parts = [
            `displayType=${result.displayType}`,
          ];
        
          if (isComplexValue(result.value)) {
            parts.push(`value=Complex(${formatNumberToText(result.value.re, precision)}, ${formatNumberToText(result.value.im, precision)})`);
          } else if (isPhasorValue(result.value)) {
            parts.push(`value=Phasor(${formatNumberToText(result.value.magnitude, precision)}, ${formatNumberToText(result.value.angle, precision)}, ${result.value.angleUnit})`);
          } else {
            parts.push(`value=${String(result.value)}`);
          }
        
          if (result.metadata && Object.keys(result.metadata).length > 0) {
            parts.push(`metadataKeys=${Object.keys(result.metadata).join(",")}`);
          }
        
          return parts.join(" | ");
        }
        
        function resolvePreferredAngleUnit(result, options = {}) {
          if (options.angleUnit) {
            return options.angleUnit;
          }
        
          if (result.metadata && typeof result.metadata.preferredAngleUnit === "string") {
            return result.metadata.preferredAngleUnit;
          }
        
          return ANGLE_UNITS.RAD;
        }
        
        function chooseOutputMode(result, options = {}) {
          if (options.outputMode) {
            return options.outputMode;
          }
        
          if (result.displayType === DISPLAY_TYPES.COMPLEX_POLAR || result.displayType === DISPLAY_TYPES.PHASOR) {
            return OUTPUT_MODES.POLAR;
          }
        
          return OUTPUT_MODES.PLAIN;
        }
        
        function renderEvaluationResultToText(result, options = {}) {
          if (!result || typeof result !== "object") {
            throw new TypeError("renderEvaluationResultToText.result must be an object.");
          }
        
          const precision = normalizePrecision(options.precision ?? DEFAULT_PRECISION);
          const outputMode = chooseOutputMode(result, options);
        
          if (outputMode === OUTPUT_MODES.DEBUG) {
            return renderDebugResultToText(result, { precision });
          }
        
          if (outputMode === OUTPUT_MODES.POLAR) {
            if (result.metadata && result.metadata.polarValue && isPhasorValue(result.metadata.polarValue)) {
              return renderPhasorToText(result.metadata.polarValue, { precision });
            }
        
            if (isPhasorValue(result.value)) {
              return renderPhasorToText(result.value, { precision });
            }
        
            if (isComplexValue(result.value)) {
              return renderPhasorToText(
                toPhasorValue(result.value, resolvePreferredAngleUnit(result, options)),
                { precision }
              );
            }
          }
        
          if (isComplexValue(result.value) || isPhasorValue(result.value)) {
            return renderComplexRectToText(asComplexValue(result.value), { precision });
          }
        
          if (typeof result.text === "string" && result.text) {
            return result.text;
          }
        
          return "";
        }
        
        function evaluateSourceToText(input, context = {}, options = {}) {
          return renderEvaluationResultToText(evaluateSource(input, context), options);
        }
        
        module.exports = {
          evaluateSourceToText,
          formatNumberToText,
          renderComplexRectToText,
          renderDebugResultToText,
          renderEvaluationResultToText,
          renderPhasorToText,
        };
        
      },
            {
        "../model": "core/model/index.js",
        "../math": "core/math/index.js",
        "../evaluator": "core/evaluator/index.js"
      }
    ],
    "core/functions/builtins.js": [
      function(module, exports, require) {
        "use strict";
        
        const {
          ANGLE_UNITS,
          DISPLAY_TYPES,
          createArityError,
          createBuiltinFunctionDefinition,
          createComplexValue,
          createMathDomainError,
        } = require("../model");
        const {
          angleOfComplex,
          complexExp,
          complexLog,
          conjugateComplex,
          cosComplex,
          fromPhasorParts,
          fromRectangularParts,
          imaginaryPart,
          magnitudeOfComplex,
          realPart,
          sinComplex,
          sqrtComplex,
          tanComplex,
          toPhasorValue,
        } = require("../math");
        
        function requireArity(name, argNodes, expectedCount) {
          if (argNodes.length !== expectedCount) {
            throw createArityError({
              code: "ARITY_EXACT_MISMATCH",
              message: `函数 ${name} 需要 ${expectedCount} 个参数，实际收到 ${argNodes.length} 个。`,
              context: { functionName: name, expectedCount, actualCount: argNodes.length },
              hint: "请检查函数参数个数是否正确。",
            });
          }
        }
        
        function requireArityBetween(name, argNodes, minCount, maxCount) {
          if (argNodes.length < minCount || argNodes.length > maxCount) {
            throw createArityError({
              code: "ARITY_RANGE_MISMATCH",
              message: `函数 ${name} 需要 ${minCount} 到 ${maxCount} 个参数，实际收到 ${argNodes.length} 个。`,
              context: { functionName: name, minCount, maxCount, actualCount: argNodes.length },
              hint: "请检查函数参数个数是否正确。",
            });
          }
        }
        
        function requireRealNumber(name, argumentValue, parameterName) {
          if (argumentValue.im !== 0) {
            throw createMathDomainError({
              code: "MATH_EXPECTED_REAL_ARGUMENT",
              message: `函数 ${name} 的参数 ${parameterName} 必须是实数。`,
              context: { functionName: name, parameterName, argumentValue },
              hint: "请传入虚部为 0 的值。",
            });
          }
        
          return argumentValue.re;
        }
        
        function resolveAngleUnitNode(functionName, argNodes, index) {
          if (!argNodes[index]) {
            return ANGLE_UNITS.RAD;
          }
        
          const node = argNodes[index];
        
          if (node.kind !== "Identifier" || !Object.values(ANGLE_UNITS).includes(node.name)) {
            throw createMathDomainError({
              code: "MATH_INVALID_ANGLE_UNIT_ARGUMENT",
              message: `函数 ${functionName} 的角度单位参数必须是 deg 或 rad。`,
              context: { functionName, index },
              hint: "请将角度单位写成 deg 或 rad。",
            });
          }
        
          return node.name;
        }
        
        function createUnaryBuiltin(name, executor, metadata = {}) {
          return createBuiltinFunctionDefinition({
            name,
            parameters: ["value"],
            metadata,
            executor({ argNodes, helpers }) {
              requireArity(name, argNodes, 1);
              return executor(helpers.evaluateNode(argNodes[0]));
            },
          });
        }
        
        function createDefaultBuiltinFunctions() {
          const definitions = [
            createUnaryBuiltin("sin", sinComplex, { supportsComplex: true }),
            createUnaryBuiltin("cos", cosComplex, { supportsComplex: true }),
            createUnaryBuiltin("tan", tanComplex, { supportsComplex: true }),
            createUnaryBuiltin("sqrt", sqrtComplex, { supportsComplex: true }),
            createUnaryBuiltin("exp", complexExp, { supportsComplex: true }),
            createUnaryBuiltin("ln", complexLog, { supportsComplex: true }),
            createBuiltinFunctionDefinition({
              name: "lg",
              parameters: ["value"],
              metadata: { supportsComplex: true },
              executor({ argNodes, helpers }) {
                requireArity("lg", argNodes, 1);
                const value = complexLog(helpers.evaluateNode(argNodes[0]));
                return createComplexValue({
                  re: value.re / Math.LN10,
                  im: value.im / Math.LN10,
                });
              },
            }),
            createUnaryBuiltin("conj", conjugateComplex, { supportsComplex: true }),
            createBuiltinFunctionDefinition({
              name: "abs",
              parameters: ["value"],
              metadata: { supportsComplex: true },
              executor({ argNodes, helpers }) {
                requireArity("abs", argNodes, 1);
                return createComplexValue({
                  re: magnitudeOfComplex(helpers.evaluateNode(argNodes[0])),
                  im: 0,
                });
              },
            }),
            createBuiltinFunctionDefinition({
              name: "arg",
              parameters: ["value", "unit"],
              metadata: { supportsComplex: true },
              executor({ argNodes, helpers }) {
                requireArityBetween("arg", argNodes, 1, 2);
                const angleUnit = argNodes.length === 2 ? resolveAngleUnitNode("arg", argNodes, 1) : helpers.context.options.angleUnit;
                return createComplexValue({
                  re: angleOfComplex(helpers.evaluateNode(argNodes[0]), angleUnit),
                  im: 0,
                });
              },
            }),
            createBuiltinFunctionDefinition({
              name: "re",
              parameters: ["value"],
              metadata: { supportsComplex: true },
              executor({ argNodes, helpers }) {
                requireArity("re", argNodes, 1);
                return createComplexValue({
                  re: realPart(helpers.evaluateNode(argNodes[0])),
                  im: 0,
                });
              },
            }),
            createBuiltinFunctionDefinition({
              name: "im",
              parameters: ["value"],
              metadata: { supportsComplex: true },
              executor({ argNodes, helpers }) {
                requireArity("im", argNodes, 1);
                return createComplexValue({
                  re: imaginaryPart(helpers.evaluateNode(argNodes[0])),
                  im: 0,
                });
              },
            }),
            createBuiltinFunctionDefinition({
              name: "rect",
              parameters: ["x", "y"],
              metadata: { supportsComplex: false },
              executor({ argNodes, helpers }) {
                requireArity("rect", argNodes, 2);
                const re = requireRealNumber("rect", helpers.evaluateNode(argNodes[0]), "re");
                const im = requireRealNumber("rect", helpers.evaluateNode(argNodes[1]), "im");
                return fromRectangularParts(re, im);
              },
            }),
            createBuiltinFunctionDefinition({
              name: "polar",
              parameters: ["magnitude", "angle", "unit"],
              metadata: { supportsComplex: false, affectsDisplay: true },
              executor({ argNodes, helpers }) {
                requireArityBetween("polar", argNodes, 2, 3);
                const magnitude = requireRealNumber("polar", helpers.evaluateNode(argNodes[0]), "magnitude");
                const angle = requireRealNumber("polar", helpers.evaluateNode(argNodes[1]), "angle");
                const angleUnit = argNodes.length === 3 ? resolveAngleUnitNode("polar", argNodes, 2) : helpers.context.options.angleUnit;
                return fromPhasorParts(magnitude, angle, angleUnit);
              },
            }),
          ];
        
          const table = {};
        
          for (const definition of definitions) {
            table[definition.name] = definition;
          }
        
          return Object.freeze(table);
        }
        
        const DEFAULT_BUILTIN_FUNCTIONS = createDefaultBuiltinFunctions();
        
        function createDisplayMetadataForPolar(value, angleUnit) {
          return Object.freeze({
            preferredAngleUnit: angleUnit,
            polarValue: toPhasorValue(value, angleUnit),
            preferredDisplayType: DISPLAY_TYPES.COMPLEX_POLAR,
          });
        }
        
        module.exports = {
          DEFAULT_BUILTIN_FUNCTIONS,
          createDefaultBuiltinFunctions,
          createDisplayMetadataForPolar,
        };
        
      },
            {
        "../model": "core/model/index.js",
        "../math": "core/math/index.js"
      }
    ],
    "core/functions/index.js": [
      function(module, exports, require) {
        "use strict";
        
        module.exports = {
          ...require("./builtins"),
          ...require("./persistent-store"),
          ...require("./registry"),
          ...require("./user-functions"),
        };
        
      },
            {
        "./builtins": "core/functions/builtins.js",
        "./persistent-store": "core/functions/persistent-store.js",
        "./registry": "core/functions/registry.js",
        "./user-functions": "core/functions/user-functions.js"
      }
    ],
    "core/functions/persistent-store.js": [
      function(module, exports, require) {
        "use strict";
        
        const { createInMemoryUserFunctionStore } = require("./user-functions");
        
        function createPersistentUserFunctionStore({
          store = createInMemoryUserFunctionStore(),
          persistence = null,
          autoLoad = true,
        } = {}) {
          const adapter = persistence || {};
          let loaded = false;
          let lastLoadError = null;
          let lastSaveError = null;
        
          function ensureLoaded() {
            if (loaded) {
              return;
            }
        
            try {
              const records = typeof adapter.loadRecords === "function" ? adapter.loadRecords() : [];
        
              if (records !== undefined && records !== null) {
                store.loadRecords(records, { replace: true });
              }
        
              loaded = true;
              lastLoadError = null;
            } catch (error) {
              lastLoadError = error;
              loaded = true;
            }
          }
        
          function persist() {
            try {
              if (typeof adapter.saveRecords === "function") {
                adapter.saveRecords(store.exportRecords());
              }
        
              lastSaveError = null;
            } catch (error) {
              lastSaveError = error;
              throw error;
            }
          }
        
          function withLoad(callback) {
            ensureLoaded();
            return callback();
          }
        
          function withMutation(callback) {
            ensureLoaded();
            const result = callback();
            persist();
            return result;
          }
        
          if (autoLoad) {
            ensureLoaded();
          }
        
          return Object.freeze({
            define(spec, options = {}) {
              return withMutation(() => store.define(spec, options));
            },
            exportRecords() {
              return withLoad(() => store.exportRecords());
            },
            get(name) {
              return withLoad(() => store.get(name));
            },
            getPersistenceStatus() {
              return Object.freeze({
                loaded,
                lastLoadError,
                lastSaveError,
              });
            },
            has(name) {
              return withLoad(() => store.has(name));
            },
            list() {
              return withLoad(() => store.list());
            },
            loadRecords(records, options = {}) {
              return withMutation(() => store.loadRecords(records, options));
            },
            remove(name) {
              return withMutation(() => store.remove(name));
            },
            save(definition, options = {}) {
              return withMutation(() => store.save(definition, options));
            },
            toDefinitionTable() {
              return withLoad(() => store.toDefinitionTable());
            },
          });
        }
        
        module.exports = {
          createPersistentUserFunctionStore,
        };
        
      },
            {
        "./user-functions": "core/functions/user-functions.js"
      }
    ],
    "core/functions/registry.js": [
      function(module, exports, require) {
        "use strict";
        
        const {
          FUNCTION_KINDS,
          createArityError,
          createNameError,
          isFunctionDefinition,
        } = require("../model");
        const { DEFAULT_BUILTIN_FUNCTIONS } = require("./builtins");
        
        function cloneDefinitionTable(source, label) {
          if (!source || typeof source !== "object" || Array.isArray(source)) {
            throw new TypeError(`${label} must be a plain object.`);
          }
        
          const table = {};
        
          for (const [name, definition] of Object.entries(source)) {
            if (!isFunctionDefinition(definition)) {
              throw new TypeError(`${label}.${name} is not a valid function definition.`);
            }
        
            table[name] = definition;
          }
        
          return table;
        }
        
        function sortByName(definitions) {
          return definitions.slice().sort((left, right) => left.name.localeCompare(right.name));
        }
        
        function createFunctionRegistry({
          builtinDefinitions = DEFAULT_BUILTIN_FUNCTIONS,
          userDefinitions = {},
        } = {}) {
          const builtins = cloneDefinitionTable(builtinDefinitions, "builtinDefinitions");
          const users = cloneDefinitionTable(userDefinitions, "userDefinitions");
        
          for (const name of Object.keys(users)) {
            if (builtins[name]) {
              throw new RangeError(`Function name "${name}" is already occupied by a builtin definition.`);
            }
          }
        
          function assertDefinition(definition, expectedKind, label) {
            if (!isFunctionDefinition(definition)) {
              throw new TypeError(`${label} must be a valid function definition.`);
            }
        
            if (definition.kind !== expectedKind) {
              throw new TypeError(`${label} must have kind "${expectedKind}".`);
            }
          }
        
          function registerBuiltin(definition) {
            assertDefinition(definition, FUNCTION_KINDS.BUILTIN, "builtin definition");
        
            if (builtins[definition.name] || users[definition.name]) {
              throw new RangeError(`Function "${definition.name}" is already registered.`);
            }
        
            builtins[definition.name] = definition;
            return definition;
          }
        
          function registerUserFunction(definition, options = {}) {
            assertDefinition(definition, FUNCTION_KINDS.USER_DEFINED, "user function definition");
            const replace = options.replace === true;
        
            if (builtins[definition.name]) {
              throw createNameError({
                code: "NAME_BUILTIN_FUNCTION_CONFLICT",
                message: `函数名 ${definition.name} 已被内建函数占用。`,
                context: { name: definition.name },
                hint: "请换一个用户函数名，避免覆盖内建函数。",
              });
            }
        
            if (users[definition.name] && !replace) {
              throw createNameError({
                code: "NAME_DUPLICATE_USER_FUNCTION",
                message: `用户函数 ${definition.name} 已存在。`,
                context: { name: definition.name },
                hint: "请换一个新的函数名，或先显式替换旧定义。",
              });
            }
        
            users[definition.name] = definition;
            return definition;
          }
        
          function removeUserFunction(name) {
            if (!users[name]) {
              return false;
            }
        
            delete users[name];
            return true;
          }
        
          function hasFunction(name) {
            return Boolean(builtins[name] || users[name]);
          }
        
          function getFunction(name) {
            return users[name] || builtins[name] || null;
          }
        
          function requireFunction(name) {
            const definition = getFunction(name);
        
            if (!definition) {
              throw createNameError({
                code: "NAME_UNKNOWN_FUNCTION",
                message: `未定义的函数：${name}。`,
                context: { name },
                hint: "请检查函数名是否正确，或确认该函数是否已经注册。",
              });
            }
        
            return definition;
          }
        
          function listFunctions(options = {}) {
            const includeBuiltins = options.includeBuiltins !== false;
            const includeUsers = options.includeUsers !== false;
            const definitions = [];
        
            if (includeBuiltins) {
              definitions.push(...Object.values(builtins));
            }
        
            if (includeUsers) {
              definitions.push(...Object.values(users));
            }
        
            return sortByName(definitions);
          }
        
          function getBuiltinDefinitions() {
            return Object.freeze({ ...builtins });
          }
        
          function getUserDefinitions() {
            return Object.freeze({ ...users });
          }
        
          function toTable() {
            return Object.freeze({
              ...builtins,
              ...users,
            });
          }
        
          function validateInvocationArity(name, actualCount, { exact = null, min = null, max = null } = {}) {
            if (exact !== null && actualCount !== exact) {
              throw createArityError({
                code: "ARITY_EXACT_MISMATCH",
                message: `函数 ${name} 需要 ${exact} 个参数，实际收到 ${actualCount} 个。`,
                context: { functionName: name, expectedCount: exact, actualCount },
                hint: "请检查函数参数个数是否正确。",
              });
            }
        
            if ((min !== null && actualCount < min) || (max !== null && actualCount > max)) {
              throw createArityError({
                code: "ARITY_RANGE_MISMATCH",
                message: `函数 ${name} 需要 ${min} 到 ${max} 个参数，实际收到 ${actualCount} 个。`,
                context: { functionName: name, minCount: min, maxCount: max, actualCount },
                hint: "请检查函数参数个数是否正确。",
              });
            }
          }
        
          return Object.freeze({
            getBuiltinDefinitions,
            getFunction,
            getUserDefinitions,
            hasFunction,
            listFunctions,
            registerBuiltin,
            registerUserFunction,
            removeUserFunction,
            requireFunction,
            toTable,
            validateInvocationArity,
          });
        }
        
        module.exports = {
          createFunctionRegistry,
        };
        
      },
            {
        "../model": "core/model/index.js",
        "./builtins": "core/functions/builtins.js"
      }
    ],
    "core/functions/user-functions.js": [
      function(module, exports, require) {
        "use strict";
        
        const {
          AST_NODE_TYPES,
          createNameError,
          createUnsupportedFeatureError,
          createUserFunctionDefinition,
          isFunctionDefinition,
        } = require("../model");
        const { parseSource } = require("../parser");
        const { createFunctionRegistry } = require("./registry");
        
        function walkAst(node, visitor) {
          visitor(node);
        
          switch (node.kind) {
            case AST_NODE_TYPES.NUMBER_LITERAL:
            case AST_NODE_TYPES.IDENTIFIER:
              return;
            case AST_NODE_TYPES.UNARY_EXPRESSION:
              walkAst(node.argument, visitor);
              return;
            case AST_NODE_TYPES.BINARY_EXPRESSION:
              walkAst(node.left, visitor);
              walkAst(node.right, visitor);
              return;
            case AST_NODE_TYPES.FUNCTION_CALL:
              walkAst(node.callee, visitor);
              for (const argument of node.args) {
                walkAst(argument, visitor);
              }
              return;
            case AST_NODE_TYPES.CONVERSION_EXPRESSION:
              walkAst(node.source, visitor);
              return;
            default:
              throw createUnsupportedFeatureError({
                code: "USER_FUNCTION_UNSUPPORTED_AST_NODE",
                message: `用户函数分析阶段遇到了不支持的节点类型：${node.kind}。`,
                context: { kind: node.kind },
              });
          }
        }
        
        function collectReferencedFunctionNames(bodyAst) {
          const names = new Set();
        
          walkAst(bodyAst, (node) => {
            if (node.kind === AST_NODE_TYPES.FUNCTION_CALL && node.callee && typeof node.callee.name === "string") {
              names.add(node.callee.name);
            }
          });
        
          return Object.freeze(Array.from(names).sort());
        }
        
        function assertNoDirectRecursion(functionName, bodyAst) {
          let foundDirectRecursion = false;
          let recursionSpan = null;
        
          walkAst(bodyAst, (node) => {
            if (node.kind === AST_NODE_TYPES.FUNCTION_CALL && node.callee.name === functionName) {
              foundDirectRecursion = true;
              recursionSpan = node.callee.span;
            }
          });
        
          if (foundDirectRecursion) {
            throw createUnsupportedFeatureError({
              code: "USER_FUNCTION_DIRECT_RECURSION_UNSUPPORTED",
              message: `当前阶段不支持用户函数 ${functionName} 直接递归调用自身。`,
              position: recursionSpan,
              context: { name: functionName },
              hint: "请先改写公式，避免在函数体中直接调用自身。",
            });
          }
        }
        
        function assertNoRecursiveCycle(definitions, changedFunctionName = "") {
          const visiting = new Set();
          const visited = new Set();
          const definitionTable = definitions || {};
        
          function visit(name, stack) {
            if (visited.has(name) || !definitionTable[name]) {
              return;
            }
        
            if (visiting.has(name)) {
              const cycleStart = stack.indexOf(name);
              const cyclePath = cycleStart >= 0 ? stack.slice(cycleStart).concat(name) : stack.concat(name);
        
              throw createUnsupportedFeatureError({
                code: "USER_FUNCTION_RECURSION_CYCLE_UNSUPPORTED",
                message: `当前阶段不支持用户函数之间形成递归调用环：${cyclePath.join(" -> ")}。`,
                context: {
                  cyclePath,
                  changedFunctionName,
                },
                hint: "请改写函数依赖关系，避免用户函数直接或间接循环调用。",
              });
            }
        
            visiting.add(name);
        
            const dependencies = collectReferencedFunctionNames(definitionTable[name].bodyAst)
              .filter((dependencyName) => Boolean(definitionTable[dependencyName]));
        
            for (const dependencyName of dependencies) {
              visit(dependencyName, stack.concat(name));
            }
        
            visiting.delete(name);
            visited.add(name);
          }
        
          for (const name of Object.keys(definitionTable)) {
            visit(name, []);
          }
        }
        
        function compileUserFunctionDefinition({
          name,
          parameters = [],
          bodySource,
          metadata = {},
        } = {}) {
          if (typeof bodySource !== "string" || !bodySource.trim()) {
            throw new TypeError("userFunction.bodySource must be a non-empty string.");
          }
        
          const bodyAst = parseSource(bodySource);
          assertNoDirectRecursion(name, bodyAst);
        
          return createUserFunctionDefinition({
            name,
            parameters,
            bodyAst,
            metadata: {
              ...metadata,
              source: bodySource,
            },
          });
        }
        
        function validateUserFunctionSpec(spec, options = {}) {
          const registry = options.registry || createFunctionRegistry();
        
          try {
            const definition = compileUserFunctionDefinition(spec);
        
            if (registry.hasFunction(definition.name)) {
              throw createNameError({
                code: "NAME_DUPLICATE_FUNCTION",
                message: `函数名 ${definition.name} 已存在，不能重复定义。`,
                context: { name: definition.name },
                hint: "请更换用户函数名，或在替换时显式开启 replace。",
              });
            }
        
            return Object.freeze({
              valid: true,
              definition,
              error: null,
            });
          } catch (error) {
            return Object.freeze({
              valid: false,
              definition: null,
              error,
            });
          }
        }
        
        function serializeUserFunctionDefinition(definition) {
          if (!isFunctionDefinition(definition) || definition.kind !== "user_defined") {
            throw new TypeError("serializeUserFunctionDefinition.definition must be a user-defined function definition.");
          }
        
          return Object.freeze({
            name: definition.name,
            parameters: definition.parameters.map((parameter) => ({
              name: parameter.name,
              description: parameter.description,
            })),
            bodySource: definition.metadata.source || "",
            metadata: {
              description: definition.metadata.description,
              supportsComplex: definition.metadata.supportsComplex,
              affectsDisplay: definition.metadata.affectsDisplay,
              source: definition.metadata.source,
              tags: Array.from(definition.metadata.tags || []),
            },
          });
        }
        
        function deserializeUserFunctionRecord(record) {
          if (!record || typeof record !== "object" || Array.isArray(record)) {
            throw new TypeError("deserializeUserFunctionRecord.record must be a plain object.");
          }
        
          return compileUserFunctionDefinition({
            name: record.name,
            parameters: record.parameters || [],
            bodySource: record.bodySource,
            metadata: record.metadata || {},
          });
        }
        
        function normalizeUserDefinitionTable(definitions = {}) {
          if (!definitions || typeof definitions !== "object" || Array.isArray(definitions)) {
            throw new TypeError("definitions must be a plain object.");
          }
        
          const table = {};
        
          for (const [name, definition] of Object.entries(definitions)) {
            if (!isFunctionDefinition(definition) || definition.kind !== "user_defined") {
              throw new TypeError(`definitions.${name} is not a valid user function definition.`);
            }
        
            table[name] = definition;
          }
        
          return table;
        }
        
        function createInMemoryUserFunctionStore({
          definitions = {},
          registry = createFunctionRegistry(),
        } = {}) {
          const internalRegistry = registry;
          const table = normalizeUserDefinitionTable(definitions);
        
          for (const definition of Object.values(table)) {
            if (!internalRegistry.hasFunction(definition.name)) {
              internalRegistry.registerUserFunction(definition);
            }
          }
        
          function get(name) {
            return table[name] || null;
          }
        
          function has(name) {
            return Boolean(table[name]);
          }
        
          function list() {
            return Object.values(table).sort((left, right) => left.name.localeCompare(right.name));
          }
        
          function save(definition, options = {}) {
            if (!isFunctionDefinition(definition) || definition.kind !== "user_defined") {
              throw new TypeError("save.definition must be a user-defined function definition.");
            }
        
            const replace = options.replace === true;
        
            if (table[definition.name] && !replace) {
              throw createNameError({
                code: "NAME_DUPLICATE_USER_FUNCTION",
                message: `用户函数 ${definition.name} 已存在。`,
                context: { name: definition.name },
                hint: "如需覆盖，请显式传入 replace: true。",
              });
            }
        
            const nextTable = {
              ...table,
              [definition.name]: definition,
            };
        
            assertNoRecursiveCycle(nextTable, definition.name);
        
            if (!table[definition.name]) {
              internalRegistry.registerUserFunction(definition);
            } else {
              internalRegistry.registerUserFunction(definition, { replace: true });
            }
        
            table[definition.name] = definition;
            return definition;
          }
        
          function define(spec, options = {}) {
            const definition = compileUserFunctionDefinition(spec);
            return save(definition, options);
          }
        
          function remove(name) {
            if (!table[name]) {
              return false;
            }
        
            delete table[name];
            if (typeof internalRegistry.removeUserFunction === "function") {
              internalRegistry.removeUserFunction(name);
            }
            return true;
          }
        
          function exportRecords() {
            return Object.freeze(list().map((definition) => serializeUserFunctionDefinition(definition)));
          }
        
          function loadRecords(records, options = {}) {
            if (!Array.isArray(records)) {
              throw new TypeError("loadRecords.records must be an array.");
            }
        
            const loaded = [];
        
            for (const record of records) {
              loaded.push(save(deserializeUserFunctionRecord(record), options));
            }
        
            return Object.freeze(loaded);
          }
        
          function toDefinitionTable() {
            return Object.freeze({ ...table });
          }
        
          return Object.freeze({
            define,
            exportRecords,
            get,
            has,
            list,
            loadRecords,
            remove,
            save,
            toDefinitionTable,
          });
        }
        
        module.exports = {
          assertNoRecursiveCycle,
          assertNoDirectRecursion,
          collectReferencedFunctionNames,
          compileUserFunctionDefinition,
          createInMemoryUserFunctionStore,
          deserializeUserFunctionRecord,
          serializeUserFunctionDefinition,
          validateUserFunctionSpec,
          walkAst,
        };
        
      },
            {
        "../model": "core/model/index.js",
        "../parser": "core/parser/index.js",
        "./registry": "core/functions/registry.js"
      }
    ],
    "core/lexer/index.js": [
      function(module, exports, require) {
        "use strict";
        
        module.exports = {
          ...require("./tokenizer"),
        };
        
      },
            {
        "./tokenizer": "core/lexer/tokenizer.js"
      }
    ],
    "core/lexer/tokenizer.js": [
      function(module, exports, require) {
        "use strict";
        
        const {
          TOKEN_TYPES,
          createEOFToken,
          createLexError,
          createToken,
        } = require("../model");
        
        const SINGLE_CHAR_TOKENS = Object.freeze({
          "(": TOKEN_TYPES.LPAREN,
          ")": TOKEN_TYPES.RPAREN,
          ",": TOKEN_TYPES.COMMA,
          "+": TOKEN_TYPES.OPERATOR,
          "-": TOKEN_TYPES.OPERATOR,
          "*": TOKEN_TYPES.OPERATOR,
          "/": TOKEN_TYPES.OPERATOR,
          "^": TOKEN_TYPES.OPERATOR,
        });
        
        function isWhitespace(char) {
          return char === " " || char === "\t" || char === "\n" || char === "\r";
        }
        
        function isDigit(char) {
          return char >= "0" && char <= "9";
        }
        
        function isIdentifierStart(char) {
          return /[A-Za-z_]/.test(char);
        }
        
        function isIdentifierPart(char) {
          return /[A-Za-z0-9_]/.test(char);
        }
        
        function createLexerState(input) {
          return {
            input,
            length: input.length,
            index: 0,
            tokens: [],
          };
        }
        
        function peek(state, offset = 0) {
          const nextIndex = state.index + offset;
          return nextIndex >= state.length ? "" : state.input[nextIndex];
        }
        
        function advance(state, count = 1) {
          state.index += count;
        }
        
        function addToken(state, type, value, start, end) {
          state.tokens.push(
            createToken({
              type,
              value,
              start,
              end,
            })
          );
        }
        
        function failLex(state, code, message, start, end, context = {}, hint = "") {
          throw createLexError({
            code,
            message,
            position: { start, end },
            context,
            hint,
          });
        }
        
        function readIdentifier(state) {
          const start = state.index;
          let value = "";
        
          while (state.index < state.length && isIdentifierPart(peek(state))) {
            value += peek(state);
            advance(state);
          }
        
          addToken(state, TOKEN_TYPES.IDENTIFIER, value, start, state.index);
        }
        
        function readExponentPart(state, start) {
          let exponentText = peek(state);
          advance(state);
        
          if (peek(state) === "+" || peek(state) === "-") {
            exponentText += peek(state);
            advance(state);
          }
        
          if (!isDigit(peek(state))) {
            failLex(
              state,
              "LEX_INVALID_EXPONENT",
              "科学计数法的指数部分缺少数字。",
              start,
              state.index,
              { fragment: state.input.slice(start, state.index) },
              "请检查 e 或 E 后是否跟了整数，例如 1e3 或 2.5e-4。"
            );
          }
        
          while (isDigit(peek(state))) {
            exponentText += peek(state);
            advance(state);
          }
        
          return exponentText;
        }
        
        function readNumber(state) {
          const start = state.index;
          let value = "";
          let hasIntegerPart = false;
          let hasFractionPart = false;
        
          while (isDigit(peek(state))) {
            hasIntegerPart = true;
            value += peek(state);
            advance(state);
          }
        
          if (peek(state) === ".") {
            value += ".";
            advance(state);
        
            while (isDigit(peek(state))) {
              hasFractionPart = true;
              value += peek(state);
              advance(state);
            }
          }
        
          if (!hasIntegerPart && !hasFractionPart) {
            failLex(
              state,
              "LEX_INVALID_NUMBER",
              "无法识别数字字面量。",
              start,
              state.index,
              { fragment: state.input.slice(start, state.index + 1) },
              "数字可以是整数、小数或科学计数法。"
            );
          }
        
          if (peek(state) === "e" || peek(state) === "E") {
            value += readExponentPart(state, start);
          }
        
          addToken(state, TOKEN_TYPES.NUMBER, value, start, state.index);
        }
        
        function tokenize(input, options = {}) {
          if (typeof input !== "string") {
            throw new TypeError("tokenize.input must be a string.");
          }
        
          const state = createLexerState(input);
          const includeEOF = options.includeEOF !== false;
        
          while (state.index < state.length) {
            const current = peek(state);
        
            if (isWhitespace(current)) {
              advance(state);
              continue;
            }
        
            if (isDigit(current) || (current === "." && isDigit(peek(state, 1)))) {
              readNumber(state);
              continue;
            }
        
            if (isIdentifierStart(current)) {
              readIdentifier(state);
              continue;
            }
        
            if (Object.prototype.hasOwnProperty.call(SINGLE_CHAR_TOKENS, current)) {
              const start = state.index;
              advance(state);
              addToken(state, SINGLE_CHAR_TOKENS[current], current, start, state.index);
              continue;
            }
        
            failLex(
              state,
              "LEX_INVALID_CHARACTER",
              `发现不支持的字符 "${current}"。`,
              state.index,
              state.index + 1,
              { character: current },
              "当前仅支持数字、字母、下划线、空白、括号、逗号以及 + - * / ^ 运算符。"
            );
          }
        
          if (includeEOF) {
            state.tokens.push(createEOFToken(state.index));
          }
        
          return Object.freeze(state.tokens.slice());
        }
        
        function tokenizeToDebug(input, options = {}) {
          return tokenize(input, options).map((token) => ({
            type: token.type,
            value: token.value,
            start: token.start,
            end: token.end,
          }));
        }
        
        module.exports = {
          tokenize,
          tokenizeToDebug,
        };
        
      },
            {
        "../model": "core/model/index.js"
      }
    ],
    "core/math/complex.js": [
      function(module, exports, require) {
        "use strict";
        
        const {
          ANGLE_UNITS,
          DEFAULT_ZERO_TOLERANCE,
          createComplexValue,
          createConversionError,
          createMathDomainError,
          createPhasorValue,
          isComplexValue,
          isPhasorValue,
          normalizeNearZero,
        } = require("../model");
        
        function degreesToRadians(degrees) {
          if (typeof degrees !== "number" || Number.isNaN(degrees) || !Number.isFinite(degrees)) {
            throw new TypeError("degreesToRadians.degrees must be a finite number.");
          }
        
          return (degrees * Math.PI) / 180;
        }
        
        function radiansToDegrees(radians) {
          if (typeof radians !== "number" || Number.isNaN(radians) || !Number.isFinite(radians)) {
            throw new TypeError("radiansToDegrees.radians must be a finite number.");
          }
        
          return (radians * 180) / Math.PI;
        }
        
        function normalizeAngle(angle, angleUnit = ANGLE_UNITS.RAD) {
          if (typeof angle !== "number" || Number.isNaN(angle) || !Number.isFinite(angle)) {
            throw new TypeError("normalizeAngle.angle must be a finite number.");
          }
        
          if (!Object.values(ANGLE_UNITS).includes(angleUnit)) {
            throw new RangeError("normalizeAngle.angleUnit must be deg or rad.");
          }
        
          return angleUnit === ANGLE_UNITS.DEG ? degreesToRadians(angle) : angle;
        }
        
        function toAngleUnit(angleInRadians, angleUnit = ANGLE_UNITS.RAD) {
          if (!Object.values(ANGLE_UNITS).includes(angleUnit)) {
            throw new RangeError("toAngleUnit.angleUnit must be deg or rad.");
          }
        
          return angleUnit === ANGLE_UNITS.DEG ? radiansToDegrees(angleInRadians) : angleInRadians;
        }
        
        function asComplexValue(value) {
          if (isComplexValue(value)) {
            return value;
          }
        
          if (typeof value === "number" && Number.isFinite(value)) {
            return createComplexValue({ re: value, im: 0 });
          }
        
          if (isPhasorValue(value)) {
            return fromPhasorValue(value);
          }
        
          throw new TypeError("Value cannot be converted to ComplexValue.");
        }
        
        function isNearlyZero(value, tolerance = DEFAULT_ZERO_TOLERANCE) {
          if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
            throw new TypeError("isNearlyZero.value must be a finite number.");
          }
        
          if (typeof tolerance !== "number" || Number.isNaN(tolerance) || !Number.isFinite(tolerance)) {
            throw new TypeError("isNearlyZero.tolerance must be a finite number.");
          }
        
          return Math.abs(value) <= tolerance;
        }
        
        function isZeroComplex(value, tolerance = DEFAULT_ZERO_TOLERANCE) {
          const complex = asComplexValue(value);
          return isNearlyZero(complex.re, tolerance) && isNearlyZero(complex.im, tolerance);
        }
        
        function addComplex(left, right) {
          const a = asComplexValue(left);
          const b = asComplexValue(right);
        
          return createComplexValue({
            re: a.re + b.re,
            im: a.im + b.im,
          });
        }
        
        function subtractComplex(left, right) {
          const a = asComplexValue(left);
          const b = asComplexValue(right);
        
          return createComplexValue({
            re: a.re - b.re,
            im: a.im - b.im,
          });
        }
        
        function multiplyComplex(left, right) {
          const a = asComplexValue(left);
          const b = asComplexValue(right);
        
          return createComplexValue({
            re: a.re * b.re - a.im * b.im,
            im: a.re * b.im + a.im * b.re,
          });
        }
        
        function divideComplex(left, right, tolerance = DEFAULT_ZERO_TOLERANCE) {
          const a = asComplexValue(left);
          const b = asComplexValue(right);
          const denominator = b.re * b.re + b.im * b.im;
        
          if (isNearlyZero(denominator, tolerance)) {
            throw createMathDomainError({
              code: "MATH_DIVISION_BY_ZERO",
              message: "复数除法的分母不能为 0。",
              context: { left: a, right: b },
              hint: "请检查除数是否为 0 或极接近 0。",
            });
          }
        
          return createComplexValue({
            re: (a.re * b.re + a.im * b.im) / denominator,
            im: (a.im * b.re - a.re * b.im) / denominator,
          });
        }
        
        function conjugateComplex(value) {
          const complex = asComplexValue(value);
          return createComplexValue({
            re: complex.re,
            im: -complex.im,
          });
        }
        
        function magnitudeOfComplex(value) {
          const complex = asComplexValue(value);
          return normalizeNearZero(Math.hypot(complex.re, complex.im));
        }
        
        function angleOfComplex(value, angleUnit = ANGLE_UNITS.RAD) {
          const complex = asComplexValue(value);
        
          if (isZeroComplex(complex)) {
            throw createConversionError({
              code: "CONVERSION_ZERO_ANGLE_UNDEFINED",
              message: "零复数的相角未定义。",
              context: { value: complex },
              hint: "请避免对 0 求相角，或在业务层单独约定其显示方式。",
            });
          }
        
          return normalizeNearZero(toAngleUnit(Math.atan2(complex.im, complex.re), angleUnit));
        }
        
        function fromRectangularParts(re, im) {
          return createComplexValue({ re, im });
        }
        
        function fromPhasorParts(magnitude, angle, angleUnit = ANGLE_UNITS.RAD) {
          return fromPhasorValue(
            createPhasorValue({
              magnitude,
              angle,
              angleUnit,
            })
          );
        }
        
        function fromPhasorValue(phasor) {
          if (!isPhasorValue(phasor)) {
            throw new TypeError("fromPhasorValue.phasor must be a PhasorValue.");
          }
        
          const angleInRadians = normalizeAngle(phasor.angle, phasor.angleUnit);
        
          return createComplexValue({
            re: phasor.magnitude * Math.cos(angleInRadians),
            im: phasor.magnitude * Math.sin(angleInRadians),
          });
        }
        
        function toPhasorValue(value, angleUnit = ANGLE_UNITS.RAD) {
          const complex = asComplexValue(value);
        
          return createPhasorValue({
            magnitude: magnitudeOfComplex(complex),
            angle: isZeroComplex(complex) ? 0 : angleOfComplex(complex, angleUnit),
            angleUnit,
          });
        }
        
        function complexExp(value) {
          const complex = asComplexValue(value);
          const factor = Math.exp(complex.re);
        
          return createComplexValue({
            re: factor * Math.cos(complex.im),
            im: factor * Math.sin(complex.im),
          });
        }
        
        function complexLog(value, angleUnit = ANGLE_UNITS.RAD) {
          const complex = asComplexValue(value);
          const magnitude = magnitudeOfComplex(complex);
        
          if (isNearlyZero(magnitude)) {
            throw createMathDomainError({
              code: "MATH_LOG_ZERO_UNDEFINED",
              message: "0 的复对数未定义。",
              context: { value: complex },
              hint: "请避免对 0 求对数。",
            });
          }
        
          return createComplexValue({
            re: Math.log(magnitude),
            im: angleOfComplex(complex, angleUnit),
          });
        }
        
        function sqrtComplex(value) {
          const complex = asComplexValue(value);
        
          if (isZeroComplex(complex)) {
            return createComplexValue({ re: 0, im: 0 });
          }
        
          const magnitude = magnitudeOfComplex(complex);
          const real = Math.sqrt((magnitude + complex.re) / 2);
          const imaginarySign = complex.im < 0 ? -1 : 1;
          const imaginary = imaginarySign * Math.sqrt(Math.max(0, (magnitude - complex.re) / 2));
        
          return createComplexValue({
            re: real,
            im: imaginary,
          });
        }
        
        function sinComplex(value) {
          const complex = asComplexValue(value);
        
          return createComplexValue({
            re: Math.sin(complex.re) * Math.cosh(complex.im),
            im: Math.cos(complex.re) * Math.sinh(complex.im),
          });
        }
        
        function cosComplex(value) {
          const complex = asComplexValue(value);
        
          return createComplexValue({
            re: Math.cos(complex.re) * Math.cosh(complex.im),
            im: -Math.sin(complex.re) * Math.sinh(complex.im),
          });
        }
        
        function tanComplex(value, tolerance = DEFAULT_ZERO_TOLERANCE) {
          return divideComplex(sinComplex(value), cosComplex(value), tolerance);
        }
        
        function powerComplex(base, exponent) {
          const normalizedBase = asComplexValue(base);
          const normalizedExponent = asComplexValue(exponent);
        
          if (isZeroComplex(normalizedExponent)) {
            if (isZeroComplex(normalizedBase)) {
              throw createMathDomainError({
                code: "MATH_ZERO_TO_ZERO_UNDEFINED",
                message: "0^0 未定义。",
                context: { base: normalizedBase, exponent: normalizedExponent },
                hint: "请在业务层为 0^0 明确约定，或避免这种输入。",
              });
            }
        
            return createComplexValue({ re: 1, im: 0 });
          }
        
          if (isZeroComplex(normalizedBase)) {
            if (normalizedExponent.im !== 0 || normalizedExponent.re < 0) {
              throw createMathDomainError({
                code: "MATH_INVALID_ZERO_POWER",
                message: "0 不能被提升到负指数或复指数。",
                context: { base: normalizedBase, exponent: normalizedExponent },
                hint: "请检查指数是否为正实数。",
              });
            }
        
            return createComplexValue({ re: 0, im: 0 });
          }
        
          return complexExp(multiplyComplex(normalizedExponent, complexLog(normalizedBase)));
        }
        
        function realPart(value) {
          return asComplexValue(value).re;
        }
        
        function imaginaryPart(value) {
          return asComplexValue(value).im;
        }
        
        module.exports = {
          addComplex,
          angleOfComplex,
          asComplexValue,
          complexExp,
          complexLog,
          cosComplex,
          conjugateComplex,
          degreesToRadians,
          divideComplex,
          fromPhasorParts,
          fromPhasorValue,
          fromRectangularParts,
          imaginaryPart,
          isNearlyZero,
          isZeroComplex,
          magnitudeOfComplex,
          multiplyComplex,
          normalizeAngle,
          powerComplex,
          radiansToDegrees,
          realPart,
          sinComplex,
          subtractComplex,
          sqrtComplex,
          tanComplex,
          toAngleUnit,
          toPhasorValue,
        };
        
      },
            {
        "../model": "core/model/index.js"
      }
    ],
    "core/math/index.js": [
      function(module, exports, require) {
        "use strict";
        
        module.exports = {
          ...require("./complex"),
        };
        
      },
            {
        "./complex": "core/math/complex.js"
      }
    ],
    "core/model/ast.js": [
      function(module, exports, require) {
        "use strict";
        
        const {
          ANGLE_UNITS,
          AST_NODE_TYPES,
          CONVERSION_TARGETS,
        } = require("./constants");
        const { createSpan, mergeSpans, normalizeSpan } = require("./span");
        const {
          ensureFiniteNumber,
          ensureNonEmptyString,
          ensureOneOf,
        } = require("./shared");
        
        function createBaseNode(kind, span) {
          return {
            kind: ensureOneOf(kind, AST_NODE_TYPES, "node.kind"),
            span: normalizeSpan(span),
          };
        }
        
        function createNumberLiteral({ raw, value, span }) {
          return Object.freeze({
            ...createBaseNode(AST_NODE_TYPES.NUMBER_LITERAL, span),
            raw: ensureNonEmptyString(raw, "numberLiteral.raw"),
            value: ensureFiniteNumber(value, "numberLiteral.value"),
          });
        }
        
        function createIdentifier({ name, span }) {
          return Object.freeze({
            ...createBaseNode(AST_NODE_TYPES.IDENTIFIER, span),
            name: ensureNonEmptyString(name, "identifier.name"),
          });
        }
        
        function normalizeIdentifierNode(candidate, label) {
          if (isAstNode(candidate) && candidate.kind === AST_NODE_TYPES.IDENTIFIER) {
            return candidate;
          }
        
          if (typeof candidate === "string") {
            return createIdentifier({
              name: candidate,
              span: createSpan(0, 0),
            });
          }
        
          throw new TypeError(`${label} must be an Identifier node or a string.`);
        }
        
        function createUnaryExpression({ operator, argument, span }) {
          if (!isAstNode(argument)) {
            throw new TypeError("unaryExpression.argument must be an AST node.");
          }
        
          return Object.freeze({
            ...createBaseNode(AST_NODE_TYPES.UNARY_EXPRESSION, span || argument.span),
            operator: ensureNonEmptyString(operator, "unaryExpression.operator"),
            argument,
          });
        }
        
        function createBinaryExpression({ operator, left, right, span }) {
          if (!isAstNode(left)) {
            throw new TypeError("binaryExpression.left must be an AST node.");
          }
        
          if (!isAstNode(right)) {
            throw new TypeError("binaryExpression.right must be an AST node.");
          }
        
          return Object.freeze({
            ...createBaseNode(AST_NODE_TYPES.BINARY_EXPRESSION, span || mergeSpans(left.span, right.span)),
            operator: ensureNonEmptyString(operator, "binaryExpression.operator"),
            left,
            right,
          });
        }
        
        function createFunctionCall({ callee, args, span }) {
          const normalizedCallee = normalizeIdentifierNode(callee, "functionCall.callee");
          const normalizedArgs = Array.isArray(args) ? args.slice() : [];
        
          for (const argument of normalizedArgs) {
            if (!isAstNode(argument)) {
              throw new TypeError("functionCall.args must contain only AST nodes.");
            }
          }
        
          const lastArgumentSpan =
            normalizedArgs.length > 0 ? normalizedArgs[normalizedArgs.length - 1].span : normalizedCallee.span;
        
          return Object.freeze({
            ...createBaseNode(
              AST_NODE_TYPES.FUNCTION_CALL,
              span || mergeSpans(normalizedCallee.span, lastArgumentSpan)
            ),
            callee: normalizedCallee,
            args: Object.freeze(normalizedArgs),
          });
        }
        
        function createConversionExpression({ source, targetForm, angleUnit = null, span }) {
          if (!isAstNode(source)) {
            throw new TypeError("conversionExpression.source must be an AST node.");
          }
        
          return Object.freeze({
            ...createBaseNode(AST_NODE_TYPES.CONVERSION_EXPRESSION, span || source.span),
            source,
            targetForm: ensureOneOf(targetForm, CONVERSION_TARGETS, "conversionExpression.targetForm"),
            angleUnit: angleUnit === null ? null : ensureOneOf(angleUnit, ANGLE_UNITS, "conversionExpression.angleUnit"),
          });
        }
        
        function isAstNode(value) {
          return Boolean(
            value &&
              typeof value === "object" &&
              Object.values(AST_NODE_TYPES).includes(value.kind) &&
              value.span
          );
        }
        
        module.exports = {
          createBinaryExpression,
          createConversionExpression,
          createFunctionCall,
          createIdentifier,
          createNumberLiteral,
          createUnaryExpression,
          isAstNode,
        };
        
      },
            {
        "./constants": "core/model/constants.js",
        "./span": "core/model/span.js",
        "./shared": "core/model/shared.js"
      }
    ],
    "core/model/constants.js": [
      function(module, exports, require) {
        "use strict";
        
        const TOKEN_TYPES = Object.freeze({
          NUMBER: "NUMBER",
          IDENTIFIER: "IDENTIFIER",
          OPERATOR: "OPERATOR",
          LPAREN: "LPAREN",
          RPAREN: "RPAREN",
          COMMA: "COMMA",
          EOF: "EOF",
        });
        
        const AST_NODE_TYPES = Object.freeze({
          NUMBER_LITERAL: "NumberLiteral",
          IDENTIFIER: "Identifier",
          UNARY_EXPRESSION: "UnaryExpression",
          BINARY_EXPRESSION: "BinaryExpression",
          FUNCTION_CALL: "FunctionCall",
          CONVERSION_EXPRESSION: "ConversionExpression",
        });
        
        const VALUE_TYPES = Object.freeze({
          COMPLEX: "ComplexValue",
          PHASOR: "PhasorValue",
        });
        
        const DISPLAY_TYPES = Object.freeze({
          REAL: "real",
          COMPLEX_RECT: "complex_rect",
          COMPLEX_POLAR: "complex_polar",
          PHASOR: "phasor",
          ERROR: "error",
        });
        
        const OUTPUT_MODES = Object.freeze({
          PLAIN: "plain",
          RECT: "rect",
          POLAR: "polar",
          DEBUG: "debug",
        });
        
        const ANGLE_UNITS = Object.freeze({
          DEG: "deg",
          RAD: "rad",
        });
        
        const FUNCTION_KINDS = Object.freeze({
          BUILTIN: "builtin",
          USER_DEFINED: "user_defined",
        });
        
        const CONVERSION_TARGETS = Object.freeze({
          RECT: "rect",
          POLAR: "polar",
        });
        
        const ERROR_KINDS = Object.freeze({
          MODEL: "ModelError",
          LEX: "LexError",
          PARSE: "ParseError",
          NAME: "NameError",
          ARITY: "ArityError",
          MATH_DOMAIN: "MathDomainError",
          CONVERSION: "ConversionError",
          UNSUPPORTED_FEATURE: "UnsupportedFeatureError",
        });
        
        const DEFAULT_PRECISION = 12;
        const DEFAULT_ZERO_TOLERANCE = 1e-12;
        const DEFAULT_MAX_IDENTIFIER_LENGTH = 32;
        
        module.exports = {
          ANGLE_UNITS,
          AST_NODE_TYPES,
          CONVERSION_TARGETS,
          DEFAULT_MAX_IDENTIFIER_LENGTH,
          DEFAULT_PRECISION,
          DEFAULT_ZERO_TOLERANCE,
          DISPLAY_TYPES,
          ERROR_KINDS,
          FUNCTION_KINDS,
          OUTPUT_MODES,
          TOKEN_TYPES,
          VALUE_TYPES,
        };
        
      },
            {}
    ],
    "core/model/context.js": [
      function(module, exports, require) {
        "use strict";
        
        const {
          createComplexValue,
          createEvaluationOptions,
          DEFAULT_EVALUATION_OPTIONS,
          isComplexValue,
        } = require("./values");
        const { isFunctionDefinition } = require("./functions");
        const { ensurePlainObject } = require("./shared");
        
        const DEFAULT_CONSTANTS = Object.freeze({
          pi: createComplexValue({ re: Math.PI, im: 0 }),
          e: createComplexValue({ re: Math.E, im: 0 }),
          i: createComplexValue({ re: 0, im: 1 }),
        });
        
        function cloneValueRecord(record, label, validator) {
          ensurePlainObject(record, label);
          const normalizedRecord = {};
        
          for (const [key, value] of Object.entries(record)) {
            if (!validator(value)) {
              throw new TypeError(`${label}.${key} is not a valid value.`);
            }
        
            normalizedRecord[key] = value;
          }
        
          return Object.freeze(normalizedRecord);
        }
        
        function createEvaluationContext({
          constants = DEFAULT_CONSTANTS,
          variables = {},
          functions = {},
          options = DEFAULT_EVALUATION_OPTIONS,
        } = {}) {
          ensurePlainObject(functions, "evaluationContext.functions");
        
          const normalizedFunctions = {};
        
          for (const [name, definition] of Object.entries(functions)) {
            if (!isFunctionDefinition(definition)) {
              throw new TypeError(`evaluationContext.functions.${name} is not a valid function definition.`);
            }
        
            normalizedFunctions[name] = definition;
          }
        
          return Object.freeze({
            constants: cloneValueRecord(constants, "evaluationContext.constants", isComplexValue),
            variables: cloneValueRecord(variables, "evaluationContext.variables", isComplexValue),
            functions: Object.freeze(normalizedFunctions),
            options: createEvaluationOptions(options),
          });
        }
        
        module.exports = {
          DEFAULT_CONSTANTS,
          createEvaluationContext,
        };
        
      },
            {
        "./values": "core/model/values.js",
        "./functions": "core/model/functions.js",
        "./shared": "core/model/shared.js"
      }
    ],
    "core/model/errors.js": [
      function(module, exports, require) {
        "use strict";
        
        const { ERROR_KINDS } = require("./constants");
        const { normalizeSpan } = require("./span");
        const {
          ensureNonEmptyString,
          ensureOneOf,
          ensurePlainObject,
        } = require("./shared");
        
        function createCalculatorError({
          kind = ERROR_KINDS.MODEL,
          code,
          message,
          position = null,
          context = {},
          hint = "",
          cause = null,
        } = {}) {
          ensurePlainObject(context, "calculatorError.context");
        
          return Object.freeze({
            kind: ensureOneOf(kind, ERROR_KINDS, "calculatorError.kind"),
            code: ensureNonEmptyString(code, "calculatorError.code"),
            message: ensureNonEmptyString(message, "calculatorError.message"),
            position: position === null ? null : normalizeSpan(position),
            context: Object.freeze({ ...context }),
            hint: typeof hint === "string" ? hint : String(hint),
            cause: cause || null,
          });
        }
        
        function createLexError(options) {
          return createCalculatorError({
            kind: ERROR_KINDS.LEX,
            ...options,
          });
        }
        
        function createParseError(options) {
          return createCalculatorError({
            kind: ERROR_KINDS.PARSE,
            ...options,
          });
        }
        
        function createNameError(options) {
          return createCalculatorError({
            kind: ERROR_KINDS.NAME,
            ...options,
          });
        }
        
        function createArityError(options) {
          return createCalculatorError({
            kind: ERROR_KINDS.ARITY,
            ...options,
          });
        }
        
        function createMathDomainError(options) {
          return createCalculatorError({
            kind: ERROR_KINDS.MATH_DOMAIN,
            ...options,
          });
        }
        
        function createConversionError(options) {
          return createCalculatorError({
            kind: ERROR_KINDS.CONVERSION,
            ...options,
          });
        }
        
        function createUnsupportedFeatureError(options) {
          return createCalculatorError({
            kind: ERROR_KINDS.UNSUPPORTED_FEATURE,
            ...options,
          });
        }
        
        function isCalculatorError(value) {
          return Boolean(
            value &&
              typeof value === "object" &&
              Object.values(ERROR_KINDS).includes(value.kind) &&
              typeof value.code === "string" &&
              typeof value.message === "string"
          );
        }
        
        module.exports = {
          createArityError,
          createCalculatorError,
          createConversionError,
          createLexError,
          createMathDomainError,
          createNameError,
          createParseError,
          createUnsupportedFeatureError,
          isCalculatorError,
        };
        
      },
            {
        "./constants": "core/model/constants.js",
        "./span": "core/model/span.js",
        "./shared": "core/model/shared.js"
      }
    ],
    "core/model/functions.js": [
      function(module, exports, require) {
        "use strict";
        
        const {
          FUNCTION_KINDS,
        } = require("./constants");
        const { isAstNode } = require("./ast");
        const {
          IDENTIFIER_PATTERN,
          getReservedGroup,
          validateVariableName,
        } = require("./identifierRules");
        const {
          ensureNonEmptyString,
          ensurePlainObject,
          ensureString,
        } = require("./shared");
        
        function validateCallableName(name, kind) {
          const normalizedName = ensureNonEmptyString(name, "function.name");
        
          if (!IDENTIFIER_PATTERN.test(normalizedName)) {
            throw new TypeError("Function names must start with a lowercase letter and use only lowercase letters, digits, or underscores.");
          }
        
          const reservedGroup = getReservedGroup(normalizedName);
        
          if (kind === FUNCTION_KINDS.USER_DEFINED && reservedGroup) {
            throw new RangeError(`Function name "${normalizedName}" is reserved for ${reservedGroup}.`);
          }
        
          return normalizedName;
        }
        
        function createFunctionParameter({
          name,
          description = "",
        } = {}) {
          const validation = validateVariableName(name);
        
          if (!validation.valid) {
            throw new TypeError(`Invalid parameter name "${name}": ${validation.reasons.join(" ")}`);
          }
        
          return Object.freeze({
            name: validation.normalizedName,
            description: ensureString(description, "functionParameter.description"),
          });
        }
        
        function normalizeParameters(parameters = []) {
          if (!Array.isArray(parameters)) {
            throw new TypeError("function.parameters must be an array.");
          }
        
          const normalizedParameters = parameters.map((parameter) =>
            typeof parameter === "string"
              ? createFunctionParameter({ name: parameter })
              : createFunctionParameter(parameter)
          );
        
          const seenNames = new Set();
        
          for (const parameter of normalizedParameters) {
            if (seenNames.has(parameter.name)) {
              throw new RangeError(`Duplicate function parameter "${parameter.name}" is not allowed.`);
            }
        
            seenNames.add(parameter.name);
          }
        
          return Object.freeze(normalizedParameters);
        }
        
        function createFunctionMetadata(metadata = {}) {
          ensurePlainObject(metadata, "function.metadata");
        
          return Object.freeze({
            description: typeof metadata.description === "string" ? metadata.description : "",
            supportsComplex: metadata.supportsComplex !== false,
            affectsDisplay: Boolean(metadata.affectsDisplay),
            source: typeof metadata.source === "string" ? metadata.source : "",
            tags: Array.isArray(metadata.tags) ? Object.freeze(metadata.tags.slice()) : Object.freeze([]),
          });
        }
        
        function createBuiltinFunctionDefinition({
          name,
          parameters = [],
          executor,
          metadata = {},
        } = {}) {
          if (typeof executor !== "function") {
            throw new TypeError("builtinFunction.executor must be a function.");
          }
        
          return Object.freeze({
            kind: FUNCTION_KINDS.BUILTIN,
            name: validateCallableName(name, FUNCTION_KINDS.BUILTIN),
            parameters: normalizeParameters(parameters),
            bodyAst: null,
            executor,
            metadata: createFunctionMetadata(metadata),
          });
        }
        
        function createUserFunctionDefinition({
          name,
          parameters = [],
          bodyAst,
          metadata = {},
        } = {}) {
          if (!isAstNode(bodyAst)) {
            throw new TypeError("userFunction.bodyAst must be an AST node.");
          }
        
          return Object.freeze({
            kind: FUNCTION_KINDS.USER_DEFINED,
            name: validateCallableName(name, FUNCTION_KINDS.USER_DEFINED),
            parameters: normalizeParameters(parameters),
            bodyAst,
            executor: null,
            metadata: createFunctionMetadata(metadata),
          });
        }
        
        function isFunctionDefinition(value) {
          return Boolean(
            value &&
              typeof value === "object" &&
              Object.values(FUNCTION_KINDS).includes(value.kind) &&
              typeof value.name === "string" &&
              Array.isArray(value.parameters)
          );
        }
        
        module.exports = {
          createBuiltinFunctionDefinition,
          createFunctionMetadata,
          createFunctionParameter,
          createUserFunctionDefinition,
          isFunctionDefinition,
          normalizeParameters,
        };
        
      },
            {
        "./constants": "core/model/constants.js",
        "./ast": "core/model/ast.js",
        "./identifierRules": "core/model/identifierRules.js",
        "./shared": "core/model/shared.js"
      }
    ],
    "core/model/identifierRules.js": [
      function(module, exports, require) {
        "use strict";
        
        const MAX_IDENTIFIER_LENGTH = 32;
        const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
        
        const RESERVED_GROUPS = {
          constants: ["pi", "e", "i"],
          angleUnits: ["deg", "rad"],
          builtins: [
            "sin",
            "cos",
            "tan",
            "sqrt",
            "exp",
            "lg",
            "ln",
            "abs",
            "arg",
            "re",
            "im",
            "conj",
            "rect",
            "polar",
            "to_rect",
            "to_polar",
          ],
          futureCommands: ["ans", "history"],
        };
        
        const RESERVED_LOOKUP = Object.entries(RESERVED_GROUPS).reduce(
          (lookup, [groupName, names]) => {
            for (const name of names) {
              lookup[name] = groupName;
            }
            return lookup;
          },
          {}
        );
        
        const RULE_SUMMARY = [
          "只能使用小写字母、数字和下划线。",
          "必须以字母开头。",
          "长度不能超过 32 个字符。",
          "不能以下划线结尾。",
          "不能出现连续下划线。",
          "不能使用 pi、i、sin、rect、deg 等保留名称。",
        ];
        
        function buildSuccessMessage(name) {
          return `"${name}" 可以作为用户自定义变量名使用。`;
        }
        
        function buildReservedMessage(name, groupName) {
          const groupLabelMap = {
            constants: "常量",
            angleUnits: "角度单位",
            builtins: "内建函数",
            futureCommands: "预留会话名称",
          };
        
          const label = groupLabelMap[groupName] || groupName;
          return `"${name}" 是${label}保留名称，不能重复作为变量名使用。`;
        }
        
        function validateVariableName(name) {
          const reasons = [];
          const rawName = String(name ?? "");
          const trimmedName = rawName.trim();
        
          if (trimmedName.length === 0) {
            reasons.push("变量名不能为空。");
          }
        
          if (rawName !== trimmedName) {
            reasons.push("变量名前后不能包含空格。");
          }
        
          if (trimmedName.length > MAX_IDENTIFIER_LENGTH) {
            reasons.push(`变量名长度不能超过 ${MAX_IDENTIFIER_LENGTH} 个字符。`);
          }
        
          if (trimmedName.length > 0 && !IDENTIFIER_PATTERN.test(trimmedName)) {
            reasons.push(
              "变量名必须以小写字母开头，且只能包含小写字母、数字或下划线。"
            );
          }
        
          if (trimmedName.endsWith("_")) {
            reasons.push("变量名不能以下划线结尾。");
          }
        
          if (trimmedName.includes("__")) {
            reasons.push("变量名不能包含连续下划线。");
          }
        
          if (RESERVED_LOOKUP[trimmedName]) {
            reasons.push(buildReservedMessage(trimmedName, RESERVED_LOOKUP[trimmedName]));
          }
        
          return {
            valid: reasons.length === 0,
            normalizedName: trimmedName,
            message:
              reasons.length === 0 ? buildSuccessMessage(trimmedName) : "变量名不合法。",
            reasons,
            rules: RULE_SUMMARY.slice(),
          };
        }
        
        function getReservedGroups() {
          return JSON.parse(JSON.stringify(RESERVED_GROUPS));
        }
        
        function getReservedGroup(name) {
          const normalizedName = String(name ?? "").trim();
          return RESERVED_LOOKUP[normalizedName] || null;
        }
        
        function isReservedIdentifier(name) {
          return getReservedGroup(name) !== null;
        }
        
        const api = {
          MAX_IDENTIFIER_LENGTH,
          IDENTIFIER_PATTERN,
          RULE_SUMMARY,
          RESERVED_GROUPS,
          getReservedGroup,
          isReservedIdentifier,
          validateVariableName,
          getReservedGroups,
        };
        
        if (typeof module !== "undefined" && module.exports) {
          module.exports = api;
        }
        
        if (typeof window !== "undefined") {
          window.IdentifierRules = api;
        }
        
      },
            {}
    ],
    "core/model/index.js": [
      function(module, exports, require) {
        "use strict";
        
        module.exports = {
          ...require("./constants"),
          ...require("./span"),
          ...require("./tokens"),
          ...require("./ast"),
          ...require("./values"),
          ...require("./errors"),
          ...require("./functions"),
          ...require("./context"),
          ...require("./identifierRules"),
        };
        
      },
            {
        "./constants": "core/model/constants.js",
        "./span": "core/model/span.js",
        "./tokens": "core/model/tokens.js",
        "./ast": "core/model/ast.js",
        "./values": "core/model/values.js",
        "./errors": "core/model/errors.js",
        "./functions": "core/model/functions.js",
        "./context": "core/model/context.js",
        "./identifierRules": "core/model/identifierRules.js"
      }
    ],
    "core/model/shared.js": [
      function(module, exports, require) {
        "use strict";
        
        function isPlainObject(value) {
          if (value === null || typeof value !== "object") {
            return false;
          }
        
          const prototype = Object.getPrototypeOf(value);
          return prototype === Object.prototype || prototype === null;
        }
        
        function ensurePlainObject(value, label) {
          if (!isPlainObject(value)) {
            throw new TypeError(`${label} must be a plain object.`);
          }
        
          return value;
        }
        
        function ensureString(value, label) {
          if (typeof value !== "string") {
            throw new TypeError(`${label} must be a string.`);
          }
        
          return value;
        }
        
        function ensureNonEmptyString(value, label) {
          const text = ensureString(value, label).trim();
        
          if (!text) {
            throw new TypeError(`${label} cannot be empty.`);
          }
        
          return text;
        }
        
        function ensureFiniteNumber(value, label) {
          if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
            throw new TypeError(`${label} must be a finite number.`);
          }
        
          return value;
        }
        
        function ensureInteger(value, label) {
          if (!Number.isInteger(value)) {
            throw new TypeError(`${label} must be an integer.`);
          }
        
          return value;
        }
        
        function ensureNonNegativeInteger(value, label) {
          ensureInteger(value, label);
        
          if (value < 0) {
            throw new RangeError(`${label} cannot be negative.`);
          }
        
          return value;
        }
        
        function ensureOneOf(value, allowedValues, label) {
          const options = Array.isArray(allowedValues) ? allowedValues : Object.values(allowedValues);
        
          if (!options.includes(value)) {
            throw new RangeError(`${label} must be one of: ${options.join(", ")}.`);
          }
        
          return value;
        }
        
        function cloneRecord(record) {
          return Object.assign({}, record);
        }
        
        function freezeShallow(value) {
          return Object.freeze(value);
        }
        
        module.exports = {
          cloneRecord,
          ensureFiniteNumber,
          ensureInteger,
          ensureNonEmptyString,
          ensureNonNegativeInteger,
          ensureOneOf,
          ensurePlainObject,
          ensureString,
          freezeShallow,
          isPlainObject,
        };
        
      },
            {}
    ],
    "core/model/span.js": [
      function(module, exports, require) {
        "use strict";
        
        const {
          ensureNonNegativeInteger,
        } = require("./shared");
        
        function createSpan(start, end) {
          const normalizedStart = ensureNonNegativeInteger(start, "span.start");
          const normalizedEnd = ensureNonNegativeInteger(end, "span.end");
        
          if (normalizedEnd < normalizedStart) {
            throw new RangeError("span.end cannot be smaller than span.start.");
          }
        
          return Object.freeze({
            start: normalizedStart,
            end: normalizedEnd,
          });
        }
        
        function createPointSpan(index) {
          const normalizedIndex = ensureNonNegativeInteger(index, "span.index");
          return createSpan(normalizedIndex, normalizedIndex);
        }
        
        function isSpan(value) {
          return Boolean(
            value &&
              typeof value === "object" &&
              Number.isInteger(value.start) &&
              Number.isInteger(value.end) &&
              value.start >= 0 &&
              value.end >= value.start
          );
        }
        
        function normalizeSpan(value, fallbackStart = 0, fallbackEnd = fallbackStart) {
          if (isSpan(value)) {
            return createSpan(value.start, value.end);
          }
        
          return createSpan(fallbackStart, fallbackEnd);
        }
        
        function mergeSpans(leftSpan, rightSpan) {
          const left = normalizeSpan(leftSpan);
          const right = normalizeSpan(rightSpan, left.end, left.end);
          return createSpan(left.start, right.end);
        }
        
        module.exports = {
          createPointSpan,
          createSpan,
          isSpan,
          mergeSpans,
          normalizeSpan,
        };
        
      },
            {
        "./shared": "core/model/shared.js"
      }
    ],
    "core/model/tokens.js": [
      function(module, exports, require) {
        "use strict";
        
        const { TOKEN_TYPES } = require("./constants");
        const { createSpan } = require("./span");
        const {
          ensureNonNegativeInteger,
          ensureOneOf,
          ensureString,
        } = require("./shared");
        
        function createToken({ type, value, start, end }) {
          const normalizedType = ensureOneOf(type, TOKEN_TYPES, "token.type");
          const normalizedValue = ensureString(value, "token.value");
          const normalizedStart = ensureNonNegativeInteger(start, "token.start");
          const normalizedEnd = ensureNonNegativeInteger(end, "token.end");
        
          if (normalizedEnd < normalizedStart) {
            throw new RangeError("token.end cannot be smaller than token.start.");
          }
        
          return Object.freeze({
            type: normalizedType,
            value: normalizedValue,
            start: normalizedStart,
            end: normalizedEnd,
            span: createSpan(normalizedStart, normalizedEnd),
          });
        }
        
        function createEOFToken(position) {
          const normalizedPosition = ensureNonNegativeInteger(position, "token.position");
          return createToken({
            type: TOKEN_TYPES.EOF,
            value: "",
            start: normalizedPosition,
            end: normalizedPosition,
          });
        }
        
        function isToken(value) {
          return Boolean(
            value &&
              typeof value === "object" &&
              Object.values(TOKEN_TYPES).includes(value.type) &&
              typeof value.value === "string" &&
              Number.isInteger(value.start) &&
              Number.isInteger(value.end)
          );
        }
        
        module.exports = {
          createEOFToken,
          createToken,
          isToken,
        };
        
      },
            {
        "./constants": "core/model/constants.js",
        "./span": "core/model/span.js",
        "./shared": "core/model/shared.js"
      }
    ],
    "core/model/values.js": [
      function(module, exports, require) {
        "use strict";
        
        const {
          ANGLE_UNITS,
          DEFAULT_PRECISION,
          DEFAULT_ZERO_TOLERANCE,
          DISPLAY_TYPES,
          OUTPUT_MODES,
          VALUE_TYPES,
        } = require("./constants");
        const {
          ensureFiniteNumber,
          ensureOneOf,
          ensurePlainObject,
        } = require("./shared");
        
        function normalizeNearZero(value, tolerance = DEFAULT_ZERO_TOLERANCE) {
          const normalizedTolerance = ensureFiniteNumber(tolerance, "tolerance");
          const normalizedValue = ensureFiniteNumber(value, "value");
        
          if (Math.abs(normalizedValue) <= normalizedTolerance) {
            return 0;
          }
        
          return Object.is(normalizedValue, -0) ? 0 : normalizedValue;
        }
        
        function createComplexValue({ re = 0, im = 0, tolerance = DEFAULT_ZERO_TOLERANCE } = {}) {
          return Object.freeze({
            kind: VALUE_TYPES.COMPLEX,
            re: normalizeNearZero(re, tolerance),
            im: normalizeNearZero(im, tolerance),
          });
        }
        
        function isComplexValue(value) {
          return Boolean(
            value &&
              typeof value === "object" &&
              value.kind === VALUE_TYPES.COMPLEX &&
              typeof value.re === "number" &&
              typeof value.im === "number"
          );
        }
        
        function createPhasorValue({
          magnitude,
          angle,
          angleUnit = ANGLE_UNITS.RAD,
        } = {}) {
          const normalizedMagnitude = ensureFiniteNumber(magnitude, "phasorValue.magnitude");
        
          if (normalizedMagnitude < 0) {
            throw new RangeError("phasorValue.magnitude cannot be negative.");
          }
        
          return Object.freeze({
            kind: VALUE_TYPES.PHASOR,
            magnitude: normalizedMagnitude,
            angle: ensureFiniteNumber(angle, "phasorValue.angle"),
            angleUnit: ensureOneOf(angleUnit, ANGLE_UNITS, "phasorValue.angleUnit"),
          });
        }
        
        function isPhasorValue(value) {
          return Boolean(
            value &&
              typeof value === "object" &&
              value.kind === VALUE_TYPES.PHASOR &&
              typeof value.magnitude === "number" &&
              typeof value.angle === "number"
          );
        }
        
        function inferDisplayType(value) {
          if (isPhasorValue(value)) {
            return DISPLAY_TYPES.PHASOR;
          }
        
          if (isComplexValue(value)) {
            return value.im === 0 ? DISPLAY_TYPES.REAL : DISPLAY_TYPES.COMPLEX_RECT;
          }
        
          return DISPLAY_TYPES.ERROR;
        }
        
        function createEvaluationResult({
          value = null,
          displayType = inferDisplayType(value),
          text = "",
          latex = "",
          metadata = {},
        } = {}) {
          ensurePlainObject(metadata, "evaluationResult.metadata");
        
          return Object.freeze({
            value,
            displayType: ensureOneOf(displayType, DISPLAY_TYPES, "evaluationResult.displayType"),
            text: typeof text === "string" ? text : String(text),
            latex: typeof latex === "string" ? latex : String(latex),
            metadata: Object.freeze({ ...metadata }),
          });
        }
        
        function createEvaluationOptions({
          angleUnit = ANGLE_UNITS.RAD,
          outputMode = OUTPUT_MODES.PLAIN,
          precision = DEFAULT_PRECISION,
          zeroTolerance = DEFAULT_ZERO_TOLERANCE,
        } = {}) {
          const normalizedPrecision = ensureFiniteNumber(precision, "evaluationOptions.precision");
        
          if (!Number.isInteger(normalizedPrecision) || normalizedPrecision < 0) {
            throw new RangeError("evaluationOptions.precision must be a non-negative integer.");
          }
        
          return Object.freeze({
            angleUnit: ensureOneOf(angleUnit, ANGLE_UNITS, "evaluationOptions.angleUnit"),
            outputMode: ensureOneOf(outputMode, OUTPUT_MODES, "evaluationOptions.outputMode"),
            precision: normalizedPrecision,
            zeroTolerance: ensureFiniteNumber(zeroTolerance, "evaluationOptions.zeroTolerance"),
          });
        }
        
        const DEFAULT_EVALUATION_OPTIONS = createEvaluationOptions();
        
        module.exports = {
          createComplexValue,
          createEvaluationOptions,
          createEvaluationResult,
          createPhasorValue,
          DEFAULT_EVALUATION_OPTIONS,
          inferDisplayType,
          isComplexValue,
          isPhasorValue,
          normalizeNearZero,
        };
        
      },
            {
        "./constants": "core/model/constants.js",
        "./shared": "core/model/shared.js"
      }
    ],
    "core/parser/index.js": [
      function(module, exports, require) {
        "use strict";
        
        module.exports = {
          ...require("./parser"),
        };
        
      },
            {
        "./parser": "core/parser/parser.js"
      }
    ],
    "core/parser/parser.js": [
      function(module, exports, require) {
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
        
      },
            {
        "../model": "core/model/index.js",
        "../lexer": "core/lexer/index.js"
      }
    ],
    "web/app-entry.js": [
      function(module, exports, require) {
        "use strict";
        
        const { evaluate } = require("../core/evaluator");
        const { parseSource } = require("../core/parser");
        const {
          renderAstToLatex,
          renderEvaluationResultToLatex,
          renderEvaluationResultToText,
        } = require("../core/format");
        const {
          createInMemoryUserFunctionStore,
          createPersistentUserFunctionStore,
        } = require("../core/functions");
        const { createWebInputProtocol } = require("./input-protocol");
        const { createLocalStorageRecordPersistence } = require("./user-function-storage");
        
        function setCursor(input, position) {
          try {
            input.setSelectionRange(position, position);
          } catch (error) {
            // Ignore unsupported cursor updates.
          }
        }
        
        function focusExpressionInput(input, cursorPosition) {
          input.focus();
          setCursor(input, cursorPosition);
        }
        
        function createProtocolForUserStore(userStore) {
          return createWebInputProtocol({
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
        }
        
        function splitParameterInput(value) {
          const source = String(value ?? "").trim();
          return source ? source.split(",").map((item) => item.trim()).filter(Boolean) : [];
        }
        
        function buildInvocationTemplate(definition) {
          const parameterCount = definition.parameters.length;
        
          if (parameterCount === 0) {
            return {
              text: `${definition.name}()`,
              cursorOffset: definition.name.length + 2,
            };
          }
        
          return {
            text: `${definition.name}(${",".repeat(Math.max(0, parameterCount - 1))})`,
            cursorOffset: definition.name.length + 1,
          };
        }
        
        const DEFAULT_BUTTON_HINT = "将光标移到按钮上可查看其作用说明。";
        
        const BUTTON_HELP_TEXTS = Object.freeze({
          plus: "加法运算符，用于计算左值与右值之和。",
          minus: "减法运算符，用于计算左值减去右值。",
          multiply: "乘法运算符，用于计算两个数或表达式的乘积。",
          divide: "除法运算符，用于计算左值除以右值。",
          power: "幂运算符，a ^ b 表示 a 的 b 次方。",
          lparen: "左括号，用于控制表达式优先级或函数参数范围。",
          rparen: "右括号，用于结束括号表达式或函数参数列表。",
          comma: "逗号，用于分隔函数的多个参数。",
          sin: "正弦函数，sin(x) 为求 x 的正弦值。",
          cos: "余弦函数，cos(x) 为求 x 的余弦值。",
          tan: "正切函数，tan(x) 为求 x 的正切值。",
          sqrt: "平方根函数，sqrt(x) 为求 x 的平方根。",
          exp: "指数函数，exp(x) 表示 e 的 x 次方。",
          lg: "常用对数函数，lg(x) 为求 x 的 10 为底对数。",
          ln: "自然对数函数，ln(x) 为求 x 的 e 为底对数。",
          re: "实部函数，re(z) 为求复数 z 的实部。",
          im: "虚部函数，im(z) 为求复数 z 的虚部。",
          abs: "模长函数，abs(z) 为求复数 z 的模。",
          arg: "幅角函数，arg(z) 为求复数 z 的相角。",
          conj: "共轭函数，conj(z) 为求复数 z 的共轭。",
          rect: "直角坐标构造函数，rect(x, y) 表示 x + y*i。",
          polar: "相量构造函数，polar(r, theta, unit) 按幅值与角度生成复数。",
          to_rect: "转换函数，to_rect(z) 将结果按直角坐标形式显示。",
          to_polar: "转换函数，to_polar(z) 将结果按相量形式显示。",
          pi: "圆周率，约为 3.141592653589793。",
          e: "自然常数 e，约为 2.718281828459045。",
          i: "虚数单位，满足 i^2 = -1。",
          deg: "角度单位常量，表示 degree（度）。",
          rad: "角度单位常量，表示 radian（弧度）。",
          backspaceButton: "退格，删除光标前的一个字符。",
          clearButton: "清空，删除当前输入框中的全部内容。",
        });
        
        function mountCalculatorApp(doc = document) {
          const userStore = createPersistentUserFunctionStore({
            autoLoad: false,
            persistence: createLocalStorageRecordPersistence(),
            store: createInMemoryUserFunctionStore(),
          });
          const protocol = createProtocolForUserStore(userStore);
          let state = protocol.createState();
        
          const expressionInput = doc.getElementById("expressionInput");
          const latexExpression = doc.getElementById("latexExpression");
          const resultText = doc.getElementById("resultText");
          const resultLatex = doc.getElementById("resultLatex");
          const parseError = doc.getElementById("parseError");
          const evaluationError = doc.getElementById("evaluationError");
          const displayMode = doc.getElementById("displayMode");
          const angleUnit = doc.getElementById("angleUnit");
          const keyboardHint = doc.getElementById("keyboardHint");
          const buttonHint = doc.getElementById("buttonHint");
          const buttonBar = doc.getElementById("buttonBar");
          const clearButton = doc.getElementById("clearButton");
          const backspaceButton = doc.getElementById("backspaceButton");
        
          const functionNameInput = doc.getElementById("functionNameInput");
          const functionParamsInput = doc.getElementById("functionParamsInput");
          const functionSaveButton = doc.getElementById("functionSaveButton");
          const functionResetButton = doc.getElementById("functionResetButton");
          const functionStatus = doc.getElementById("functionStatus");
          const savedFunctionList = doc.getElementById("savedFunctionList");
          const functionJsonArea = doc.getElementById("functionJsonArea");
          const exportFunctionsButton = doc.getElementById("exportFunctionsButton");
          const importFunctionsButton = doc.getElementById("importFunctionsButton");
        
          if (!expressionInput) {
            throw new Error("Missing #expressionInput root element.");
          }
        
          function setFunctionStatus(message, tone = "muted") {
            if (!functionStatus) {
              return;
            }
        
            functionStatus.textContent = message;
            functionStatus.dataset.tone = tone;
          }
        
          function setButtonHint(message = DEFAULT_BUTTON_HINT) {
            if (!buttonHint) {
              return;
            }
        
            buttonHint.textContent = message;
          }
        
          function getButtonHelpText(button) {
            if (!button) {
              return "";
            }
        
            if (button.dataset && button.dataset.buttonKey && BUTTON_HELP_TEXTS[button.dataset.buttonKey]) {
              return BUTTON_HELP_TEXTS[button.dataset.buttonKey];
            }
        
            if (button.id && BUTTON_HELP_TEXTS[button.id]) {
              return BUTTON_HELP_TEXTS[button.id];
            }
        
            return "";
          }
        
          function applyButtonHelpMetadata() {
            const buttons = buttonBar ? Array.from(buttonBar.querySelectorAll("button")) : [];
        
            for (const button of buttons) {
              const helpText = getButtonHelpText(button);
        
              if (!helpText) {
                continue;
              }
        
              button.title = helpText;
              button.setAttribute("aria-label", helpText);
            }
          }
        
          function showButtonHintForElement(button) {
            const helpText = getButtonHelpText(button);
            setButtonHint(helpText || DEFAULT_BUTTON_HINT);
          }
        
          function loadPersistedFunctions() {
            userStore.list();
            const persistenceStatus = userStore.getPersistenceStatus();
        
            if (persistenceStatus.lastLoadError) {
              setFunctionStatus(`本地存储加载失败，已忽略旧数据: ${persistenceStatus.lastLoadError.message}`, "error");
              return;
            }
        
            setFunctionStatus("已从浏览器本地存储加载用户函数。", "success");
          }
        
          function renderFunctionList() {
            if (!savedFunctionList) {
              return;
            }
        
            const definitions = userStore.list();
            savedFunctionList.innerHTML = "";
        
            if (definitions.length === 0) {
              const empty = doc.createElement("div");
              empty.className = "function-empty";
              empty.textContent = "当前还没有已保存函数。";
              savedFunctionList.appendChild(empty);
              return;
            }
        
            for (const definition of definitions) {
              const item = doc.createElement("div");
              item.className = "function-item";
        
              const header = doc.createElement("div");
              header.className = "function-item-header";
        
              const title = doc.createElement("div");
              title.className = "function-item-title";
              title.textContent = `${definition.name}(${definition.parameters.map((parameter) => parameter.name).join(", ")})`;
        
              const actions = doc.createElement("div");
              actions.className = "function-item-actions";
        
              const editButton = doc.createElement("button");
              editButton.type = "button";
              editButton.textContent = "编辑";
              editButton.dataset.action = "edit";
              editButton.dataset.functionName = definition.name;
        
              const insertButton = doc.createElement("button");
              insertButton.type = "button";
              insertButton.textContent = "插入调用";
              insertButton.dataset.action = "insert";
              insertButton.dataset.functionName = definition.name;
        
              const deleteButton = doc.createElement("button");
              deleteButton.type = "button";
              deleteButton.textContent = "删除";
              deleteButton.dataset.action = "delete";
              deleteButton.dataset.functionName = definition.name;
              deleteButton.dataset.tone = "danger";
        
              actions.appendChild(editButton);
              actions.appendChild(insertButton);
              actions.appendChild(deleteButton);
              header.appendChild(title);
              header.appendChild(actions);
        
              const body = doc.createElement("div");
              body.className = "function-item-body";
              body.textContent = definition.metadata.source;
        
              item.appendChild(header);
              item.appendChild(body);
              savedFunctionList.appendChild(item);
            }
          }
        
          function render() {
            if (expressionInput.value !== state.rawInput) {
              expressionInput.value = state.rawInput;
            }
        
            if (doc.activeElement === expressionInput) {
              setCursor(expressionInput, state.cursorPosition);
            }
        
            latexExpression.textContent = state.latexExpression || "等待表达式输入";
            resultText.textContent = state.resultText || "等待结果";
            resultLatex.textContent = state.resultLatex || "等待 LaTeX 结果";
        
            parseError.textContent = state.parseError ? `${state.parseError.code}: ${state.parseError.message}` : "无";
            evaluationError.textContent = state.evaluationError
              ? `${state.evaluationError.code}: ${state.evaluationError.message}`
              : "无";
        
            displayMode.value = state.displayMode;
            angleUnit.value = state.angleUnit;
        
            keyboardHint.textContent = state.lastAction && state.lastAction.rejectedText
              ? `已忽略不支持的输入: ${state.lastAction.rejectedText}`
              : state.lastAction && state.lastAction.normalizedOriginalText
                ? `已将全角或特殊符号 ${state.lastAction.normalizedOriginalText} 自动转换为 ${state.lastAction.normalizedText}`
                : "数字、字母、运算符、括号和逗号都可直接键盘输入；检测到全角符号时会自动转为半角。";
          }
        
          function apply(nextState) {
            state = nextState;
            render();
          }
        
          function refreshCalculator() {
            apply(protocol.refresh(state));
            renderFunctionList();
          }
        
          function resetFunctionForm() {
            functionNameInput.value = "";
            functionParamsInput.value = "";
          }
        
          function saveFunctionFromCurrentExpression() {
            try {
              const name = functionNameInput.value.trim();
              const parameters = splitParameterInput(functionParamsInput.value);
              const bodySource = state.rawInput.trim();
              const replacing = userStore.has(name);
        
              const definition = userStore.define(
                {
                  name,
                  parameters,
                  bodySource,
                },
                { replace: replacing }
              );
        
              setFunctionStatus(`${replacing ? "已更新" : "已保存"}函数 ${definition.name}。`, "success");
              refreshCalculator();
            } catch (error) {
              setFunctionStatus(`保存失败: ${error.message}`, "error");
            }
          }
        
          function editFunction(name) {
            const definition = userStore.get(name);
        
            if (!definition) {
              setFunctionStatus(`未找到函数 ${name}。`, "error");
              return;
            }
        
            functionNameInput.value = definition.name;
            functionParamsInput.value = definition.parameters.map((parameter) => parameter.name).join(", ");
            apply(protocol.replaceRawInput(state, definition.metadata.source || ""));
            expressionInput.focus();
            setFunctionStatus(`已载入函数 ${name}，现在可以编辑并重新保存。`, "success");
          }
        
          function insertFunctionCall(name) {
            const definition = userStore.get(name);
        
            if (!definition) {
              setFunctionStatus(`未找到函数 ${name}。`, "error");
              return;
            }
        
            const template = buildInvocationTemplate(definition);
            apply(
              protocol.insertTemplate(state, template.text, template.cursorOffset, {
                kind: "savedFunctionInsert",
                functionName: name,
              })
            );
            focusExpressionInput(expressionInput, state.cursorPosition);
          }
        
          function deleteFunction(name) {
            if (!userStore.remove(name)) {
              setFunctionStatus(`未找到函数 ${name}。`, "error");
              return;
            }
        
            setFunctionStatus(`已删除函数 ${name}。`, "success");
            refreshCalculator();
          }
        
          function exportFunctions() {
            functionJsonArea.value = JSON.stringify(userStore.exportRecords(), null, 2);
            setFunctionStatus("已导出函数 JSON。", "success");
          }
        
          function importFunctions() {
            try {
              const records = JSON.parse(functionJsonArea.value || "[]");
              const loaded = userStore.loadRecords(records, { replace: true });
              setFunctionStatus(`已导入 ${loaded.length} 个函数。`, "success");
              refreshCalculator();
            } catch (error) {
              setFunctionStatus(`导入失败: ${error.message}`, "error");
            }
          }
        
          expressionInput.addEventListener("keydown", (event) => {
            if (event.ctrlKey || event.metaKey || event.altKey) {
              return;
            }
        
            switch (event.key) {
              case "ArrowLeft":
                event.preventDefault();
                apply(protocol.moveCursorBy(state, -1));
                return;
              case "ArrowRight":
                event.preventDefault();
                apply(protocol.moveCursorBy(state, 1));
                return;
              case "Home":
                event.preventDefault();
                apply(protocol.moveCursor(state, 0));
                return;
              case "End":
                event.preventDefault();
                apply(protocol.moveCursor(state, state.rawInput.length));
                return;
              case "Backspace":
                event.preventDefault();
                apply(protocol.backspace(state));
                return;
              case "Delete":
                event.preventDefault();
                apply(protocol.deleteForward(state));
                return;
              default:
                break;
            }
        
            if (event.key.length === 1) {
              event.preventDefault();
              apply(protocol.applyKeyboardText(state, event.key));
            }
          });
        
          expressionInput.addEventListener("click", () => {
            apply(protocol.moveCursor(state, expressionInput.selectionStart || 0));
          });
        
          expressionInput.addEventListener("keyup", () => {
            apply(protocol.moveCursor(state, expressionInput.selectionStart || 0));
          });
        
          expressionInput.addEventListener("paste", (event) => {
            event.preventDefault();
            const pastedText = event.clipboardData ? event.clipboardData.getData("text") : "";
            apply(protocol.applyKeyboardText(state, pastedText));
          });
        
          buttonBar.addEventListener("click", (event) => {
            const button = event.target.closest("[data-button-key]");
        
            if (!button) {
              return;
            }
        
            apply(protocol.insertButton(state, button.dataset.buttonKey));
            focusExpressionInput(expressionInput, state.cursorPosition);
          });
        
          buttonBar.addEventListener("mouseover", (event) => {
            const button = event.target.closest("button");
        
            if (!button || !buttonBar.contains(button)) {
              return;
            }
        
            showButtonHintForElement(button);
          });
        
          buttonBar.addEventListener("focusin", (event) => {
            const button = event.target.closest("button");
        
            if (!button || !buttonBar.contains(button)) {
              return;
            }
        
            showButtonHintForElement(button);
          });
        
          buttonBar.addEventListener("mouseout", (event) => {
            const button = event.target.closest("button");
        
            if (!button || !buttonBar.contains(button)) {
              return;
            }
        
            const relatedTarget = event.relatedTarget;
        
            if (relatedTarget && button.contains(relatedTarget)) {
              return;
            }
        
            if (relatedTarget && buttonBar.contains(relatedTarget)) {
              return;
            }
        
            setButtonHint();
          });
        
          buttonBar.addEventListener("focusout", (event) => {
            const nextFocused = event.relatedTarget;
        
            if (nextFocused && buttonBar.contains(nextFocused)) {
              return;
            }
        
            setButtonHint();
          });
        
          clearButton.addEventListener("click", () => {
            apply(protocol.clear(state));
            focusExpressionInput(expressionInput, state.cursorPosition);
          });
        
          backspaceButton.addEventListener("click", () => {
            apply(protocol.backspace(state));
            focusExpressionInput(expressionInput, state.cursorPosition);
          });
        
          displayMode.addEventListener("change", () => {
            apply(protocol.setDisplayMode(state, displayMode.value));
          });
        
          angleUnit.addEventListener("change", () => {
            apply(protocol.setAngleUnit(state, angleUnit.value));
          });
        
          functionSaveButton.addEventListener("click", () => {
            saveFunctionFromCurrentExpression();
          });
        
          functionResetButton.addEventListener("click", () => {
            resetFunctionForm();
            setFunctionStatus("已清空函数编辑表单。", "muted");
          });
        
          savedFunctionList.addEventListener("click", (event) => {
            const actionButton = event.target.closest("[data-action]");
        
            if (!actionButton) {
              return;
            }
        
            const { action, functionName } = actionButton.dataset;
        
            switch (action) {
              case "edit":
                editFunction(functionName);
                return;
              case "insert":
                insertFunctionCall(functionName);
                return;
              case "delete":
                deleteFunction(functionName);
                return;
              default:
                return;
            }
          });
        
          exportFunctionsButton.addEventListener("click", exportFunctions);
          importFunctionsButton.addEventListener("click", importFunctions);
        
          loadPersistedFunctions();
          applyButtonHelpMetadata();
          setButtonHint();
          refreshCalculator();
        
          return {
            getState() {
              return state;
            },
            protocol,
            userStore,
          };
        }
        
        if (typeof window !== "undefined") {
          window.addEventListener("DOMContentLoaded", () => {
            mountCalculatorApp(window.document);
          });
        }
        
        module.exports = {
          buildInvocationTemplate,
          mountCalculatorApp,
          splitParameterInput,
        };
        
      },
            {
        "../core/evaluator": "core/evaluator/index.js",
        "../core/parser": "core/parser/index.js",
        "../core/format": "core/format/index.js",
        "../core/functions": "core/functions/index.js",
        "./input-protocol": "web/input-protocol.js",
        "./user-function-storage": "web/user-function-storage.js"
      }
    ],
    "web/input-protocol.js": [
      function(module, exports, require) {
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
        
      },
            {
        "../core/parser": "core/parser/index.js",
        "../core/evaluator": "core/evaluator/index.js",
        "../core/format": "core/format/index.js"
      }
    ],
    "web/user-function-storage.js": [
      function(module, exports, require) {
        "use strict";
        
        const DEFAULT_STORAGE_KEY = "latex_calculator_user_functions";
        
        function resolveStorage(storage) {
          if (storage) {
            return storage;
          }
        
          if (typeof window !== "undefined" && window.localStorage) {
            return window.localStorage;
          }
        
          return null;
        }
        
        function createLocalStorageRecordPersistence({
          storage = null,
          storageKey = DEFAULT_STORAGE_KEY,
        } = {}) {
          const targetStorage = resolveStorage(storage);
        
          function loadRecords() {
            if (!targetStorage) {
              return [];
            }
        
            const source = targetStorage.getItem(storageKey);
        
            if (!source) {
              return [];
            }
        
            const records = JSON.parse(source);
        
            if (!Array.isArray(records)) {
              throw new TypeError("Persisted user function data must be a JSON array.");
            }
        
            return records;
          }
        
          function saveRecords(records) {
            if (!targetStorage) {
              return;
            }
        
            targetStorage.setItem(storageKey, JSON.stringify(records));
          }
        
          return Object.freeze({
            storageKey,
            loadRecords,
            saveRecords,
          });
        }
        
        module.exports = {
          DEFAULT_STORAGE_KEY,
          createLocalStorageRecordPersistence,
        };
        
      },
            {}
    ]
  },
  "web/app-entry.js"
);
