# 模块 6：LaTeX 渲染器

模块 6 负责把 AST 和求值结果转成 LaTeX。

## 当前实现位置

- `core/format/latex.js`
- `core/format/index.js`
- `tests/format/latex.test.js`

## 目标

模块 6 只做显示，不做求值，不修改 AST，也不参与 CLI 输出。

它负责两条主线：

1. `AST -> 表达式 LaTeX`
2. `EvaluationResult -> 结果 LaTeX`

## 当前对外接口

### `renderAstToLatex(ast)`

输入：

- `ASTNode`

输出：

- LaTeX 字符串

### `renderSourceToLatex(input)`

输入：

- 表达式字符串

输出：

- 表达式 LaTeX

说明：

- 内部会先走 Parser

### `renderEvaluationResultToLatex(result)`

输入：

- `EvaluationResult`

输出：

- 结果 LaTeX

### `evaluateSourceToLatex(input, context?)`

输入：

- 表达式字符串
- 可选求值上下文

输出：

- 结果 LaTeX

说明：

- 内部会先走 Evaluator

## 当前渲染规则

### 数字

- 普通数字直接输出
- 科学计数法渲染为 `a \times 10^{b}`

### 标识符

- `pi -> \pi`
- `deg -> \mathrm{deg}`
- `rad -> \mathrm{rad}`
- `e -> e`
- `i -> i`
- 其他多字符标识符用 `\mathrm{...}`

### 二元运算

- 加减保持中缀
- 乘法统一渲染为 `\cdot`
- 除法统一渲染为 `\frac{}{}`
- 幂渲染为 `a^{b}`

### 一元运算

- `-x`
- `+(x)` 这类形式按最小括号原则渲染

### 函数

当前规则：

- `sin/cos/tan/log/exp/arg` 使用标准 LaTeX 函数名
- `sqrt(x)` 渲染为 `\sqrt{x}`
- `abs(x)` 渲染为 `\left|x\right|`
- `conj(x)` 渲染为 `\overline{x}`
- 其他函数使用 `\operatorname{...}`

### 转换节点

- `to_rect(z)` 渲染为 `\operatorname{to\_rect}\left(z\right)`
- `to_polar(z,deg)` 渲染为 `\operatorname{to\_polar}\left(z,\mathrm{deg}\right)`

### 结果

复数直角坐标：

- `3 + 4i`
- `3 - 4i`
- `i`
- `-i`

相量：

- 度制：`5 \angle 53.13^{\circ}`
- 弧度制：`5 \angle 0.927\,\mathrm{rad}`

## 当前显示策略

如果 `EvaluationResult.displayType` 为 `complex_polar` 且存在 `metadata.polarValue`：

- 优先按相量形式渲染

否则：

- `ComplexValue` 按直角坐标渲染
- `PhasorValue` 按相量渲染

## 当前测试覆盖

已覆盖：

- 四则表达式的表达式 LaTeX
- 三角函数
- 根号
- 转换表达式
- 复数结果
- 相量结果
- `evaluateSourceToLatex()` 联动 Evaluator

## 前几个模块的检查

模块 6 接入后，建议继续回归：

- 模块 2 Tokenizer
- 模块 3 Parser
- 模块 4 数学值系统
- 模块 5 Evaluator

如果这些测试全部通过，就说明 LaTeX 层没有反向污染核心计算层。
