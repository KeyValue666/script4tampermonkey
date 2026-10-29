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
| 哔哩哔哩 | [bilibili-com.user.js](sites/bilibili-com/bilibili-com.user.js) | 2.0.1 | 首页推荐 2 × 5 列 + Alt+R 视频旋转 | [说明](sites/bilibili-com/README.md) |

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

本项目全程由 AI 协作开发，规范是唯一的评判标准。任何一次改动都按下面的流程执行：

1. **按顺序读**：本 README → [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) → `sites/<site-key>/README.md` → `sites/<site-key>/<site-key>.user.js`。不要凭印象改代码。
2. **一次只改一个站点**：除规范、模板、索引外，单次改动不跨站点；跨站点改动拆成多次提交。
3. **改行为必须同步四处**：`@version`（语义化递增）、站点 README 的功能与变更记录、`CHANGELOG.md`、根 README 索引的版本号。不一致即视为未完成。
4. **不越界**：不新建规范外的目录/文件，不引入 npm 依赖或外部 CDN，不改动其它站点代码；需求有歧义先提问，不要猜。
5. **完成定义（DoD）**：
   - [ ] `node tools/check.mjs` 通过（无错误）
   - [ ] 脚本可在目标站点安装并运行，Console 无 error
   - [ ] 刷新、前进/后退、SPA 路由切换下行为一致，不重复注入
   - [ ] 站点改版或目标元素缺失时只降级提示，不报错、不白屏
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
