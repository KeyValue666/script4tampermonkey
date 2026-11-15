# 小红书 · 笔记原图视频下载

> 在小红书笔记页一键把整篇图集的原始图片打包带走、下载无水印视频，不用一张张右键另存。

| 项 | 内容 |
| --- | --- |
| 脚本文件 | [`xiaohongshu-com.user.js`](./xiaohongshu-com.user.js) |
| 当前版本 | `0.3.4` |
| 适配域名 | `https://www.xiaohongshu.com/*`、`https://xiaohongshu.com/*` |
| 脚本管理器 | Tampermonkey 5.x / Violentmonkey 2.x |
| 安装 | [点击安装](https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/xiaohongshu-com/xiaohongshu-com.user.js) |

## 功能

- 在当前打开的图文笔记里读出**全部**图片（含轮播中未滚动到的、懒加载的图），按作者发布顺序编号。
- **视频笔记单独一种面板模式**：视频笔记的 `imageList` 通常只有一张封面，脚本不会把它当成「整篇图集」提供批量下载。视频笔记时隐藏「打包下载 ZIP」和缩略图勾选网格，角标归零，只保留明确标注的视频按钮；封面降级为次要入口「下载封面（静态图）」，不会让你误把封面当视频下。
- **视频笔记判定不依赖 `note.type` 和图片数**：`hasVideoData()` 直接检查 `note.video` 里的视频线索（原片 key、`media.stream`、顶层播放地址），即使 `note.type` 不是 `'video'` 且 `imageList` 里带着封面也能正确判定。SSR 字段完全改版时，还会从页面的 `og:video` / `video` 元素兜底取播放地址，避免退化成图文模式。
- **视频笔记下载无水印原片**：只把 `originVideoKey` / `origin_video_key` 拼出的 `sns-video-bd` 源片当作确定无水印；拿不到时先尝试把带水印流（`/259/`、`_259`）派生成 `/258/`、`_258` 的无水印同源地址，最后才退到带水印的播放流，并在按钮与状态栏明确告诉你拿到的是哪一种，不冒充无水印。视频地址解析失败时面板会写明「未解析到视频地址（检查登录态 / 站点改版）」，而不是静默只剩封面。
- 下载的是 CDN 原始文件：剥掉缩放、格式转换、水印相关的 URL 参数（例如 `imageView2…`、`x-oss-process…`、`!nd_dft_wlteh_webp_3`），不下载页面展示用的压缩图。
- 多源择优：首图会比较同域去参数地址、`ci.xiaohongshu.com`、`sns-img-bd.xhscdn.com`、`sns-img-hw.xhscdn.com` 等干净源，按真实像素尺寸和文件体积挑最优，其余图片沿用这个已验证的源。
- **缩略图预览与单图点选**：面板里 3 列缩略图网格，点选要下载的图，没勾选时默认下载全部。
- 每张图解码后校验分辨率，面板会显示本次下载的**最小尺寸**，方便你核对是不是原图；只拿到带处理参数的版本时会明确告警，不冒充原图。
- 默认打包成一个 ZIP 一次下载，避免浏览器拦截批量下载；也可以选「逐张保存」。
- 文件名带**作者与作品 ID**（`标题_作者_作品ID_序号`），批量下载后不串、好归档。
- 扩展名按文件魔数判断（jpg / png / webp / avif / gif），不会把 webp 错存成 jpg。
- **面板可拖拽**：按住「原图下载」按钮或面板标题栏拖动，位置会被记住；双击复位回默认位置。
- 右下角常驻入口显示当前笔记的图片张数；切换笔记、前进后退后面板不重复注入。

## 使用说明

1. 安装脚本，打开任意一篇小红书笔记（图文或视频，直接进详情页，或从首页、搜索页、用户主页点开弹窗都行）。
2. 页面右下角出现红色「原图下载」按钮，角标是识别到的图片张数；点开面板可看到笔记标题与张数。
3. 图文笔记：点「打包下载 ZIP」下载全部，或先在缩略图网格里点选某几张、再下载选中的图；想直接拿散图就点「逐张保存」。
4. 视频笔记：面板会切成视频模式——**没有「打包下载 ZIP」和缩略图网格**，角标显示 0。视频按钮直接写明能拿到什么：「下载无水印视频」（找到原片标识）、「下载视频（尝试无水印）」（只能靠 258 规律派生）、「下载视频（可能带水印）」（只有播放流）。点一下存成 MP4，状态栏会再次说明实际命中的是哪一种。确实只想要那张静态封面的话，点次要按钮「下载封面（静态图）」。如果连视频按钮都不出现，看 meta 里的「未解析到视频地址」提示，先确认已登录、笔记加载完整。
5. 面板里的「多源择优，保证最高清」默认开启。关掉后只取第一个可用源，速度更快，但个别图可能不是最高质量；设置会被记住。
6. 下载开始后面板出现「取消下载」，可随时中止在途请求；图片一次最多处理 30 张 / 120MB，超限会在状态栏说明并跳过后续图片。
7. 想把面板挪到别处，就按住右下角「原图下载」按钮（或面板展开后的标题栏）拖动；松手后位置被记住，下次打开还是那个位置。拖乱了就双击按钮复位到默认位置。

快捷键 / 开关：无快捷键；开关为面板内的「多源择优」复选框。所有下载都必须由你点击触发，脚本不会自动下载。

## 触发条件与覆盖页面

| 页面 | 是否生效 | 说明 |
| --- | --- | --- |
| 笔记详情页 `/explore/…` | ✅ | 读取页面状态里的完整图集 |
| 笔记详情页 `/discovery/item/…`、`/search_result/…` | ✅ | 同上 |
| 首页、搜索页、用户主页点开的笔记弹窗 | ✅ | 弹窗可能不改动地址栏，脚本会观察弹窗出现后刷新张数 |
| 视频笔记 | ✅ | 面板切视频模式：隐藏 ZIP 与缩略图网格，优先取无水印原片，退化到带水印流时明确标注，封面单独作为次要入口 |
| 站外短链跳转前的中间页 | ❌ | 不匹配 `@match` |

脚本在整个小红书 Web 域生效，是因为笔记详情可以作为弹窗在任意路径上打开、地址栏不固定；但只有识别到当前笔记的图片清单时才会启用下载，其它路径只保留一个常驻入口。

## 权限与隐私

| 项 | 内容 |
| --- | --- |
| `@grant` | `GM_xmlhttpRequest`、`GM_getValue`、`GM_setValue` |
| `@connect` | `xhscdn.com`、`xiaohongshu.com`。脚本管理器会把注册域名下的所有子域一并放行，因此能覆盖不固定的 CDN 子域（含视频域 `sns-video-bd.xhscdn.com`） |
| 读取的数据 | 当前笔记的标题、作者昵称、图片与视频的 CDN 地址与二进制；全部只在本机内存里处理 |
| 写入的数据 | 布尔偏好「多源择优」（`s4tm:xiaohongshu-com:probeQuality`）、面板位置坐标（`s4tm:xiaohongshu-com:position`）；只存这两个必要的本地配置，不存其它数据 |
| 上传的数据 | 无。只向小红书自己的 CDN 发起图片 / 视频 GET，不调用任何第三方接口、不上传页面内容或行为日志 |
| 登录态 | 不读取、不伪造 Cookie 或 token；`GM_xmlhttpRequest` 设 `anonymous: true`、fetch 分支设 `credentials: 'omit'`，两条路径都不携带目标域 Cookie；脚本只下载你已经能在页面上看到的图片与视频 |

## 已知限制

- **作者自己烧进图片里的水印去不掉。** 脚本拿到的是作者上传时的原始文件，平台水印来自 App 端保存时叠加，不走这条路；但上传前就写进像素的水印属于图片内容，任何下载工具都无法无损移除。需要无痕素材请向作者索取原文件。
- **无水印视频依赖原片标识，不是所有笔记都有。** 平台只在 `video.consumer.originVideoKey`（或 `origin_video_key`）里给出无水印源片；未登录、部分笔记或站点改版时该字段可能缺失。此时脚本先尝试把带水印流（`/259/`、`_259`）派生成同源 `/258/`、`_258` 地址——这是社区验证过的路径规律，**不保证一定生效**；仍拿不到就只能下载带水印的播放流，按钮和状态栏会如实提示。作者上传前就烧进画面的水印、以及平台在 App 保存时叠加的水印，任何下载工具都无法无损移除。想稳拿无水印请保持浏览器已登录，仍不行就向作者索取原文件。
- **视频画质受登录态影响**：未登录 / 无 Cookie 时可能只返回低分辨率地址，脚本会在可用档位里挑「分辨率面积 + 码率」最优的一档。
- **SSR 视频字段改版时只能靠 DOM 兜底**：站点若把 `note.video` 的结构改成脚本认不出的样子，脚本会从 `og:video` / 页面 `video` 元素取播放地址，但这些地址通常是播放器流（可能带水印），且信息流页面存在多个 `video` 时可能取到非当前笔记的地址。此时按钮会如实标注「可能带水印」；若连视频按钮都不出现，就只能下载封面。这类结构变动需要更新脚本版本。
- **视频笔记的封面是静态帧，不是视频。** 平台在视频笔记的 `imageList` 里也会塞一张封面，脚本已把它从批量下载入口里剔除，只留「下载封面（静态图）」这个次要按钮；动态部分无法通过静态下载保留，请用平台自带功能。
- **Live 图**：只能拿到静态帧，动态部分无法通过静态下载保留，请用平台自带功能。
- **未登录 / 需要登录才可见的笔记**：页面状态里可能没有完整 `imageList`，脚本会降级从 DOM 读取，此时张数、顺序和清晰度可能下降，面板会标注「页面元素（降级）」。替代做法：先登录并让笔记完整加载再下载。
- **逐张保存**会被 Chrome / Edge 的多文件下载保护拦截一次，需手动允许；ZIP 模式没有这个问题。
- ZIP 用不压缩的 store 模式封装（图片本身已压缩），包体积≈图片总和，峰值内存约为图片总和的 2 倍（原图 buffer + ZIP Blob）；因此限制单次最多 30 张 / 120MB，CRC 与拼装都分片让出主线程，下载后立刻释放 buffer。单个包超过 4 GB 或单张图超过 4 GB 未做 ZIP64 处理，实际图集不会触及。
- **禁用脚本后需刷新页面**：油猴禁用脚本不会通知已注入实例，脚本无法自动卸载。所有监听器、观察者、在途请求与 objectURL 已集中登记并可回收，调试时把 `CONFIG.debug` 改为 `true`，在控制台执行 `__S4TM__.destroy()` 即可主动还原；普通用户刷新一次页面即可彻底回收。
- 站点改版若改变 `imageList` / `video` 结构或 CDN 规则，可能全部取图失败，此时面板会给出失败提示并建议你检查跨域授权；这类改动需要更新脚本版本。
- **改了源码不等于装到浏览器里**：从 raw 链接安装的正式版只随 GitHub 仓库更新，工作区改动需提交推送后 Tampermonkey 才会通过 `@updateURL` 拉到；本机开发可跑 `node tools/dev.mjs` 生成 DEV 壳（见 `docs/DEV_SYNC.md`），并确认 Chrome 已开启「允许访问文件网址」。改完在 Console 查 `document.getElementById('s4tm-xhs-panel')?.dataset.s4tmVersion`，不是最新版本号就说明仍跑着旧脚本；同时按 `@namespace` 检查 Tampermonkey 面板里是否有正式版与 DEV 壳重复安装。
- 只处理当前打开的一篇笔记，不批量抓取信息流、不翻页、不遍历他人主页。请遵守平台条款与图片版权，下载内容仅限个人合理使用。

## 变更记录

见 [CHANGELOG.md](./CHANGELOG.md)。

## 开发说明

**实现要点**

- 数据主路径：`window.__INITIAL_STATE__` → `note.noteDetailMap[笔记ID].note.imageList`。有 `@grant` 时脚本在沙箱里，因此优先读 `unsafeWindow`；SSR 状态可能被 Vue ref 包了几层，用 `unwrap()` 逐层解开。
- 字段回退顺序：`urlDefault` → `url` → `urlPre` → `infoList` 中的 `WB_DFT` / `WB_PRV`。只接受 `xhscdn.com` / `xiaohongshu.com` 的 HTTPS 直链，并排除头像、表情、视频域名。
- 原图 URL = 去掉查询串（含 `imageView2`、`x-oss-process` 等）与 `!` 变换后缀；纯资源 token 额外拼 `ci` / `bd` / `hw` 三个源。带处理参数的原始链只作为最后兜底，并标记为 `clean: false` 上报给用户。
- 视频直链（`parseVideo`）：**只有** `note.video.consumer.originVideoKey` / `origin_video_key` 拼 `https://sns-video-bd.xhscdn.com/{key}` 是确定无水印的原片，同时生成 `sns-video-hw` 同 key 备用节点；key 里的 `\u002F` 字面量会还原成 `/`（从 HTML 源码提取时才需要，读 `__INITIAL_STATE__` 已解码）。两种字段命名都要兼容，漏一种就会退化到带水印流。
- `deriveCleanVideoUrl()`：平台用 `/stream/110/259/xxx_259.mp4` 标记带水印流，`/258/`、`_258` 是同源无水印版。只替换编号、不动域名，已是 258 或不含 259 标记时不凭空造 URL。候选按 `clean`（确定无水印）→ `derived`（258 规律命中，疑似无水印）→ `watermarked`（带水印播放流）排序，`downloadVideo` 顺序尝试并把实际命中的档位如实写进状态栏。视频 URL 校验走独立的 `isValidVideoUrl()`，不能复用图片用的 `isValidCdnUrl()`——后者排除路径含 `video` 的 URL，会误杀视频流。
- 视频笔记判定：`hasVideoData()` 检查 `note.video` 里的视频线索（原片 key、`media.stream`、顶层 `url` / `videoUrl` / `playUrl` / `masterUrl`），命中即为视频笔记；`type === 'video'` 也直接算。**不靠图片数判断**——视频笔记的 `imageList` 里常带一张封面，旧版「无图且有 video」的条件会漏判，把封面当整篇图集下载。SSR 解析不出直链时，`parseVideoFromDom()` 从 `og:video` / 页面 `video` 元素兜底；只有 `note.video` 非空或 `type` 明确时才查 DOM，避免信息流里的其它视频元素误判图文笔记。`collectFromDom()` 降级路径同样会识别视频。
- `applyNoteMode()` 在 `renderMeta()` 末尾统一切换面板模式：视频笔记隐藏「打包下载 ZIP」、缩略图网格与「多源择优」，角标归零，逐张按钮改名为「下载封面（静态图）」；`renderGrid()` 对视频笔记直接返回空网格并清空勾选，避免把封面塞进图片下载链路。视频解析失败（`video.candidates` 为空）时 meta 给出「未解析到视频地址」诊断，视频按钮隐藏但封面入口仍在。
- **CSS 坑**：`.s4tm-xhs-option` 与 `.s4tm-xhs-grid-actions` 都声明了 `display: flex`，会盖过浏览器 UA 的 `[hidden] { display: none }`；必须补 `.xxx[hidden] { display: none; }` 才能让 `hidden` 属性生效。`.s4tm-xhs-btn[hidden]`、`.s4tm-xhs-grid[hidden]`、`.s4tm-xhs-card[hidden]` 同理已显式声明。
- 跨域取资源走 `GM_xmlhttpRequest`（`responseType: blob`），不支持时降级到 `fetch` + `AbortController` 超时；`createImageBitmap` 读真实尺寸，`Image` 兜底。图片请求 Accept 走 image、视频请求走 video。
- 缩略图预览用 `urlDefault`（处理后的缩略图），网格内点选切换 `state.selection`；`downloadAll` 传入选中项，空选中回退全选。切笔记时按 `note.id` 清空选中，避免串到下一篇。
- 面板拖拽（`makeDraggable`）：面板用 `right/bottom` 定位，拖拽把手为 fab 按钮与卡片标题栏，直接更新 `right/bottom` 内联值（不写 `transform`，避免位移与坐标语义混用导致拖出屏）；用 `pointer` 事件 + `setPointerCapture` 覆盖鼠标与触摸，`pointerdown` 记录起始指针位置与当前 `right/bottom`，`pointermove` 按位移反推新值并做视口钳制（保留 8px 边距），`pointerup` 持久化到 `s4tm:xiaohongshu-com:position`。`wasDragged()` 返回值让 fab 的 click 区分「拖动」与「点击」，双击把手复位；所有监听走 `on()` 登记，`destroy()` 统一注销。关闭按钮的 `pointerdown` 已 `stopPropagation`，避免点关闭误触发拖拽。**`releasePointerCapture` 必须传 `pointerId`**：`pointerup` / `pointercancel` 共用的 `end()` 拿不到 event，因此 `pointerdown` 里把 `pointerId` 存进 `activePointerId`，抬手时再传；无参调用会抛 `TypeError: 1 argument required, but only 0 present`。释放包了 `try/catch`，因为 `pointercancel` 时浏览器可能已自动释放。
- ZIP 为脚本内手写的 store 模式实现（CRC32 + 本地头 + 中央目录 + EOCD，UTF-8 文件名标志位），零依赖、可离线运行。
- 每次点击下载都重新解析当前笔记，避免弹窗换篇后下到上一篇；SPA 路由变化只刷新数据，不重建面板。
- 0.1.1 把所有资源集中登记在 `runtime`：`on()` 登记监听器、`later()` 登记定时器、各包装把原始引用压入 `runtime.restores`、`destroy()` 一次性还原。下载链路用 `AbortController` 串联取消，GM 请求登记在 `state.pendingRequests` 以便中止；`downloadAll()` 的 `finally` 主动断开全部 buffer 引用。
- 内存预算：图片 30 张 / 120MB 上限，超限丢弃单张并立刻置空引用；`crc32Chunked()` 每 512KB 让出主线程且与同步 `crc32()` 结果一致，`buildZip()` 每累计 4MB 让出一次。store 模式固有的「buffer + Blob 两份」峰值无法消除，只能靠上限与及时释放控制。视频单独走 `downloadVideo()`，不占用图片字节预算。

**选择器依赖**

| 用途 | 选择器 | 说明 |
| --- | --- | --- |
| 笔记容器（降级路径） | `.note-detail-mask`、`#noteContainer`、`.note-container`、`[class*="note-detail"]`、`.note-slider`、`.note-detail-slider` | 只要命中任一即可把 DOM 抓图范围限制在当前笔记，避免抓到信息流 |
| 标题（降级路径） | `#detail-title`、`.title`、`h1` | 仅用于文件命名，取不到时用文档标题或笔记 ID |
| 兜底单图 | `meta[property="og:image"]` | 状态缺失且页面无 img 时的最后一张图 |
| 自身面板 | `#s4tm-xhs-panel` | 幂等标记，重复挂载时只刷新数据 |

**易碎假设**

- `imageList` 里必须是 CDN HTTPS 直链；若站点换成需要签名的临时 URL 或改字段名，主路径会失效并降级到 DOM。
- `width` / `height` 被当作原图的参考尺寸，用于判断候选源是否达标；站点若只给展示尺寸，判断会偏保守，但首图全源比较仍能选出体积最大的版本。
- `ci.xiaohongshu.com/{token}` 只对纯资源 token 有效，新版带日期目录的 CDN 路径不会拼这个源，自动退回同域去参数地址。
- `video.consumer.originVideoKey` / `origin_video_key` 与 `video.media.stream` 的结构随版本变化，任一缺失都靠另一条兜底；两者都变则视频下载失效（图片不受影响）。
- `/259/` → `/258/` 的无水印派生是**经验规律而非平台契约**：站点若改编号规则或给 258 也加水印，脚本只能拿到带水印流，届时会明确告警而不是静默冒充无水印。
- `@connect` 按注册域名放行全部子域（`xhscdn.com` 覆盖所有 CDN 节点，含视频域）；若站点启用全新的图片 / 视频域名，管理器会弹跨域确认，需要在脚本里补一行 `@connect`。

**回归验证**

1. 打开一篇 9 图的图文笔记，确认右下角角标为 9，面板标题与笔记一致。
2. 点「打包下载 ZIP」，解压后核对 9 张图的分辨率与页面原图一致、无平台水印、顺序正确、文件名含作者与作品 ID。
3. 在缩略图网格里勾选第 1、3、5 张，点「打包下载 ZIP」，确认只下载 3 张且编号仍从 01 连续。
4. 打开视频笔记，确认面板**不显示**「打包下载 ZIP」与缩略图网格、角标为 0、meta 写明「封面仅为静态帧」；按钮显示「下载无水印视频」，点击后得到 MP4、状态栏写「无水印原片」且画面无平台水印。再找一篇只有播放流的笔记，确认按钮与状态栏都明确标注「可能带水印」。
5. 打开视频笔记但让视频解析失败（例如临时清空 `video` 字段），确认 meta 给出「未解析到视频地址」诊断、视频按钮隐藏、「下载封面（静态图）」仍可用；再切回图文笔记，确认 ZIP / 网格 / 多源择优全部恢复、角标等于图片张数。
6. 确认 `note.type` 不是 `'video'` 但 `note.video` 里带原片 key / `media.stream` / 顶层 `url` 时，面板仍切成视频模式（角标 0、ZIP 隐藏）；再确认 `note.video = null` 的图文笔记即使页面里存在其它 `video` 元素也不会被误判。
7. 站内切到另一篇笔记再切回，确认角标随之变化、勾选被清空、`document.querySelectorAll('[data-s4tm]')` 只有 1 个面板。
8. 刷新、前进/后退，确认面板不重复注入、Console 无 error（尤其点开面板时不应出现 `releasePointerCapture` 的 TypeError）。
9. 关掉「多源择优」再下载一次，确认只走单个源且偏好在刷新后仍保留。
10. 拖动「原图下载」按钮到屏幕另一处，刷新页面确认位置保持；双击按钮确认复位到右下角。
11. 在 Console 里执行 `document.getElementById('s4tm-xhs-panel').dataset.s4tm` 确认为 `xhs-downloader`，再执行 `document.getElementById('s4tm-xhs-panel').dataset.s4tmVersion` 确认与头部 `@version` 一致；不一致说明 Tampermonkey 里跑的是旧脚本（正式版未更新、外部资源缓存，或正式版与 DEV 壳重复安装）。
12. 打开一篇视频笔记但面板没识别到视频时，按下面「排障」小节跑诊断脚本，把 `video` 结构贴出来再定位。

**排障：视频识别不到时取真实数据**

站点改版后 `note.video` 的字段名可能超出 `hasVideoData()` 的清单。在**该笔记页面的 Console** 里执行下面这段，把输出的表格与「完整 video 对象」贴给维护者即可针对性补解析，无需截图：

```js
(() => {
  const un = (x) => {
    for (let i = 0; i < 4; i += 1) {
      if (!x || typeof x !== 'object') break;
      if ('_rawValue' in x) x = x._rawValue;
      else if ('value' in x && !Array.isArray(x) && !('imageList' in x)) x = x.value;
      else break;
    }
    return x;
  };
  const st = un(window.__INITIAL_STATE__);
  const noteState = un(st?.note);
  const map = un(noteState?.noteDetailMap);
  const id = location.pathname.match(/\/(?:explore|discovery\/item|search_result)\/([0-9a-z]{24})/i)?.[1];
  const holder = un(map?.[id]) || un(map?.[un(noteState?.currentNoteId)])
    || un(Object.values(map || {})[0]);
  const note = un(holder?.note || holder?.noteInfo || holder);
  const video = un(note?.video);
  const panel = document.getElementById('s4tm-xhs-panel');
  const info = {
    面板版本: panel?.dataset.s4tmVersion ?? '未安装 / 旧版',
    笔记ID: id,
    命中noteDetailMap: !!holder,
    map里的ID: JSON.stringify(Object.keys(map || {}).slice(0, 5)),
    type: note?.type,
    imageList是数组: Array.isArray(un(note?.imageList)),
    imageList长度: un(note?.imageList)?.length,
    video存在: !!video,
    video顶层字段: video ? JSON.stringify(Object.keys(video)) : '[]',
    consumer字段: video?.consumer ? JSON.stringify(Object.keys(un(video.consumer) || {})) : '[]',
    media字段: video?.media ? JSON.stringify(Object.keys(un(video.media) || {})) : '[]',
    stream档位: video?.media?.stream
      ? JSON.stringify(Object.keys(un(video.media.stream) || {})) : '[]',
    页面video元素数: document.querySelectorAll('video').length,
    ogVideo: document.querySelector('meta[property="og:video"]')?.content || null,
  };
  console.table(info);
  console.log('[s4tm] 完整 video 对象:', video);
  return info;
})();
```

判读：`面板版本` 不是最新版本号 → 先更新脚本，别再往下查；`命中noteDetailMap` 为 false → 状态结构或 ID 匹配变了；`video存在` 为 true 但 `video顶层字段` 不在 `hasVideoData()` 清单里 → 需要补字段名；`video存在` 为 false 且 `ogVideo` 为空 → 该笔记的媒体数据确实没随页面给出（未登录、需登录可见、或接口异步返回），脚本只能等数据或降级。
