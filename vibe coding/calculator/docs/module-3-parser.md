# 模块 3：Parser

模块 3 的目标是把模块 2 输出的 `Token[]` 转换成统一 AST，不做求值。

## 当前实现位置

- `core/parser/parser.js`
- `core/parser/index.js`
- `tests/parser/parser.test.js`

## 对外接口

### `parse(tokens)`

输入：

- `Token[]`

输出：

- `ASTNode`

行为：

- 读取一整个表达式
- 末尾必须消费到 `EOF`
- 解析失败时抛出结构化 `ParseError`

### `parseSource(input)`

输入：

- `string`

输出：

- `ASTNode`

说明：

- 这是便捷入口，内部会先调用 Tokenizer，再调用 `parse()`

## 当前支持的语法

- 数字字面量
- 标识符
- 前缀一元 `+` `-`
- 二元 `+ - * / ^`
- 括号表达式
- 函数调用

## 当前优先级

从高到低：

1. 函数调用与括号
2. 幂 `^`
3. 一元 `+ -`
4. 乘除 `* /`
5. 加减 `+ -`

说明：

- 幂运算当前为右结合
- 因为幂优先级高于一元运算，所以 `-2^3^2` 会被解析成 `-(2^(3^2))`

## 节点映射策略

### NumberLiteral

来源：

- `NUMBER`

### Identifier

来源：

- `IDENTIFIER`

### UnaryExpression

来源：

- 前缀 `+x`
- 前缀 `-x`

### BinaryExpression

来源：

- `a + b`
- `a - b`
- `a * b`
- `a / b`
- `a ^ b`

### FunctionCall

来源：

- `sin(x)`
- `polar(5,30,deg)`

要求：

- 只有标识符可以作为调用目标

### ConversionExpression

当前 parser 对两个显式转换函数做了专门映射：

- `to_rect(expr)`
- `to_polar(expr)`
- `to_polar(expr, deg|rad)`

说明：

- 这两个函数会直接生成 `ConversionExpression`
- 其余函数调用仍然生成 `FunctionCall`

## 当前错误策略

Parser 会抛出结构化 `ParseError`，当前覆盖的主要错误包括：

- `PARSE_UNEXPECTED_TOKEN`
- `PARSE_UNEXPECTED_EOF`
- `PARSE_EXPECTED_EOF`
- `PARSE_MISSING_RPAREN`
- `PARSE_MISSING_ARGUMENT`
- `PARSE_TRAILING_COMMA`
- `PARSE_INVALID_CALLEE`
- `PARSE_TOO_MANY_ARGUMENTS`
- `PARSE_INVALID_ANGLE_UNIT`

## 当前明确不支持的内容

- 隐式乘法，如 `2(3+4)`
- 任意表达式作为函数调用目标，如 `(sin)(x)`
- 特殊字符相量语法，如 `5∠30`

## 当前最小测试集

已覆盖：

- `3 + 4*i`
- `-2^3^2`
- `sin(pi/4)`
- `to_polar(3+4*i,deg)`
- `to_rect(polar(5,30,deg))`
- `2 + * 3`
- `polar(10,)`
- `to_polar(z,foo)`
- `sin(pi/4`

## 下一步

模块 3 完成后，模块 4 数学值系统和模块 5 Evaluator 都应直接消费这里的 AST，不再回看原始字符串。
