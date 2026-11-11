# 抖音网页版 · 清爽省流

> 一句话说明：刷视频时把推送广告、营销入口和弹窗清掉，看直播时只留画面与弹幕互动，同时在请求发出前掐掉埋点、广告、预取和特效开销。

| 项 | 内容 |
| --- | --- |
| 脚本文件 | [`douyin-com.user.js`](./douyin-com.user.js) |
| 当前版本 | `0.1.1` |
| 适配域名 | `https://www.douyin.com/*`、`https://live.douyin.com/*` |
| 脚本管理器 | Tampermonkey 5.x / Violentmonkey 2.x |
| 安装 | [点击安装](https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/douyin-com/douyin-com.user.js) |

## 功能

- **请求拦截（默认开启）**：在页面脚本执行前接管 `fetch`、`XMLHttpRequest`、`sendBeacon`、图片与脚本的资源地址赋值、`setAttribute`、`WebSocket` 与 `EventSource`。命中埋点、监控、广告域与上报路径的请求直接不发，被拦的 `fetch` 返回可解析的空 JSON、被拦的 XHR 伪造一次成功回调，站点不会因等待上报而卡住或刷错误日志。
- **从数据源头去广告**：改写推荐流、关注流、搜索结果等接口的响应，剔除带 `is_ads`、`is_ad`、非空 `ad_info` 的条目，广告视频连分片都不会下载；不改动游标、状态码等其它字段，整页全是广告时保留原响应避免页面异常。
- **广告与营销噪音**：按「广告 / 推广 / 赞助」角标、下载与充值按钮、营销弹窗文案给站点节点打标记后隐藏；刷视频时额外收起信息流里的直播推荐卡片。当前视频确实是广告卡片时自动静音并切到下一条。
- **直播模式只留内容与互动**：隐藏顶部导航、榜单、礼物、电商购物车、活动横幅、下载与充值入口、推荐直播位；弹幕列表、发言输入框、发送按钮、清晰度与弹幕设置一律不动。
- **性能开销控制**：移除纯预取节点、把自动预加载降为 metadata、暂停离屏视频、停掉礼物飘屏 / 跑马灯 / 动效横幅的动画与绘制，并屏蔽通知权限申请与推送通知实例。
- **四个独立开关**：清爽、省流、省性能、跳广告，全部可一键暂停、可记住偏好；点「原版界面」或按 `Alt + H` 立刻完整还原站点，网络拦截仍可单独开关。
- **实时计数**：右下角工具条显示本次页面拦掉的请求数与从响应里剔除的广告条数，便于你直接核对效果。

## 使用说明

1. 安装脚本后打开 `www.douyin.com` 或 `live.douyin.com`，刷新一次即默认进入清爽 + 省流 + 省性能 + 跳广告。
2. 右下角小工具条从左到右显示模式（视频 / 直播 / 浏览）、`拦 N · 去广告 M` 统计，以及四个开关按钮。灰色按下状态的按钮表示已开启，红色表示已关闭。
3. 快捷键：`Alt + H` 清爽 / 原版，`Alt + P` 省流开关，`Alt + O` 省性能开关，`Alt + K` 跳广告开关。输入框聚焦时不触发，不影响打字和发弹幕。
4. 验证拦截效果：打开 DevTools 的 Network，搜索 `mon.zijieapi.com` 或 `log/sentry`，开启时无新请求；按 `Alt + P` 暂停后刷新，请求应恢复，工具条也变成「省流 关」。
5. 验证去广告：刷新推荐流，观察工具条「去广告」计数变化，以及信息流里不再出现带广告角标的卡片。
6. 如果拦截后某个功能异常（例如活动页、通知、客户端下载打不开），先按 `Alt + P` 暂停确认是不是黑名单太宽，再提 issue 附上具体请求地址。误判时可以只关「跳广告」，保留请求拦截。

## 触发条件与覆盖页面

脚本头部写两条 `@match`：抖音的短视频与直播间分属 `www.douyin.com`、`live.douyin.com` 两个域，必须同时覆盖；未使用全站通配。运行时再按 URL 分成三种模式：视频模式套用清爽样式、直播模式套用直播精简、浏览模式（直播首页与分类页）只做网络拦截不改界面，避免找不到想看的房间。

| 页面 | 是否生效 | 说明 |
| --- | --- | --- |
| `https://www.douyin.com/` 及 `?recommend=1` 推荐流 | ✅ 视频模式 | 去广告卡片、隐藏营销入口与弹窗、自动跳过广告 |
| `https://www.douyin.com/video/*`、`/search/*`、`/user/*` | ✅ 视频模式 | 同样去广告与营销位，搜索、评论、点赞等交互保留 |
| `https://www.douyin.com/live/<房间号>` | ✅ 直播模式 | 只留画面与弹幕互动 |
| `https://live.douyin.com/<房间号>` | ✅ 直播模式 | 同上；弹幕 WebSocket 与直播流始终放行 |
| `https://live.douyin.com/`、`/categorynew/*`、`/rank*` | 部分 | 网络拦截生效，界面保持原样（浏览模式） |
| 其它未匹配的域名与移动版 | ❌ | 不匹配 `@match` |

## 权限与隐私

| 项 | 内容 |
| --- | --- |
| `@grant` | `none`。网络拦截必须替换页面原生的 `fetch` / `XMLHttpRequest` / `sendBeacon` 等 API，只有页面上下文才有这个能力；不声明任何 GM API、不请求跨域权限 |
| `@connect` | 无，脚本自身不发起任何网络请求 |
| 读取的数据 | 请求 URL 字符串（仅用于匹配黑名单）；推荐流响应的 JSON 文本（仅在本地剔除广告条目）；页面节点的短文案（仅用于判断是否营销入口）。不读请求体、不读 Cookie、不读站点其它存储项 |
| 上传的数据 | 无。被拦请求直接丢弃，不转发、不记录内容、不接第三方统计 |
| 本地存储 | 同源 `localStorage` 四个布尔键：`s4tm:douyin-com:cleanMode`、`guardMode`、`perfMode`、`skipAdsMode` |

注意：`www.douyin.com` 与 `live.douyin.com` 是不同源，四个开关在两边各自保存，需要分别设置一次。脚本不读取或改写站点自身的登录态存储。

## 已知限制

- **浏览器级请求拦不到**：HTML 里静态写死的同步脚本、CSP 的 `report-uri`、Reporting API、Service Worker 发起的请求、以及第三方 iframe 内部自己发的请求，不经过页面的 `fetch` / XHR，用户脚本无法拦截。想连这层一起掐掉，需要配浏览器扩展级拦截（uBlock Origin / AdGuard）或 hosts；脚本能做的是移走命中的脚本、iframe 与预取节点。
- **广告响应过滤依赖明文 JSON**：目前按 `aweme_list` 数组与 `is_ads` / `is_ad` / `ad_info` 字段判断。抖音若改成加密响应、换字段名或换列表结构，这一步会静默失效，但 DOM 层的广告角标隐藏与请求黑名单仍然有效。
- **选择器会随改版失效**：`data-e2e` 属性与节点 id 相对稳定，哈希类名不写进脚本；失效时隐藏规则静默跳过，不白屏也不报错。此时点「原版界面」可完整还原，再提 issue 附上页面结构。
- **自动跳过可能误判**：极端情况下正常视频的描述恰好等于「广告 / 推广」等短文案，会被当作广告卡片跳过。脚本每批复核卡片角标、按视频 id 去重，但挡不住站点改写文案；按 `Alt + K` 关掉即可，其它净化不受影响。
- **直播布局不强改**：脚本只移除冗余区块，播放器尺寸交回抖音自己计算，避免站点换成 grid 布局后错位。想铺满视口请用站点自带的全屏 / 剧场模式按钮。
- **通知被屏蔽**：清爽模式下浏览器通知权限申请一律返回 `denied`，桌面消息提醒会收不到；按 `Alt + P` 暂停拦截也不影响这一项（它由 `CONFIG.blockPush` 控制）。需要通知就得改脚本配置。
- **黑名单不自动更新**：只列了 2026-11 核对过的明确域名与路径，新增上报域不会被自动识别。按 `Alt + P` 立刻全部放行，再提 issue 补名单。
- **被拦的 XHR 是伪成功**：不真正发出请求，但会派发 `load` 事件并返回空 JSON。个别站点代码若强依赖真实响应字段可能停在下一步，遇到功能异常先按 `Alt + P` 确认。
- **兼容性**：Greasemonkey 4 的沙箱与页面上下文差异较大，不保证网络拦截生效；Safari 未测试。

## 变更记录

见 [CHANGELOG.md](./CHANGELOG.md)。

## 开发说明

**实现要点**

- `@run-at document-start`：样式与网络守卫必须在抖音自己的业务脚本执行前装好，否则首屏埋点与广告请求已经发出。样式只注入一份，所有隐藏规则都以 `html[data-s4tm-clean="1"]` 为前缀，移除该属性即可完整还原。
- 模式判定：`live.douyin.com` 下的根路径与分类页走浏览模式，其余房间号走直播模式；`www.douyin.com` 的 `/live/<数字>` 走直播模式，其余走视频模式。`onUrlChange()` 包装 `pushState` / `replaceState` 并监听 `popstate`，路由回调自带 URL 去重。
- 规则判定顺序固定：媒体分片 → 黑名单域 → 业务接口白名单 → 上报 / 广告路径黑名单 → 广告查询参数。默认放行，宁可漏拦也不误伤视频、弹幕、评论与登录。URL 解析与静态判定结果都按 `hostname + pathname` 缓存（去掉带随机签名的 query），上限 600、超限淘汰最早一半而不是整表清空；只有需要看 query 时才跑参数正则。
- 广告数据过滤：fetch 走响应替换（复制 header 并删掉 content-length / content-encoding），XHR 走「在实例上包一层 responseText / response getter」的惰性过滤，结果按原文缓存，避免重复计数。任何解析失败都原样返回站点响应。
- DOM 与性能：MutationObserver 回调只收集新增节点，重活交给 `requestIdleCallback` 分批（每批 160 个）处理；弹幕容器整棵子树跳过扫描，叶子节点不做 `querySelectorAll`，每批最多 24 次子树扫描。视频用 IntersectionObserver 判断是否离屏，**节点被移除时立即 `unobserve`**，否则 IO 的强引用会让已卸载的 video 无法回收。隐藏一律靠打 `data-s4tm-hidden` / `data-s4tm-ad` 标记，不删除站点节点。
- 生命周期与内存：XHR 响应缓存只存短指纹与过滤结果，超过 256KB 的响应不缓存；广告卡片标记每批复核（React 虚拟列表会复用 DOM），角标消失就撤掉标记，按视频 id 决定是否需要再次自动跳过。被拦的 XHR 额外覆盖 `getAllResponseHeaders` / `getResponseHeader` / `responseURL`，避免原生方法因内部状态不一致抛错。
- 对规范 2.7「禁止改写站点全局变量」的**必要偏离**：油猴脚本没有浏览器扩展的请求拦截权限，必须替换 `window.fetch`、`XMLHttpRequest.prototype.open/send`、`navigator.sendBeacon`、`Element.prototype.setAttribute` 与若干资源属性的 setter，以及 `WebSocket` / `EventSource` / `Notification` 的构造引用。替换的只是方法引用，不改站点业务变量、不改 DOM 结构、不覆盖站点基础样式；每个 patch 独立 try/catch。

**选择器依赖**

| 用途 | 选择器 | 说明 |
| --- | --- | --- |
| 页面骨架 | `#root`、`#douyin-header`、`#slidelist`、`#douyin-right-container` | 抖音 Web 的稳定 id；只用于隐藏顶部导航，不匹配时无副作用 |
| 推荐流卡片 | `[data-e2e="feed-item"]`、`[data-e2e="feed-live"]` | 官方埋点属性，2026-11 社区实机核对，比哈希类名稳定 |
| 当前视频 | `[data-e2e="feed-active-video"]` | 自动跳过广告时定位当前卡片 |
| 切换下一条 | `[data-e2e="video-switch-next-arrow"]` | 只做切换，不触发点赞 / 关注 / 送礼 |
| 播放器 | `.xgplayer` 及其内部视频元素 | 语义类名，脚本不改写播放器 DOM |
| 弹幕与发言 | `[data-e2e="chat-send-btn"]`、`[class*="webcast-chatroom"]`、编辑框节点 | 保留区，`classifyClutter()` 遇到这些祖先直接跳过 |
| 直播设置 | `[data-e2e="danmaku-setting-icon"]`、`[data-e2e="gift-setting"]` | 保留，用户仍可开启「屏蔽礼物特效」 |
| 自建工具条 | `#s4tm-douyin-com-bar` | body 下独立节点，带 `data-s4tm` 与 `data-s4tm-mounted` 标记 |

**网络拦截清单**（2026-11 从抖音页面 CSP 的 `report-uri`、`monitor_browser` 上报链、穿山甲 / 巨量引擎广告域与社区脚本中核对）

| 类别 | 目标 | 说明 |
| --- | --- | --- |
| 监控与埋点域 | `mon.zijieapi.com`、`mcs.zijieapi.com`、`mon.snssdk.com`、`log.snssdk.com`、`*.ibytedapm.com` | Slardar / APM / 浏览器性能采集 |
| 错误上报路径 | `i.snssdk.com/log/sentry/...`、`*/log/sentry/`、`*/slardar/`、`*/collect/batch` | 按路径拦，不整域封 `snssdk.com` |
| 广告投放域 | `ad.douyin.com`、`ads.douyin.com`、`ad.snssdk.com`、`pglstatp-toutiao.com`、`pangolin-sdk-toutiao*.com`、`csjplatform.com`、`pangle*.io`、`*.oceanengine.com` | 穿山甲 / 巨量引擎 |
| 第三方广告与统计 | `gdt.qq.com`、`pgdt.gtimg.com`、`hm.baidu.com`、`pos.baidu.com`、`doubleclick.net`、`cnzz.com`、`umeng.com` 等 | 广点通、百度联盟、Google 与国内统计 |
| 站内推广接口 | `/aweme/v1/web/ads/`、`promotion`、`ecommerce`、`goods`、`shop`、`/api/ad/v1/`、`/webcast/ranklist/`、`hot/search/list` | 按精确路径拦，主推荐流不拦请求只过滤响应 |
| 查询参数 | `is_ad=1`、`is_ads=1`、`ad_type=1` 等 | 兜底，业务接口白名单优先 |
| 一律放行 | 视频分片（mp4 / m4s / ts / m3u8 等）、`*.douyinvod.com`、`*.byteimg.com`、`webcast*.douyin.com` 的弹幕长连接、`/aweme/*/comment`、`/webcast/room`、登录与静态资源 | 播放、弹幕、评论、登录不受影响 |

**易碎假设**

- 推荐流响应是明文 JSON，广告条目位于根对象或 `data` 下的 `aweme_list` 数组，且带 `is_ads` / `is_ad` / 非空 `ad_info`。
- `data-e2e` 属性与 `#douyin-header`、`#slidelist` 等 id 继续存在；抖音换成全新的埋点属性时，CSS 隐藏与 DOM 打标记都会失效。
- `@grant none` 下脚本确实运行在页面上下文；脚本管理器若强制沙箱注入，所有网络拦截都会失效（样式与 DOM 部分仍有效）。
- 黑名单域的子域不会承载视频流或弹幕；因此 `MEDIA_PATH_RE` 与业务路径白名单必须始终排在黑名单域之前。
- XHR 的 `responseText` / `response` 仍是原型链上可配置的 getter；浏览器若改为不可配置，XHR 响应过滤会降级，fetch 路径的过滤不受影响。
- 直播子串隐藏规则用 `:is(...)` + `:not([class*="chatroom"])` 保护弹幕区；抖音若把弹幕容器的类名改成不含 chatroom，这条保护会失效，此时先按 `Alt + H` 还原并提 issue。
- 信息流直播卡片的 CSS 隐藏限定在 `#slidelist` 内；站点若换列表容器 id，这部分改由 DOM 打标记兜底。

**回归验证**

1. 打开推荐流：确认工具条出现且只有一个，「去广告」计数随刷新变化，信息流里没有带广告角标的卡片，Console 无 error。
2. 打开 DevTools 的 Network：过滤 `zijieapi` / `sentry` / `oceanengine`，开启时无新请求；按 `Alt + P` 暂停后刷新，请求恢复且按钮显示「省流 关」。
3. 打开任意直播间：确认顶部导航、榜单、礼物与活动位消失，视频正常播放、弹幕持续滚动、发言能发送，清晰度与弹幕设置按钮仍可用。
4. 打开 `live.douyin.com` 首页或分类页：确认界面保持原样（只拦请求），点进房间后自动切成直播模式。
5. 点「原版界面」或按 `Alt + H`：确认站点完整还原；刷新后确认偏好被记住。
6. 站内点进搜索页再返回、浏览器前进 / 后退：确认工具条不重复、模式随 URL 正确切换；在 Console 执行 `document.querySelectorAll('[data-s4tm]')` 检查残留节点。
7. 窄屏（375px）确认工具条换行不遮挡关键操作；在输入框打字时按 `Alt + P` 确认快捷键不触发。
8. 连续刷视频 10 分钟后，在 DevTools 的 Memory 里确认已卸载的 video 节点能被回收（IO 目标已解除观察），工具条计数持续增长但页面不卡顿。
9. 直播间弹幕高速滚动时录一段 Performance：确认脚本的空闲任务没有占满主线程，且弹幕文本与发言框始终可交互。
