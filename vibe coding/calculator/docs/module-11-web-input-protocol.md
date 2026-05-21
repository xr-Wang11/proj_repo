# 模块 11：网页输入协议

模块 11 负责把未来 HTML 网页 UI 的输入协议先固定下来，但当前不直接做完整网页界面。

## 当前实现位置

- `web/input-protocol.js`
- `tests/web/input-protocol.test.js`

## 目标

模块 11 解决的是“网页应该如何和核心引擎交互”：

1. 网页要维护哪些状态
2. 键盘输入与按钮输入如何分工
3. 光标、插入模板、删除操作如何定义
4. 每次输入后如何同步解析结果、LaTeX 和求值结果

## 当前状态模型

`createWebInputProtocol().createState()` 创建的状态对象当前包含：

- `rawInput`
- `cursorPosition`
- `parsedAst`
- `latexExpression`
- `evaluationResult`
- `resultText`
- `resultLatex`
- `parseError`
- `evaluationError`
- `displayMode`
- `angleUnit`
- `lastAction`

## 键盘输入规则

当前协议明确把键盘输入限制为：

- 数字
- 字母
- 下划线
- 小数点
- 空白

这意味着：

- `3`
- `53.13`
- `pi`
- `deg`

可以直接键盘输入。

而这些符号不允许直接走键盘通道：

- `+`
- `-`
- `*`
- `/`
- `^`
- `(`
- `)`
- `,`

这些都必须通过按钮协议插入。

## 按钮协议

当前通过 `insertButton(state, buttonKey)` 完成按钮插入。

已内置按钮类型包括：

- 运算符按钮：`plus` `minus` `multiply` `divide` `power`
- 结构按钮：`comma` `lparen` `rparen`
- 函数按钮：`sin` `cos` `tan` `sqrt` `exp` `log` `abs` `arg` `conj` `rect` `polar` `to_rect` `to_polar`
- 常量按钮：`pi` `e` `i` `deg` `rad`

## 模板插入规则

按钮不是简单追加，而是在当前光标位置插入模板。

例如：

- `sin -> sin()`，光标定位到括号内
- `rect -> rect(,)`，光标定位到第一个参数位置
- `polar -> polar(,,)`，光标定位到第一个参数位置

## 当前支持的操作

- `applyKeyboardText(state, text)`
- `insertButton(state, buttonKey)`
- `moveCursor(state, position)`
- `moveCursorBy(state, delta)`
- `backspace(state)`
- `deleteForward(state)`
- `replaceRawInput(state, rawInput)`
- `clear(state)`
- `setDisplayMode(state, mode)`
- `setAngleUnit(state, unit)`

## 当前同步策略

每次状态变更后，协议层会自动尝试：

1. 解析 `rawInput`
2. 生成表达式 LaTeX
3. 求值
4. 生成结果文本与结果 LaTeX

如果解析失败：

- `parseError` 会被填充

如果解析成功但求值失败：

- `evaluationError` 会被填充

## 浏览器适配策略

当前协议模块本身尽量做成纯状态机。

如果运行环境支持 Node 风格 `require`：

- 会自动接入当前项目的 Parser、Evaluator 和格式化器

如果未来在浏览器里单独加载：

- 可以显式传入适配器
- 协议层本身不依赖 DOM

## 当前测试覆盖

已覆盖：

- 初始状态
- 键盘输入
- 按钮模板插入
- 光标移动
- 删除和退格
- 表达式 LaTeX 同步
- 求值文本同步
- `displayMode` 和 `angleUnit` 状态切换
- 非法键盘字符拒绝
- 解析错误状态

## 当前限制

- 还没有真正的网页界面
- 还没有按钮分组布局
- 还没有 selection 范围替换
- 当前协议只处理单光标，不处理多选区

这些限制不影响它作为未来网页 UI 的稳定输入协议层。
