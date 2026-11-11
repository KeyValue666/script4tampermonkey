# 小红书 · 笔记原图批量下载

> 在小红书笔记页一键把整篇图集的原始图片打包带走，不用一张张右键另存。

| 项 | 内容 |
| --- | --- |
| 脚本文件 | [`xiaohongshu-com.user.js`](./xiaohongshu-com.user.js) |
| 当前版本 | `0.1.1` |
| 适配域名 | `https://www.xiaohongshu.com/*`、`https://xiaohongshu.com/*` |
| 脚本管理器 | Tampermonkey 5.x / Violentmonkey 2.x |
| 安装 | [点击安装](https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/xiaohongshu-com/xiaohongshu-com.user.js) |

## 功能

- 在当前打开的图文笔记里读出**全部**图片（含轮播中未滚动到的、懒加载的图），按作者发布顺序编号。
- 下载的是 CDN 原始文件：剥掉缩放、格式转换、水印相关的 URL 参数（例如 `imageView2…`、`x-oss-process…`、`!nd_dft_wlteh_webp_3`），不下载页面展示用的压缩图。
- 多源择优：首图会比较同域去参数地址、`ci.xiaohongshu.com`、`sns-img-bd.xhscdn.com`、`sns-img-hw.xhscdn.com` 等干净源，按真实像素尺寸和文件体积挑最优，其余图片沿用这个已验证的源。
- 每张图解码后校验分辨率，面板会显示本次下载的**最小尺寸**，方便你核对是不是原图；只拿到带处理参数的版本时会明确告警，不冒充原图。
- 默认打包成一个 ZIP 一次下载，避免浏览器拦截批量下载；也可以选「逐张保存」。
- 扩展名按文件魔数判断（jpg / png / webp / avif / gif），不会把 webp 错存成 jpg。
- 右下角常驻入口显示当前笔记的图片张数；切换笔记、前进后退后面板不重复注入。

## 使用说明

1. 安装脚本，打开任意一篇小红书图文笔记（直接进详情页，或从首页、搜索页、用户主页点开弹窗都行）。
2. 页面右下角出现红色「原图下载」按钮，角标是识别到的图片张数；点开面板可看到笔记标题与张数。
3. 点「打包下载 ZIP」，浏览器会下载一个以笔记标题命名的压缩包，里面是 `标题_01.jpg`、`标题_02.jpg` 这样按序编号的原图。
4. 想直接拿到散图就点「逐张保存」。浏览器若弹出「是否允许此网站下载多个文件」，选允许即可；嫌麻烦就用 ZIP。
5. 面板里的「多源择优，保证最高清」默认开启。关掉后只取第一个可用源，速度更快，但个别图可能不是最高质量；设置会被记住。
6. 下载开始后面板出现「取消下载」，可随时中止在途请求；一次最多处理 30 张 / 120MB，超限会在状态栏说明并跳过后续图片。

快捷键 / 开关：无快捷键；开关为面板内的「多源择优」复选框。所有下载都必须由你点击触发，脚本不会自动下载。

## 触发条件与覆盖页面

| 页面 | 是否生效 | 说明 |
| --- | --- | --- |
| 笔记详情页 `/explore/…` | ✅ | 读取页面状态里的完整图集 |
| 笔记详情页 `/discovery/item/…`、`/search_result/…` | ✅ | 同上 |
| 首页、搜索页、用户主页点开的笔记弹窗 | ✅ | 弹窗可能不改动地址栏，脚本会观察弹窗出现后刷新张数 |
| 视频笔记 | ⚠️ | 只有封面属于图片，脚本会提示；不下载视频 |
| 站外短链跳转前的中间页 | ❌ | 不匹配 `@match` |

脚本在整个小红书 Web 域生效，是因为笔记详情可以作为弹窗在任意路径上打开、地址栏不固定；但只有识别到当前笔记的图片清单时才会启用下载，其它路径只保留一个常驻入口。

## 权限与隐私

| 项 | 内容 |
| --- | --- |
| `@grant` | `GM_xmlhttpRequest`、`GM_getValue`、`GM_setValue` |
| `@connect` | `xhscdn.com`、`xiaohongshu.com`。脚本管理器会把注册域名下的所有子域一并放行，因此能覆盖不固定的 CDN 子域 |
| 读取的数据 | 当前笔记的标题、作者昵称、图片 CDN 地址与图片二进制；全部只在本机内存里处理 |
| 写入的数据 | 一个布尔偏好「多源择优」，键名 `s4tm:xiaohongshu-com:probeQuality` |
| 上传的数据 | 无。只向小红书自己的 CDN 发起图片 GET，不调用任何第三方接口、不上传页面内容或行为日志 |
| 登录态 | 不读取、不伪造 Cookie 或 token；`GM_xmlhttpRequest` 设 `anonymous: true`、fetch 分支设 `credentials: 'omit'`，两条路径都不携带目标域 Cookie；脚本只下载你已经能在页面上看到的图片 |

## 已知限制

- **作者自己烧进图片里的水印去不掉。** 脚本拿到的是作者上传时的原始文件，平台水印来自 App 端保存时叠加，不走这条路；但上传前就写进像素的水印属于图片内容，任何下载工具都无法无损移除。需要无痕素材请向作者索取原文件。
- **视频笔记和 Live 图**：只能拿到静态封面，不下载视频或动态部分。想保留动态效果请用平台自带功能。
- **未登录 / 需要登录才可见的笔记**：页面状态里可能没有完整 `imageList`，脚本会降级从 DOM 读取，此时张数、顺序和清晰度可能下降，面板会标注「页面元素（降级）」。替代做法：先登录并让笔记完整加载再下载。
- **逐张保存**会被 Chrome / Edge 的多文件下载保护拦截一次，需手动允许；ZIP 模式没有这个问题。
- ZIP 用不压缩的 store 模式封装（图片本身已压缩），包体积≈图片总和，峰值内存约为图片总和的 2 倍（原图 buffer + ZIP Blob）；因此限制单次最多 30 张 / 120MB，CRC 与拼装都分片让出主线程，下载后立刻释放 buffer。单个包超过 4 GB 或单张图超过 4 GB 未做 ZIP64 处理，实际图集不会触及。
- **禁用脚本后需刷新页面**：油猴禁用脚本不会通知已注入实例，脚本无法自动卸载。所有监听器、观察者、在途请求与 objectURL 已集中登记并可回收，调试时把 `CONFIG.debug` 改为 `true`，在控制台执行 `__S4TM__.destroy()` 即可主动还原；普通用户刷新一次页面即可彻底回收。
- 站点改版若改变 `imageList` 结构或 CDN 规则，可能全部取图失败，此时面板会给出失败提示并建议你检查跨域授权；这类改动需要更新脚本版本。
- 只处理当前打开的一篇笔记，不批量抓取信息流、不翻页、不遍历他人主页。请遵守平台条款与图片版权，下载内容仅限个人合理使用。

## 变更记录

见 [CHANGELOG.md](./CHANGELOG.md)。

## 开发说明

**实现要点**

- 数据主路径：`window.__INITIAL_STATE__` → `note.noteDetailMap[笔记ID].note.imageList`。有 `@grant` 时脚本在沙箱里，因此优先读 `unsafeWindow`；SSR 状态可能被 Vue ref 包了几层，用 `unwrap()` 逐层解开。
- 字段回退顺序：`urlDefault` → `url` → `urlPre` → `infoList` 中的 `WB_DFT` / `WB_PRV`。只接受 `xhscdn.com` / `xiaohongshu.com` 的 HTTPS 直链，并排除头像、表情、视频域名。
- 原图 URL = 去掉查询串（含 `imageView2`、`x-oss-process` 等）与 `!` 变换后缀；纯资源 token 额外拼 `ci` / `bd` / `hw` 三个源。带处理参数的原始链只作为最后兜底，并标记为 `clean: false` 上报给用户。
- 跨域取图走 `GM_xmlhttpRequest`（`responseType: blob`），不支持时降级到 `fetch` + `AbortController` 超时；`createImageBitmap` 读真实尺寸，`Image` 兜底。
- ZIP 为脚本内手写的 store 模式实现（CRC32 + 本地头 + 中央目录 + EOCD，UTF-8 文件名标志位），零依赖、可离线运行。
- 每次点击下载都重新解析当前笔记，避免弹窗换篇后下到上一篇；SPA 路由变化只刷新数据，不重建面板。
- 0.1.1 把所有资源集中登记在 `runtime`：`on()` 登记监听器、`later()` 登记定时器、各包装把原始引用压入 `runtime.restores`、`destroy()` 一次性还原。下载链路用 `AbortController` 串联取消，GM 请求登记在 `state.pendingRequests` 以便中止；`downloadAll()` 的 `finally` 主动断开全部 buffer 引用。
- 内存预算：30 张 / 120MB 上限，超限丢弃单张并立刻置空引用；`crc32Chunked()` 每 512KB 让出主线程且与同步 `crc32()` 结果一致，`buildZip()` 每累计 4MB 让出一次。store 模式固有的「buffer + Blob 两份」峰值无法消除，只能靠上限与及时释放控制。

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
- `@connect` 按注册域名放行全部子域（`xhscdn.com` 覆盖所有 CDN 节点）；若站点启用全新的图片域名，管理器会弹跨域确认，需要在脚本里补一行 `@connect`。

**回归验证**

1. 打开一篇 9 图的图文笔记，确认右下角角标为 9，面板标题与笔记一致。
2. 点「打包下载 ZIP」，解压后核对 9 张图的分辨率与页面原图一致、无平台水印、顺序正确。
3. 站内切到另一篇笔记再切回，确认角标随之变化、`document.querySelectorAll('[data-s4tm]')` 只有 1 个面板。
4. 刷新、前进/后退，确认面板不重复注入、Console 无 error。
5. 打开视频笔记，确认给出「没找到图片」提示而不是报错或白屏。
6. 关掉「多源择优」再下载一次，确认只走单个源且偏好在刷新后仍保留。
7. 在 Console 里执行 `document.getElementById('s4tm-xhs-panel').dataset.s4tm` 确认为 `xhs-downloader`。
