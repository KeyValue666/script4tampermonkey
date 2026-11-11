// ==UserScript==
// @name         S4TM · 抖音网页版 · 清爽省流
// @namespace    https://github.com/KeyValue666/script4tampermonkey/sites/douyin-com
// @version      0.1.1
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

  const MODE = { VIDEO: 'video', LIVE: 'live', BROWSE: 'browse' };

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
    /** 屏蔽浏览器通知权限请求与通知实例：推送广告 */
    blockPush: true,
    /** 移除纯预取 link[rel=prefetch]，不影响当前播放 */
    blockPrefetch: true,
    /** 离屏视频暂停并关闭预加载，降低解码开销 */
    limitOffscreenVideo: true,
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

  const CLEAN_CSS = `
    #s4tm-douyin-com-bar {
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 2147483000;
      display: flex;
      align-items: center;
      gap: 6px;
      max-width: calc(100vw - 24px);
      padding: 6px 9px;
      border-radius: 10px;
      background: rgba(22, 24, 30, 0.92);
      color: #f2f3f5;
      font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI",
        "Microsoft YaHei", sans-serif;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
      user-select: none;
    }

    #s4tm-douyin-com-bar .s4tm-stat {
      color: #9aa0aa;
      white-space: nowrap;
    }

    #s4tm-douyin-com-bar .s4tm-toggle {
      flex: none;
      border: 0;
      border-radius: 6px;
      padding: 4px 8px;
      background: #2b2f3a;
      color: #f2f3f5;
      font: inherit;
      font-size: 12px;
      white-space: nowrap;
      cursor: pointer;
    }

    #s4tm-douyin-com-bar .s4tm-toggle:hover { background: #3c4252; }

    #s4tm-douyin-com-bar .s4tm-toggle[aria-pressed="false"] {
      background: #3a3038;
      color: #d7a4b4;
    }

    #s4tm-douyin-com-bar .s4tm-toggle--guard {
      min-width: 74px;
      text-align: center;
    }

    /* 站点节点只按标记隐藏；去掉 html 上的 clean 属性即可完整还原 */
    html[data-s4tm-clean="1"] [data-s4tm-hidden="1"],
    html[data-s4tm-clean="1"] [data-s4tm-ad="1"] {
      display: none !important;
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

    @media (max-width: 720px) {
      #s4tm-douyin-com-bar { right: 8px; bottom: 8px; flex-wrap: wrap; }
      #s4tm-douyin-com-bar .s4tm-stat { display: none; }
    }
  `;

  const state = {
    mode: MODE.VIDEO,
    cleanEnabled: true,
    guardEnabled: true,
    perfEnabled: true,
    skipAdsEnabled: true,
    blockedCount: 0,
    adCount: 0,
    countTimer: 0,
    bar: null,
    buttons: {},
    videoObserver: null,
    lastSkippedVid: '',
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
      return path === '/' || LIVE_BROWSE_RE.test(path) ? MODE.BROWSE : MODE.LIVE;
    }
    if (/^\/live\/?$/.test(path)) return MODE.BROWSE;
    if (/^\/live\/\d+/.test(path)) return MODE.LIVE;
    return MODE.VIDEO;
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
   * 剔除推荐流响应里的广告条目；全被剔除或不是 feed 结构时原样返回。
   * @param {string} text
   * @returns {{ text: string, removed: number }}
   */
  function filterFeedPayload(text) {
    if (typeof text !== 'string' || !text.trim().startsWith('{')) {
      return { text, removed: 0 };
    }
    if (!AD_FIELD_RE.test(text)) return { text, removed: 0 };
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return { text, removed: 0 };
    }

    const lists = findFeedLists(data);
    if (!lists.length) return { text, removed: 0 };

    let removed = 0;
    for (const list of lists) {
      const adIndexes = [];
      for (let i = 0; i < list.length; i += 1) {
        if (isAdItem(list[i])) adIndexes.push(i);
      }
      // 留空会让站点认为推荐流异常，宁可这一页不剔
      if (adIndexes.length === 0 || adIndexes.length === list.length) continue;
      // 倒序删除，避免展开超大数组时触发参数数量上限
      for (let i = adIndexes.length - 1; i >= 0; i -= 1) list.splice(adIndexes[i], 1);
      removed += adIndexes.length;
    }

    if (!removed) return { text, removed: 0 };
    try {
      return { text: JSON.stringify(data), removed };
    } catch (err) {
      return { text, removed: 0 };
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
      if (!result.removed) return response;
      countAds(result.removed);
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
      if (result.removed && !XHR_COUNTED.has(instance)) {
        XHR_COUNTED.add(instance);
        countAds(result.removed);
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

  /** 只给精确短文案 / 明确语义属性打标记，不删站点节点，便于一键还原 */
  function classifyClutter(el) {
    if (el.hasAttribute(HIDDEN_ATTR) || el.hasAttribute(AD_ATTR)) return;
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
   * 因此每批复查一次已标记的卡片，角标消失就撤掉标记。
   */
  function refreshAdCards() {
    if (!state.cleanEnabled || state.mode === MODE.BROWSE) return;
    const cards = document.querySelectorAll(
      `[${AD_ATTR}][data-e2e="feed-item"], [${AD_ATTR}][data-e2e="feed-live"]`,
    );
    const limit = Math.min(cards.length, 60);
    for (let i = 0; i < limit; i += 1) {
      if (!hasAdBadge(cards[i])) cards[i].removeAttribute(AD_ATTR);
    }
  }

  /** 当前视频确实是广告卡片时静音并切下一条 */
  function pruneActiveAd() {
    if (!state.skipAdsEnabled || !state.cleanEnabled || state.mode !== MODE.VIDEO) return;
    const active = document.querySelector('[data-e2e="feed-active-video"]');
    if (!active) return;
    const card = active.closest('[data-e2e="feed-item"], [data-e2e="feed-live"]');
    if (!card || !card.hasAttribute(AD_ATTR) || !hasAdBadge(card)) return;

    // 按视频 id 去重：卡片 DOM 被复用时，换了一条新广告仍能再跳
    const vid = active.getAttribute('data-e2e-vid') || '';
    if (vid && vid === state.lastSkippedVid) return;
    state.lastSkippedVid = vid;

    const video = card.querySelector('video');
    if (video) {
      video.muted = true;
      try {
        video.pause();
      } catch (err) {
        log('广告视频暂停失败');
      }
    }
    const next = document.querySelector('[data-e2e="video-switch-next-arrow"]');
    if (next) {
      next.click();
      log('跳过广告卡片');
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
  };
  const HOTKEY_STORE = {
    cleanEnabled: 'cleanMode', guardEnabled: 'guardMode',
    perfEnabled: 'perfMode', skipAdsEnabled: 'skipAdsMode',
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

  function updateBar() {
    if (!state.bar) return;
    const label = state.bar.querySelector('.s4tm-label');
    const stat = state.bar.querySelector('.s4tm-stat');
    const names = { video: '视频', live: '直播', browse: '浏览' };

    if (label) label.textContent = `抖音 · ${names[state.mode] || '浏览'}`;
    if (stat) {
      stat.textContent = state.guardEnabled
        ? `拦 ${state.blockedCount} · 去广告 ${state.adCount}`
        : '拦截已暂停';
    }

    setToggle(state.buttons.clean, state.cleanEnabled, '清爽', '原版', '清爽模式 Alt + H');
    setToggle(state.buttons.perf, state.perfEnabled, '省性能', '性能关', '预加载与特效限制 Alt + O');
    setToggle(state.buttons.skip, state.skipAdsEnabled, '跳广告', '跳广告关', '自动跳过广告 Alt + K');

    const guard = state.buttons.guard;
    if (guard) {
      guard.textContent = state.guardEnabled ? `省流 ${state.blockedCount}` : '省流 关';
      guard.setAttribute('aria-pressed', String(state.guardEnabled));
      guard.title = state.guardEnabled
        ? `已拦 ${state.blockedCount} 个请求、剔除 ${state.adCount} 条广告，点击或 Alt + P 暂停`
        : '拦截已暂停，点击或 Alt + P 恢复';
    }
  }

  function toggleFlag(stateKey) {
    state[stateKey] = !state[stateKey];
    store.set(HOTKEY_STORE[stateKey], state[stateKey]);
    if (stateKey === 'cleanEnabled') applyMode();
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

  function createBar() {
    if (document.getElementById(BAR_ID)) return;
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.setAttribute('data-s4tm', 'toolbar');
    bar.setAttribute('data-s4tm-mounted', '1');

    const label = document.createElement('span');
    label.className = 's4tm-label';
    label.setAttribute('data-s4tm', 'label');

    const stat = document.createElement('span');
    stat.className = 's4tm-stat';
    stat.setAttribute('data-s4tm', 'stat');

    const clean = makeToggle('clean', () => toggleFlag('cleanEnabled'));
    const guard = makeToggle('guard', () => toggleFlag('guardEnabled'));
    const perf = makeToggle('perf', () => toggleFlag('perfEnabled'));
    const skip = makeToggle('skip', () => toggleFlag('skipAdsEnabled'));

    bar.append(label, stat, clean, guard, perf, skip);
    (document.body || document.documentElement).appendChild(bar);

    state.bar = bar;
    state.buttons = { clean, guard, perf, skip };
    updateBar();
  }

  function onKeyDown(event) {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    const key = event.key?.toLowerCase();
    const stateKey = HOTKEY_STATE[key];
    if (!stateKey) return;
    if (event.target instanceof Element
      && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
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
      });
      document.addEventListener('keydown', onKeyDown, true);
    } catch (err) {
      warn('初始化失败', err);
    }
  }

  main();
})();
