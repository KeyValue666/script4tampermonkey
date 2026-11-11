# 虎牙直播 · 清爽观影

> 一句话说明：打开虎牙直播间时，页面只剩视频、弹幕列表和发言输入框，其余推荐、礼物、榜单、导航全部收起，并顺手掐掉不影响观看的埋点、广告请求和特效开销。

| 项 | 内容 |
| --- | --- |
| 脚本文件 | [`huya-com.user.js`](./huya-com.user.js) |
| 当前版本 | `0.2.1` |
| 适配域名 | `https://www.huya.com/*` |
| 脚本管理器 | Tampermonkey 5.x / Violentmonkey 2.x |
| 安装 | [点击安装](https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/huya-com/huya-com.user.js) |

## 功能

- 在直播间隐藏下方推荐区（猜你喜欢、推荐分类、主播动态、节目单、公会、广告位），页面不再往下滚出一堆卡片。
- 隐藏礼物栏：既包括外层 60px 占位，也包括播放器内部由 vplayer 动态渲染的白底礼物条、贵族 / 充值 / 礼物信息入口；同时收掉播放器内的水印、二维码、订阅、分享、活动横幅等浮层。
- 隐藏左侧边栏与顶部导航，并把它们占掉的 240px / 60px 空白还给画面；播放器与弹幕栏一起按视口高度铺满，下方不再留黑底。
- 右侧只保留弹幕列表、表情、屏蔽与发言输入框；主播信息头收起后，房间标题和主播名改由顶部一条 36px 的极简工具条显示。
- **性能模式（默认开启）**：拦截埋点、统计、性能上报与广告域的请求（`ylog.huya.com`、`statwup.huya.com`、`metric.huya.com`、`hm.baidu.com`、`ext.huya.com`、广点通相关域，以及 Sentry 的 envelope 路径）。工具条上的「省流 N」实时显示已拦数量。
- 隐藏持续消耗 CPU / GPU 的礼物飘屏、跑马灯、活动横幅、播放器内推荐卡片与广告容器；直播流、弹幕 WebSocket、静态资源、登录与订阅接口一律放行。
- 一键还原：点「原版界面」或按 `Alt + H` 恢复站点原样；点「省流 N」或按 `Alt + P` 暂停拦截，请求立刻恢复正常。两个偏好都会被记住。

## 使用说明

1. 安装脚本后打开任意虎牙直播间，刷新一次页面即默认进入清爽模式与性能模式。
2. 顶部工具条显示房间标题与主播名，右端有「省流 N」和「原版界面」两个按钮；切到原版后工具条缩成左下角的小胶囊。
3. `Alt + H` 切换清爽 / 原版，`Alt + P` 切换性能拦截开关。输入框聚焦时快捷键不触发，不影响打字。
4. 「省流 N」里的数字是本次页面累计拦掉的请求数。想确认效果：打开 DevTools 的 Network，过滤 `ylog.huya.com` 或 `statwup.huya.com`，开启时应无新请求，关闭后立刻恢复。
5. 使用虎牙自带的「网页全屏 / 剧场模式」时，脚本工具条自动让位，由站点自己的全屏布局接管。
6. 如果拦截后某个功能异常（例如活动页打不开），先按 `Alt + P` 暂停；恢复正常说明是黑名单太宽，请提 issue 附上具体请求地址。

## 触发条件与覆盖页面

脚本头部写成 `https://www.huya.com/*`：虎牙直播间地址既有纯数字 ID，也有字母短链和赛事子直播间，`@match` 的通配语法无法精确枚举，所以运行时用 `.room-core` 节点判定，只有确认是直播间才打开清爽开关；网络拦截同样只在直播间 URL 生效，SPA 跳到首页后自动放行。非直播间页面不会隐藏任何东西、也不会拦任何请求。

| 页面 | 是否生效 | 说明 |
| --- | --- | --- |
| `https://www.huya.com/660000` 等数字 ID 直播间 | ✅ | 完整清爽布局 |
| `https://www.huya.com/lpl` 等短链 / 赛事直播间 | ✅ | 额外隐藏赛事头图、多直播间导航与赛事活动区 |
| 虎牙首页、分类页、全部直播、视频、搜索、个人中心 | ❌ | 路径被排除，且运行时找不到 `.room-core` 时直接跳过 |
| 站点自带的网页全屏 / 剧场模式 | 部分 | 顶栏让位，站点自己的全屏布局优先 |

## 权限与隐私

| 项 | 内容 |
| --- | --- |
| `@grant` | `none`。网络拦截必须替换页面原生的 `fetch` / `XMLHttpRequest` / `sendBeacon`，只有 `@grant none` 才保证脚本运行在页面上下文；不再声明任何 GM API |
| `@connect` | 无，脚本自身不发起任何网络请求 |
| 读取的数据 | 页面上的房间标题与主播名（仅显示在自建工具条）；请求 URL 字符串（仅用于匹配黑名单，不读请求体、不看响应内容） |
| 上传的数据 | 无。被拦请求直接丢弃，不转发、不记录内容、不接第三方统计 |
| 本地存储 | 同源 `localStorage` 两个布尔键：`s4tm:huya-com:cleanMode`、`s4tm:huya-com:perfMode` |

0.2.0 从 GM 存储切到 `localStorage`：升级后两个开关会回到默认值（清爽开、性能开），重新点一次即可。不读取站点其它存储项。

## 已知限制

- 虎牙改版后如果选择器失效，隐藏规则会静默不生效，不会白屏也不报错。此时点「原版界面」即可完整还原，再到仓库提 issue 附上页面结构。
- 礼物栏由播放器 JS 动态挂到 `#videoContainer` 内，并可能用内联 `display` 强制打开；脚本除了隐藏，还把它的高度归零、设为不可见不可交互。若虎牙再改成内联 `!important`，该条可能重新露出，此时提 issue 附上节点结构。
- 播放器按视口高度铺满，画面比例由播放器自己处理：视频源不是 16:9 时，播放器内部会出现上下或左右黑边，这属于正常的画面适配，不是页面留白。
- 窄屏（视口宽度小于 900px）下两栏会被改成上下排列，弹幕栏固定 420px 高，需要滚动页面才能看到发言框。
- 只适配带 `www` 的桌面版域名；移动版 `m.huya.com` 与非 `www` 跳转后的地址不在匹配范围内。
- 网络拦截只覆盖 `fetch`、`XMLHttpRequest`、`sendBeacon` 和图片 `src` 赋值。虎牙若改用 iframe、动态 script 或 WebSocket 发埋点，这部分会漏拦；直播与弹幕的 WebSocket 是主动放行的，不碰。
- `performance-report` 与 Sentry SDK 脚本本身仍会加载，并在页面挂自己的 MutationObserver 收集性能数据。油猴脚本无法在 HTML 解析阶段阻止同步 script 执行，只能掐掉它们发出的上报请求；要彻底去掉这层开销得用浏览器扩展级别的请求拦截。
- 黑名单只列已核对过的明确域名，虎牙新增其它上报域不会自动识别。按 `Alt + P` 可立刻全部放行，再提 issue 补名单。
- 被拦的 XHR 是静默丢弃，不触发站点的 error 回调；个别站点代码若硬等回调可能停在那一步。遇到功能异常先按 `Alt + P` 确认是不是拦截导致。
- **禁用脚本后需刷新页面**：油猴禁用脚本不会通知已注入实例，脚本无法自动卸载。所有监听器、观察者与原生 API 包装已集中登记并可还原，调试时把 `CONFIG.debug` 改为 `true`，在控制台执行 `__S4TM__.destroy()` 即可主动还原；普通用户刷新一次页面即可彻底回收。

## 变更记录

见 [CHANGELOG.md](./CHANGELOG.md)。

## 开发说明

**实现要点**

- `@run-at document-start` 尽早注入唯一一份样式；所有隐藏规则都以 `html[data-s4tm-clean="1"]` 为前缀，关闭开关时移除该属性即可完整还原，不改站点任何内联样式。
- 用 `waitFor('.room-core')` 确认页面确实是直播间，超时只输出一条 warn 并跳过，绝不误伤首页。
- 自建工具条是 `body` 下的独立节点，不注入站点容器；SPA 切房间时通过 URL 变化与标题节点的观察器刷新文案，不重复创建节点。
- 布局关键：站点 `.main-wrap` 用 `padding: 60px 0 0 240px` 给顶栏与左栏留位；礼物栏有两处占位——`.room-player-wrap` 的 `padding-bottom: 60px`，以及播放器内部 `.player-wrap` 的 `height: calc(100% - 60px)` + `#player-gift-wrap`。三处都要收回。
- 0.1.0 用 `padding-top: 56.25%` 撑出 16:9，宽屏下高度小于视口，余下部分露出深色页面背景（用户反馈的「下方黑色留白」）。0.1.1 改为 `height: calc(100vh - 36px)`，弹幕栏 `.room-core-r` 的 `height: 100%` 会同步铺满。
- 0.2.0 的网络守卫在 `document-start` 替换页面原生的 `fetch`、`XHR.prototype.open/send`、`navigator.sendBeacon`、`HTMLImageElement.prototype.src`。这是对规范 2.7「禁止改写站点全局变量」的**必要偏离**：油猴脚本没有浏览器扩展的请求拦截权限，不替换这些原生方法就拦不到页面请求；替换的只是方法引用，不改站点业务变量、不碰 DOM 结构、不覆盖样式。每个 patch 独立 `try/catch`，某个 API 被抢占不会带崩其它功能。
- `fetch` 命中黑名单时返回可解析的空 JSON 响应（`{}`），否则站点的 `await` 链会永久挂起；XHR 命中时静默不发送，避免触发站点 error 回调刷日志。计数写按钮文案走 400ms 防抖。
- 0.2.1 把所有资源集中登记在 `runtime`：`on()` 登记监听器、`later()` 登记定时器、各 patch 把原始引用压入 `runtime.restores`、`destroy()` 一次性还原。`PATCHED` Symbol 防止重复注入时层层代理；`watchRoomMeta()` 用 generation 号防止 mount 与路由回调并发建出多个观察器；标题观察回调走 150ms 防抖。

**选择器依赖**

| 用途 | 选择器 | 说明 |
| --- | --- | --- |
| 直播间判定 | `.room-core` | SSR 骨架节点，普通房与赛事房一致，2026-11 实机核对 |
| 左侧栏 | `.mod-sidebar` | 整块隐藏，配合 `.main-wrap` 清零左内边距 |
| 顶部导航 | `#duya-header` | 固定定位，隐藏后同步清零 `.main-wrap` 上内边距 |
| 下方推荐 | `.room-footer` | 内含猜你喜欢、推荐分类、主播动态、公会与广告 |
| 礼物栏外层占位 | `.room-player-gift-placeholder` | 播放器底部 60px 占位 |
| 礼物栏本体 | `#player-gift-wrap`、`.player-gift-left/-right`、`.player-face` | 挂在 `#videoContainer` 内，由 vplayer JS 渲染，白底 60px |
| 播放器画面区 | `#videoContainer .player-wrap` | 站点默认 `height: calc(100% - 60px)`，隐藏礼物栏后必须改成 `100%` |
| 弹幕与发言 | `#chatRoom`、`.chat-room__ft`、`.chat-room__input` | 保留区，禁止隐藏 |
| 右栏冗余 | `.room-sidebar-top`、`.room-sidebar-hd`、`.room-sidebar-tab`、`#wrap-income` 等 | 榜单、活动位、礼物收入、宝箱、公告 |
| 房间标题 | `#J_roomTitle`、`.host-name` | 读取 title 属性 / 文本，失败时回退到页面标题 |
| 全屏降级 | `body.mode-page-theater`、`body.mode-page-full` | 站点原生模式，脚本顶栏让位 |

**网络拦截清单**（2026-11 实抓 `room_normal_b16c8552.js`、`performance-report.global.prod.js`、`huya-kiwi` SDK 与页面请求核对）

| 类别 | 目标 | 来源 |
| --- | --- | --- |
| 启动 / 点击埋点 | `ylog.huya.com` | `(new Image).src = https://ylog.huya.com/d.gif?...` |
| WUP 统计上报 | `statwup.huya.com` | `q.Util.ajax(reportUrl ?timestamp=...)` |
| 性能与第三方统计 | `metric.huya.com`、`hm.baidu.com` | performance-report 的排除 / 上报域列表 |
| 小程序广告中台 | `ext.huya.com` | 「主播优选」悬浮广告，进房会发大量请求 |
| 广告资源 | `xs.gdt.qq.com`、`v.gdt.qq.com`、`snowflake.qq.com` | performance-report 的广点通域列表 |
| 下载引导 | `download.huya.com` | 页面里的客户端下载推广 |
| 错误上报 | `i.huya.com` 的 envelope / store 路径 | Sentry DSN，只按路径匹配，不影响该域其它接口 |

核心域（`www.huya.com`、`api.huya.com`、`livewebbs2.msstatic.com`、`a.msstatic.com` 等）、所有静态资源与 WebSocket 都不在名单里。新增域名必须先在真实页面确认用途，禁止用宽泛关键词匹配。

**易碎假设**

- `.room-core-l` 靠 `margin-right: 350px` 给右侧 340px 弹幕栏让位；站点若改成 grid 布局，这行覆盖可能失效。
- `shouldBlock()` 依赖 `new URL()` 解析相对地址，且依赖 `looksLikeRoom()` 判断当前是否在直播间；站点若改用 `data:` 或 `blob:` 上报，这些会直接放行。
- `.room-core-r` 的 `height: 100%` 依赖 `.room-player-wrap` 撑出 `.room-core` 高度；站点若把右栏改成固定像素高，两栏会重新错开。
- `calc(100vh - 36px)` 里的 36px 是自建顶栏高度；改顶栏高度必须同步改这个值，以及全屏降级里的 `height: 100%`。
- 赛事房比普通房多出 `#matchComponent2`、`.match-room`、`#match-cms-content` 三块装修节点，站点换赛事模板时要重新抓一次结构。

**回归验证**

1. 打开数字 ID 直播间：确认无顶部导航、无左侧栏、无下方推荐、无白底礼物栏，播放器与弹幕栏顶部对齐、一起铺到视口底部，下方没有深色留白。
2. 打开赛事直播间：确认赛事头图、多直播间导航与活动区一并消失。
3. 点「原版界面」或按 `Alt + H`：确认站点界面完整还原；刷新后确认偏好被记住。
4. 切换房间、前进 / 后退后确认工具条只有一个；在 Console 执行 `document.querySelectorAll('[data-s4tm]')` 检查残留节点。
5. 打开虎牙首页，确认页面结构未被改动、埋点请求也未被拦，Console 无 error。
6. 在 DevTools 的 Network 过滤 `ylog.huya.com` 或 `statwup.huya.com`，刷新直播间确认无新请求；按 `Alt + P` 暂停后再刷新，确认请求恢复且「省流」按钮变成「省流 关」。
7. 开启拦截时确认视频正常播放、弹幕持续滚动、发言能发送，Console 无 error。
