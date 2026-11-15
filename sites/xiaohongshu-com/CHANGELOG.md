# 变更记录

## [0.3.4] - 2026-11-15

### 修复

针对「某篇视频笔记完全没识别出可下载视频」的代码审查，修掉三个会让视频解析根本跑不到的缺陷：

- `findCurrentNote()` 原来要求 `imageList` 必须是数组才认这篇笔记。视频笔记的 `imageList` 可能缺失或不是数组，导致整篇笔记被判无效、直接 `return null`。新增 `looksLikeNote()`：有数组 `imageList`，或 `type === 'video'`，或 `hasVideoData(video)` 任一成立即可；`list` 也改为只在数组时迭代。
- `resolveNote()` 原来只认 `note.images.length > 0`，视频笔记没有封面时会掉进 `collectFromDom()` 降级；该降级在页面没有 `og:video` / video 元素时返回 `type: 'image', video: null`，**把 SSR 已解析出的视频信息覆盖丢掉**。改为「有图或有视频候选」都直接返回 SSR 结果，并保留一层兜底合并。
- `observeNoteRoot()` 只在笔记容器「出现 / 消失」翻转时才 `refresh()`。详情页容器一直存在、媒体数据由客户端异步填充时永远不会重解析，面板停在初始空状态。新增 `scheduleProbe()`：数据未就绪时按 `probeInterval=600ms` 有限重查（最多 `probeMax=30` 次 ≈18 秒），拿到可用内容或次数耗尽即停；`mount()` / `onUrlChange()` / 重复挂载路径都会重置探测窗口，定时器走 `later()` 登记、`destroy()` 统一回收。

### 新增

- README「开发说明」新增「排障：视频识别不到时取真实数据」小节，附一段可直接在 Console 执行的诊断脚本，输出面板版本、`noteDetailMap` 命中情况、`type` / `imageList` / `video` 的字段结构与 `og:video` 状态，便于站点改版后针对性补解析。

## [0.3.3] - 2026-11-15

### 修复

- **点开面板时报 `Uncaught TypeError: ... 1 argument required, but only 0 present`**。`makeDraggable` 的 `end()` 被改成无参函数后仍调用 `releasePointerCapture()`，缺 `pointerId` 必然抛错。改为在 `pointerdown` 里把 `pointerId` 存入 `activePointerId`，抬手时传入并清空；释放包 `try/catch`，避免 `pointercancel` 时浏览器已自动释放导致二次报错。模板 `makeDraggable` 与 `CONVENTIONS` 2.6.1 同步补了这条约束。
- **视频笔记仍被判成图文、下到封面（上一版修复没真正生效）**。上一版只处理了「已判定为视频」之后的面板模式，但判定本身是 `type === 'video' || (images.length === 0 && !!note.video)`：视频笔记的 `imageList` 里带一张封面时 `images.length !== 0`，且 `note.type` 不一定等于 `'video'`，于是直接掉回图文分支，ZIP 与缩略图网格照常显示。改为：
  - `hasVideoData()` 直接检查 `note.video` 里的视频线索（`consumer.originVideoKey` / `origin_video_key`、`media.stream`、顶层 `url` / `videoUrl` / `playUrl` / `masterUrl`），命中即为视频笔记，与图片数无关。
  - `parseVideo()` 同步支持顶层播放地址字段（标 `derived` / `watermarked`，不冒充无水印）。
  - `parseVideoFromDom()`：SSR 字段完全改版时从 `og:video` / 页面 video 元素兜底取播放地址；只在 `note.video` 非空或 `type` 明确时才启用，避免信息流里其它 video 元素把图文笔记误判。`collectFromDom()` 降级路径同样会识别视频，不再因「找不到 img」丢弃整篇视频笔记。
- 面板根节点新增 `data-s4tm-version`（由 `SCRIPT_VERSION` 常量写入，须与 `@version` 同步）。Console 执行 `document.getElementById('s4tm-xhs-panel')?.dataset.s4tmVersion` 可确认浏览器里实际加载的版本，避免把「旧脚本没更新」误判成「修复没生效」。

## [0.3.2] - 2026-11-15

### 修复

- **视频笔记下载到的是封面而不是视频**。视频笔记的 `imageList` 里通常有一张封面，`count=1` 让旧版 `renderMeta` 走了图文分支，于是「共 1 张」、缩略图网格、「打包下载 ZIP」全部照常显示，点 ZIP 拿到的就是封面；若视频地址解析失败，视频按钮还会被隐藏，面板只剩封面这条路，看起来就像脚本把封面当成视频。
- 新增 `applyNoteMode()` 按笔记类型切换面板：视频笔记隐藏「打包下载 ZIP」、缩略图网格、全选/清空与「多源择优」，角标归零，逐张按钮改名为「下载封面（静态图）」；`renderGrid()` 对视频笔记返回空网格并清空勾选，封面不再混进图片下载链路。meta 写明「封面仅为静态帧」；视频解析失败时给出「未解析到视频地址（检查登录态 / 站点改版）」诊断，封面入口仍保留。
- 补 CSS `.s4tm-xhs-option[hidden]` / `.s4tm-xhs-grid-actions[hidden]`：这两处声明了 `display: flex`，会盖过 UA 的 `[hidden] { display: none }`，导致 `hidden` 属性根本藏不住元素。
- `state.ui` 补 `gridActions` / `option` 引用，供模式切换控制显隐。

## [0.3.1] - 2026-11-15

### 修复

- **视频下载不能保证无水印**。`media.stream` 各清晰度档是网页播放器的带水印流（`/259/`、`_259`），旧版把它当「原片」兜底还标成成功；只有 `video.consumer.originVideoKey` 拼 `sns-video-bd` 才是无水印源片。改为：
  - 兼容 `originVideoKey` 与 `origin_video_key` 两种字段命名（漏一种就会退化到带水印流）；还原 key 里可能的 `\u002F`。
  - 生成 `sns-video-bd` + `sns-video-hw` 双无水印候选；旧版 origin 存在时直接返回单候选，bd 取不到就彻底失败，现在有兜底链。
  - 无原片标识时，用 `deriveCleanVideoUrl()` 把 `/259/`、`_259` 派生成同源 `/258/`、`_258` 无水印地址优先尝试；派生不了才退到带水印播放流。
  - 候选按 `clean`（确定无水印）→ `derived`（258 规律，疑似无水印）→ `watermarked`（带水印）排序，按钮文案与状态栏都如实说明实际命中的档位，不冒充无水印。
- 视频 URL 校验拆出独立的 `isValidVideoUrl()`：图片用的 `isValidCdnUrl()` 会排除路径含 `video` 的 URL，用在视频流上会误杀。
- 顺带修掉旧版循环里取到小于 1KB 响应时未重置 `blob`、可能保存垃圾文件的问题。

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
