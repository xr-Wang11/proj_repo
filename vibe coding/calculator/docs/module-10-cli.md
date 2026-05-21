# 模块 10：CLI 交互层

模块 10 负责把前面已经完成的核心能力接到真正的命令行交互上。

## 当前实现位置

- `cli/session.js`
- `cli/index.js`
- `tests/cli/session.test.js`

## 结构

模块 10 分为两层：

### `cli/session.js`

职责：

- 管理 CLI 会话状态
- 处理命令
- 处理表达式求值
- 返回结构化响应

这是可测试核心，不依赖真实终端。

### `cli/index.js`

职责：

- 启动 `readline` REPL
- 把终端输入交给 `cli/session.js`
- 把响应打印到终端

这是很薄的一层，只做 I/O。

## 当前会话状态

- `angleUnit`
- `outputMode`
- `showLatex`
- `history`

## 当前支持的命令

- `:help`
- `:quit`
- `:exit`
- `:mode <plain|rect|polar|debug>`
- `:angle <deg|rad>`
- `:latex <on|off>`
- `:functions`
- `:history`

## 当前表达式行为

普通输入会走：

1. Parser
2. Evaluator
3. 文本格式化器
4. 可选 LaTeX 渲染

默认输出形如：

- `= 3 + 4i`
- `= 5 ∠ 53.13 deg`

如果开启 `:latex on`，则会额外输出：

- `latex: ...`

## 当前错误输出

CLI 会把结构化错误转换成多行文本，例如：

- 错误类型和 code
- 位置
- 提示

## 当前测试覆盖

已覆盖：

- `:help`
- 普通表达式求值
- 切换 `mode`
- 切换 `angle`
- 切换 `latex`
- `:history`
- `:functions`
- 求值错误
- `:quit`
- 会话快照

## 如何启动

当前可以直接运行：

```powershell
node cli\index.js
```

启动后输入：

```text
3 + 4*i
:mode polar
:angle deg
3 + 4*i
:help
:quit
```

## 当前限制

- 还没有把模块 9 的用户函数定义命令暴露到 CLI
- 历史记录只保存在当前会话内
- 没有自动补全
- 没有持久化配置

这些限制都不影响第一版 CLI 的核心交互能力。
