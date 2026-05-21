# 模块 8：函数注册中心

模块 8 负责把“内建函数定义”和“用户函数定义”收束成统一注册中心。

## 当前实现位置

- `core/functions/builtins.js`
- `core/functions/registry.js`
- `core/functions/index.js`
- `tests/functions/registry.test.js`

## 目标

模块 8 解决两个问题：

1. 默认内建函数应该放在哪里
2. Evaluator 应该如何统一查找内建函数和用户函数

## 当前结构

### `builtins.js`

职责：

- 定义默认内建函数
- 提供 `DEFAULT_BUILTIN_FUNCTIONS`
- 提供 `createDefaultBuiltinFunctions()`

### `registry.js`

职责：

- 注册内建函数
- 注册用户函数
- 查找函数
- 列出函数
- 导出合并后的函数表
- 校验调用参数个数

## 当前对外接口

### `createFunctionRegistry(options?)`

可选输入：

- `builtinDefinitions`
- `userDefinitions`

返回对象当前支持：

- `registerBuiltin(definition)`
- `registerUserFunction(definition)`
- `hasFunction(name)`
- `getFunction(name)`
- `requireFunction(name)`
- `listFunctions(options?)`
- `getBuiltinDefinitions()`
- `getUserDefinitions()`
- `toTable()`
- `validateInvocationArity(name, actualCount, rule)`

## 当前注册规则

### 内建函数

- 只能注册 `kind = builtin` 的定义
- 不允许和已有内建函数重名
- 不允许和已有用户函数重名

### 用户函数

- 只能注册 `kind = user_defined` 的定义
- 不允许覆盖内建函数
- 不允许重复注册同名用户函数

## 当前 Evaluator 接入方式

模块 5 现在不再自行拼接函数表，而是：

1. 创建一个函数注册中心
2. 自动载入默认内建函数
3. 再把 `context.functions` 里的定义注册进去
4. 求值时通过 `requireFunction()` 查找

这意味着：

- 新增内建函数不需要修改 Evaluator 主流程
- 后续用户函数存储功能也能直接接入这个中心

## 当前已验证能力

测试已覆盖：

- 默认内建函数存在
- 用户函数注册
- 重复用户函数拦截
- 未定义函数报错
- 调用参数个数校验
- 内建函数和用户函数合并导出

## 兼容性说明

为了避免破坏现有结构：

- `core/evaluator/builtins.js` 仍然保留
- 但它现在只是转发到 `core/functions/builtins.js`

这样旧引用路径不会立刻失效。
