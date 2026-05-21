# LaTeX Calculator

当前版本：`v0.2.0`

一个面向公式输入的计算器项目，当前支持：

- 四则运算与幂运算
- 复数计算
- 相量值与直角坐标形式转换
- 表达式与结果的 LaTeX 字符串输出
- CLI 交互
- 原生 HTML 网页界面
- Vue 3 并行前端
- 用户函数保存、复用、导入导出

## 项目状态

项目仍在开发中，当前已经具备核心计算、网页交互和用户函数持久化能力。

## 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)。

## 目录结构

```text
calculator/
  core/       核心引擎：词法、语法、数学、求值、格式化、函数系统
  cli/        命令行入口与会话逻辑
  web/        原生网页界面与前端输入协议
  web-vue/    Vue 3 + Vite 并行前端
  tests/      回归测试
  scripts/    构建脚本
  docs/       模块设计文档
```

## 使用方式

### CLI

在项目根目录执行：

```powershell
node calculator\cli\index.js
```

常用命令：

- `:help`
- `:mode <plain|rect|polar|debug>`
- `:angle <deg|rad>`
- `:latex <on|off>`
- `:functions`
- `:fn-save <name>(<params>) = <expr>`
- `:fn-show <name>`
- `:fn-delete <name>`
- `:fn-export`
- `:fn-import <json>`

### 原生 Web

构建网页 bundle：

```powershell
node calculator\scripts\build-web-bundle.js
```

构建后可使用：

- `calculator\web\index.html`
- `calculator\web\app.bundle.js`

脚本也会生成单文件版本：

- `calculator\web\index.standalone.html`

注意：按照当前约定，`index.standalone.html` 只在明确要求时更新。

### Vue 3 Web

进入 Vue 前端目录后安装依赖并启动：

```powershell
cd calculator\web-vue
npm.cmd install
npm.cmd run dev
```

生产构建：

```powershell
npm.cmd run build
```

### Android APK

`web-vue` 现已接入 Capacitor，可生成 Android 工程并输出 APK。

首次接入后，常用命令如下：

```powershell
cd calculator\web-vue
npm.cmd run android:sync
npm.cmd run android:open
```

直接生成调试版 APK：

```powershell
cd calculator\web-vue
npm.cmd run android:apk:debug
```

调试版 APK 默认输出到：

- `calculator\web-vue\android\app\build\outputs\apk\debug\app-debug.apk`

如需正式发布包，建议在 Android Studio 中打开 `web-vue\android` 后使用签名流程生成 release APK 或 AAB。

## 开发与测试

可直接运行各模块测试，例如：

```powershell
node calculator\tests\cli\session.test.js
node calculator\tests\web\input-protocol.test.js
node calculator\tests\functions\persistent-store.test.js
```

## 许可协议

本项目采用 [MIT License](./LICENSE)。

## 免责声明

本项目按“现状”提供，不对计算结果的绝对正确性、适用性或特定用途作任何担保。在工程设计、教学评测、财务决策等场景中，请使用者自行复核结果。
