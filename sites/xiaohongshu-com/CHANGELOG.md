# 变更记录

## [0.3.0] - 2026-11-14

### 新增

- 面板可拖拽：按住「原图下载」按钮或面板标题栏拖动，直接更新 `right/bottom` 内联值并做视口钳制；拖到别处后位置持久化（`s4tm:xiaohongshu-com:position`），双击把手复位到默认位置。
- 拖拽用 `pointer` 事件 + `setPointerCapture` 覆盖鼠标与触摸；`wasDragged()` 返回值让 fab 的 click 区分「拖动」与「点击」，关闭按钮的 `pointerdown` 已 `stopPropagation` 防止误触发拖拽。

### 修复

- 拖拽后面板消失：初版用 `transform: translate` 写偏移量，但面板是 `right/bottom` 定位，位移语义与坐标语义混用导致向右下拖时面板被推出视口。改为直接更新 `right/bottom`，配合视口钳制，面板不再丢失。

## [0.2.0] - 2026-11-14

### 新增

- 视频笔记下载原片：优先取 `note.video.consumer.originVideoKey` 原画（`sns-video-bd.xhscdn.com`），拿不到再从 `note.video.media.stream` 各清晰度档按「分辨率面积 + 码率」选最优档的 `masterUrl` / `backupUrls[0]`；面板在有视频笔记时显示「下载视频」按钮，落盘为 MP4。
- 缩略图预览与单图点选：面板内 3 列缩略图网格（用 `urlDefault` 缩略图），点选要下载的图；未勾选时默认下载全部，勾选后只下选中的图，编号仍从 01 连续。
- 文件名带作者与作品 ID：`标题_作者_作品ID_序号`，逐段安全化并各自截断 30 字，批量下载后好归档、不串。

### 变更

- `@name` 由「笔记原图批量下载」改为「笔记原图视频下载」，`@description` 同步补充视频下载。
- 笔记对象新增 `type`（`image` / `video`）与 `video`（解析结果或 null）字段；DOM 降级路径同步补齐，保持结构一致。
- `fetchBlob` 增加可选 `accept` 参数，视频请求走 video 的 Accept 头，图片保持 image。
- `downloadAll` 接受可选的选中图片子集，空选中回退全选。

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
