# Vue 3 最小重构方案

## 目标

将当前原生网页界面迁移到 `Vue 3`，但**不改动核心计算层**：

- 保留 `core/` 下的词法、语法、数学、求值、格式化、函数系统
- 保留现有用户函数数据结构与持久化策略
- 只重构 `web/` 对应的前端界面与状态组织方式

本方案追求的是：

- 最小风险
- 最小改动面
- 尽快获得组件化、响应式状态和更清晰的 UI 结构

不追求一次性重写全部工程。

---

## 非目标

本次迁移**不包含**：

- 重写 `core/` 为 TypeScript 或 ESM
- 重写计算逻辑
- 改动表达式语法
- 重写用户函数存储格式
- 同时切到 React
- 同时处理桌面端、服务端或后端接口

---

## 当前工程的实际边界

当前网页层的职责主要集中在：

- 渲染输入区、按钮区、结果区、错误区
- 调用 `createWebInputProtocol(...)`
- 调用 `core/parser`、`core/evaluator`、`core/format`
- 管理按钮提示、输入焦点、光标位置
- 管理用户函数的本地持久化与导入导出

核心事实是：

- `core/` 已经是独立层
- 当前最大耦合点不在计算逻辑，而在 `web/app-entry.js` 里的“页面状态 + DOM 事件 + 用户函数 UI”混在一起

所以最合适的迁移策略不是动核心，而是把 `app-entry.js` 里现在那一坨职责拆成 Vue 组件和组合式逻辑。

---

## 推荐技术路线

推荐采用：

- `Vue 3`
- `Vite`

原因：

- 你的页面是典型的“输入面板 + 状态面板 + 按钮区 + 表单区 + 列表区”
- Vue 模板对这类 UI 比较直观
- 从当前静态 HTML 迁过去成本较低
- Vite 适合作为前端壳层构建工具，替代现在手写的网页 bundle 逻辑

---

## 最小重构原则

### 1. 不改 `core/`

以下目录保持不动：

- `core/model`
- `core/lexer`
- `core/parser`
- `core/math`
- `core/evaluator`
- `core/format`
- `core/functions`

### 2. 先保留输入协议层

`web/input-protocol.js` 已经把很多输入行为固化了：

- 键盘输入
- 光标移动
- 按钮模板插入
- 清空 / 删除
- 派生结果刷新

最小迁移方案里，**不要立刻删除这层**。  
Vue 第一阶段直接把它当成“前端状态引擎”使用。

### 3. 先替换 UI 壳，不替换数据模型

Vue 组件只负责：

- 显示
- 绑定事件
- 调用协议层和核心 API

不要第一阶段就把协议层和用户函数逻辑都重写成 Vue store。

---

## 推荐目录结构

建议新增一个新的前端目录，而不是立即覆盖旧的 `web/`：

```text
calculator/
  core/
  web/                 现有原生网页，先保留
  web-vue/
    index.html
    package.json
    vite.config.js
    src/
      main.js
      App.vue
      adapters/
        core-api.js
      composables/
        useCalculatorProtocol.js
        useUserFunctions.js
        useButtonHints.js
      components/
        ExpressionEditor.vue
        DisplayControls.vue
        SymbolPad.vue
        ResultPanel.vue
        ErrorPanel.vue
        FunctionEditor.vue
        FunctionList.vue
        JsonTransferPanel.vue
```

这样做的好处：

- 原生网页可继续作为对照版本
- Vue 迁移可以分阶段完成
- 不会在迁移中把现有可用页面直接打碎

---

## 模块映射关系

### 当前 `web/app-entry.js`

它当前承担了这些职责：

- 组装 `createWebInputProtocol`
- 初始化用户函数存储
- 维护整个页面状态
- 绑定所有 DOM 事件
- 更新所有 DOM 文本
- 管理函数表单、函数列表、JSON 导入导出

### Vue 迁移后的拆分

#### `src/adapters/core-api.js`

职责：

- 统一暴露当前核心能力给 Vue 层使用

建议导出：

- `parseSource`
- `evaluate`
- `renderAstToLatex`
- `renderEvaluationResultToLatex`
- `renderEvaluationResultToText`
- `createWebInputProtocol`
- `createInMemoryUserFunctionStore`
- `createPersistentUserFunctionStore`
- `createLocalStorageRecordPersistence`

说明：

- 这里是“Vue UI”和“旧核心 CommonJS 模块”之间的边界层
- 后面如果要处理 CommonJS / ESM 兼容问题，只改这一层

#### `src/composables/useCalculatorProtocol.js`

职责：

- 封装协议层实例与页面主状态

建议对外暴露：

- `state`
- `applyKeyboardText(text)`
- `insertButton(buttonKey)`
- `insertTemplate(text, cursorOffset, metadata)`
- `moveCursor(position)`
- `moveCursorBy(delta)`
- `backspace()`
- `deleteForward()`
- `clear()`
- `setDisplayMode(mode)`
- `setAngleUnit(unit)`
- `replaceRawInput(text)`
- `refresh()`

实现原则：

- `state` 用 Vue `ref` 或 `shallowRef`
- 协议层仍然是单一真相来源
- 每次操作都把新状态覆盖到 `state.value`

#### `src/composables/useUserFunctions.js`

职责：

- 封装用户函数仓库和界面所需行为

建议对外暴露：

- `userStore`
- `functionList`
- `saveCurrentExpressionAsFunction(...)`
- `editFunction(name)`
- `deleteFunction(name)`
- `insertFunctionCall(name)`
- `exportFunctions()`
- `importFunctions(json)`
- `functionStatus`

说明：

- 这个 composable 不直接渲染 UI
- 它负责把用户函数仓库与主计算状态连起来

#### `src/composables/useButtonHints.js`

职责：

- 管理按钮悬停说明

建议对外暴露：

- `buttonHint`
- `showButtonHint(key)`
- `resetButtonHint()`
- `buttonHelpTexts`

---

## 组件拆分方案

### `App.vue`

职责：

- 持有顶层状态
- 串联各个 composable
- 将状态和动作分发给子组件

它应该成为唯一的“页面装配层”，但不要重新写复杂业务逻辑。

### `ExpressionEditor.vue`

职责：

- 输入框
- 光标同步
- 键盘事件
- 粘贴事件

输入：

- `rawInput`
- `cursorPosition`

输出事件：

- `keyboard-text`
- `move-cursor`
- `move-cursor-by`
- `backspace`
- `delete-forward`

注意：

- 当前项目里最容易出 bug 的地方就是光标位置
- 第一阶段这个组件必须只做输入转发，不做业务判断

### `DisplayControls.vue`

职责：

- 显示模式下拉框
- 角度单位下拉框

输入：

- `displayMode`
- `angleUnit`

输出：

- `update:displayMode`
- `update:angleUnit`

### `SymbolPad.vue`

职责：

- 渲染所有按钮
- 处理悬停说明
- 触发按钮插入

输入：

- `buttonDefinitions`
- `buttonHint`

输出：

- `insert-button`
- `show-button-hint`
- `reset-button-hint`

说明：

- 这里不需要知道表达式内容
- 只负责“点了哪个按钮”

### `ResultPanel.vue`

职责：

- 表达式 LaTeX
- 结果文本
- 结果 LaTeX

输入：

- `latexExpression`
- `resultText`
- `resultLatex`

### `ErrorPanel.vue`

职责：

- 渲染解析错误
- 渲染求值错误

输入：

- `parseError`
- `evaluationError`

### `FunctionEditor.vue`

职责：

- 函数名输入
- 参数输入
- 保存按钮
- 清空按钮
- 状态消息

输入：

- `functionName`
- `functionParams`
- `statusMessage`

输出：

- `save`
- `reset`
- `update:functionName`
- `update:functionParams`

### `FunctionList.vue`

职责：

- 渲染已保存函数列表
- 编辑 / 插入 / 删除按钮

输入：

- `functions`

输出：

- `edit`
- `insert`
- `delete`

### `JsonTransferPanel.vue`

职责：

- JSON 文本框
- 导入 / 导出按钮

输入：

- `jsonText`

输出：

- `export`
- `import`
- `update:jsonText`

---

## 最小实施步骤

## 阶段 1：建立 Vue 外壳

目标：

- 新建 `web-vue/`
- 跑起一个空的 Vue 3 页面
- 页面只显示标题和占位文本

完成标准：

- `npm run dev` 能启动
- `npm run build` 能生成前端产物

## 阶段 2：接入核心适配层

目标：

- 创建 `src/adapters/core-api.js`
- 让 Vue 页面能调用现有 `core/*` 和 `web/input-protocol.js`

关键风险：

- 现有核心是 CommonJS
- Vue/Vite 默认更偏向 ESM

最小解决方案：

- 先只做一层适配模块
- 如果 Vite 对本地 CommonJS 处理不稳定，再单独加兼容配置

完成标准：

- Vue 页面能成功创建协议实例
- 能拿到初始 `state`

## 阶段 3：迁移主状态

目标：

- 用 `useCalculatorProtocol.js` 接管当前页面主状态

做法：

- 把 `app-entry.js` 里的 `state`、`apply(...)`、`refresh(...)` 搬到 composable
- 不改业务逻辑，只改承载方式

完成标准：

- 页面能显示 `rawInput`
- 页面能显示结果文本和错误文本

## 阶段 4：迁移输入框和控制区

目标：

- 先完成输入框、显示模式、角度单位三个区域

原因：

- 这是最核心的最小闭环

完成标准：

- 能输入表达式
- 能切换显示模式
- 能切换角度单位
- 能正确刷新结果

## 阶段 5：迁移按钮区和提示区

目标：

- 迁移符号按钮、函数按钮、悬停说明

完成标准：

- 点击按钮能插入内容
- 光标保持正确
- 悬停说明正常显示

## 阶段 6：迁移用户函数管理

目标：

- 迁移函数保存、列表、编辑、删除、导入导出

做法：

- 用 `useUserFunctions.js` 承接现有 `userStore`
- 保持当前持久化格式不变

完成标准：

- Vue 页面里可保存和复用用户函数
- 刷新后仍能从本地存储恢复

## 阶段 7：对齐样式与收尾

目标：

- 复用现有页面 CSS 视觉
- 去掉原生 DOM 手动渲染逻辑

完成标准：

- Vue 版功能覆盖原生版
- 原生版只作为回退分支保留

---

## 状态设计建议

顶层状态建议保留两层：

### 层 1：协议层状态

由 `createWebInputProtocol(...)` 生成和更新：

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

### 层 2：纯 UI 状态

仅由 Vue 维护：

- `buttonHint`
- `functionNameInput`
- `functionParamsInput`
- `functionStatus`
- `functionJsonText`

这样做的好处是：

- 计算状态和界面状态不混
- 后续改 UI 不容易把求值链路带坏

---

## 构建方案建议

### 最小方案

Vue 版单独使用 `Vite` 构建：

- 开发：`npm run dev`
- 构建：`npm run build`

先不要追求单文件产物。

原因：

- 当前原生版已经有 `index.standalone.html`
- Vue 迁移第一目标是稳定组件化，不是交付格式压缩

### 第二阶段再考虑

如果 Vue 版稳定后还要单文件交付，再额外做：

- `vite build` 后资源内联
- 或新增一个 `build-standalone-vue.js`

---

## 风险点与处理策略

### 1. CommonJS 与 Vite 兼容

风险：

- `core/*` 当前是 CommonJS

处理：

- 通过 `adapters/core-api.js` 做统一入口
- 如果需要，只在 Vite 侧补 CommonJS 兼容配置

### 2. 光标同步

风险：

- 输入框迁到 Vue 后，响应式更新可能打断光标位置

处理：

- `ExpressionEditor.vue` 中继续显式同步 `selectionStart/selectionEnd`
- 保留当前“状态更新后再恢复光标”的模式

### 3. 中文文案编码

风险：

- 当前部分文件已有编码污染历史

处理：

- Vue 迁移阶段所有新文件统一用 UTF-8
- 不直接复制乱码文案，重新写中文文本

### 4. 状态重复来源

风险：

- 一部分状态在协议层，一部分状态在组件内部，容易不一致

处理：

- 明确协议层是计算真相源
- 组件内部只存纯 UI 状态

---

## 最终验收标准

迁移完成后，Vue 版至少应满足：

- 可输入表达式并实时显示结果
- 复数计算正常
- 相量 / 直角坐标转换正常
- 显示模式切换正常
- 角度单位切换正常
- 按钮插入与光标恢复正常
- 全角 / 半角输入转换正常
- 用户函数保存、删除、导入导出正常
- 本地持久化正常
- 主要自动化测试继续通过

---

## 最推荐的实际执行顺序

如果要开始做，建议按下面的顺序推进：

1. 新建 `web-vue/` 和 `Vite + Vue 3` 外壳
2. 建立 `adapters/core-api.js`
3. 实现 `useCalculatorProtocol.js`
4. 先做 `ExpressionEditor.vue + DisplayControls.vue + ResultPanel.vue`
5. 再做 `SymbolPad.vue`
6. 再做 `FunctionEditor.vue + FunctionList.vue + JsonTransferPanel.vue`
7. 最后清理旧 `app-entry.js` 的职责

---

## 结论

最小重构的正确方向不是“重写整个项目”，而是：

- 保留 `core/`
- 保留现有输入协议和用户函数仓库
- 用 Vue 3 只重构页面壳和事件组织方式

这样做可以在不碰核心计算层的前提下，获得：

- 更清晰的组件边界
- 更稳的状态组织
- 更低的后续 UI 扩展成本

如果下一步真的开始实施，第一批落地文件建议就是：

- `web-vue/src/main.js`
- `web-vue/src/App.vue`
- `web-vue/src/adapters/core-api.js`
- `web-vue/src/composables/useCalculatorProtocol.js`
