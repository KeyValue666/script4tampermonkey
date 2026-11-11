<div align="center">

# script4tampermonkey

**一个站点 · 一个目录 · 一个脚本 · 一份说明**

面向 Web 端的 Tampermonkey / Violentmonkey 用户脚本集合。
按站点隔离组织，无构建、无依赖，全程 AI 协作开发，规范即契约。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Language](https://img.shields.io/badge/language-JavaScript-f7df1e.svg)](docs/CONVENTIONS.md)
[![Build](https://img.shields.io/badge/build-none-brightgreen.svg)](docs/CONVENTIONS.md)

</div>

## 目录

- [项目简介](#项目简介)
- [站点索引](#站点索引)
- [安装与使用](#安装与使用)
- [项目结构](#项目结构)
- [约定速查](#约定速查)
- [AI 协作规则](#ai-协作规则)
- [新增一个站点](#新增一个站点)
- [版本与提交](#版本与提交)
- [兼容性](#兼容性)
- [License](#license)

## 项目简介

本仓库收集针对具体网站的功能增强用户脚本：页面精简、快捷操作、批量操作、数据导出等。

三条设计原则：

| 原则 | 含义 |
| --- | --- |
| 站点隔离 | 每个站点一个独立目录，脚本之间不共享代码，可单独安装、卸载、发版 |
| 单文件可安装 | 无构建、无依赖、无打包：把 `sites/<site-key>/<site-key>.user.js` 粘进 Tampermonkey 就能跑 |
| 文档即契约 | 每个脚本配一份功能说明；行为变更必须同步版本号与文档，否则视为未完成 |

## 站点索引

> 新增、下线、改版本时**必须**同步这张表；`版本` 列要与脚本 `@version` 完全一致。

| 站点 | 脚本 | 版本 | 功能简介 | 功能说明 |
| --- | --- | --- | --- | --- |
| 哔哩哔哩 | [bilibili-com.user.js](sites/bilibili-com/bilibili-com.user.js) | 2.2.1 | 首页推荐 2 × 5 列 + Alt+R 视频旋转 + 音频提取 | [说明](sites/bilibili-com/README.md) |
| 虎牙直播 | [huya-com.user.js](sites/huya-com/huya-com.user.js) | 0.2.0 | 只留视频 / 弹幕 / 发言，隐藏推荐礼物侧栏、铺满视口并拦截埋点广告请求 | [说明](sites/huya-com/README.md) |
| 抖音 | [douyin-com.user.js](sites/douyin-com/douyin-com.user.js) | 0.1.1 | 刷视频去广告 / 看直播只留画面与弹幕，拦截埋点广告请求、预取与特效开销 | [说明](sites/douyin-com/README.md) |
| 小红书 | [xiaohongshu-com.user.js](sites/xiaohongshu-com/xiaohongshu-com.user.js) | 0.1.0 | 笔记页一键打包下载全部图片，取 CDN 原图、去压缩与水印参数 | [说明](sites/xiaohongshu-com/README.md) |

<!--
新增站点时复制下面这行并替换占位内容：

| 示例站点 | [example-com.user.js](sites/example-com/example-com.user.js) | 0.1.0 | 页面精简 / 快捷下载 | [说明](sites/example-com/README.md) |
-->

## 安装与使用

1. 给浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)（Chrome / Edge / Firefox）或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 打开 `sites/<site-key>/README.md`，点击其中的 **安装** 链接（指向脚本的 raw 地址），扩展会自动弹出安装页。
3. 或手动安装：扩展面板 → `添加新脚本` → 粘贴 `sites/<site-key>/<site-key>.user.js` 全文 → `Ctrl + S`。

装好后回到目标站点刷新页面即可生效；脚本开关、快捷键在扩展面板的脚本设置里管理。

安装链接的固定形态（`<site-key>` 换成实际目录名）：

```
https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/<site-key>/<site-key>.user.js
```

> 自动更新依赖脚本头部的 `@updateURL` / `@downloadURL`，它们指向 `main` 分支的 raw 地址。首次发布脚本时请按模板填好，否则用户只能手动更新。

## 项目结构

```
script4tampermonkey/
├── README.md                  # 项目总览、站点索引、规范入口
├── LICENSE                    # MIT
├── .editorconfig              # 编辑器统一风格
├── .gitattributes             # 换行符统一为 LF
├── .gitignore                 # 忽略 IDE、依赖、日志等非交付物
├── docs/
│   ├── CONVENTIONS.md         # 编码与工程规范（唯一真源，AI 必读）
│   └── NEW_SITE.md            # 新增站点操作手册 + 自测矩阵
├── templates/
│   ├── site-README.md         # 站点功能说明模板
│   └── site.user.js           # 用户脚本骨架模板
├── tools/
│   └── check.mjs              # 规范检查器（node tools/check.mjs）
└── sites/
    ├── README.md              # 站点目录说明
    └── <site-key>/            # 一个站点一个目录
        ├── README.md          # 功能说明（必需）
        ├── <site-key>.user.js # 用户脚本（必需，唯一代码入口）
        ├── CHANGELOG.md       # 版本记录（可选，发版后建议必需）
        └── assets/            # 截图 / 图标（可选）
```

## 约定速查

**站点目录命名**：由域名确定性推导——小写，`.` 换成 `-`，省略 `www.`，其它非法字符转 `-` 并合并连续的 `-`。

```
example.com        → example-com
www.example.com    → example-com
m.example.com      → m-example-com
www.example.co.uk  → example-co-uk
```

**文件命名**：目录名 = 脚本文件名主干 = 功能说明所在目录。脚本必须是 `<site-key>.user.js`，一个站点默认只维护一个脚本。

**脚本头部必填**：`@name`、`@namespace`、`@version`、`@description`、`@author`、`@match`、`@grant`、`@run-at`、`@noframes`、`@homepageURL`、`@supportURL`；跨域时必须补具体的 `@connect`（禁止 `*`）。

**代码风格**：纯 JavaScript（ES2020+，不转译）、2 空格缩进、单引号、必须写分号、行宽 ≤ 100、`const` 优先、禁止 `var`。

**DOM 与样式**：注入节点打 `data-s4tm` 标记，CSS 类名统一 `s4tm-` 前缀；不用 `setTimeout` 猜时间，统一走 `waitFor()`。

**隐私红线**：禁止 `eval` / 加载远程代码 / 采集或上传用户数据 / 自动执行付费、删除、发帖等不可撤销操作。

完整规则见 [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)。

## AI 协作规则

本项目全程由 AI 协作开发，规范是唯一的评判标准。下面这段可整段复制给 AI，作为新对话的**前置提示词**；详细条款与检查表见 [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) 第 6 章（唯一真源，冲突时以它为准）。

### 前置提示词（整段复制）

```text
你是 script4tampermonkey 仓库的协作开发者。规范是唯一评判标准，不要凭印象改代码。
开工前按顺序读：README.md → docs/CONVENTIONS.md → 目标站点 README.md → 目标脚本。

1. 一次只改一个站点。改行为必须同步四处：@version、站点 README、CHANGELOG.md、根 README 索引。
2. 需求太笼统、缺目标站点/页面路径/期望行为/验收标准时，先自由发挥：读仓库现状，推演
   2-3 个方案及各自代价，给出推荐项与默认假设，然后带着具体选项一次性向人类确认，
   确认后再动手。不许按猜测直接实现，也不许只回一句「能说清楚一点吗」。
3. 每次编码完成后、提交前，必须逐行 review 本次改动，重点排查内存泄漏和影响本机性能的
   开销：监听器/观察者是否成对注销、定时器与 rAF 是否可终止、缓存集合是否有上限与淘汰、
   DOM/Blob/大对象引用是否释放、高频回调是否有节流与分片预算、原生 API 包装是否可还原、
   禁用脚本后能否彻底回收。发现问题当场修好并重新 review，禁止「下轮再修」。
4. 提交前逐条核对根 README「AI 协作规则」的完成定义（DoD），并跑 node tools/check.mjs。
5. 用户未必说得清自己真正想要什么。如果你判断突破某条规则才能交付他真正想要的结果，
   可以主动申请豁免：写清突破哪条、为什么原规则做不到、用户能得到什么、代价与风险、
   如何回滚，并把「守规方案 vs 突破方案」并列给人类选。未获明确同意前一律按原规则执行，
   禁止先斩后奏；获批仅限本次这一条、不形成先例，且必须在提交说明里留痕。
   安全与隐私红线不可申请突破（详见 CONVENTIONS 6.3.1）。
6. 不越界（第 5 条获批的豁免除外）：不建规范外目录/文件、不引入依赖或外部 CDN、
   不改其它站点代码；增删站点、改规范/模板、删功能或改变默认行为前必须先问人类。
```

### 详细流程

任何一次改动都按下面的流程执行：

1. **按顺序读**：本 README → [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) → `sites/<site-key>/README.md` → `sites/<site-key>/<site-key>.user.js`。不要凭印象改代码。
2. **一次只改一个站点**：除规范、模板、索引外，单次改动不跨站点；跨站点改动拆成多次提交。
3. **改行为必须同步四处**：`@version`（语义化递增）、站点 README 的功能与变更记录、`CHANGELOG.md`、根 README 索引的版本号。不一致即视为未完成。
4. **需求太笼统就先想再问**：提示词缺目标站点、页面路径、期望行为或验收标准时，允许先自由发挥——读仓库现状、推演 2–3 个方案及取舍、给出推荐项与默认假设，然后带着具体选项一次性向人类确认，确认后再动手。**禁止**按猜测直接实现，也**禁止**只回一句「能说清楚一点吗」把思考成本全推回去（详见 CONVENTIONS 6.1.1）。涉及增删站点、改规范/模板、删功能等事项仍必须先询问。若推演发现严格守规做不出用户真正想要的结果，走第 6 条申请豁免。
5. **编码后强制 review（内存与性能）**：每次写完代码、提交前，必须逐行复查本次改动，重点防内存泄漏与其它拖慢本机 / 浏览器的开销：监听器与 `MutationObserver` / `IntersectionObserver` 是否成对注销、定时器与 `rAF` 是否可终止、`Map` / `Set` / 闭包持有的 DOM 与响应引用是否有上限和淘汰、Blob 与 `createObjectURL` 是否释放、高频回调是否做了节流与分片预算、原生 API 包装是否可还原、禁用脚本后能否彻底回收。发现问题**当场修好并重新 review**，禁止「下轮再修」。完整检查表见 CONVENTIONS 6.5。
6. **可申请突破规则（乔布斯式判断）**：用户未必说得清自己真正想要什么。当你有充分理由认为突破某条明文规则才能交付用户真正想要的结果时，可以主动发起「规则豁免申请」，写清突破哪条、为什么原规则做不到、用户能得到什么、代价与风险、回滚方式，并把守规方案与突破方案并列给人类选。**未获人类明确同意前一律按原规则执行**，禁止先斩后奏或把「已经做完」包装成申请；批准仅限本次、仅限该条，不形成先例、不外溢到其它站点，且必须在提交说明或 `CHANGELOG.md` 留痕。**安全与隐私红线（CONVENTIONS 2.12）不可申请突破**。完整规则见 CONVENTIONS 6.3.1。
7. **不越界**：不新建规范外的目录/文件，不引入 npm 依赖或外部 CDN，不改动其它站点代码（第 6 条获批的豁免除外）。
8. **完成定义（DoD）**：
   - [ ] `node tools/check.mjs` 通过（无错误）
   - [ ] 脚本可在目标站点安装并运行，Console 无 error
   - [ ] 刷新、前进/后退、SPA 路由切换下行为一致，不重复注入
   - [ ] 站点改版或目标元素缺失时只降级提示，不报错、不白屏
   - [ ] 编码后 review 已完成：无内存泄漏、无累积监听器/定时器/缓存、无高频主线程开销
   - [ ] 若突破了任何规则，提交说明里已记录人类批准、豁免条款与范围
   - [ ] `@version`、站点 README、`CHANGELOG.md`、根索引四处一致
   - [ ] 无新增依赖、无规范外文件、调试开关已关闭

## 新增一个站点

1. 按上面的规则确定 `<site-key>`，确认根索引里没有重名。
2. 新建 `sites/<site-key>/` 目录。
3. 从 `templates/` 复制 `site.user.js` 和 `site-README.md`，分别重命名为 `<site-key>.user.js` 和 `README.md`。
4. 填好头部元数据 → 实现功能 → 写功能说明 → 登记根索引 → 自测 → 发一次 `feat(<site-key>): ...` 提交。

`docs/` 与 `tools/` 是给人/AI 用的工程设施：前者约定规则，后者自动核对。提交前跑一次：

```bash
node tools/check.mjs            # 校验全部站点
node tools/check.mjs <site-key> # 只校验一个站点（需要 Node 18+）
```

完整步骤、自测矩阵见 [`docs/NEW_SITE.md`](docs/NEW_SITE.md)。

## 版本与提交

**版本**：语义化版本 `MAJOR.MINOR.PATCH`。新脚本从 `0.1.0` 起步；修复 → `PATCH`，新增兼容功能 → `MINOR`，重写或行为不兼容 → `MAJOR`。预发布写作 `1.0.0-beta.1`。

**提交信息**：`<type>(<site-key>): <简述>`，简述用中文、不超过 50 字、不加句号。

| type | 用途 |
| --- | --- |
| `feat` | 新增功能 |
| `fix` | 修复问题 |
| `docs` | 仅文档、规范、索引 |
| `style` | 格式调整，不影响行为 |
| `refactor` | 重构，行为不变 |
| `perf` | 性能优化 |
| `chore` | 工程杂项（模板、配置） |
| `ci` | 自动化流程 |
| `revert` | 回滚 |

```
feat(example-com): 列表页支持批量导出 CSV
fix(example-com): 修复深色模式下按钮文字不可见
docs: 补充站点命名与版本同步规则
chore: 初始化项目结构与规范
```

## 兼容性

| 项 | 说明 |
| --- | --- |
| 脚本管理器 | Tampermonkey 5.x、Violentmonkey 2.x；Greasemonkey 4 的 `GM_*` API 差异较大，不保证兼容 |
| 浏览器 | Chrome / Edge 120+、Firefox 120+ |
| Safari | 未测试 |

## License

[MIT](LICENSE) © script4tampermonkey contributors
