# 模块 2：Tokenizer

模块 2 的目标是把原始输入字符串稳定切分为 Token 序列，不做优先级处理，不做数学语义推断。

## 当前实现位置

- `core/lexer/tokenizer.js`
- `core/lexer/index.js`
- `tests/lexer/tokenizer.test.js`

## 对外接口

### `tokenize(input, options?)`

输入：

- `input: string`
- `options.includeEOF?: boolean`

输出：

- `Token[]`

行为：

- 默认在结尾附加 `EOF`
- 出现非法字符或非法数字格式时抛出结构化 `LexError`

### `tokenizeToDebug(input, options?)`

输出简化后的调试结构，便于测试：

- `type`
- `value`
- `start`
- `end`

## 当前支持的 token

- `NUMBER`
- `IDENTIFIER`
- `OPERATOR`
- `LPAREN`
- `RPAREN`
- `COMMA`
- `EOF`

## 当前支持的输入形式

### 数字

支持：

- 整数，如 `12`
- 小数，如 `12.34`
- 前导点小数，如 `.5`
- 尾随点小数，如 `5.`
- 科学计数法，如 `1e3`、`2.5e-4`、`.5e+2`

不支持：

- 单独的 `.`
- 缺指数数字的写法，如 `1e`

### 标识符

当前词法层接受：

- 字母开头
- 或下划线开头
- 后续包含字母、数字、下划线

说明：

- 这里故意比“合法变量名”更宽松。
- Tokenizer 负责切分，不负责判定某个标识符是否可以作为用户变量名。
- 后续 Parser / 用户函数模块再结合命名规则判定合法性。

### 运算符和符号

支持：

- `+`
- `-`
- `*`
- `/`
- `^`
- `(`
- `)`
- `,`

### 空白

支持跳过：

- 空格
- `\\t`
- `\\n`
- `\\r`

## 明确不支持的内容

- 隐式乘法，如 `2(3+4)`
- 特殊相量字符，如 `∠`
- 任何未列出的标点符号

## 错误策略

当前 Tokenizer 会抛出结构化 `LexError`，包括：

- `LEX_INVALID_CHARACTER`
- `LEX_INVALID_NUMBER`
- `LEX_INVALID_EXPONENT`

错误对象中包含：

- `code`
- `message`
- `position`
- `context`
- `hint`

## 当前最小测试集

已覆盖：

- `3 + 4*i`
- `polar(5, 30, deg)`
- `.5e-2 + foo_bar9`
- `1e`
- `5∠30`

## 下一步

模块 2 完成后，模块 3 Parser 应直接消费这里返回的 `Token[]`，不要自己重新扫描原始字符串。
