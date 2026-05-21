# 模块 5：Evaluator

模块 5 负责把 AST 和数学值系统接起来。

## 当前实现位置

- `core/evaluator/builtins.js`
- `core/evaluator/evaluator.js`
- `core/evaluator/index.js`
- `tests/evaluator/evaluator.test.js`

## 目标

模块 5 完成后，系统第一次具备“输入表达式并得到数值结果”的能力。

也就是说：

- 模块 4 只会算值
- 模块 5 才会读 AST 并调用模块 4

## 当前对外接口

### `evaluate(ast, context?)`

输入：

- `ASTNode`
- 可选上下文

输出：

- `EvaluationResult`

### `evaluateSource(input, context?)`

输入：

- 表达式字符串
- 可选上下文

输出：

- `EvaluationResult`

说明：

- 内部会先调用 Parser，再调用 Evaluator

### `evaluateToValue(ast, context?)`

输出：

- 仅返回内部数值对象

### `evaluateSourceToValue(input, context?)`

输出：

- 仅返回内部数值对象

## 当前支持的 AST 节点

- `NumberLiteral`
- `Identifier`
- `UnaryExpression`
- `BinaryExpression`
- `FunctionCall`
- `ConversionExpression`

## 当前标识符解析规则

优先级：

1. `context.variables`
2. `context.constants`

未命中时抛出：

- `NAME_UNKNOWN_IDENTIFIER`

## 当前二元运算支持

- `+`
- `-`
- `*`
- `/`
- `^`

这些运算都直接调用模块 4 的数学 API。

## 当前内建函数

- `sin`
- `cos`
- `tan`
- `sqrt`
- `exp`
- `log`
- `abs`
- `arg`
- `re`
- `im`
- `conj`
- `rect`
- `polar`

## 当前转换节点处理

### `to_rect(expr)`

结果：

- 保留内部值为 `ComplexValue`
- `displayType` 标记为 `complex_rect`

### `to_polar(expr, deg|rad?)`

结果：

- 保留内部值为 `ComplexValue`
- `displayType` 标记为 `complex_polar`
- 在 `metadata.polarValue` 中附带相量视图

## 当前错误策略

Evaluator 当前会抛出结构化错误，包括：

- `NameError`
- `ArityError`
- `MathDomainError`
- `ConversionError`
- `UnsupportedFeatureError`

## 当前已打通的能力

现在已经可以直接进行最基础表达式求值，例如：

- `3 + 4*2`
- `(1+2*i)*(3-4*i)`
- `i^2`
- `abs(3+4*i)`
- `rect(3,4)`
- `polar(5,53.13,deg)`
- `to_polar(3+4*i,deg)`

## 当前测试覆盖

已覆盖：

- 纯四则表达式
- 复数乘法
- 幂
- 常量 `i`
- 内建函数
- 相量转换
- 变量上下文
- 未定义名称错误
- 参数个数错误
- 要求实数参数时的错误

## 前几个模块的检查结果

当前重新运行的模块测试全部通过：

- 模块 2 Tokenizer
- 模块 3 Parser
- 模块 4 数学值系统

暂时没有发现阻塞模块 5 的结构性问题。

当前一个明确的非阻塞限制是：

- `context.variables` 仍然只接受 `ComplexValue`
- 这意味着相量变量如果要存入上下文，需要先转成复数表示

这个限制不影响当前阶段求值功能。
