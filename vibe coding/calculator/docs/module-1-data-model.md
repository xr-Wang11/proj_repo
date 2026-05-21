# 模块 1：统一数据模型

这份文档对应项目的第一个正式实现模块。目标不是开始计算，而是先把整个项目未来要共享的数据协议固定下来。

## 目标

模块 1 必须解决三个问题：

1. 后续模块交换什么对象。
2. 这些对象的字段边界是什么。
3. 哪些对象可以直接在 CLI、网页 UI、Parser、Evaluator 之间复用。

这一步完成后，Tokenizer、Parser、求值器和格式化器都不能再自行发明新结构。

## 文件组成

当前模块 1 落在 `core/model` 下，文件职责如下：

- `constants.js`：统一枚举和默认常量。
- `shared.js`：模型层通用校验函数。
- `span.js`：位置范围对象。
- `tokens.js`：Token 工厂。
- `ast.js`：AST 节点工厂。
- `values.js`：复数、相量、求值结果、全局选项对象。
- `errors.js`：结构化错误对象。
- `functions.js`：内建函数和未来用户函数的数据结构。
- `context.js`：求值上下文。
- `index.js`：统一导出入口。

## 1. Token 模型

Token 由 `createToken()` 创建，固定字段如下：

- `type`
- `value`
- `start`
- `end`
- `span`

规则：

- `start/end` 是原始输入字符串中的字符位置。
- `span` 是 `{ start, end }` 的冻结对象。
- Token 类型只能来自 `TOKEN_TYPES`。

当前支持的类型：

- `NUMBER`
- `IDENTIFIER`
- `OPERATOR`
- `LPAREN`
- `RPAREN`
- `COMMA`
- `EOF`

`createEOFToken(position)` 用于统一创建输入结束符。

## 2. Span 模型

Span 是整个项目的位置协议。后续错误定位、AST 节点、Token 都依赖它。

字段：

- `start`
- `end`

规则：

- 两者必须是非负整数。
- `end` 不能小于 `start`。

工具函数：

- `createSpan(start, end)`
- `createPointSpan(index)`
- `normalizeSpan(value)`
- `mergeSpans(left, right)`

## 3. AST 模型

AST 节点全部通过工厂函数创建，并且都具有：

- `kind`
- `span`

当前定义的节点类型：

- `NumberLiteral`
- `Identifier`
- `UnaryExpression`
- `BinaryExpression`
- `FunctionCall`
- `ConversionExpression`

### NumberLiteral

字段：

- `kind`
- `span`
- `raw`
- `value`

说明：

- `raw` 保留原始数值文本。
- `value` 是已经解析好的有限数字。

### Identifier

字段：

- `kind`
- `span`
- `name`

### UnaryExpression

字段：

- `kind`
- `span`
- `operator`
- `argument`

### BinaryExpression

字段：

- `kind`
- `span`
- `operator`
- `left`
- `right`

### FunctionCall

字段：

- `kind`
- `span`
- `callee`
- `args`

说明：

- `callee` 固定为 `Identifier` 节点。
- `args` 固定为 AST 节点数组。

### ConversionExpression

字段：

- `kind`
- `span`
- `source`
- `targetForm`
- `angleUnit`

说明：

- `targetForm` 目前限定为 `rect` 或 `polar`。
- 第一阶段 parser 即使先不用这个节点，也必须保留定义。

## 4. 数值模型

### ComplexValue

由 `createComplexValue()` 创建。

字段：

- `kind`
- `re`
- `im`

规则：

- 实数也用同一个对象表示。
- 内部通过 `normalizeNearZero()` 统一消除 `-0` 和极小残差。
- 当前模型层只接受有限数字。

### PhasorValue

由 `createPhasorValue()` 创建。

字段：

- `kind`
- `magnitude`
- `angle`
- `angleUnit`

规则：

- `angleUnit` 仅允许 `deg` 或 `rad`。
- `magnitude` 当前要求非负。

### EvaluationResult

由 `createEvaluationResult()` 创建。

字段：

- `value`
- `displayType`
- `text`
- `latex`
- `metadata`

说明：

- `value` 将来由 evaluator 填入。
- `displayType` 当前支持 `real`、`complex_rect`、`complex_polar`、`phasor`、`error`。
- `metadata` 用于扩展显示意图，不污染主字段。

### EvaluationOptions

由 `createEvaluationOptions()` 创建。

字段：

- `angleUnit`
- `outputMode`
- `precision`
- `zeroTolerance`

这组对象会直接进入未来的 `EvaluationContext`。

## 5. 错误模型

所有核心错误都必须走 `createCalculatorError()` 或其专用工厂。

统一字段：

- `kind`
- `code`
- `message`
- `position`
- `context`
- `hint`
- `cause`

已定义错误种类：

- `ModelError`
- `LexError`
- `ParseError`
- `NameError`
- `ArityError`
- `MathDomainError`
- `ConversionError`
- `UnsupportedFeatureError`

已提供工厂：

- `createLexError`
- `createParseError`
- `createNameError`
- `createArityError`
- `createMathDomainError`
- `createConversionError`
- `createUnsupportedFeatureError`

## 6. 函数定义模型

### FunctionParameter

由 `createFunctionParameter()` 创建。

字段：

- `name`
- `description`

规则：

- 参数名复用变量命名规则。
- 不允许重复参数名。

### BuiltinFunctionDefinition

由 `createBuiltinFunctionDefinition()` 创建。

字段：

- `kind`
- `name`
- `parameters`
- `bodyAst`
- `executor`
- `metadata`

说明：

- `bodyAst` 固定为 `null`
- `executor` 必须是函数

### UserFunctionDefinition

由 `createUserFunctionDefinition()` 创建。

字段：

- `kind`
- `name`
- `parameters`
- `bodyAst`
- `executor`
- `metadata`

说明：

- `bodyAst` 必须是 AST 节点
- `executor` 固定为 `null`
- 用户函数名不能占用保留名称

## 7. 求值上下文模型

由 `createEvaluationContext()` 创建。

字段：

- `constants`
- `variables`
- `functions`
- `options`

默认常量位于 `DEFAULT_CONSTANTS`：

- `pi`
- `e`
- `i`

规则：

- `constants` 和 `variables` 目前都要求值为 `ComplexValue`
- `functions` 中的每一项都必须是合法函数定义

## 8. 设计约束

模块 1 当前刻意做了这几个限制：

- 不接受 NaN 和 Infinity 进入值对象
- 不允许未命名或空字符串对象进入模型
- 不允许后续模块自己构造“长得像但不完全一致”的对象
- 所有工厂函数返回冻结对象，降低后续误改风险

## 9. 下一步

模块 1 完成后，下一步应该进入 Tokenizer。Tokenizer 只能依赖这里提供的：

- `TOKEN_TYPES`
- `createToken`
- `createEOFToken`
- `createSpan`
- `createLexError`

不要在 Tokenizer 中重新定义 token 结构。
