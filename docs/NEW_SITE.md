# 新增站点操作手册

按顺序执行，全部完成才算交付。规范依据：[CONVENTIONS.md](./CONVENTIONS.md)。

## 1. 明确范围

开工前先回答这四个问题，答案直接决定脚本头部写法：

| 问题 | 影响 |
| --- | --- |
| 目标站点的主域名是什么？ | `<site-key>`、`@match`、`@namespace` |
| 功能用一句话说清是什么？涉及哪些页面/路径？ | `@description`、`@match` 的精度、README 章节 |
| 是否需要跨域请求站点以外的接口？ | 是否需要 `GM_xmlhttpRequest` 与具体 `@connect` |
| 是否需要保存用户偏好？是否要在 SPA 路由切换后重新挂载？ | `@grant` 选型、是否使用 `store` 与 `onUrlChange` |

## 2. 定名

按 CONVENTIONS 1.1 推导 `<site-key>`，并检查根 `README.md` 索引里没有重名。

## 3. 建目录

```text
sites/<site-key>/
```

## 4. 复制模板

| 从 | 到 |
| --- | --- |
| `templates/site.user.js` | `sites/<site-key>/<site-key>.user.js` |
| `templates/site-README.md` | `sites/<site-key>/README.md` |

## 5. 填头部元数据

逐项替换模板里的占位符，重点检查：

- [ ] `@name` 格式为 `S4TM · <站点名> · <功能>`
- [ ] `@match` 精确到所需路径，没有 `*://*/*` 或 `<all_urls>`
- [ ] `@grant` 最小化，只保留实际用到的项
- [ ] 需要跨域时写了具体 `@connect` 域名
- [ ] `@homepageURL` / `@supportURL` / `@updateURL` / `@downloadURL` 指向正确路径

## 6. 实现功能

- 从模板的工具区开始，不要重新发明 `waitFor` / `injectStyle` / `store`。
- 所有注入节点带 `data-s4tm` 标记；所有样式类名带 `s4tm-` 前缀。
- 每个功能写成独立函数，按页面或子功能分节；能单独失败、单独降级。
- 选择器尽量用语义化属性（`data-*`、`aria-*`、稳定的类名），避免依赖可自动生成的哈希类名。

## 7. 自测

| 场景 | 操作 | 期望 |
| --- | --- | --- |
| 首次安装 | 扩展里安装脚本后打开目标页 | 功能出现，Console 无 error |
| 强制刷新 | `Ctrl + F5` | 行为一致，UI 不重复 |
| SPA 切换 | 站内点进另一页再返回 | 对应页面才生效，离开时清理 |
| 后退 / 前进 | 浏览器后退、前进 | 与首次进入结果一致 |
| 元素缺失 | DevTools 删掉目标节点后等待 | 只 `warn`，页面不报错 |
| 禁用脚本 | 扩展里关闭脚本 | 站点恢复原样，无残留 DOM |
| 窄屏 | 375px 宽度 | 不遮挡站点关键操作 |

## 8. 写文档

- 按 `templates/site-README.md` 的章节顺序填满，不得删节。
- 「已知限制」写触发条件与替代方案。
- 「开发说明」写清依赖的选择器、易碎假设和回归验证步骤。
- 首次发版建 `CHANGELOG.md`，格式见 CONVENTIONS 3.4。

## 9. 登记索引

在根 `README.md` 的「站点索引」表新增一行，`版本` 与脚本 `@version` 一致。

## 10. 提交

```bash
node tools/check.mjs                       # 规范检查，必须无错误
git add sites/<site-key> README.md
git commit -m "feat(<site-key>): <一句话功能>"
```

提交前跑一遍 CONVENTIONS 6.4 的 DoD 清单。
