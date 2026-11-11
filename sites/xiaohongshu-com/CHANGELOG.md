# 变更记录

## [0.1.1] - 2026-11-11

### 修复

- 控制 ZIP 峰值内存与主线程占用：一次最多处理 30 张、原始字节总预算 120MB，超限跳过后续图片并提示；CRC32 改为下载阶段分片预计算（每 512KB 让出主线程），ZIP 拼装每累计 4MB 让出一次；下载结束 / 取消 / 失败时在 `finally` 里立刻断开全部图片 buffer 引用。
- 新增「取消下载」按钮与 `AbortController` 链路：GM 请求调 `abort()`、fetch 分支转发取消信号，在途请求立即中止，不再继续占带宽与内存。
- `objectURL` 释放由 60 秒缩到 3 秒，句柄登记后卸载时可提前 revoke，不再让整个 ZIP Blob 长时间挂住内存。
- 补统一资源登记与 `destroy()` 调试接口：监听器、`MutationObserver`、定时器、`waitFor` 清理器、`history` 包装、objectURL、注入节点集中回收；`onUrlChange()` 加防重复包装与还原路径。
- `observeNoteRoot()` 回调改为 160ms 节流，避免无限滚动时每次 DOM 变动都做全文档 `querySelector`；观察器存入 `state` 且可注销。
- `GM_xmlhttpRequest` 补 `anonymous: true`，与 fetch 分支 `credentials: 'omit'` 对齐，跨域取图不携带目标域 Cookie。

### 变更

- `buildZip()` 改为 async（分片让出主线程），CRC 可由 `entry.crc` 预计算传入，未传时回退同步 `crc32()`。已用 Python `zipfile.testzip()` 验证 5 个中文文件名条目、CRC 与内容全部通过。

## [0.1.0] - 2026-11-11

### 新增
- 首个版本：图文笔记一键下载全部图片，从页面状态读取完整图集并按发布顺序编号。
- 剥离 CDN 缩放 / 格式转换 / 水印参数，取原始文件；多源择优按真实分辨率与体积挑最高质量版本。
- 内置零依赖 ZIP 打包（store 模式）与逐张保存两种下载方式。
- 右下角常驻面板显示张数、下载进度、最小分辨率与降级告警；支持 SPA 路由与笔记弹窗切换。
