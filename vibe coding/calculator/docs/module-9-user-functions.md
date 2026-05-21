# 模块 9：用户函数接口占位

模块 9 负责把“保存公式为函数”的接口边界先固定下来，但当前不做磁盘持久化。

## 当前实现位置

- `core/functions/user-functions.js`
- `core/functions/index.js`
- `tests/functions/user-functions.test.js`

## 目标

这一层解决的是“接口先定型”：

1. 如何把函数名、参数和公式字符串编译成用户函数定义
2. 如何在不落盘的前提下暂存用户函数
3. 如何把用户函数定义转换成未来可持久化的记录结构

## 当前对外接口

### `compileUserFunctionDefinition(spec)`

输入：

- `name`
- `parameters`
- `bodySource`
- `metadata`

输出：

- `UserFunctionDefinition`

行为：

- 先调用 Parser 把 `bodySource` 转成 AST
- 再生成用户函数定义对象
- 自动把 `bodySource` 存进 `metadata.source`

### `validateUserFunctionSpec(spec, options?)`

输入：

- 用户函数草案
- 可选注册中心

输出：

- `{ valid, definition, error }`

用途：

- 在 CLI 或未来网页 UI 中做预检查

### `serializeUserFunctionDefinition(definition)`

输出：

- 可序列化记录对象

字段当前包含：

- `name`
- `parameters`
- `bodySource`
- `metadata`

### `deserializeUserFunctionRecord(record)`

输入未来可持久化的记录对象，重新编译成用户函数定义。

### `createInMemoryUserFunctionStore(options?)`

返回一个内存存储层，当前支持：

- `define(spec, options?)`
- `save(definition, options?)`
- `get(name)`
- `has(name)`
- `list()`
- `remove(name)`
- `exportRecords()`
- `loadRecords(records, options?)`
- `toDefinitionTable()`

## 当前规则

### 命名规则

- 复用现有用户函数命名规则
- 不允许使用保留名称
- 不允许覆盖内建函数

### 参数规则

- 复用现有变量命名规则
- 不允许重复参数名

### 递归规则

当前阶段明确禁止直接递归。

例如：

- `f(x) = f(x)` 会被拒绝

原因：

- 当前只是接口占位层
- 递归会牵涉执行策略、深度限制、错误处理和性能约束

## 当前存储策略

当前只提供内存存储：

- 不落盘
- 不改写项目文件
- 主要用于先把协议定死

未来落盘时，只需要把 `exportRecords()` 的结果保存起来，再通过 `loadRecords()` 恢复即可。

## 当前测试覆盖

已覆盖：

- 从源码编译用户函数
- 序列化与反序列化
- 内存存储增删查列出
- 通过注册中心做重名检查
- 拒绝直接递归
- 拒绝重复保存

## 与后续模块的关系

做到这里，后续不论是 CLI 还是网页 UI，只要采集到：

- 函数名
- 参数列表
- 公式字符串

就已经可以生成用户函数定义并暂存在内存中。

未来真正做持久化时，不需要再改 Parser、Evaluator 或函数注册中心，只需要在这一层外面接一个文件读写适配器。
