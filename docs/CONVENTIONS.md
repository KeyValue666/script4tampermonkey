# 编码与工程规范

> 本文件是本仓库**唯一的规范真源**。README、模板、提示词与本文冲突时，以本文为准。
> 修改规则的正确顺序：先改本文档，再改 `templates/`，最后改历史代码。

## 0. 适用范围与措辞

- 适用对象：`sites/` 下全部脚本与说明、`docs/`、`templates/`、`tools/`。
- 措辞含义：
  - **必须 / 禁止（MUST / MUST NOT）**：违反即视为缺陷，自检清单会逐条核对。
  - **应当（SHOULD）**：有正当理由可以偏离，但要在 PR / 提交说明里写清原因。

---

## 1. 目录与命名

### 1.1 站点目录（site-key）

一个可安装脚本对应一个站点目录。目录名**必须**由域名确定性推导，保证不同人或不同 AI 得到同一个名字：

1. 取站点主域名，通常省略 `www.`；需要按子域区分时保留子域；
2. 全部转小写；
3. `.` 与其它非 `[a-z0-9]` 字符替换为 `-`；
4. 合并连续的 `-`，去掉首尾 `-`。

| 域名 | site-key |
| --- | --- |
| `example.com` | `example-com` |
| `www.example.com` | `example-com` |
| `m.example.com` | `m-example-com` |
| `www.example.co.uk` | `example-co-uk` |
| `bbs.example.com` | `bbs-example-com` |

规则：

- **禁止**中文、空格、大写字母、下划线。
- 同一站点只建一个目录。
- 已发布（`@version` 已登记在根索引）的目录**禁止**随意改名：会破坏用户的 `@downloadURL` 与更新链路；确需改名必须在根 README 注明旧名与迁移方式。
- 站点目录**必须**是 `sites/` 的直接子目录，不允许再嵌套一层分类目录（分类靠根 README 索引表达）。

### 1.2 站点目录内文件

| 文件 | 必需 | 说明 |
| --- | --- | --- |
| `README.md` | ✅ | 该站点的功能说明，同时服务用户与维护者 |
| `<site-key>.user.js` | ✅ | 用户脚本，唯一代码入口 |
| `CHANGELOG.md` | 发版后 | 版本记录，格式见 3.4 |
| `assets/` | 可选 | 截图、图标；文件名用 `kebab-case` |

- 一个站点默认只有一个脚本。
- 仅当两套功能无法在同一页面共存（例如互斥的页面改写）时，才允许 `<site-key>-<feature>.user.js`。此时 README **必须**分节说明每个脚本，根索引里分行登记。
- 站点目录内**禁止**新增其他代码文件：不建 `utils.js`、`config.json`、`src/`。脚本必须自包含。

### 1.3 脚本头部（metadata）

字段**必须**按下列顺序、使用下列写法：

```js
// ==UserScript==
// @name         S4TM · 站点中文名 · 功能名
// @namespace    https://github.com/KeyValue666/script4tampermonkey/sites/<site-key>
// @version      0.1.0
// @description  面向用户的一句话说明，不超过 80 字，不写实现细节
// @author       KeyValue666
// @match        https://example.com/path/*
// @icon         https://example.com/favicon.ico
// @grant        none
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/KeyValue666/script4tampermonkey/blob/main/sites/<site-key>/README.md
// @supportURL   https://github.com/KeyValue666/script4tampermonkey/issues
// @updateURL    https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/<site-key>/<site-key>.user.js
// @downloadURL  https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/<site-key>/<site-key>.user.js
// ==/UserScript==
```

| 字段 | 规则 |
| --- | --- |
| `@name` | 固定格式 `S4TM · <站点名> · <功能>`，不带版本号 |
| `@namespace` | 指向该站点目录，用于避免同名脚本冲突 |
| `@version` | 语义化版本，见第 4 章，必须与文档一致 |
| `@description` | 说清「在哪个页面、做什么、有什么收益」，禁止写「优化用户体验」这类空话 |
| `@match` | **必须**精确到实际需要的域名与路径；**禁止** `<all_urls>`、`*://*/*`；确需全站生效时在 README 写明理由 |
| `@grant` | 最小化。不需要 GM API 时写 `none`；需要存储时写 `GM_getValue` + `GM_setValue`；跨域时写 `GM_xmlhttpRequest` 并配 `@connect` |
| `@connect` | **必须**写具体域名，**禁止** `*` |
| `@run-at` | 默认 `document-idle`；必须尽早拦截时用 `document-start`，并自行等待 DOM |
| `@noframes` | 默认加；只有当功能明确需要运行在 iframe 内才去掉，并在 README 说明 |
| `@updateURL` / `@downloadURL` | 首次发布时必须填 raw 地址，否则用户无法自动更新 |

> 仓库地址统一为 `https://github.com/KeyValue666/script4tampermonkey`。仓库改名或转移时**一次性全仓替换**，不要逐个脚本手工改；替换后同步更新本节与 `templates/`。

---

## 2. JavaScript 规范

### 2.1 语言基线

- **必须**使用 ES2020+ 语法（可选链、`??`、`Promise.allSettled`、`Array.prototype.at` 等），**不转译、不构建**。
- **禁止** `var`、`eval`、`new Function`、动态导入远程地址。
- **禁止**引入任何 npm 依赖、外部 CDN、远程加载的库：脚本必须能作为单文件离线运行。
- 必须能在 Chrome / Edge 120+、Firefox 120+ 的稳定版直接运行，不使用实验性 API。

### 2.2 文件结构

顺序固定，便于人和 AI 快速定位：

```js
// ==UserScript== … ==/UserScript==    // 1. 头部元数据
(function () {                          // 2. IIFE 隔离，避免污染页面全局
  'use strict';                         // 3. 严格模式

  /* ---------- 配置 ---------- */      // 4. 常量与可调参数
  /* ---------- 工具 ---------- */      // 5. waitFor / injectStyle / store 等
  /* ---------- 业务 ---------- */      // 6. 主要功能，按页面或子功能分节
  /* ---------- 启动 ---------- */      // 7. main() 调用，try/catch 包裹
})();
```

- 除 IIFE 外**禁止**新增全局变量。确需暴露调试接口时只挂一个 `window.__S4TM__`，且默认不启用。
- 不写 `import` / `export` / `module.exports`：脚本不是模块。

### 2.3 格式

| 项 | 规定 |
| --- | --- |
| 缩进 | 2 空格，禁止 Tab |
| 引号 | 单引号；插值用模板字符串 |
| 分号 | 必须写 |
| 行宽 | ≤ 100 字符 |
| 尾随逗号 | 多行对象 / 数组必须加 |
| 空行 | 函数之间空 1 行；分节之间空 2 行 |
| 换行符 | LF（由 `.gitattributes` 保证） |
| 文件末尾 | 恰好一个空行 |

### 2.4 命名

| 对象 | 规则 | 示例 |
| --- | --- | --- |
| 变量 / 函数 | `camelCase` | `waitFor`、`pageReady` |
| 常量 | `UPPER_SNAKE_CASE` | `SITE_KEY`、`MOUNTED_ATTR` |
| 配置对象内的键 | `camelCase` | `CONFIG.waitTimeout` |
| 类 | `PascalCase` | `FloatingPanel` |
| 布尔 | `is` / `has` / `can` / `should` 前缀 | `isEnabled`、`hasLoaded` |
| 事件处理 | `on` + 事件名 | `onUrlChange`、`onClick` |
| DOM id / class | `s4tm-` 前缀 + `kebab-case` | `s4tm-toolbar`、`s4tm-btn--primary` |
| 自定义属性 | `data-s4tm` / `data-s4tm-<feature>` | `data-s4tm-mounted`、`data-s4tm="export"` |
| 存储键 | `s4tm:<site-key>:<key>` | `s4tm:example-com:panelOpen` |

### 2.5 注释与日志

- 注释用中文，解释「为什么」，不复述代码「做了什么」。
- 超过 10 行的函数、所有工具函数**应当**写 JSDoc（`@param` / `@returns`）。
- 日志统一前缀 `[s4tm:<site-key>]`；`log` 受 `CONFIG.debug` 控制，`warn` / `error` 始终输出。
- **禁止**在高频回调（`scroll`、`input`、`MutationObserver`、循环）里输出日志。

```js
const SITE_KEY = 'example-com';
const PREFIX = `[s4tm:${SITE_KEY}]`;
const log = (...args) => {
  if (CONFIG.debug) console.log(PREFIX, ...args);
};
const warn = (...args) => console.warn(PREFIX, ...args);
```

### 2.6 DOM 操作

- **禁止**用固定 `setTimeout` / `setInterval` 猜元素出现时间；**必须**用 `waitFor(selector)`（基于 `MutationObserver`，模板已提供）。
- 每次注入**必须**幂等：注入前检查标记（`data-s4tm-mounted` 或 `getElementById`），重复调用不得叠加 UI。
- **禁止**用 `innerHTML` 拼接站点数据或用户输入（防 XSS）；需要 HTML 时用 `createElement` + `textContent`。
- 改写站点原生节点前，先确认该节点不被站点框架（React / Vue）复用；优先「追加自己的节点」而不是「改别人的节点」。
- 隐藏或移除站点元素时，只作用于明确的稳定选择器，**禁止**通配删除，并保留还原能力。

### 2.7 样式注入

- 统一用 `injectStyle(id, css)` 注入单个 `<style>`，`id` 形如 `s4tm-<site-key>-style`。
- 所有选择器加 `s4tm-` 前缀，或限定在自己的 `[data-s4tm]` 容器内，防止污染站点样式。
- 需要与站点样式彻底隔离时使用 Shadow DOM：`attachShadow({ mode: 'open' })`。
- **禁止**改写站点全局变量、`body` 上的关键类名，或覆盖站点的基础排版样式。

### 2.8 异步与网络

- 同源请求用 `fetch`，**必须**配超时（`AbortController` + `setTimeout`，建议 8–15 秒）。
- 跨域请求用 `GM_xmlhttpRequest`，并在头部声明具体的 `@connect` 域名。
- **禁止**上传用户数据、页面内容或行为日志；**禁止**接入第三方统计。
- 所有 `await` 都要处理失败路径：网络失败只降级提示，不阻断页面其它功能。

### 2.9 存储

- 键名格式 `s4tm:<site-key>:<key>`；站点前缀由 `store` 封装自动拼接。
- 优先 `GM_getValue` / `GM_setValue`；未声明对应 `@grant` 时退回 `localStorage`，并在站点 README 的「权限与隐私」中说明。
- 只存必要配置（开关、偏好、排序）；**禁止**缓存用户隐私数据。

### 2.10 错误处理

- `main()` 外层**必须** `try/catch`：失败时输出一条可诊断的 `warn` 后退出，不影响站点自身运行。
- 单个功能失败**禁止**导致整页白屏或阻断站点脚本；用局部 `try/catch` + 降级。
- `waitFor` 超时属于预期情况：记录选择器并跳过该功能，不要抛到顶层。

### 2.11 性能

- `MutationObserver` 回调只做轻量判断，重活交给 `requestIdleCallback` 或防抖（≥ 100ms）。
- **禁止**使用间隔 < 1s 的 `setInterval` 轮询；能用事件或观察者就不要轮询。
- 单次同步任务**应当** < 50ms，避免阻塞首屏。
- 批量插入用 `DocumentFragment`；大列表操作要分片处理。

### 2.12 安全与隐私红线（MUST NOT）

- 不执行 `eval`、`new Function`、`document.write`，不加载远程代码。
- 不采集、不上传、不统计用户行为与页面内容。
- 不自动执行付费、下单、删除、发帖、发消息等不可撤销操作；这类动作只能由用户手动点击触发。
- 不伪造登录态、不绕过风控或付费墙、不抓取需要登录的他人数据。
- 不读取与功能无关的 Cookie 或 `localStorage` 项。

### 2.13 SPA 与多标签

- 需要随路由切换重新挂载时，使用模板的 `onUrlChange()`（包装 `pushState` / `replaceState`，并监听 `popstate` / `hashchange`）。
- 路由回调**必须**去重：同一 URL 只执行一次；离开页面时清理自己注入的 `[data-s4tm]` 节点。
- 多标签页共享配置时，改动只写自己的 `s4tm:` 键，不碰站点原生存储。

---

## 3. 文档规范

### 3.1 站点 README 必备章节（顺序固定）

1. 标题：`<站点名> · <功能名>`
2. 一句话简介 + 信息表（脚本文件、版本、适配域名、安装链接）
3. `## 功能`
4. `## 使用说明`
5. `## 触发条件与覆盖页面`
6. `## 权限与隐私`
7. `## 已知限制`
8. `## 变更记录`
9. `## 开发说明`（选择器依赖、实现要点、回归验证方法）

模板见 [`templates/site-README.md`](../templates/site-README.md)。**禁止**删除章节；某项不适用时写「无」并说明原因。

### 3.2 写作要求

- 面向用户的章节（1–7）用「你」的口吻，不出现内部术语。
- 功能条目**必须**可验证：写清在哪类页面、做什么、结果是什么。
- 「已知限制」要写触发条件和替代方案，不能只写「不支持」。
- 面向维护者的章节（8–9）写实现细节：依赖哪些选择器、哪些假设容易随站点改版失效、如何快速回归验证。

### 3.3 根 README 索引

新增、下线、改版本时**必须**同步根 `README.md` 的「站点索引」表，`版本` 列与脚本 `@version` 完全一致。

### 3.4 CHANGELOG

采用 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 结构，最新版本在最上面：

```md
# 变更记录

## [0.2.0] - 2026-10-29

### 新增
- 列表页支持批量导出 CSV

### 修复
- 深色模式下按钮文字不可见

## [0.1.0] - 2026-10-20

### 新增
- 首个版本：页面精简与快捷跳转
```

分类只用：`新增` / `变更` / `修复` / `移除` / `安全`。

---

## 4. 版本规范

| 版本位 | 何时递增 | 示例 |
| --- | --- | --- |
| `PATCH` | 修复 bug、调整选择器、改文案 | 0.1.0 → 0.1.1 |
| `MINOR` | 新增功能或配置项，且兼容旧行为 | 0.1.1 → 0.2.0 |
| `MAJOR` | 重写、移除功能、行为不兼容 | 0.2.0 → 1.0.0 |

- 新脚本从 `0.1.0` 开始；用户面稳定、功能闭环后可升 `1.0.0`。
- 预发布写作 `1.0.0-beta.1`。**禁止** `v0.1`、`0.1`、`1` 这类非语义化写法。
- 一次提交只递增一次版本；`@version`、站点 README 信息表、`CHANGELOG.md`、根索引**四处必须同步**。

---

## 5. Git 规范

- 分支：单人开发可直接提交 `main`；多人协作时用 `feat/<site-key>-<简述>`，合并后再删除。
- 提交信息：`<type>(<site-key>): <简述>`，简述用中文、≤ 50 字、不加句号。
  - type 见根 README 的表格。
  - 规范、模板、索引类改动可以不带 scope：`docs: 更新站点命名规则`。
- 一个提交只做一件事：功能与对应文档同步提交，**禁止**把多个站点的改动塞进同一个提交。
- **禁止**提交 `node_modules/`、构建产物、日志、`.idea/`；二进制文件 > 500KB 需压缩后再提交。

---

## 6. AI 协作流程

### 6.1 每次开工的固定动作

1. 读 `README.md` → 本文件 → 目标站点 `README.md` → 目标脚本。
2. 明确本次改动属于哪个站点，以及是否需要动规范 / 模板（尽量不动）。
3. 小步实现 → 自测 → 同步文档与版本 → 提交。

### 6.2 可以自主执行

- 读取仓库内任意文件。
- 修改目标站点目录内的脚本与文档；更新根索引与 `CHANGELOG.md`。
- 在本地运行只读检查（`node tools/check.mjs`、`node --check`、格式检查）。

### 6.3 必须先询问人类

- 新增、删除、重命名站点目录，或改变已有 `site-key`。
- 修改本规范、`templates/`、`LICENSE`、`.gitignore`、`.gitattributes`。
- 引入任何依赖、构建流程或 GitHub Actions。
- 删除已有功能，或改变用户可见行为的默认值。
- 需要真实账号、真实付费环境才能验证的功能。

### 6.4 完成定义（DoD，逐条核对）

- [ ] `node tools/check.mjs` 通过（无错误）
- [ ] 目标站点脚本可安装、可运行，Console 无 error
- [ ] 首次加载、刷新、前进 / 后退、SPA 路由切换后行为一致，无重复注入
- [ ] 目标元素缺失或站点改版时降级提示，不报错、不白屏
- [ ] 幂等：重复执行 `mount()` 不产生重复 UI
- [ ] `@version` 已递增，四处版本一致
- [ ] 站点 README 的功能、限制、变更记录已更新
- [ ] 无新增依赖、无规范外文件、调试开关已关闭

---

## 7. 提交前 30 秒自检

```bash
node tools/check.mjs                     # 目录、头部、文档、版本、索引一次核对
git status --short -uall                 # 只应有本次改动（-uall：本机全局配置可能隐藏未跟踪文件）
git diff --stat                          # 确认没有误改其它站点
node --check sites/<site-key>/<site-key>.user.js   # 语法检查（可选）
```
