# 模块 4：数学值系统

模块 4 负责“值层计算”，只处理数值对象，不处理 AST。

## 当前实现位置

- `core/math/complex.js`
- `core/math/index.js`
- `tests/math/complex.test.js`

## 目标

这一层提供三类能力：

1. 复数四则运算
2. 复数与相量的双向转换
3. 为模块 5 Evaluator 提供统一数学 API

## 当前对外接口

### 基础转换

- `asComplexValue(value)`
- `fromRectangularParts(re, im)`
- `fromPhasorParts(magnitude, angle, angleUnit)`
- `fromPhasorValue(phasor)`
- `toPhasorValue(complex, angleUnit)`

### 四则与幂

- `addComplex(left, right)`
- `subtractComplex(left, right)`
- `multiplyComplex(left, right)`
- `divideComplex(left, right)`
- `powerComplex(base, exponent)`

### 常用复数操作

- `conjugateComplex(value)`
- `magnitudeOfComplex(value)`
- `angleOfComplex(value, angleUnit)`
- `realPart(value)`
- `imaginaryPart(value)`

### 角度工具

- `degreesToRadians(degrees)`
- `radiansToDegrees(radians)`
- `normalizeAngle(angle, angleUnit)`
- `toAngleUnit(angleInRadians, angleUnit)`

### 辅助工具

- `isNearlyZero(value, tolerance)`
- `isZeroComplex(value, tolerance)`
- `complexExp(value)`
- `complexLog(value)`

## 输入规则

当前 `asComplexValue()` 接受三种输入：

- `ComplexValue`
- 有限实数
- `PhasorValue`

输出统一归一化成 `ComplexValue`。

## 当前错误策略

模块 4 不返回裸异常字符串，而是使用结构化错误对象。

当前已覆盖：

- `MATH_DIVISION_BY_ZERO`
- `MATH_LOG_ZERO_UNDEFINED`
- `MATH_ZERO_TO_ZERO_UNDEFINED`
- `MATH_INVALID_ZERO_POWER`
- `CONVERSION_ZERO_ANGLE_UNDEFINED`

## 角度规则

- 内部三角运算统一使用弧度
- 只有输入输出边界处理 `deg`
- `toPhasorValue(z, deg)` 会输出角度制相量
- `fromPhasorParts(..., deg)` 会先转弧度再计算

## 当前幂运算策略

`powerComplex(base, exponent)` 当前采用主值分支：

- 非零底数：通过 `exp(exponent * log(base))` 计算
- `0^0`：报错
- `0` 的负指数或复指数：报错
- `0` 的正实指数：返回 `0`

## 已验证能力

测试已覆盖：

- 复数加减乘除
- `abs(3+4i)` 对应的模长能力
- `arg(1+i)` 对应的幅角能力
- `rect <-> polar` 双向转换
- `i^2`
- 零除错误
- 零复数相角错误

## 和模块 5 的边界

模块 4 完成后，数学引擎已经具备四则计算能力。

但“输入表达式后直接算出结果”还不能发生，因为：

- 模块 4 不读取 AST
- 模块 4 不认识 `BinaryExpression`
- 模块 4 不处理变量、函数调用、上下文

这些工作都在模块 5 Evaluator。

## 关于最基础四则计算功能

如果你说的是“数学引擎层已经能做 `3+4`、`2*5`”，那么模块 4 已经具备。

如果你说的是“输入字符串表达式后系统真正算出结果”，那么至少要到模块 5 完成后才成立。

如果你说的是“用户在终端直接输入并看到结果”，那还要等模块 9 CLI。
