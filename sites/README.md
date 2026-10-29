# sites —— 站点脚本目录

每个子目录 = 一个站点 = 一个可独立安装的脚本 + 一份功能说明。

```
sites/
└── <site-key>/
    ├── README.md          # 功能说明（必需，用户装之前看的就是它）
    ├── <site-key>.user.js # 用户脚本（必需，唯一代码入口）
    ├── CHANGELOG.md       # 版本记录（可选，发版后建议必需）
    └── assets/            # 截图 / 图标（可选）
```

## 命名

目录名由域名确定性推导：小写，`.` 换成 `-`，省略 `www.`，其它非法字符转 `-` 并合并连续的 `-`。

| 域名 | site-key |
| --- | --- |
| `example.com` | `example-com` |
| `www.example.com` | `example-com` |
| `m.example.com` | `m-example-com` |
| `www.example.co.uk` | `example-co-uk` |

## 目录规则

- 同一站点只建一个目录，脚本文件名与目录同名（`<site-key>.user.js`）。
- 一个站点默认只有一个脚本；功能无法共存时才用 `<site-key>-<feature>.user.js`，并在 README 分节说明、根索引分行登记。
- 脚本自包含：目录内不放 `utils.js`、`config.json`、`src/`，不跨站点共享代码。
- 新增目录的完整流程见 [docs/NEW_SITE.md](../docs/NEW_SITE.md)。

## 索引

新增、下线、改版本后，**必须**同步根 [README.md](../README.md) 的「站点索引」表，`版本` 列与脚本 `@version` 一致。

## 当前站点

- [bilibili-com](./bilibili-com/)：B 站首页推荐 2 行 × 5 列、`Alt + R` 旋转视频、可拖拽个性化面板
