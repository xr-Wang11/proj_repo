# 模块 7：文本格式化器

模块 7 负责把求值结果转成适合命令行显示的文本。

## 当前实现位置

- `core/format/text.js`
- `core/format/index.js`
- `tests/format/text.test.js`

## 目标

模块 7 不做求值，不渲染 LaTeX，只负责 CLI 文本输出。

## 当前对外接口

### `renderEvaluationResultToText(result, options?)`

输入：

- `EvaluationResult`
- 可选格式化参数

输出：

- 文本字符串

### `evaluateSourceToText(input, context?, options?)`

输入：

- 表达式字符串
- 可选求值上下文
- 可选格式化参数

输出：

- 文本字符串

### 辅助接口

- `formatNumberToText(value, precision?)`
- `renderComplexRectToText(value, options?)`
- `renderPhasorToText(value, options?)`
- `renderDebugResultToText(result, options?)`

## 当前支持的输出模式

- `plain`
- `rect`
- `polar`
- `debug`

说明：

- `plain` 会优先尊重 `EvaluationResult.displayType`
- `rect` 强制输出直角坐标文本
- `polar` 强制输出相量文本
- `debug` 输出面向开发调试的摘要

## 当前文本规则

### 数字

- 自动去掉无意义尾零
- 极大或极小数值使用科学计数法文本

### 复数直角坐标

示例：

- `3 + 4i`
- `3 - 4i`
- `i`
- `-i`
- `5`

### 相量

示例：

- `5 ∠ 53.13 deg`
- `5 ∠ 0.927 rad`

### Debug

示例形式：

- `displayType=complex_polar | value=Complex(3, 4) | metadataKeys=preferredAngleUnit,polarValue,preferredDisplayType`

## 当前显示选择策略

### 默认模式

如果结果对象带有：

- `displayType = complex_polar`
- 或 `displayType = phasor`

则默认输出相量文本。

否则默认输出直角坐标文本。

### 强制相量模式

如果调用方指定 `outputMode: polar`：

- 优先使用 `metadata.polarValue`
- 没有则由当前 `ComplexValue` 即时转相量

### 强制直角模式

如果调用方指定 `outputMode: rect`：

- 会把结果统一格式化成直角坐标文本

## 当前测试覆盖

已覆盖：

- 数字文本格式
- 复数直角坐标格式
- 相量格式
- `plain / rect / polar / debug`
- 与 Evaluator 的联动

## 当前状态

做到这里，模块 5 的求值能力已经可以直接通过模块 7 输出成命令行可读文本。

这意味着距离真正的 CLI 入口只差交互层本身了。
