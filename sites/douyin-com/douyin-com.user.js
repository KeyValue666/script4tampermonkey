// ==UserScript==
// @name         S4TM · 抖音网页版 · 清爽省流
// @namespace    https://github.com/KeyValue666/script4tampermonkey/sites/douyin-com
// @version      0.2.3
// @description  刷视频去广告与营销弹窗、看直播只留画面和弹幕，并拦截埋点广告请求与预加载开销
// @author       KeyValue666
// @match        https://www.douyin.com/*
// @match        https://live.douyin.com/*
// @icon         https://www.douyin.com/favicon.ico
// @grant        none
// @run-at       document-start
// @noframes
// @homepageURL  https://github.com/KeyValue666/script4tampermonkey/blob/main/sites/douyin-com/README.md
// @supportURL   https://github.com/KeyValue666/script4tampermonkey/issues
// @updateURL    https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/douyin-com/douyin-com.user.js
// @downloadURL  https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/douyin-com/douyin-com.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- 配置 ---------- */

  const SITE_KEY = 'douyin-com';
  const PREFIX = `[s4tm:${SITE_KEY}]`;
  const STYLE_ID = `s4tm-${SITE_KEY}-style`;
  const BAR_ID = `s4tm-${SITE_KEY}-bar`;
  /** 所有站点隐藏规则都限定在 html[data-s4tm-clean] 下，移除属性即完整还原 */
  const CLEAN_ATTR = 'data-s4tm-clean';
  const MODE_ATTR = 'data-s4tm-mode';
  const HIDDEN_ATTR = 'data-s4tm-hidden';
  const AD_ATTR = 'data-s4tm-ad';
  const BLOCK_ATTR = 'data-s4tm-block';

  const MODE = { VIDEO: 'video', LIVE: 'live', BROWSE: 'browse' };

  /** 屏蔽规则的三个维度：作者名必须全等，文案与话题按包含匹配 */
  const RULE_SCOPES = { NAME: 'name', DESC: 'desc', TAG: 'tag' };
  const RULE_KEYS = {
    keywords: 'blockKeywords',
    authors: 'blockAuthors',
    whitelist: 'whiteAuthors',
    markedAds: 'markedAds',
    allowed: 'allowedVideos',
  };

  const CONFIG = {
    /** 本地调试时改 true；提交前必须恢复为 false */
    debug: false,
    /** 等待 body 出现的超时（毫秒） */
    waitTimeout: 12000,
    /** 拦截计数写按钮文案的防抖间隔 */
    countDebounce: 400,
    /** 单次空闲任务最多处理的节点数，避免长任务卡住首屏 */
    idleBatch: 160,
    /** 每批最多做几次子树扫描：弹幕等高频叶子节点不值得逐个 querySelectorAll */
    deepScanBudget: 24,
    /** URL 判定缓存上限；超限时淘汰最早的一半，避免整表清空造成抖动 */
    cacheLimit: 600,
    /** 超过这个长度的 XHR 响应不缓存，避免大字符串长期挂在实例上 */
    maxCachedResponse: 256 * 1024,
    /** 避让测量的最小间隔（毫秒）：弹幕高频插入时不能每批都量一次全文档 */
    avoidThrottle: 400,
    /** 屏蔽浏览器通知权限请求与通知实例：推送广告 */
    blockPush: true,
    /** 移除纯预取 link[rel=prefetch]，不影响当前播放 */
    blockPrefetch: true,
    /** 离屏视频暂停并关闭预加载，降低解码开销 */
    limitOffscreenVideo: true,
    /** 用户自定义规则的数量上限，防止 localStorage 被写满 */
    maxKeywords: 200,
    maxBlockedAuthors: 500,
    maxMarkedAds: 2000,
    maxAllowedVideos: 200,
    /** 跳过广告后的撤销提示保留时间（毫秒） */
    undoToastMs: 5000,
  };

  /*
   * 黑名单只写「广告 / 埋点 / 监控」专用域，2026-11 从抖音页面 CSP 的
   * report-uri（i.snssdk.com/log/sentry/...）、monitor_browser 上报链、
   * 穿山甲 / 巨量引擎广告域与第三方统计域核对。
   * 视频流（douyinvod / byteimg / bytecdn）、弹幕 WebSocket（webcast*.douyin.com）、
   * 静态资源、登录与评论接口一律不在这里，宁可漏拦也不误伤播放与互动。
   */
  const BLOCKED_HOSTS = new Set([
    'mon.zijieapi.com', 'mcs.zijieapi.com', 'mon.snssdk.com',
    'log.snssdk.com', 'ad.snssdk.com', 'ads.snssdk.com',
    'ad.douyin.com', 'ads.douyin.com', 'log.douyin.com',
    'report.douyin.com', 'stat.douyin.com', 'tj.douyin.com',
    'monitor.douyin.com', 'download.douyin.com',
    'ibytedapm.com', 'pglstatp-toutiao.com',
    'pangolin-sdk-toutiao.com', 'pangolin-sdk-toutiao-b.com',
    'csjplatform.com', 'pangle.io', 'pangle-ads.com',
    'oceanengine.com', 'ad.oceanengine.com',
    'gdt.qq.com', 'v.gdt.qq.com', 'xs.gdt.qq.com', 'pgdt.gtimg.com',
    'hm.baidu.com', 'pos.baidu.com', 'cpro.baidu.com',
    'afd.baidu.com', 'duclick.baidu.com',
    'google-analytics.com', 'googletagmanager.com',
    'doubleclick.net', 'googlesyndication.com',
    'cnzz.com', 'umeng.com', 'talkingdata.com', 'mobtech.cn',
  ]);

  /** 这些父域下的任意子域都属于广告 / APM 体系，按后缀拦 */
  const BLOCKED_HOST_SUFFIX = [
    'ibytedapm.com', 'pangle.io', 'pangle-ads.com',
    'pangolin-sdk-toutiao.com', 'oceanengine.com',
    'gdtimg.com', 'cnzz.com', 'umeng.com',
  ];

  /** 媒体分片优先放行：广告视频交给 feed 数据过滤与卡片隐藏处理 */
  const MEDIA_PATH_RE = /\.(?:mp4|m4s|ts|m3u8|mpd|flv|webm|mov|aac|mp3|m4a)(?:\?|$)/i;

  /** 业务接口优先放行，防止下面的路径黑名单误伤评论、登录、弹幕与搜索 */
  const PROTECTED_PATH_PATTERNS = [
    /\/aweme\/v\d+\/web\/(?:comment|danmaku|user|aweme|feed|tab\/feed|follow\/feed)\b/i,
    /\/aweme\/v\d+\/web\/(?:familiar\/feed|channel\/feed|search|collects|favorite|digg)\b/i,
    /\/aweme\/v\d+\/web\/(?:follow|mix|history|im|user\/profile)\b/i,
    /\/webcast\/(?:room|im|chat|user|message|gift|web\/room)\b/i,
    /\/(?:passport|sso|login|captcha|verify)\//i,
    /\.(?:js|css|mjs|map|woff2?|ttf|svg|png|jpe?g|webp|gif|ico)(?:\?|$)/i,
    /\/(?:video|media|vod|play)\//i,
  ];

  /** 明确的上报、广告、热榜与电商推广接口，不做宽泛关键词匹配 */
  const BLOCKED_PATH_PATTERNS = [
    /\/aweme\/v\d+\/web\/(?:ads?|promotion|ecommerce|goods|shop|commerce|brand)\b/i,
    /\/api\/ad\/v\d+\//i,
    /\/webcast\/(?:ranklist|rank\/|promotion|ads?\/|ecommerce|goods\/)/i,
    /\/aweme\/v\d+\/web\/hot\/search\/(?:list|board)/i,
    /\/monitor_browser\//i,
    /\/log\/sentry\//i,
    /\/slardar\//i,
    /\/collect\/(?:batch|log|event)/i,
    /\/(?:apm|telemetry|beacon|metrics|sentry)\/(?:collect|report|upload|batch|v\d+)/i,
    /\/(?:crash|diagnose)\/(?:collect|report|upload|batch|v\d+)/i,
    /\/(?:log|logs|report|statistics|perf|performance)\/(?:upload|collect|batch|report|v\d+)/i,
  ];

  const AD_QUERY_RE = /[?&](?:is_ad|is_ads|isAds|ad_type|from_ad|is_commercial)=(?:1|true)/i;

  /** 响应文本快速预检：没有广告字段就不做整包 JSON 解析与序列化 */
  const AD_FIELD_RE = /"(?:is_ads|is_ad|isAds|ad_info|adInfo|ad_data|adData|ad_label)"/;

  /** 推荐流响应：命中后从 aweme_list 里剔除广告条目，连视频都不再下载 */
  const FEED_SEGMENTS = [
    'tab\\/feed', 'feed', 'channel\\/feed', 'follow\\/feed', 'familiar\\/feed',
    'aweme\\/related', 'aweme\\/post', 'mix\\/aweme',
    'general\\/search\\/single', 'search\\/item', 'discover\\/search',
  ];
  const FEED_PATH_RE = new RegExp(
    `\\/aweme\\/v\\d+\\/web\\/(?:${FEED_SEGMENTS.join('|')})\\/?`,
    'i',
  );

  /** 直播首页 / 分类页只做网络拦截，不改界面，避免找不到想看的房间 */
  const LIVE_BROWSE_RE = /^\/(?:categorynew|category|rank|hot|all|follow|index\.html)?(?:\/|$)/;

  /** 直播间入口不止 /live/<房间号>：从关注页点进去是 /follow/live/<房间号>，
   *  另有 /root/live/ 与 /living/ 形态；SPA 切换不刷新页面，按 URL 判定最稳 */
  const LIVE_ROOM_PATH_RE = /^\/(?:follow\/|root\/)?live\/\d+|^\/living(?:\/|$)/;

  /** 只按精确短文案打标记，视频描述里偶然出现「广告」二字不会误伤 */
  const AD_BADGE_RE = /^(?:广告|推广|赞助|商业推广|了解详情|立即下载|立即购买|去购买|查看详情)$/;
  const CLUTTER_TEXT_RE = new RegExp(
    '^(?:充钻石|客户端|壁纸|小游戏|放映厅|短剧|AI抖音|下载抖音|下载客户端|' +
      '开启通知|立即领取|领取福利|更多直播|推荐直播|排行榜|贵族|粉丝团|' +
      '福袋|红包|小黄车|购物车|去抢购|打开APP|下载APP)$',
  );
  const POPUP_TEXT_RE = /(?:下载抖音|下载客户端|打开\s?APP|领取福利|开启通知)/i;

  const RESOURCE_SELECTOR = [
    'script[src]', 'iframe[src]', 'link[href]', 'img[src]', 'source[src]',
    'video', '[data-e2e]', '[role="dialog"]', 'a[href]',
  ].join(',');

  /*
   * 作者链接不总在 active video 的子树里。2026-11 对照多个活跃油猴脚本核对：
   * 头像链接 a[data-e2e="video-avatar"] 最稳，昵称链接次之，.account 兜底。
   * 按顺序取第一个命中的，避免整卡扫 a[href*="/user/"] 抓到别的视频。
   */
  const AUTHOR_LINK_SELECTORS = [
    'a[data-e2e="video-avatar"][href]',
    '[data-e2e="feed-video-nickname"] a[href]',
    '.account a[href*="/user/"]',
    'a[href*="/user/"]',
  ];
  const AUTHOR_NAME_SELECTORS = [
    '[data-e2e="feed-video-nickname"]',
    '[data-e2e="video-nickname"]',
  ];

  /** 评论框、弹幕发言框与发送按钮：工具条必须给它们让位 */
  const INTERACTIVE_SELECTOR = [
    'input:not([type="hidden"])',
    'textarea',
    '[contenteditable="true"]',
    '[role="textbox"]',
    '[data-e2e="chat-send-btn"]',
    '[data-e2e="comment-send"]',
  ].join(',');

  /** 工具条默认底距，自动避让时用它构造虚拟矩形 */
  const BAR_DEFAULT_BOTTOM = 12;

  /** 内联 SVG，不加载外部资源 */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  /** 盾牌 + 勾：对应「拦截 / 防护已开启」，用作折叠态圆点图标 */
  const SHIELD_PATHS = [
    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    'M9 12l2 2 4-4',
  ];
  /** 双右箭头：展开态的「收起」图标 */
  const CHEVRON_PATHS = ['M7 6l6 6-6 6', 'M14 6l6 6-6 6'];

  const CLEAN_CSS = `
    /* 卡片式工具条：标题 / 统计 / 2×2 开关，不再一字排开 */
    #s4tm-douyin-com-bar {
      box-sizing: border-box;
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 2147483000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 220px;
      max-width: calc(100vw - 24px);
      padding: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      background: rgba(20, 22, 28, 0.94);
      color: #f2f3f5;
      font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI",
        "Microsoft YaHei", sans-serif;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.42);
      user-select: none;
      cursor: grab;
    }

    #s4tm-douyin-com-bar[data-s4tm-dragging="1"] { cursor: grabbing; }

    #s4tm-douyin-com-bar .s4tm-head {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    #s4tm-douyin-com-bar .s4tm-mark {
      flex: none;
      display: flex;
      width: 20px;
      height: 20px;
      color: #2dd36f;
    }

    #s4tm-douyin-com-bar .s4tm-mark svg,
    #s4tm-douyin-com-bar .s4tm-toggle--collapse svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    #s4tm-douyin-com-bar .s4tm-label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      font-size: 13px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #s4tm-douyin-com-bar .s4tm-stat {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      padding: 6px 8px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      font-size: 11px;
      white-space: nowrap;
    }

    #s4tm-douyin-com-bar .s4tm-stat__blocked { color: #7ff7f1; }
    #s4tm-douyin-com-bar .s4tm-stat__ads { color: #ff9bb0; }

    #s4tm-douyin-com-bar .s4tm-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }

    #s4tm-douyin-com-bar .s4tm-toggle {
      box-sizing: border-box;
      min-width: 0;
      border: 1px solid transparent;
      border-radius: 7px;
      padding: 6px 8px;
      background: #2b2f3a;
      color: #f2f3f5;
      font: inherit;
      font-size: 12px;
      white-space: nowrap;
      cursor: pointer;
    }

    #s4tm-douyin-com-bar .s4tm-toggle:hover { background: #3c4252; }

    /* 开启态用抖音青、关闭态压暗；前缀圆点让状态一眼可辨 */
    #s4tm-douyin-com-bar .s4tm-grid .s4tm-toggle[aria-pressed="true"] {
      border-color: rgba(37, 244, 238, 0.28);
      background: rgba(37, 244, 238, 0.12);
      color: #7ff7f1;
    }

    #s4tm-douyin-com-bar .s4tm-toggle[aria-pressed="false"] {
      background: rgba(255, 255, 255, 0.05);
      color: #858c98;
    }

    #s4tm-douyin-com-bar .s4tm-grid .s4tm-toggle::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      margin-right: 6px;
      border-radius: 50%;
      background: currentColor;
      vertical-align: 1px;
    }

    /* 规则按钮独占一行：它是面板开关，不是状态开关，不该混在网格里当第 6 个灯 */
    #s4tm-douyin-com-bar .s4tm-toggle--rules {
      grid-column: 1 / -1;
      border-color: rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.06);
      color: #cfd5e0;
    }
    #s4tm-douyin-com-bar .s4tm-toggle--rules::before { display: none; }
    #s4tm-douyin-com-bar .s4tm-toggle--rules[aria-pressed="true"] {
      border-color: rgba(45, 211, 111, 0.4);
      background: rgba(45, 211, 111, 0.14);
      color: #9df0be;
    }

    #s4tm-douyin-com-bar .s4tm-toggle--guard {
      min-width: 0;
      text-align: center;
    }

    #s4tm-douyin-com-bar .s4tm-toggle--collapse[aria-pressed] {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 5px;
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.06);
      color: #c9ced8;
    }

    #s4tm-douyin-com-bar .s4tm-toggle--collapse:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    /* 图标按状态切换：展开态是收起箭头，折叠态换成盾牌 */
    #s4tm-douyin-com-bar .s4tm-toggle--collapse .s4tm-icon--shield {
      display: none;
    }

    #s4tm-douyin-com-bar[data-s4tm-collapsed="1"]
      .s4tm-toggle--collapse .s4tm-icon--chevron {
      display: none;
    }

    #s4tm-douyin-com-bar[data-s4tm-collapsed="1"]
      .s4tm-toggle--collapse .s4tm-icon--shield {
      display: block;
    }

    /* 折叠成高对比圆点：正向绿 + 白描边 + 外发光，深色页面上也能一眼看到 */
    #s4tm-douyin-com-bar[data-s4tm-collapsed="1"] {
      width: 40px;
      height: 40px;
      padding: 0;
      border: 2px solid rgba(255, 255, 255, 0.92);
      border-radius: 50%;
      background: #2dd36f;
      box-shadow: 0 0 0 4px rgba(45, 211, 111, 0.22), 0 6px 18px rgba(0, 0, 0, 0.45);
      justify-content: center;
    }

    #s4tm-douyin-com-bar[data-s4tm-collapsed="1"] > :not(.s4tm-head) {
      display: none !important;
    }

    #s4tm-douyin-com-bar[data-s4tm-collapsed="1"] > .s4tm-head {
      width: 100%;
      height: 100%;
      padding: 0;
    }

    #s4tm-douyin-com-bar[data-s4tm-collapsed="1"]
      > .s4tm-head > :not(.s4tm-toggle--collapse) {
      display: none !important;
    }

    /* 带 :hover 的高特异性写法，压过通用按钮灰底 */
    #s4tm-douyin-com-bar[data-s4tm-collapsed="1"]
      > .s4tm-head > .s4tm-toggle--collapse,
    #s4tm-douyin-com-bar[data-s4tm-collapsed="1"]
      > .s4tm-head > .s4tm-toggle--collapse:hover {
      width: 100%;
      height: 100%;
      padding: 7px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: #fff;
    }

    #s4tm-douyin-com-bar[data-s4tm-collapsed="1"] .s4tm-toggle--collapse svg {
      width: 100%;
      height: 100%;
    }

    /* 折叠后仍显示拦截数，确认脚本还活着；不接收指针事件，免得挡住展开点击 */
    #s4tm-douyin-com-bar[data-s4tm-collapsed="1"]::after {
      content: attr(data-s4tm-count);
      position: absolute;
      top: -7px;
      right: -9px;
      min-width: 18px;
      padding: 0 4px;
      border-radius: 9px;
      background: #fff;
      color: #2dd36f;
      font-size: 10px;
      font-weight: 700;
      line-height: 16px;
      text-align: center;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
      pointer-events: none;
    }

    /* 站点节点只按标记隐藏；去掉 html 上的 clean 属性即可完整还原 */
    html[data-s4tm-clean="1"] [data-s4tm-hidden="1"],
    html[data-s4tm-clean="1"] [data-s4tm-ad="1"],
    html[data-s4tm-clean="1"] [data-s4tm-block="1"] {
      display: none !important;
    }

    /* 规则面板：默认收起，展开后跟工具条一起走，避免第二个浮层的拖拽与避让 */
    #s4tm-douyin-com-bar .s4tm-rules {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 10px;
    }
    #s4tm-douyin-com-bar .s4tm-rules[hidden] { display: none; }
    #s4tm-douyin-com-bar .s4tm-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    #s4tm-douyin-com-bar .s4tm-section__title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #9aa2b1;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    #s4tm-douyin-com-bar .s4tm-section__title em {
      color: #6f7683;
      font-size: 10px;
      font-style: normal;
      font-weight: 400;
    }
    #s4tm-douyin-com-bar .s4tm-rules__row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    /* 动作按钮改用浅底 + 正常字色，和上面深色开关区分开 */
    #s4tm-douyin-com-bar .s4tm-rules__row .s4tm-toggle {
      background: rgba(255, 255, 255, 0.07);
      color: #e6e9ef;
      text-align: center;
    }
    #s4tm-douyin-com-bar .s4tm-rules__row .s4tm-toggle:hover {
      background: rgba(37, 244, 238, 0.14);
      color: #7ff7f1;
    }
    #s4tm-douyin-com-bar .s4tm-rules__row .s4tm-toggle::before { display: none; }
    #s4tm-douyin-com-bar .s4tm-rules__list {
      display: flex;
      flex-direction: column;
      gap: 3px;
      max-height: 108px;
      overflow-y: auto;
      padding: 4px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.28);
    }
    #s4tm-douyin-com-bar .s4tm-rules__item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 6px;
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.04);
      font-size: 11px;
    }
    /* 关键：display:flex 会盖掉 hidden 的浏览器默认样式，必须显式覆盖 */
    #s4tm-douyin-com-bar .s4tm-rules__item[hidden] { display: none; }
    #s4tm-douyin-com-bar .s4tm-rules__item span {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #s4tm-douyin-com-bar .s4tm-rules__item button {
      flex: none;
      width: 18px;
      height: 18px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: #ff9bb0;
      font: inherit;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
    }
    #s4tm-douyin-com-bar .s4tm-rules__item button:hover {
      background: rgba(255, 155, 176, 0.16);
    }
    #s4tm-douyin-com-bar .s4tm-rules__empty {
      padding: 10px 6px;
      color: #6f7683;
      font-size: 11px;
      text-align: center;
    }
    #s4tm-douyin-com-bar .s4tm-rules__add { display: flex; gap: 6px; }
    #s4tm-douyin-com-bar .s4tm-rules__add input {
      flex: 1;
      min-width: 0;
      box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      padding: 5px 7px;
      background: rgba(0, 0, 0, 0.3);
      color: #f2f3f5;
      font: inherit;
      font-size: 11px;
      cursor: text;
    }
    #s4tm-douyin-com-bar .s4tm-rules__add .s4tm-toggle {
      background: #2dd36f;
      color: #10231a;
      font-weight: 600;
    }
    #s4tm-douyin-com-bar .s4tm-rules__add .s4tm-toggle::before { display: none; }
    #s4tm-douyin-com-bar .s4tm-undo {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 8px;
      background: rgba(45, 211, 111, 0.14);
      color: #9df0be;
      font-size: 11px;
    }
    #s4tm-douyin-com-bar .s4tm-undo[hidden] { display: none; }
    #s4tm-douyin-com-bar .s4tm-undo span {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #s4tm-douyin-com-bar .s4tm-undo button {
      flex: none;
      border: 0;
      border-radius: 5px;
      padding: 2px 8px;
      background: #2dd36f;
      color: #10231a;
      font: inherit;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    /* 只在推荐流列表内收起直播卡片，避免误伤点开的直播间弹层 */
    html[data-s4tm-clean="1"][data-s4tm-mode="video"]
      #slidelist [data-e2e="feed-live"] {
      display: none !important;
    }

    /* 直播模式：顶部导航、榜单、礼物、电商、活动、推荐位 */
    html[data-s4tm-clean="1"][data-s4tm-mode="live"] #douyin-header {
      display: none !important;
    }

    /* 子串规则必须排除弹幕区祖先，否则整块聊天室会被连带隐藏 */
    html[data-s4tm-clean="1"][data-s4tm-mode="live"] :is(
      [data-e2e*="rank"],
      [data-e2e*="Rank"],
      [data-e2e*="shop"],
      [data-e2e*="goods"],
      [data-e2e*="promotion"],
      [data-e2e*="activity"],
      [data-e2e*="banner"],
      [data-e2e*="download"],
      [data-e2e*="recharge"],
      [data-e2e*="recommend"],
      [data-e2e^="ad-"],
      [data-e2e*="advert"]
    ):not([class*="chatroom"]):not([data-e2e*="chat"]):not([contenteditable]) {
      display: none !important;
    }

    /* 底部礼物墙（一排送礼图标）：0.1.1 为避免误伤弹幕里的送礼消息，
       删掉了宽泛的 gift 规则，礼物栏本体从此漏网。这里只认官方埋点属性
       gifts-container，不用 [data-e2e*="gift"]，gift-setting 与弹幕消息
       都不受影响；不绑 mode，SPA 路由判定滞后时也照样隐藏。 */
    html[data-s4tm-clean="1"] [data-e2e="gifts-container"],
    html[data-s4tm-clean="1"] [data-e2e="gift-container"] {
      display: none !important;
    }

    /* 礼物项类名兜底：抖音改掉埋点属性时仍能收起；必须排除弹幕区，
       否则聊天室里的送礼消息会被连带隐藏（0.1.1 踩过的坑） */
    html[data-s4tm-clean="1"]
      [class*="gift_item_gift_bar"]:not([class*="chatroom"]):not([data-e2e*="chat"]) {
      display: none !important;
    }

    /* 礼物飘屏、跑马灯、动图横幅会持续跑动画与 canvas，直接不渲染 */
    html[data-s4tm-clean="1"] [class*="gift-effect"],
    html[data-s4tm-clean="1"] [class*="GiftEffect"],
    html[data-s4tm-clean="1"] [class*="gift-animation"],
    html[data-s4tm-clean="1"] [class*="marquee"],
    html[data-s4tm-clean="1"] [class*="lottie"],
    html[data-s4tm-clean="1"] canvas[class*="effect"],
    html[data-s4tm-clean="1"] [data-e2e*="gift-effect"] {
      display: none !important;
    }

    html[data-s4tm-clean="1"] [class*="banner"] {
      animation: none !important;
      transition: none !important;
    }

    /* 底距保持 12px，与自动避让的虚拟矩形基准一致 */
    @media (max-width: 720px) {
      #s4tm-douyin-com-bar { right: 8px; width: 200px; }
    }
  `;

  const state = {
    mode: MODE.VIDEO,
    cleanEnabled: true,
    guardEnabled: true,
    perfEnabled: true,
    skipAdsEnabled: true,
    blockEnabled: false,
    blockedCount: 0,
    adCount: 0,
    filteredCount: 0,
    countTimer: 0,
    bar: null,
    buttons: {},
    videoObserver: null,
    lastSkippedVid: '',
    barCollapsed: false,
    barPinned: false,
    avoidScheduled: false,
    lastAvoidAt: 0,
    rulePanelOpen: false,
    undoSkipped: null,
    undoTimer: 0,
    /** 规则用数组持久化、Set 做查找索引；只存字符串，不持有 DOM 或响应对象 */
    rules: { keywords: [], authors: [], whitelist: [], markedAds: [], allowed: [] },
    ruleIndex: {
      authors: new Set(),
      whitelist: new Set(),
      markedAds: new Set(),
      allowed: new Set(),
    },
  };

  /* ---------- 工具 ---------- */

  const log = (...args) => {
    if (CONFIG.debug) console.log(PREFIX, ...args);
  };
  const warn = (...args) => console.warn(PREFIX, ...args);

  /**
   * 等待元素出现：用 MutationObserver，不靠猜时间。
   * @param {string} selector
   * @param {{ timeout?: number, root?: ParentNode }} [options]
   * @returns {Promise<Element>}
   */
  function waitFor(selector, { timeout = CONFIG.waitTimeout, root = document } = {}) {
    const found = root.querySelector(selector);
    if (found) return Promise.resolve(found);

    return new Promise((resolve, reject) => {
      const target = root === document ? document.documentElement : root;
      const observer = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (!el) return;
        cleanup();
        resolve(el);
      });
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`waitFor 超时 ${timeout}ms: ${selector}`));
      }, timeout);

      function cleanup() {
        observer.disconnect();
        clearTimeout(timer);
      }

      observer.observe(target, { childList: true, subtree: true });
    });
  }

  /**
   * 注入一段样式，同一个 id 只注入一次。
   * @param {string} id
   * @param {string} css
   */
  function injectStyle(id, css) {
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.setAttribute('data-s4tm', 'style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  /**
   * 监听 SPA 路由变化（pushState / replaceState / popstate / hashchange）。
   * @param {(url: string) => void} handler
   */
  function onUrlChange(handler) {
    let lastUrl = location.href;
    const fire = () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      log('路由变化', lastUrl);
      handler(lastUrl);
    };

    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function patchedHistory(...args) {
        const result = original.apply(this, args);
        fire();
        return result;
      };
    }

    window.addEventListener('popstate', fire);
    window.addEventListener('hashchange', fire);
  }

  /**
   * 配置读写：@grant none 才能在页面上下文替换 fetch / XHR，
   * 因此只写同源 localStorage 的四个布尔键，不读站点其它存储项。
   */
  const store = {
    key: (name) => `s4tm:${SITE_KEY}:${name}`,
    get(name, fallback = null) {
      try {
        const raw = localStorage.getItem(store.key(name));
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        warn('读取配置失败', name, err);
        return fallback;
      }
    },
    set(name, value) {
      try {
        localStorage.setItem(store.key(name), JSON.stringify(value));
      } catch (err) {
        warn('写入配置失败', name, err);
      }
    },
  };

  /** 重活统一丢到空闲时段，MutationObserver 回调本身只收集节点 */
  function scheduleIdle(fn) {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(fn, { timeout: 300 });
    } else {
      setTimeout(fn, 100);
    }
  }

  /**
   * 从 fetch 的第一个参数里取 URL，兼容字符串与 Request 对象。
   * @param {unknown} input
   * @returns {string}
   */
  function extractUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  /**
   * 两个矩形是否相交。DOMRect 与自定义矩形都能用。
   * @param {{ left: number, right: number, top: number, bottom: number }} a
   * @param {{ left: number, right: number, top: number, bottom: number }} b
   * @returns {boolean}
   */
  function rectsIntersect(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  /**
   * 创建内联 SVG 图标。逐节点构造，不用 innerHTML、不加载任何外部资源。
   * @param {string[]} paths
   * @param {'shield'|'chevron'} variant
   * @returns {SVGElement}
   */
  function makeIcon(paths, variant) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', `s4tm-icon s4tm-icon--${variant}`);
    svg.setAttribute('aria-hidden', 'true');
    for (const d of paths) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    }
    return svg;
  }

  /** 被拦的 fetch 必须返回可解析的响应，否则站点的 await 链会永久挂起 */
  function emptyJsonResponse() {
    if (typeof Response === 'function') {
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
      clone() { return this; },
    };
  }

  /**
   * 限制 Map 体积：淘汰最早插入的一半，避免整表清空造成命中率抖动。
   * @param {Map} map
   * @param {number} limit
   */
  function trimCache(map, limit) {
    if (map.size <= limit) return;
    let remove = Math.ceil(limit / 2);
    for (const key of map.keys()) {
      map.delete(key);
      remove -= 1;
      if (remove <= 0) break;
    }
  }

  function countBlocked() {
    state.blockedCount += 1;
    scheduleBarUpdate();
  }

  function countAds(removed) {
    state.adCount += removed;
    scheduleBarUpdate();
  }

  function countFiltered(removed) {
    state.filteredCount += removed;
    scheduleBarUpdate();
  }

  /** 计数只用于按钮文案，防抖避免高频 DOM 写入 */
  function scheduleBarUpdate() {
    if (state.countTimer) return;
    state.countTimer = setTimeout(() => {
      state.countTimer = 0;
      updateBar();
    }, CONFIG.countDebounce);
  }

  /* ---------- 业务：规则判定 ---------- */

  const URL_CACHE = new Map();
  const VERDICT_CACHE = new Map();

  /**
   * 解析 URL。抖音请求几乎都带随机签名参数，缓存键必须去掉 query，
   * 否则缓存永远不命中、还会反复「填满 600 条再整表清空」。
   * 只缓存 hostname / pathname，search 每次从原始串里取。
   * @param {unknown} rawUrl
   * @returns {{ hostname: string, pathname: string, search: string } | null}
   */
  function parseUrl(rawUrl) {
    const raw = String(rawUrl ?? '');
    if (!raw || /^(?:blob|data|about|javascript):/i.test(raw)) return null;

    const queryAt = raw.indexOf('?');
    const hashAt = raw.indexOf('#');
    const queryEnd = hashAt > queryAt && hashAt !== -1 ? hashAt : raw.length;
    const search = queryAt === -1 ? '' : raw.slice(queryAt, queryEnd);
    const path = queryAt === -1 ? raw.slice(0, queryEnd) : raw.slice(0, queryAt);
    // 根相对路径不受 SPA 路由影响，也能安全缓存；其它相对路径每次重算
    const cacheable = /^[a-z][a-z0-9+.-]*:\/\//i.test(path) || path.startsWith('/');

    let base = cacheable ? URL_CACHE.get(path) : undefined;
    if (base === undefined) {
      try {
        const url = new URL(path, location.href);
        base = {
          hostname: url.hostname.toLowerCase(),
          pathname: url.pathname.toLowerCase(),
        };
      } catch (err) {
        base = null;
      }
      if (cacheable) {
        trimCache(URL_CACHE, CONFIG.cacheLimit);
        URL_CACHE.set(path, base);
      }
    }
    if (!base) return null;
    return { hostname: base.hostname, pathname: base.pathname, search };
  }

  /**
   * 域名是否属于已核对的广告 / 埋点专用域。
   * @param {string} hostname
   * @returns {boolean}
   */
  function matchesBlockedHost(hostname) {
    if (BLOCKED_HOSTS.has(hostname)) return true;
    return BLOCKED_HOST_SUFFIX.some((suffix) => hostname.endsWith(`.${suffix}`));
  }

  /**
   * 是否要拦掉这个请求。顺序：媒体 > 黑名单域 > 业务接口 > 黑名单路径 > 广告参数。
   * 静态判定结果按 hostname + pathname 缓存，只有需要看 query 时才跑参数正则。
   * 默认放行，宁可漏拦也不能误伤视频、弹幕与账号操作。
   * @param {string} rawUrl
   * @returns {boolean}
   */
  function shouldBlock(rawUrl) {
    if (!state.guardEnabled || !rawUrl) return false;
    const parsed = parseUrl(rawUrl);
    if (!parsed) return false;
    const { hostname, pathname, search } = parsed;
    const key = `${hostname}${pathname}`;

    let verdict = VERDICT_CACHE.get(key);
    if (verdict === undefined) {
      if (MEDIA_PATH_RE.test(pathname)) verdict = 'allow';
      else if (matchesBlockedHost(hostname)) verdict = 'block';
      else if (PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(pathname))) {
        verdict = 'allow';
      } else if (BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(pathname))) {
        verdict = 'block';
      } else {
        verdict = 'query';
      }
      trimCache(VERDICT_CACHE, CONFIG.cacheLimit);
      VERDICT_CACHE.set(key, verdict);
    }

    if (verdict === 'block') return true;
    if (verdict === 'allow') return false;
    return AD_QUERY_RE.test(search);
  }

  /**
   * 是否为推荐流接口（响应里的广告条目需要剔除）。
   * @param {string} rawUrl
   * @returns {boolean}
   */
  function isFeedUrl(rawUrl) {
    const parsed = parseUrl(rawUrl);
    return Boolean(parsed && FEED_PATH_RE.test(parsed.pathname));
  }

  /**
   * 页面模式：看直播 / 刷视频 / 找直播。
   * @returns {string}
   */
  function currentMode() {
    const path = location.pathname;
    if (location.hostname === 'live.douyin.com') {
      // 先认房间路径：/follow/live/<id> 会被下面的浏览页正则误吞
      if (LIVE_ROOM_PATH_RE.test(path)) return MODE.LIVE;
      return path === '/' || LIVE_BROWSE_RE.test(path) ? MODE.BROWSE : MODE.LIVE;
    }
    if (/^\/live\/?$/.test(path)) return MODE.BROWSE;
    if (LIVE_ROOM_PATH_RE.test(path)) return MODE.LIVE;
    return MODE.VIDEO;
  }

  /* ---------- 业务：用户自定义屏蔽规则 ---------- */

  /**
   * 从 aweme 条目里抽出稳定标识与可匹配文本。字段名带多套兼容写法，
   * 抖音改版换其中一种时规则不会整批失效。
   * @param {unknown} item
   * @returns {{ vid: string, authorId: string, nickname: string,
   *   desc: string, tags: string[] } | null}
   */
  function extractItemInfo(item) {
    if (!item || typeof item !== 'object') return null;
    const author = item.author && typeof item.author === 'object' ? item.author : {};
    const desc = item.desc ?? item.title;
    const tags = [];
    for (const key of ['text_extra', 'extra']) {
      const extras = item[key];
      if (!Array.isArray(extras)) continue;
      for (const extra of extras) {
        const tag = extra && (extra.hashtag_name || extra.hashtagName);
        if (typeof tag === 'string' && tag) tags.push(tag);
      }
    }
    return {
      vid: String(item.aweme_id ?? item.awemeId ?? item.group_id ?? ''),
      authorId: String(author.uid ?? author.sec_uid ?? author.id ?? ''),
      nickname: typeof author.nickname === 'string' ? author.nickname : '',
      desc: typeof desc === 'string' ? desc : '',
      tags,
    };
  }

  /** 重建 Set 索引：规则数量有硬上限，全量重建比增量同步更不容易出错 */
  function rebuildRuleIndex() {
    state.ruleIndex.authors = new Set(
      state.rules.authors.map((item) => item.id).filter(Boolean),
    );
    state.ruleIndex.whitelist = new Set(
      state.rules.whitelist.map((item) => item.id).filter(Boolean),
    );
    state.ruleIndex.markedAds = new Set(state.rules.markedAds.filter(Boolean));
    state.ruleIndex.allowed = new Set(state.rules.allowed.filter(Boolean));
  }

  /** 只保留结构正确的数据，避免手改 localStorage 后整页报错 */
  function sanitizeRules(name, raw) {
    if (!Array.isArray(raw)) return [];
    if (name === 'keywords') {
      return raw.filter((item) => item && typeof item.text === 'string' && item.text
        && Array.isArray(item.scopes))
        .slice(0, CONFIG.maxKeywords)
        .map((item) => ({
          text: item.text.slice(0, 40),
          scopes: item.scopes.filter((scope) => Object.values(RULE_SCOPES).includes(scope)),
        }));
    }
    if (name === 'authors' || name === 'whitelist') {
      return raw.filter((item) => item && typeof item.id === 'string' && item.id)
        .slice(0, CONFIG.maxBlockedAuthors)
        .map((item) => ({
          id: item.id.slice(0, 64),
          name: typeof item.name === 'string' ? item.name.slice(0, 40) : '',
        }));
    }
    const limit = name === 'markedAds' ? CONFIG.maxMarkedAds : CONFIG.maxAllowedVideos;
    return raw.filter((item) => typeof item === 'string' && item)
      .slice(0, limit)
      .map((item) => item.slice(0, 64));
  }

  function loadRules() {
    for (const [name, storeKey] of Object.entries(RULE_KEYS)) {
      state.rules[name] = sanitizeRules(name, store.get(storeKey, []));
    }
    rebuildRuleIndex();
  }

  function saveRules(name) {
    store.set(RULE_KEYS[name], state.rules[name]);
    rebuildRuleIndex();
  }

  /**
   * 添加一条规则。白名单 / 放行优先的规则仍限制条数，防止本地存储被写满。
   * @param {keyof state.rules} name
   * @param {unknown} value
   * @returns {boolean} 是否真的新增
   */
  function addRule(name, value, limit) {
    const list = state.rules[name];
    const exists = name === 'keywords'
      ? list.some((item) => item.text === value.text
        && item.scopes.slice().sort().join() === value.scopes.slice().sort().join())
      : list.includes(value);
    if (exists) return false;
    if (list.length >= limit) {
      warn('规则数量已达上限', name, limit);
      return false;
    }
    list.push(value);
    saveRules(name);
    return true;
  }

  /**
   * 删除一条规则。关键词按文本匹配，其余按 id / 值匹配。
   * @param {keyof state.rules} name
   * @param {string} value
   */
  function removeRule(name, value) {
    const list = state.rules[name];
    const index = list.findIndex((item) => (
      typeof item === 'string' ? item === value : (item.id === value || item.text === value)
    ));
    if (index === -1) return;
    list.splice(index, 1);
    saveRules(name);
    log('规则已删除', name, value);
  }

  /**
   * 对单条内容套用用户规则。白名单与本条放行优先于一切屏蔽；
   * 手动标记的广告即使站点没打广告字段也按广告处理。
   * @param {ReturnType<typeof extractItemInfo>} info
   * @returns {'allow' | 'block' | null}
   */
  function matchUserRules(info) {
    if (!info) return null;
    if (state.ruleIndex.allowed.has(info.vid)) return 'allow';
    if (info.authorId && state.ruleIndex.whitelist.has(info.authorId)) return 'allow';
    if (info.vid && state.ruleIndex.markedAds.has(info.vid)) return 'block';
    if (!state.blockEnabled) return null;
    if (info.authorId && state.ruleIndex.authors.has(info.authorId)) return 'block';

    for (const rule of state.rules.keywords) {
      const needle = rule.text.toLowerCase();
      if (rule.scopes.includes(RULE_SCOPES.NAME)
        && info.nickname.toLowerCase() === needle) return 'block';
      if (rule.scopes.includes(RULE_SCOPES.DESC)
        && info.desc.toLowerCase().includes(needle)) return 'block';
      if (rule.scopes.includes(RULE_SCOPES.TAG)
        && info.tags.some((tag) => tag.toLowerCase().includes(needle))) return 'block';
    }
    return null;
  }

  /**
   * 从卡片 DOM 读取可匹配信息。文字兜底只在数据层没覆盖到时使用，
   * 因此只认作者链接与描述节点这两个稳定特征，不做整卡文本模糊扫描。
   * @param {Element} [card]
   * @returns {{ vid: string, authorId: string, nickname: string,
   *   desc: string, tags: string[] } | null}
   */
  function readCardInfo(card) {
    const active = card || document.querySelector('[data-e2e="feed-active-video"]');
    if (!active) return null;
    // 作者链接在 feed-item 的头部，未必在 active 节点子树里；但绝不能跨出
    // feed-item 往上找，否则会抓到相邻视频的作者，屏蔽错人。
    const feedItem = active.closest('[data-e2e="feed-item"]');
    const owner = feedItem || active;
    let author = null;
    for (const selector of AUTHOR_LINK_SELECTORS) {
      const found = owner.querySelector(selector);
      if (found) {
        author = found;
        break;
      }
    }
    const href = author ? (author.getAttribute('href') || '') : '';
    const matched = href.match(/\/user\/([^/?#]+)/);

    let nickname = '';
    for (const selector of AUTHOR_NAME_SELECTORS) {
      const node = owner.querySelector(selector);
      if (node && (node.textContent || '').trim()) {
        nickname = (node.textContent || '').trim();
        break;
      }
    }
    if (!nickname && author) nickname = (author.textContent || '').trim();

    const descEl = owner.querySelector('[data-e2e="video-desc"], [data-e2e="desc"]');
    const desc = descEl ? (descEl.textContent || '').trim() : '';
    const tags = [];
    for (const part of desc.match(/#([^\s#]+)/g) || []) tags.push(part.slice(1));
    return {
      vid: active.getAttribute('data-e2e-vid')
        || owner.getAttribute('data-e2e-vid') || '',
      authorId: matched ? matched[1] : '',
      nickname,
      desc,
      tags,
    };
  }

  /* ---------- 业务：推荐流广告数据过滤 ---------- */

  /**
   * 判断单条 aweme 是否为广告投放内容。只看真值字段，空 ad_info 不算广告。
   * @param {unknown} item
   * @returns {boolean}
   */
  function isAdItem(item) {
    if (!item || typeof item !== 'object') return false;
    if (item.is_ads === true || item.is_ad === true || item.isAds === true) return true;
    const info = item.ad_info || item.adInfo || item.ad_data || item.adData;
    if (info && typeof info === 'object' && Object.keys(info).length > 0) return true;
    return typeof item.ad_label === 'string' && item.ad_label.trim().length > 0;
  }

  /**
   * 从任意层级的响应对象里找出 aweme_list 数组。
   * @param {object} data
   * @returns {Array[]}
   */
  function findFeedLists(data) {
    const lists = [];
    if (!data || typeof data !== 'object') return lists;
    const collect = (node) => {
      if (node && Array.isArray(node.aweme_list)) lists.push(node.aweme_list);
    };
    collect(data);
    if (data.data && typeof data.data === 'object') {
      collect(data.data);
      if (Array.isArray(data.data)) lists.push(data.data);
    }
    return lists;
  }

  /**
   * 剔除推荐流响应里的广告与命中用户规则的条目；全被剔除或不是 feed
   * 结构时原样返回。白名单 / 本条放行优先于广告与屏蔽规则。
   * @param {string} text
   * @returns {{ text: string, ads: number, filtered: number }}
   */
  function filterFeedPayload(text) {
    const none = { text, ads: 0, filtered: 0 };
    if (typeof text !== 'string' || !text.trim().startsWith('{')) return none;
    // 没有任何规则启用时保留原来的快速预检，不做无谓的整包 JSON 解析
    const hasRules = state.blockEnabled
      || state.ruleIndex.markedAds.size > 0
      || state.ruleIndex.allowed.size > 0
      || state.ruleIndex.whitelist.size > 0;
    if (!hasRules && !AD_FIELD_RE.test(text)) return none;
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return none;
    }

    const lists = findFeedLists(data);
    if (!lists.length) return none;

    let ads = 0;
    let filtered = 0;
    for (const list of lists) {
      const removeIndexes = [];
      let adsInList = 0;
      let filteredInList = 0;
      for (let i = 0; i < list.length; i += 1) {
        // 完全没有用户规则时走原来的快路径，不给每条内容构造匹配对象
        if (!hasRules) {
          if (isAdItem(list[i])) {
            removeIndexes.push(i);
            adsInList += 1;
          }
          continue;
        }
        const verdict = matchUserRules(extractItemInfo(list[i]));
        if (verdict === 'allow') continue;
        if (verdict === 'block') {
          removeIndexes.push(i);
          filteredInList += 1;
        } else if (isAdItem(list[i])) {
          removeIndexes.push(i);
          adsInList += 1;
        }
      }
      // 留空会让站点认为推荐流异常，宁可这一页不剔
      if (!removeIndexes.length || removeIndexes.length === list.length) continue;
      // 倒序删除，避免展开超大数组时触发参数数量上限
      for (let i = removeIndexes.length - 1; i >= 0; i -= 1) {
        list.splice(removeIndexes[i], 1);
      }
      ads += adsInList;
      filtered += filteredInList;
    }

    if (!ads && !filtered) return none;
    try {
      return { text: JSON.stringify(data), ads, filtered };
    } catch (err) {
      return none;
    }
  }

  /**
   * fetch 响应改写：只动 JSON 文本，其余 header / 状态码照抄。
   * @param {Response} response
   * @returns {Promise<Response>}
   */
  async function filterFeedResponse(response) {
    if (!response || !response.ok || typeof response.clone !== 'function') return response;
    // opaque / error 响应读不到正文，直接放行，别白读一次流
    if (response.type && response.type !== 'basic' && response.type !== 'default') {
      return response;
    }
    const type = response.headers && response.headers.get('content-type');
    if (type && !/json|text/i.test(type)) return response;

    try {
      const original = await response.clone().text();
      const result = filterFeedPayload(original);
      if (!result.ads && !result.filtered) return response;
      countAds(result.ads);
      countFiltered(result.filtered);
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      return new Response(result.text, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      return response;
    }
  }

  /* ---------- 业务：网络请求拦截 ---------- */

  const XHR_BLOCKED = Symbol('s4tm-blocked');
  const XHR_FEED = Symbol('s4tm-feed');
  const XHR_CACHE = new WeakMap();
  const XHR_COUNTED = new WeakSet();
  const PATCHED_FEED_XHRS = new WeakSet();

  /** 被拦的 XHR 不能静默不回调：伪造一次成功，避免站点 await 卡住 */
  function fakeXhrSuccess(xhr) {
    const define = (name, value) => {
      try {
        Object.defineProperty(xhr, name, { configurable: true, value });
      } catch (err) {
        log('XHR 伪响应字段设置失败', name);
      }
    };
    define('readyState', 4);
    define('status', 200);
    define('statusText', 'OK');
    define('responseText', '{}');
    define('response', '{}');
    define('responseURL', '');
    // 原生 header 方法检查的是内部状态（仍是 OPENED），不覆盖就会抛
    // InvalidStateError，站点控制台会多一条 error
    define('getAllResponseHeaders', () => '');
    define('getResponseHeader', () => null);

    // 晚一个宏任务再派发，等调用方把 onload / onreadystatechange 挂上
    setTimeout(() => {
      for (const type of ['readystatechange', 'load', 'loadend']) {
        try {
          xhr.dispatchEvent(new Event(type));
        } catch (err) {
          log('XHR 伪响应事件派发失败', type);
        }
      }
    }, 0);
  }

  /**
   * XHR 的 responseText / response 是只读 getter，没法改已有响应。
   * 做法：在实例上包一层 getter，站点读取时惰性过滤；只缓存短指纹与结果，
   * 不把整份原始响应挂在 WeakMap 的 value 上，计数按实例去重。
   * @param {XMLHttpRequest} xhr
   */
  function patchFeedXhr(xhr) {
    if (PATCHED_FEED_XHRS.has(xhr)) return;
    PATCHED_FEED_XHRS.add(xhr);
    const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (!proto) return;
    const textDesc = Object.getOwnPropertyDescriptor(proto, 'responseText');
    const responseDesc = Object.getOwnPropertyDescriptor(proto, 'response');
    if (!textDesc || !textDesc.get || !responseDesc || !responseDesc.get) return;

    /**
     * @param {XMLHttpRequest} instance
     * @param {string} raw
     * @returns {string}
     */
    const filterText = (instance, raw) => {
      if (typeof raw !== 'string' || !raw) return raw;
      const fingerprint = raw.length > 4096 ? `${raw.length}:${raw.slice(0, 64)}` : raw;
      const cached = XHR_CACHE.get(instance);
      if (cached && cached.fp === fingerprint) return cached.text;

      const result = filterFeedPayload(raw);
      if ((result.ads || result.filtered) && !XHR_COUNTED.has(instance)) {
        XHR_COUNTED.add(instance);
        countAds(result.ads);
        countFiltered(result.filtered);
      }
      if (raw.length <= CONFIG.maxCachedResponse) {
        XHR_CACHE.set(instance, { fp: fingerprint, text: result.text });
      }
      return result.text;
    };

    try {
      Object.defineProperty(xhr, 'responseText', {
        configurable: true,
        get() {
          let raw = '';
          try {
            raw = textDesc.get.call(this);
          } catch (err) {
            return '';
          }
          return filterText(this, raw);
        },
      });
      Object.defineProperty(xhr, 'response', {
        configurable: true,
        get() {
          let raw;
          try {
            raw = responseDesc.get.call(this);
          } catch (err) {
            return null;
          }
          if (typeof raw === 'string') return filterText(this, raw);
          if (raw && typeof raw === 'object') {
            const clean = filterText(this, JSON.stringify(raw));
            try {
              return JSON.parse(clean);
            } catch (err) {
              return raw;
            }
          }
          return raw;
        },
      });
    } catch (err) {
      warn('XHR 响应过滤安装失败', err);
    }
  }

  function patchFetch() {
    const native = window.fetch;
    if (typeof native !== 'function') return;

    window.fetch = function patchedFetch(input) {
      const rawUrl = extractUrl(input);
      if (rawUrl && shouldBlock(rawUrl)) {
        countBlocked();
        return Promise.resolve(emptyJsonResponse());
      }

      const promise = native.apply(this, arguments);
      if (!state.guardEnabled || !rawUrl || !isFeedUrl(rawUrl)) return promise;
      return promise.then(filterFeedResponse).catch(() => promise);
    };
  }

  function patchXhr() {
    const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (!proto || typeof proto.open !== 'function' || typeof proto.send !== 'function') return;

    const nativeOpen = proto.open;
    const nativeSend = proto.send;

    proto.open = function patchedOpen(method, url, ...rest) {
      const raw = String(url ?? '');
      this[XHR_BLOCKED] = shouldBlock(raw);
      this[XHR_FEED] = isFeedUrl(raw);
      return nativeOpen.call(this, method, url, ...rest);
    };

    proto.send = function patchedSend(body) {
      if (this[XHR_BLOCKED]) {
        countBlocked();
        fakeXhrSuccess(this);
        return undefined;
      }
      if (this[XHR_FEED] && state.guardEnabled) patchFeedXhr(this);
      return nativeSend.call(this, body);
    };
  }

  function patchBeacon() {
    const nav = window.navigator;
    if (!nav || typeof nav.sendBeacon !== 'function') return;
    const native = nav.sendBeacon;
    nav.sendBeacon = function patchedBeacon(url, data) {
      if (shouldBlock(String(url))) {
        countBlocked();
        return true; // 告诉调用方已排队，避免它退回 new Image 再发一次
      }
      return native.call(nav, url, data);
    };
  }

  /**
   * 属性 setter 拦截：埋点常用 (new Image).src = url，动态 script / iframe 同理。
   * @param {object} proto
   * @param {string} prop
   */
  function patchUrlSetter(proto, prop) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || !desc.set || !desc.configurable) return;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set(value) {
        if (shouldBlock(String(value ?? ''))) {
          countBlocked();
          return;
        }
        desc.set.call(this, value);
      },
    });
  }

  /** 站点用 setAttribute 挂资源时也要挡住，否则上面的 prototype setter 会被绕过 */
  function patchSetAttribute() {
    const native = Element.prototype.setAttribute;
    if (typeof native !== 'function') return;
    Element.prototype.setAttribute = function patchedSetAttribute(name, value) {
      const key = String(name).toLowerCase();
      if ((key === 'src' || key === 'href' || key === 'srcset')
        && typeof value === 'string' && shouldBlock(value)) {
        countBlocked();
        return undefined;
      }
      return native.call(this, name, value);
    };
  }

  /**
   * 黑名单域的长连接返回已关闭的哑通道，不派发事件以免 SDK 发起重连风暴。
   * 原型指向原生构造器的 prototype：否则站点的 instanceof 判断会走异常分支。
   * @param {string} url
   * @param {object} proto
   * @returns {object}
   */
  function makeDeadSocket(url, proto) {
    const socket = {
      readyState: 3,
      bufferedAmount: 0,
      url: String(url),
      protocol: '',
      extensions: '',
      binaryType: 'blob',
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      send() {},
      close() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
    };
    if (proto) Object.setPrototypeOf(socket, proto);
    return socket;
  }

  function patchWebSocket() {
    const native = window.WebSocket;
    if (typeof native !== 'function') return;

    function PatchedWebSocket(url, protocols) {
      if (shouldBlock(String(url))) {
        countBlocked();
        return makeDeadSocket(url, native.prototype);
      }
      return protocols === undefined ? new native(url) : new native(url, protocols);
    }
    PatchedWebSocket.prototype = native.prototype;
    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
      Object.defineProperty(PatchedWebSocket, key, { value: native[key] });
    }
    window.WebSocket = PatchedWebSocket;
  }

  function patchEventSource() {
    const native = window.EventSource;
    if (typeof native !== 'function') return;

    function PatchedEventSource(url, init) {
      if (shouldBlock(String(url))) {
        countBlocked();
        return makeDeadSocket(url, native.prototype);
      }
      return init === undefined ? new native(url) : new native(url, init);
    }
    PatchedEventSource.prototype = native.prototype;
    window.EventSource = PatchedEventSource;
  }

  /** 推送类广告会申请通知权限并弹通知，这里直接给 denied */
  function patchNotifications() {
    if (!CONFIG.blockPush || typeof window.Notification !== 'function') return;
    const native = window.Notification;

    function BlockedNotification() {
      const stub = { close() {}, onclick: null, onclose: null, onerror: null };
      Object.setPrototypeOf(stub, BlockedNotification.prototype);
      return stub;
    }
    // 构造函数返回自定义对象时，原型链不会自动继承，必须同时对齐 prototype
    BlockedNotification.prototype = native.prototype;
    Object.defineProperty(BlockedNotification, 'permission', { value: 'denied' });
    Object.defineProperty(BlockedNotification, 'maxActions', { value: native.maxActions });
    BlockedNotification.requestPermission = () => Promise.resolve('denied');
    window.Notification = BlockedNotification;
  }

  /** 每个 patch 独立 try/catch：某个 API 被抢占也不能带崩其它功能 */
  function installGuard() {
    const patches = [
      patchFetch, patchXhr, patchBeacon, patchSetAttribute,
      patchWebSocket, patchEventSource, patchNotifications,
    ];
    for (const patch of patches) {
      try {
        patch();
      } catch (err) {
        warn('网络拦截安装失败', patch.name, err);
      }
    }

    const setters = [
      [window.HTMLImageElement, 'src'],
      [window.HTMLScriptElement, 'src'],
      [window.HTMLIFrameElement, 'src'],
      [window.HTMLLinkElement, 'href'],
    ];
    for (const [ctor, prop] of setters) {
      try {
        if (ctor && ctor.prototype) patchUrlSetter(ctor.prototype, prop);
      } catch (err) {
        warn('资源属性拦截安装失败', prop, err);
      }
    }
    log('网络拦截已安装，黑名单域名数', BLOCKED_HOSTS.size);
  }

  /* ---------- 业务：DOM 清理与性能限制 ---------- */

  const pendingNodes = [];
  const SEEN_VIDEOS = new WeakSet();
  let pendingScheduled = false;
  let lastSkipCheck = 0;
  let deepScansLeft = 0;

  function handleResourceElement(el) {
    const url = el.getAttribute('src') || el.getAttribute('href') || '';
    if (!url) return;

    if (el.tagName === 'LINK') {
      const rel = (el.getAttribute('rel') || '').toLowerCase();
      if (state.perfEnabled && CONFIG.blockPrefetch && /\bprefetch\b/.test(rel)) {
        // 纯预取节点不发网络请求，不计入「省流 N」，否则关掉省流后数字还在涨
        el.remove();
        return;
      }
      if (/\bpreload\b/.test(rel) && shouldBlock(url)) {
        countBlocked();
        el.remove();
        return;
      }
    }

    if (!state.guardEnabled || !shouldBlock(url)) return;
    countBlocked();
    if (el.tagName === 'IMG' || el.tagName === 'SOURCE') {
      el.removeAttribute('src');
    } else {
      el.remove();
    }
  }

  /**
   * DOM 兜底：数据层没覆盖到的接口（如新搜索接口）靠卡片文本匹配规则。
   * 只打标记不删节点；白名单与本条放行命中时撤掉标记，避免误伤后无法恢复。
   * @param {Element} card
   */
  function applyUserRulesToCard(card) {
    if (!card.getAttribute('data-e2e-vid')
      && !AUTHOR_LINK_SELECTORS.some((selector) => card.querySelector(selector))) return;
    const verdict = matchUserRules(readCardInfo(card));
    if (verdict === 'block') card.setAttribute(BLOCK_ATTR, '1');
    else if (verdict === 'allow') card.removeAttribute(BLOCK_ATTR);
  }

  /** 只给精确短文案 / 明确语义属性打标记，不删站点节点，便于一键还原 */
  function classifyClutter(el) {
    if (el.hasAttribute(HIDDEN_ATTR) || el.hasAttribute(AD_ATTR)) return;
    if ((state.blockEnabled || state.ruleIndex.markedAds.size)
      && el.getAttribute('data-e2e') === 'feed-item') {
      applyUserRulesToCard(el);
    }
    // 弹幕列表、输入框与发言按钮属于「互动」，一律不动
    if (el.closest('[class*="chatroom"], [contenteditable="true"], input, textarea')) return;

    const e2e = el.getAttribute('data-e2e') || '';
    if (/(?:^|[-_])ad(?:[-_]|$)|advert|promotion|sponsor/i.test(e2e)) {
      el.setAttribute(AD_ATTR, '1');
      return;
    }

    const text = (el.textContent || '').trim();
    if (!text) return;

    if (el.getAttribute('role') === 'dialog'
      && !/登录|login/i.test(text) && POPUP_TEXT_RE.test(text)) {
      el.setAttribute(HIDDEN_ATTR, '1');
      return;
    }

    if (AD_BADGE_RE.test(text)) {
      const card = el.closest('[data-e2e="feed-item"], [data-e2e="feed-live"], [role="dialog"]')
        || el;
      card.setAttribute(AD_ATTR, '1');
      return;
    }

    if (CLUTTER_TEXT_RE.test(text) && el.matches('a, button')) {
      el.setAttribute(HIDDEN_ATTR, '1');
    }
  }

  function applyVideoPolicy(video) {
    if (!state.perfEnabled || !CONFIG.limitOffscreenVideo || SEEN_VIDEOS.has(video)) return;
    SEEN_VIDEOS.add(video);
    if (video.preload === 'auto') video.preload = 'metadata';
    if (state.videoObserver) state.videoObserver.observe(video);
  }

  function inspectElement(el) {
    if (el.hasAttribute('data-s4tm')) return;
    switch (el.tagName) {
      case 'SCRIPT':
      case 'IFRAME':
      case 'LINK':
      case 'SOURCE':
      case 'IMG':
        handleResourceElement(el);
        break;
      case 'VIDEO':
        applyVideoPolicy(el);
        break;
      default:
        if (state.cleanEnabled && state.mode !== MODE.BROWSE) classifyClutter(el);
    }
  }

  /**
   * 单个新增节点的检查。叶子节点没有子树可扫，容器也受每批预算限制：
   * 直播间弹幕每秒新增几十个节点，逐个 querySelectorAll 比省下的开销更贵。
   * @param {Element} node
   */
  function inspectNode(node) {
    if (!(node instanceof Element) || node.hasAttribute('data-s4tm')) return;
    if (node.matches(RESOURCE_SELECTOR)) inspectElement(node);
    if (node.childElementCount === 0 || deepScansLeft <= 0) return;
    deepScansLeft -= 1;
    const found = node.querySelectorAll(RESOURCE_SELECTOR);
    const limit = Math.min(found.length, CONFIG.idleBatch * 2);
    for (let i = 0; i < limit; i += 1) inspectElement(found[i]);
  }

  /** 每批节点共享一次深扫预算，首屏全量扫描与 SPA 重扫也走这里 */
  function runInspection(nodes) {
    deepScansLeft = CONFIG.deepScanBudget;
    for (const node of nodes) inspectNode(node);
    refreshAdCards();
  }

  /**
   * 卡片内是否还存在广告角标。只查短文本节点，避免视频描述误判。
   * @param {Element} card
   * @returns {boolean}
   */
  function hasAdBadge(card) {
    const labels = card.querySelectorAll('span, div, button, a');
    const limit = Math.min(labels.length, 80);
    for (let i = 0; i < limit; i += 1) {
      if (AD_BADGE_RE.test((labels[i].textContent || '').trim())) return true;
    }
    return false;
  }

  /**
   * React 虚拟列表会复用卡片 DOM。标记留在节点上会把后续正常视频也隐藏，
   * 因此每批复查一次已标记的卡片：角标消失或命中白名单就撤掉标记。
   */
  function refreshAdCards() {
    if (!state.cleanEnabled || state.mode === MODE.BROWSE) return;
    const cards = document.querySelectorAll(
      `[${AD_ATTR}][data-e2e="feed-item"], [${AD_ATTR}][data-e2e="feed-live"], `
      + `[${BLOCK_ATTR}][data-e2e="feed-item"]`,
    );
    const limit = Math.min(cards.length, 60);
    for (let i = 0; i < limit; i += 1) {
      const card = cards[i];
      if (card.hasAttribute(AD_ATTR) && !hasAdBadge(card)) card.removeAttribute(AD_ATTR);
      if (card.hasAttribute(BLOCK_ATTR)) {
        const verdict = matchUserRules(readCardInfo(card));
        if (verdict !== 'block') card.removeAttribute(BLOCK_ATTR);
      }
    }
  }

  /**
   * 当前视频命中用户屏蔽规则或确实是广告卡片时静音并切下一条。
   * 白名单与本条放行优先：命中后不跳，并撤掉可能存在的屏蔽标记。
   */
  function pruneActiveAd() {
    if (!state.cleanEnabled || state.mode !== MODE.VIDEO) return;
    const active = document.querySelector('[data-e2e="feed-active-video"]');
    if (!active) return;
    const card = active.closest('[data-e2e="feed-item"]') || active;
    const info = readCardInfo(card);
    const verdict = matchUserRules(info);
    if (verdict === 'allow') {
      card.removeAttribute(BLOCK_ATTR);
      return;
    }
    const isBlocked = verdict === 'block';
    const isAd = !isBlocked && state.skipAdsEnabled
      && card.hasAttribute(AD_ATTR) && hasAdBadge(card);
    if (!isBlocked && !isAd) return;

    // 按视频 id 去重：卡片 DOM 被复用时，换了一条新内容仍能再跳
    const vid = info && info.vid ? info.vid : '';
    if (vid && vid === state.lastSkippedVid) return;
    state.lastSkippedVid = vid;

    const video = card.querySelector('video');
    if (video) {
      video.muted = true;
      try {
        video.pause();
      } catch (err) {
        log('视频暂停失败');
      }
    }
    const next = document.querySelector('[data-e2e="video-switch-next-arrow"]');
    if (next) {
      next.click();
      if (vid) showUndo(vid, info && info.nickname ? info.nickname : '');
      log(isBlocked ? '按规则跳过' : '跳过广告卡片');
    }
  }

  function scheduleSkipCheck() {
    const now = typeof performance === 'object' ? performance.now() : Date.now();
    if (now - lastSkipCheck < 900) return;
    lastSkipCheck = now;
    pruneActiveAd();
  }

  function schedulePending() {
    if (pendingScheduled || !pendingNodes.length) return;
    pendingScheduled = true;
    scheduleIdle(() => {
      pendingScheduled = false;
      const batch = pendingNodes.splice(0, CONFIG.idleBatch);
      runInspection(batch);
      scheduleSkipCheck();
      // 走节流版：弹幕每批都变化，不能每批都做一次全文档避让测量
      scheduleAvoid();
      if (pendingNodes.length) schedulePending();
    });
  }

  function createVideoObserver() {
    if (typeof IntersectionObserver !== 'function') return;
    state.videoObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!state.perfEnabled || !CONFIG.limitOffscreenVideo) return;
        const video = entry.target;
        if (video.isConnected === false) {
          state.videoObserver.unobserve(video);
          SEEN_VIDEOS.delete(video);
          continue;
        }
        if (entry.isIntersecting) {
          video.preload = 'metadata';
        } else {
          try {
            video.pause();
          } catch (err) {
            log('离屏视频暂停失败');
          }
          video.preload = 'none';
        }
      }
    }, { threshold: 0.01 });
  }

  /**
   * 节点被移除时解除 IntersectionObserver 的目标引用。IO 会强引用被观察元素，
   * 不 unobserve 的话长时间刷视频后已卸载的 video 节点无法被 GC。
   * @param {Node} node
   */
  function releaseVideos(node) {
    if (!state.videoObserver || node.nodeType !== 1) return;
    if (node.tagName === 'VIDEO') {
      state.videoObserver.unobserve(node);
      SEEN_VIDEOS.delete(node);
      return;
    }
    if (node.childElementCount === 0) return;
    const videos = node.querySelectorAll('video');
    for (let i = 0; i < videos.length; i += 1) {
      state.videoObserver.unobserve(videos[i]);
      SEEN_VIDEOS.delete(videos[i]);
    }
  }

  function installDomObserver() {
    const target = document.documentElement;
    if (!target || typeof MutationObserver !== 'function') return;

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const container = record.target;
        // 弹幕列表是最高频的 DOM 变更来源，且不含视频节点，整棵子树都不用扫
        if (container instanceof Element && container.closest('[class*="chatroom"]')) {
          continue;
        }
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1 || pendingNodes.length >= 600) continue;
          if (node.closest && node.closest('[class*="chatroom"]')) continue;
          pendingNodes.push(node);
        }
        for (const node of record.removedNodes) releaseVideos(node);
      }
      if (pendingNodes.length) schedulePending();
    });
    observer.observe(target, { childList: true, subtree: true });
    createVideoObserver();
    scheduleIdle(() => runInspection([document.body || document.documentElement]));
  }

  /* ---------- 业务：页面精简与工具条 ---------- */

  const HOTKEY_STATE = {
    h: 'cleanEnabled', p: 'guardEnabled', o: 'perfEnabled', k: 'skipAdsEnabled',
    m: 'blockEnabled',
  };
  const HOTKEY_STORE = {
    cleanEnabled: 'cleanMode', guardEnabled: 'guardMode',
    perfEnabled: 'perfMode', skipAdsEnabled: 'skipAdsMode',
    blockEnabled: 'blockMode',
  };

  function applyMode() {
    const root = document.documentElement;
    root.setAttribute(MODE_ATTR, state.mode);
    if (state.cleanEnabled && state.mode !== MODE.BROWSE) {
      root.setAttribute(CLEAN_ATTR, '1');
    } else {
      root.removeAttribute(CLEAN_ATTR);
    }
    updateBar();
  }

  /**
   * @param {HTMLButtonElement} btn
   * @param {boolean} on
   * @param {string} onText
   * @param {string} offText
   * @param {string} title
   */
  function setToggle(btn, on, onText, offText, title) {
    if (!btn) return;
    btn.textContent = on ? onText : offText;
    btn.setAttribute('aria-pressed', String(on));
    btn.title = `${title}：${on ? '已开启' : '已关闭'}（点击切换）`;
  }

  /** 显示"已跳过"撤销条，让用户能把误判的视频加回白名单 */
  function showUndo(vid, nickname) {
    state.undoSkipped = { vid, nickname };
    const box = state.bar && state.bar.querySelector('.s4tm-undo');
    if (!box) return;
    const label = box.querySelector('span');
    if (label) label.textContent = nickname ? `已跳过 ${nickname}` : '已跳过本条';
    box.hidden = false;
    if (state.undoTimer) clearTimeout(state.undoTimer);
    state.undoTimer = setTimeout(() => {
      state.undoTimer = 0;
      box.hidden = true;
      state.undoSkipped = null;
    }, CONFIG.undoToastMs);
    scheduleAvoid(true);
  }

  /** 把刚跳过的视频加入放行名单，刷新后仍然生效 */
  function allowSkipped() {
    const target = state.undoSkipped;
    if (!target || !target.vid) return;
    addRule('allowed', target.vid, CONFIG.maxAllowedVideos);
    state.lastSkippedVid = '';
    const box = state.bar && state.bar.querySelector('.s4tm-undo');
    if (box) box.hidden = true;
    if (state.undoTimer) {
      clearTimeout(state.undoTimer);
      state.undoTimer = 0;
    }
    state.undoSkipped = null;
    log('本条已放行', target.vid);
  }

  /** 面板上的四个动作：标记广告 / 本条放行 / 屏蔽作者 / 加白名单 */
  function ruleAction(action) {
    const info = readCardInfo();
    if (!info || (!info.vid && !info.authorId)) {
      warn('当前没有可操作的视频');
      return;
    }
    if (action === 'markAd' && info.vid) {
      addRule('markedAds', info.vid, CONFIG.maxMarkedAds);
      countAds(1);
      log('已标记广告', info.vid);
    } else if (action === 'allow' && info.vid) {
      addRule('allowed', info.vid, CONFIG.maxAllowedVideos);
      state.lastSkippedVid = '';
      log('本条已放行', info.vid);
    } else if (action === 'blockAuthor' || action === 'whiteAuthor') {
      if (!info.authorId) {
        // 取不到作者 ID 时给出明确原因，别让用户点了没反应
        warn('没读到当前视频的作者，请刷到视频卡片加载完成后再试');
        return;
      }
      const group = action === 'blockAuthor' ? 'authors' : 'whitelist';
      addRule(group, { id: info.authorId, name: info.nickname },
        CONFIG.maxBlockedAuthors);
      log(action === 'blockAuthor' ? '已屏蔽作者' : '已加白名单', info.authorId);
    } else {
      return;
    }
    refreshAdCards();
    renderRuleList();
    updateBar();
  }

  /**
   * 渲染规则清单。entry.value 是删除时用的原始标识，entry.label 才是显示文本；
   * 行按需创建并复用，只建到实际条数，不再留看不见却点不动的空行。
   */
  function renderRuleList() {
    const bar = state.bar;
    const list = bar && bar.querySelector('.s4tm-rules__list');
    if (!list) return;
    const entries = [];
    for (const [group, label] of [
      ['keywords', '关键词'], ['authors', '屏蔽作者'], ['whitelist', '白名单'],
      ['markedAds', '标记广告'], ['allowed', '本条放行'],
    ]) {
      for (const item of state.rules[group]) {
        entries.push({
          group,
          value: typeof item === 'string' ? item : (item.id || item.text),
          label: `${label} · ${typeof item === 'string' ? item : (item.name || item.text)}`,
        });
      }
    }

    const count = bar.querySelector('[data-s4tm="rule-count"]');
    if (count) count.textContent = entries.length ? `${entries.length} 条` : '';

    // 先移除空提示，避免新建的行被挤到它后面
    const empty = list.querySelector('.s4tm-rules__empty');
    if (empty) empty.remove();

    const capacity = Number(list.getAttribute('data-s4tm-row-cap') || 12);
    let rows = list.querySelectorAll('.s4tm-rules__item');
    while (entries.length > rows.length && rows.length < capacity) {
      const row = document.createElement('div');
      row.className = 's4tm-rules__item';
      const text = document.createElement('span');
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = '删除这条规则';
      row.append(text, del);
      list.appendChild(row);
      rows = list.querySelectorAll('.s4tm-rules__item');
    }
    const limit = Math.min(entries.length, rows.length);
    for (let i = 0; i < limit; i += 1) {
      rows[i].hidden = false;
      rows[i].setAttribute('data-group', entries[i].group);
      rows[i].setAttribute('data-value', entries[i].value);
      const text = rows[i].querySelector('span');
      if (text) text.textContent = entries[i].label;
    }
    for (let i = limit; i < rows.length; i += 1) rows[i].hidden = true;

    if (!entries.length) {
      const node = document.createElement('div');
      node.className = 's4tm-rules__empty';
      node.textContent = '暂无规则，用下方关键词添加';
      list.appendChild(node);
    }
  }

  function toggleRulePanel() {
    const panel = state.bar && state.bar.querySelector('.s4tm-rules');
    if (!panel) return;
    state.rulePanelOpen = !state.rulePanelOpen;
    panel.hidden = !state.rulePanelOpen;
    if (state.rulePanelOpen) renderRuleList();
    // 面板高度变了，展开与收起都要重算避让
    scheduleAvoid(true);
    // 文字、aria-pressed、title 统一由 updateBar 维护，避免两处写法打架
    updateBar();
  }

  function updateBar() {
    if (!state.bar) return;
    state.bar.setAttribute('data-s4tm-count',
      state.blockedCount > 999 ? '999+' : String(state.blockedCount));
    const label = state.bar.querySelector('.s4tm-label');
    const blockedStat = state.bar.querySelector('.s4tm-stat__blocked');
    const adsStat = state.bar.querySelector('.s4tm-stat__ads');
    const filteredStat = state.bar.querySelector('.s4tm-stat__filtered');
    const names = { video: '视频', live: '直播', browse: '浏览' };

    if (label) label.textContent = `抖音 · ${names[state.mode] || '浏览'}`;
    if (blockedStat) {
      blockedStat.textContent = state.guardEnabled
        ? `拦 ${state.blockedCount}` : '拦截已暂停';
    }
    if (adsStat) adsStat.textContent = state.guardEnabled ? `去广告 ${state.adCount}` : '';
    if (filteredStat) {
      filteredStat.textContent = state.blockEnabled || state.ruleIndex.markedAds.size
        ? `筛 ${state.filteredCount}` : '';
    }

    setToggle(state.buttons.clean, state.cleanEnabled, '清爽', '原版', '清爽模式 Alt + H');
    setToggle(state.buttons.perf, state.perfEnabled, '省性能', '性能关', '预加载与特效限制 Alt + O');
    setToggle(state.buttons.skip, state.skipAdsEnabled, '跳广告', '跳广告关', '自动跳过广告 Alt + K');
    setToggle(state.buttons.block, state.blockEnabled, '屏蔽', '屏蔽关',
      '自定义关键词与作者屏蔽 Alt + M');

    const rules = state.buttons.rules;
    if (rules) {
      rules.textContent = state.rulePanelOpen ? '规则收起' : '规则设置';
      rules.setAttribute('aria-pressed', String(state.rulePanelOpen));
      rules.title = state.rulePanelOpen ? '收起规则面板' : '展开关键词 / 作者规则面板';
    }

    const guard = state.buttons.guard;
    if (guard) {
      guard.textContent = state.guardEnabled ? `省流 ${state.blockedCount}` : '省流 关';
      guard.setAttribute('aria-pressed', String(state.guardEnabled));
      guard.title = state.guardEnabled
        ? `已拦 ${state.blockedCount} 个请求、剔除 ${state.adCount} 条广告，点击或 Alt + P 暂停`
        : '拦截已暂停，点击或 Alt + P 恢复';
    }

    const collapse = state.buttons.collapse;
    if (collapse) {
      // 图标由 CSS 按状态切换；这里写 textContent 会把 SVG 子节点清掉
      collapse.setAttribute('aria-pressed', String(state.barCollapsed));
      collapse.setAttribute('aria-label',
        state.barCollapsed ? '展开工具条' : '收起工具条');
      collapse.title = state.barCollapsed
        ? '展开工具条（Alt + B）'
        : '收起工具条，避免遮挡评论框 / 发言框（Alt + B）';
    }
  }

  function toggleFlag(stateKey) {
    state[stateKey] = !state[stateKey];
    store.set(HOTKEY_STORE[stateKey], state[stateKey]);
    if (stateKey === 'cleanEnabled') applyMode();
    if (stateKey === 'blockEnabled') {
      refreshAdCards();
      scheduleIdle(() => runInspection([document.body || document.documentElement]));
    }
    updateBar();
    log('开关变更', stateKey, state[stateKey]);
  }

  /**
   * @param {string} name
   * @param {() => void} onClick
   * @returns {HTMLButtonElement}
   */
  function makeToggle(name, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `s4tm-toggle s4tm-toggle--${name}`;
    btn.setAttribute('data-s4tm', `toggle-${name}`);
    btn.addEventListener('click', onClick);
    return btn;
  }

  /**
   * 合并避让检查并做时间节流。DOM 变化批次、resize 都会调它，
   * 不节流的话弹幕滚动时每批都要全文档 querySelectorAll + 逐元素测量。
   * @param {boolean} [force] 用户操作（聚焦输入框 / 折叠 / 路由切换）跳过节流
   */
  function scheduleAvoid(force = false) {
    if (state.avoidScheduled) return;
    const now = typeof performance === 'object' ? performance.now() : Date.now();
    if (!force && state.lastAvoidAt && now - state.lastAvoidAt < CONFIG.avoidThrottle) {
      return;
    }
    state.avoidScheduled = true;
    scheduleIdle(() => {
      state.avoidScheduled = false;
      state.lastAvoidAt = typeof performance === 'object' ? performance.now() : Date.now();
      avoidInputs();
    });
  }

  /**
   * 工具条默认贴右下角，评论框与弹幕发言框正好也在那里。
   * 判定用「默认位置」的虚拟矩形：若用当前位置，上移后会判定为不再相交又掉
   * 回去，形成抖动。相交时把工具条底边抬到输入控件上沿之上。
   */
  function avoidInputs() {
    const bar = state.bar;
    if (!bar || state.barPinned) return;
    const rect = bar.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const virtual = {
      left: rect.left,
      right: rect.right,
      top: window.innerHeight - BAR_DEFAULT_BOTTOM - rect.height,
      bottom: window.innerHeight - BAR_DEFAULT_BOTTOM,
    };
    const nodes = document.querySelectorAll(INTERACTIVE_SELECTOR);
    const limit = Math.min(nodes.length, 60);
    let highestTop = 0;
    for (let i = 0; i < limit; i += 1) {
      const box = nodes[i].getBoundingClientRect();
      if (box.width < 8 || box.height < 8) continue;
      if (rectsIntersect(virtual, box)) highestTop = Math.max(highestTop, box.top);
    }

    if (highestTop > 0) {
      const maxBottom = Math.max(
        BAR_DEFAULT_BOTTOM,
        window.innerHeight - rect.height - BAR_DEFAULT_BOTTOM,
      );
      const next = Math.min(
        maxBottom,
        Math.ceil(window.innerHeight - highestTop) + BAR_DEFAULT_BOTTOM,
      );
      const value = `${next}px`;
      if (bar.style.bottom !== value) bar.style.bottom = value;
      if (!bar.hasAttribute('data-s4tm-avoid')) bar.setAttribute('data-s4tm-avoid', '1');
    } else if (bar.hasAttribute('data-s4tm-avoid')) {
      bar.style.removeProperty('bottom');
      bar.removeAttribute('data-s4tm-avoid');
    }
  }

  /**
   * 折叠 / 展开工具条。折叠态只留一个 40px 高对比圆点，彻底不占输入区。
   * @param {boolean} collapsed
   */
  function setBarCollapsed(collapsed) {
    state.barCollapsed = collapsed;
    store.set('barCollapsed', collapsed);
    const bar = state.bar;
    if (!bar) return;
    if (collapsed) {
      bar.setAttribute('data-s4tm-collapsed', '1');
      bar.removeAttribute('data-s4tm-avoid');
      // 用户手动拖过的位置要保留，只清自动避让写入的 bottom
      if (!state.barPinned) bar.style.removeProperty('bottom');
    } else {
      bar.removeAttribute('data-s4tm-collapsed');
    }
    updateBar();
    scheduleAvoid(true);
  }

  /**
   * 拖动工具条并记住位置。拖动后关闭自动避让，双击工具条复位。
   * pointermove 用 rAF 合并，抬手时取消未执行的帧，不留悬挂回调。
   * @param {HTMLElement} bar
   */
  function enableBarDrag(bar) {
    let dragging = false;
    let moved = false;
    let captured = false;
    let pointerId = 0;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let nextLeft = 0;
    let nextTop = 0;
    let frame = 0;
    // 尺寸在按下时取一次，pointermove 里不再读布局属性
    let barWidth = 0;
    let barHeight = 0;

    const applyPosition = () => {
      frame = 0;
      bar.style.left = `${nextLeft}px`;
      bar.style.top = `${nextTop}px`;
      bar.style.right = 'auto';
      bar.style.bottom = 'auto';
    };

    /**
     * 捕获指针会把 click 重定向到工具条容器，按钮就收不到点击了。
     * 所以按钮上按下时不捕获，确认是拖动（位移 > 3px）才补捕获。
     * @param {number} id
     */
    const capturePointer = (id) => {
      if (captured) return;
      try {
        bar.setPointerCapture(id);
        captured = true;
      } catch (err) {
        log('指针捕获不可用');
      }
    };

    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      const onButton = event.target instanceof Element && event.target.closest('button');
      const rect = bar.getBoundingClientRect();
      dragging = true;
      moved = false;
      captured = false;
      pointerId = event.pointerId;
      barWidth = bar.offsetWidth || 160;
      barHeight = bar.offsetHeight || 32;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      nextLeft = rect.left;
      nextTop = rect.top;
      bar.setAttribute('data-s4tm-dragging', '1');
      if (!onButton) capturePointer(pointerId);
    };

    const onPointerMove = (event) => {
      if (!dragging) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (!moved) return;
      capturePointer(pointerId);
      nextLeft = Math.max(4, Math.min(window.innerWidth - barWidth - 4, startLeft + dx));
      nextTop = Math.max(4, Math.min(window.innerHeight - barHeight - 4, startTop + dy));
      if (frame) return;
      frame = requestAnimationFrame(applyPosition);
    };

    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      bar.removeAttribute('data-s4tm-dragging');
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      if (captured) {
        try {
          bar.releasePointerCapture(pointerId);
        } catch (err) {
          log('指针释放失败');
        }
        captured = false;
      }
      // 只是点了一下（含点击开关按钮），不改位置、不关闭自动避让
      if (!moved) return;
      applyPosition();
      state.barPinned = true;
      bar.removeAttribute('data-s4tm-avoid');
      store.set('barPos', { left: nextLeft, top: nextTop });
    };

    const onDoubleClick = () => {
      store.set('barPos', null);
      state.barPinned = false;
      for (const prop of ['left', 'top', 'right', 'bottom']) {
        bar.style.removeProperty(prop);
      }
      scheduleAvoid(true);
      log('工具条位置已复位');
    };

    /** 兜底：个别浏览器仍会把折叠圆点的 click 派发到容器而不是按钮 */
    const onBarClick = (event) => {
      if (event.target === bar && !moved && bar.hasAttribute('data-s4tm-collapsed')) {
        setBarCollapsed(false);
      }
    };

    bar.addEventListener('pointerdown', onPointerDown);
    bar.addEventListener('pointermove', onPointerMove);
    bar.addEventListener('pointerup', onPointerUp);
    bar.addEventListener('pointercancel', onPointerUp);
    bar.addEventListener('dblclick', onDoubleClick);
    bar.addEventListener('click', onBarClick);
  }

  function createBar() {
    if (document.getElementById(BAR_ID)) return;
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.setAttribute('data-s4tm', 'toolbar');
    bar.setAttribute('data-s4tm-mounted', '1');

    const head = document.createElement('div');
    head.className = 's4tm-head';
    head.setAttribute('data-s4tm', 'head');

    const mark = document.createElement('span');
    mark.className = 's4tm-mark';
    mark.setAttribute('data-s4tm', 'mark');
    mark.appendChild(makeIcon(SHIELD_PATHS, 'shield'));

    const label = document.createElement('span');
    label.className = 's4tm-label';
    label.setAttribute('data-s4tm', 'label');

    const stat = document.createElement('div');
    stat.className = 's4tm-stat';
    stat.setAttribute('data-s4tm', 'stat');
    const blockedStat = document.createElement('span');
    blockedStat.className = 's4tm-stat__blocked';
    blockedStat.setAttribute('data-s4tm', 'stat-blocked');
    const adsStat = document.createElement('span');
    adsStat.className = 's4tm-stat__ads';
    adsStat.setAttribute('data-s4tm', 'stat-ads');
    const filteredStat = document.createElement('span');
    filteredStat.className = 's4tm-stat__filtered';
    filteredStat.setAttribute('data-s4tm', 'stat-filtered');
    stat.append(blockedStat, adsStat, filteredStat);

    const clean = makeToggle('clean', () => toggleFlag('cleanEnabled'));
    const guard = makeToggle('guard', () => toggleFlag('guardEnabled'));
    const perf = makeToggle('perf', () => toggleFlag('perfEnabled'));
    const skip = makeToggle('skip', () => toggleFlag('skipAdsEnabled'));
    const block = makeToggle('block', () => toggleFlag('blockEnabled'));
    const rules = makeToggle('rules', toggleRulePanel);
    const collapse = makeToggle('collapse', () => setBarCollapsed(!state.barCollapsed));
    // 两个图标按折叠态切换：圆点显示盾牌，展开态显示收起箭头
    collapse.append(
      makeIcon(SHIELD_PATHS, 'shield'),
      makeIcon(CHEVRON_PATHS, 'chevron'),
    );

    const grid = document.createElement('div');
    grid.className = 's4tm-grid';
    grid.setAttribute('data-s4tm', 'grid');
    grid.append(clean, guard, perf, skip, block, rules);

    const undo = document.createElement('div');
    undo.className = 's4tm-undo';
    undo.setAttribute('data-s4tm', 'undo');
    undo.hidden = true;
    const undoText = document.createElement('span');
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.textContent = '放行';
    undoBtn.addEventListener('click', allowSkipped);
    undo.append(undoText, undoBtn);

    const rulesPanel = buildRulesPanel();

    head.append(mark, label, collapse);
    bar.append(head, stat, grid, undo, rulesPanel);
    (document.body || document.documentElement).appendChild(bar);

    const saved = store.get('barPos', null);
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      bar.style.left = `${saved.left}px`;
      bar.style.top = `${saved.top}px`;
      bar.style.right = 'auto';
      bar.style.bottom = 'auto';
      state.barPinned = true;
    }
    if (state.barCollapsed) bar.setAttribute('data-s4tm-collapsed', '1');

    state.bar = bar;
    state.buttons = { clean, guard, perf, skip, block, rules, collapse };
    enableBarDrag(bar);
    updateBar();
    scheduleAvoid(true);
  }

  /**
   * 构建规则面板：动作区 + 规则清单 + 关键词输入三个分区。
   * 清单行完全按需创建，不再预建空行（空行的 × 看得见却点不动）。
   * @returns {HTMLElement}
   */
  function buildRulesPanel() {
    const panel = document.createElement('div');
    panel.className = 's4tm-rules';
    panel.setAttribute('data-s4tm', 'rules');
    panel.hidden = true;

    const actionSection = document.createElement('div');
    actionSection.className = 's4tm-section';
    const actionTitle = document.createElement('div');
    actionTitle.className = 's4tm-section__title';
    actionTitle.textContent = '当前视频';
    const actionHint = document.createElement('em');
    actionHint.textContent = '先刷到要操作的那一条';
    actionTitle.appendChild(actionHint);
    const actions = document.createElement('div');
    actions.className = 's4tm-rules__row';
    actions.setAttribute('data-s4tm', 'rule-actions');
    for (const [action, text] of [
      ['markAd', '标记广告'], ['allow', '本条放行'],
      ['blockAuthor', '屏蔽作者'], ['whiteAuthor', '加白名单'],
    ]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 's4tm-toggle';
      btn.textContent = text;
      btn.setAttribute('data-action', action);
      actions.appendChild(btn);
    }
    actionSection.append(actionTitle, actions);
    panel.appendChild(actionSection);

    const listSection = document.createElement('div');
    listSection.className = 's4tm-section';
    const listTitle = document.createElement('div');
    listTitle.className = 's4tm-section__title';
    listTitle.textContent = '已保存规则';
    const listCount = document.createElement('em');
    listCount.setAttribute('data-s4tm', 'rule-count');
    listTitle.appendChild(listCount);
    const list = document.createElement('div');
    list.className = 's4tm-rules__list';
    list.setAttribute('data-s4tm', 'rule-list');
    const rowTotal = CONFIG.maxKeywords + CONFIG.maxBlockedAuthors * 2
      + CONFIG.maxMarkedAds + CONFIG.maxAllowedVideos;
    list.setAttribute('data-s4tm-row-cap', String(rowTotal));
    listSection.append(listTitle, list);
    panel.appendChild(listSection);

    const add = document.createElement('div');
    add.className = 's4tm-rules__add';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '关键词（作者 / 文案 / 话题）';
    input.setAttribute('data-s4tm', 'rule-input');
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 's4tm-toggle';
    addBtn.textContent = '添加';
    addBtn.setAttribute('data-s4tm', 'rule-add');
    add.append(input, addBtn);
    panel.appendChild(add);

    // 事件委托：面板整体只挂两个监听器，行节点复用不累积
    actions.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-action]');
      if (btn) ruleAction(btn.getAttribute('data-action'));
    });
    list.addEventListener('click', (event) => {
      const btn = event.target.closest('button');
      if (!btn) return;
      const row = btn.closest('.s4tm-rules__item');
      if (!row) return;
      removeRule(row.getAttribute('data-group'), row.getAttribute('data-value'));
      renderRuleList();
      updateBar();
    });
    const submitKeyword = () => {
      const text = (input.value || '').trim().slice(0, 40);
      if (!text) return;
      const scopes = [RULE_SCOPES.NAME, RULE_SCOPES.DESC, RULE_SCOPES.TAG];
      if (addRule('keywords', { text, scopes }, CONFIG.maxKeywords)) {
        input.value = '';
        renderRuleList();
        updateBar();
      }
    };
    addBtn.addEventListener('click', submitKeyword);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submitKeyword();
    });

    return panel;
  }

  function onKeyDown(event) {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    const key = event.key?.toLowerCase();
    if (!key) return;
    if (event.target instanceof Element
      && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;

    if (key === 'b') {
      event.preventDefault();
      setBarCollapsed(!state.barCollapsed);
      return;
    }

    const stateKey = HOTKEY_STATE[key];
    if (!stateKey) return;
    event.preventDefault();
    toggleFlag(stateKey);
  }

  /* ---------- 启动 ---------- */

  function main() {
    // 页面脚本执行前就要装好拦截，否则首屏埋点与广告请求已经发出去了
    try {
      state.cleanEnabled = store.get('cleanMode', true) !== false;
      state.guardEnabled = store.get('guardMode', true) !== false;
      state.perfEnabled = store.get('perfMode', true) !== false;
      state.skipAdsEnabled = store.get('skipAdsMode', true) !== false;
      state.blockEnabled = store.get('blockMode', false) === true;
      state.barCollapsed = store.get('barCollapsed', false) === true;
      loadRules();
      installGuard();
    } catch (err) {
      warn('网络拦截初始化失败', err);
    }

    try {
      injectStyle(STYLE_ID, CLEAN_CSS);
      state.mode = currentMode();
      applyMode();
      installDomObserver();
      waitFor('body', { timeout: CONFIG.waitTimeout })
        .then(createBar)
        .then(() => log('挂载完成'))
        .catch((err) => warn('工具条挂载失败', err.message));
      onUrlChange(() => {
        state.mode = currentMode();
        state.lastSkippedVid = '';
        applyMode();
        scheduleIdle(() => runInspection([document.body || document.documentElement]));
        scheduleAvoid(true);
      });
      document.addEventListener('keydown', onKeyDown, true);
      // 聚焦输入框必须立刻重新避让；resize 走节流即可
      document.addEventListener('focusin', () => scheduleAvoid(true), true);
      window.addEventListener('resize', () => scheduleAvoid());
    } catch (err) {
      warn('初始化失败', err);
    }
  }

  main();
})();
