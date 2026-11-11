// ==UserScript==
// @name         S4TM · 虎牙直播 · 清爽观影
// @namespace    https://github.com/KeyValue666/script4tampermonkey/sites/huya-com
// @version      0.2.1
// @description  虎牙直播间只留视频、弹幕和发言：隐藏推荐、礼物、侧栏，并拦截埋点广告请求降低占用
// @author       KeyValue666
// @match        https://www.huya.com/*
// @icon         https://www.huya.com/favicon.ico
// @grant        none
// @run-at       document-start
// @noframes
// @homepageURL  https://github.com/KeyValue666/script4tampermonkey/blob/main/sites/huya-com/README.md
// @supportURL   https://github.com/KeyValue666/script4tampermonkey/issues
// @updateURL    https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/huya-com/huya-com.user.js
// @downloadURL  https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/huya-com/huya-com.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- 配置 ---------- */

  const SITE_KEY = 'huya-com';
  const PREFIX = `[s4tm:${SITE_KEY}]`;
  const STYLE_ID = `s4tm-${SITE_KEY}-style`;
  const BAR_ID = `s4tm-${SITE_KEY}-bar`;
  /** 总开关挂在 html 上：所有站点元素的隐藏规则都限定在它之下，移除即完整还原 */
  const CLEAN_ATTR = 'data-s4tm-clean';
  const ROOM_SELECTOR = '.room-core';

  const CONFIG = {
    /** 本地调试时改 true；提交前必须恢复为 false */
    debug: false,
    /** 直播间是 SSR 页面，12 秒足够覆盖弱网下的解析完成 */
    waitTimeout: 12000,
    hotkey: 'h',
    perfHotkey: 'p',
    /** 拦截计数写按钮文案的防抖间隔，避免高频 DOM 写入 */
    countDebounce: 400,
    /** 房间标题子树变动频繁，观察回调必须防抖后再读 DOM */
    metaDebounce: 150,
  };

  /** 明确排除的非直播间路径：避免首页、分类、列表页误挂开关按钮 */
  const NON_ROOM_PATHS = [
    /^\/(?:g|l|video|search|myfollow|rank|subscribe|pay)(?:\/|$)/,
    /^\/(?:download|app|act|hd|e|u|v|p|news|bbs|topic|match|cms)(?:\/|$)/,
    /^\/(?:index\.html)?$/,
  ];

  /*
   * 上报 / 广告域黑名单（2026-11 从 room_normal_*.js、performance-report、
   * huya-kiwi SDK 与虎牙页面中核对）。刻意只列域名，不做宽泛关键词匹配：
   * 直播流、弹幕 WebSocket、静态资源、登录与订阅接口一律不在这里，
   * 宁可漏拦也不能误伤观看。
   */
  const BLOCKED_HOSTS = [
    'ylog.huya.com',
    'statwup.huya.com',
    'metric.huya.com',
    'hm.baidu.com',
    'ext.huya.com',
    'download.huya.com',
    'xs.gdt.qq.com',
    'v.gdt.qq.com',
    'snowflake.qq.com',
  ];

  /** 只匹配 Sentry 的 envelope/store 上报路径，不影响 i.huya.com 其它接口 */
  const SENTRY_PATH = /^\/(?:api\/)?\d+\/(?:envelope|store)(?:\/|$)/;

  const state = {
    mounted: false,
    mounting: false,
    routePatched: false,
    guardInstalled: false,
    enabled: true,
    perfEnabled: true,
    blockedCount: 0,
    countTimer: 0,
    metaTimer: 0,
    metaObserver: null,
    metaGeneration: 0,
    bar: null,
    toggle: null,
    perfToggle: null,
  };

  /* ---------- 样式 ---------- */

  /*
   * 虎牙直播间结构（2026-11 实机抓取，普通房 / 赛事房一致）：
   *   .main-wrap（padding: 60px 0 0 240px，为顶部导航与左侧栏留位）
   *     └ #J_mainRoom > .room-core
   *         ├ .room-core-l（margin-right: 350px）
   *         │   ├ .room-hd 主播信息头
   *         │   └ .room-player-wrap（padding: 56.25% 0 60px，底部 60px 是礼物栏）
   *         └ .room-core-r > .room-sidebar > #chatRoom 弹幕与发言
   *   .room-footer 下方推荐 / 动态 / 公会 / 猜你喜欢
   *   .mod-sidebar 左侧边栏
   *
   * 礼物栏有两处占位：外层 .room-player-wrap 的 padding-bottom，以及播放器内部
   * #videoContainer 里 .player-wrap 的 calc(100% - 60px) + #player-gift-wrap。
   * 只隐藏外层占位没用，里面那条白底礼物栏是 vplayer 动态渲染的，必须一起处理。
   *
   * 因此只做三件事：隐藏明确的冗余节点、收回为它们预留的占位、按视口高度铺满画面。
   * 不改站点任何内联样式，也不碰播放器内部的 DOM —— 播放器尺寸由站点自己按容器计算。
   */
  const CLEAN_CSS = `
    /* ---------- 自建工具条：原版模式是左下角小胶囊，清爽模式是整条顶栏 ---------- */
    #s4tm-huya-com-bar {
      position: fixed;
      left: 12px;
      bottom: 12px;
      z-index: 2147483000;
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: calc(100vw - 24px);
      padding: 6px 9px;
      border-radius: 10px;
      background: rgba(20, 21, 26, 0.94);
      color: #f2f3f5;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
      user-select: none;
    }

    #s4tm-huya-com-bar .s4tm-room,
    #s4tm-huya-com-bar .s4tm-anchor,
    #s4tm-huya-com-bar .s4tm-hint {
      display: none;
    }

    #s4tm-huya-com-bar .s4tm-toggle {
      flex: none;
      border: 0;
      border-radius: 6px;
      padding: 4px 10px;
      background: #2b2f3a;
      color: #f2f3f5;
      font: inherit;
      font-size: 12px;
      white-space: nowrap;
      cursor: pointer;
    }

    #s4tm-huya-com-bar .s4tm-toggle:hover {
      background: #3c4252;
    }

    /* 计数变化时按钮宽度不跳动 */
    #s4tm-huya-com-bar .s4tm-toggle--perf {
      min-width: 68px;
      text-align: center;
    }

    html[data-s4tm-clean="1"] #s4tm-huya-com-bar {
      left: 0;
      right: 0;
      top: 0;
      bottom: auto;
      width: 100%;
      height: 36px;
      max-width: none;
      padding: 0 14px;
      border-radius: 0;
      background: #14151a;
      box-shadow: none;
      box-sizing: border-box;
    }

    html[data-s4tm-clean="1"] #s4tm-huya-com-bar .s4tm-room {
      display: block;
      overflow: hidden;
      max-width: 58%;
      color: #f2f3f5;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    html[data-s4tm-clean="1"] #s4tm-huya-com-bar .s4tm-anchor {
      display: block;
      overflow: hidden;
      max-width: 22%;
      color: #9aa0aa;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    html[data-s4tm-clean="1"] #s4tm-huya-com-bar .s4tm-anchor:empty {
      display: none;
    }

    html[data-s4tm-clean="1"] #s4tm-huya-com-bar .s4tm-hint {
      display: block;
      margin-left: auto;
      color: #6f7680;
      font-size: 11px;
    }

    /* hint 吃掉剩余空间，两个开关按钮自然贴右，不再各自 auto */
    html[data-s4tm-clean="1"] #s4tm-huya-com-bar .s4tm-toggle {
      margin-left: 0;
      background: #2b2f3a;
    }

    /* ---------- 布局：收回顶部导航与左侧栏占掉的 60px / 240px ---------- */
    html[data-s4tm-clean="1"] .main-wrap {
      padding: 36px 0 0 0 !important;
    }

    html[data-s4tm-clean="1"] .main-room {
      max-width: none !important;
      min-width: 0 !important;
      padding: 0 12px !important;
    }

    html[data-s4tm-clean="1"] .room-wrap,
    html[data-s4tm-clean="1"] #main_col,
    html[data-s4tm-clean="1"] .main-room {
      background: #101116 !important;
    }

    html[data-s4tm-clean="1"] .room-core-l {
      margin-right: 350px !important;
    }

    /*
     * 站点用 padding-top: 56.25% 按宽度撑出 16:9，宽屏下算出的高度小于视口，
     * 余下部分会露出 #main_col 的深色背景，就是截图里那块「下方黑色留白」。
     * 改成按视口高度铺满；弹幕栏是 .room-core-r height:100%，会一起到底。
     */
    html[data-s4tm-clean="1"] .room-player-wrap {
      height: calc(100vh - 36px) !important;
      padding: 0 !important;
    }

    /* 播放器内部也为 60px 礼物栏留了空，隐藏礼物栏后把画面拉回 100% */
    html[data-s4tm-clean="1"] #videoContainer .player-wrap {
      height: 100% !important;
    }

    /* ---------- 隐藏：站点框架、推荐、礼物、活动与榜单 ---------- */
    html[data-s4tm-clean="1"] #duya-header,
    html[data-s4tm-clean="1"] .mod-sidebar,
    html[data-s4tm-clean="1"] .room-footer,
    html[data-s4tm-clean="1"] .room-hd,
    html[data-s4tm-clean="1"] .room-mod-ggTop,
    html[data-s4tm-clean="1"] .room-gg-1,
    html[data-s4tm-clean="1"] .room-gg-2,
    html[data-s4tm-clean="1"] #matchComponent2,
    html[data-s4tm-clean="1"] .match-room,
    html[data-s4tm-clean="1"] #match-cms-content,
    html[data-s4tm-clean="1"] .room-player-gift-placeholder,
    html[data-s4tm-clean="1"] .send-gift {
      display: none !important;
    }

    /* 右栏只保留弹幕列表与输入区：去掉榜单、活动位、公告与付费入口 */
    html[data-s4tm-clean="1"] .room-sidebar-top,
    html[data-s4tm-clean="1"] .room-sidebar-hd,
    html[data-s4tm-clean="1"] .room-sidebar-tab,
    html[data-s4tm-clean="1"] #wrap-notice,
    html[data-s4tm-clean="1"] #wrap-income,
    html[data-s4tm-clean="1"] #wrap-guide,
    html[data-s4tm-clean="1"] #wrap-ext,
    html[data-s4tm-clean="1"] #messageboard,
    html[data-s4tm-clean="1"] #J_box_msgOfKing,
    html[data-s4tm-clean="1"] #J_bigStreamerStage,
    html[data-s4tm-clean="1"] #J_treasureChestContainer,
    html[data-s4tm-clean="1"] #J-room-club-color,
    html[data-s4tm-clean="1"] .room-chat-tool-color,
    html[data-s4tm-clean="1"] #system-warnTips {
      display: none !important;
    }

    /* ---------- 隐藏：播放器内部的礼物栏与冗余控件 ---------- */
    /*
     * 礼物栏真正挂在播放器内部：#videoContainer 底部 60px 的 #player-gift-wrap。
     * 站点 JS 会用内联 display 把它打开，所以除了 display 还要把高度归零兜底。
     * 其余是水印、二维码、订阅、分享、活动横幅等浮层，与看直播/发弹幕无关。
     */
    html[data-s4tm-clean="1"] #player-gift-wrap,
    html[data-s4tm-clean="1"] .player-gift-left,
    html[data-s4tm-clean="1"] .player-gift-right,
    html[data-s4tm-clean="1"] .player-face,
    html[data-s4tm-clean="1"] .player-gift-left-enter-list,
    html[data-s4tm-clean="1"] .gift-info-wrap,
    html[data-s4tm-clean="1"] .gift-info-btn,
    html[data-s4tm-clean="1"] #player-nobel-open,
    html[data-s4tm-clean="1"] .player-banner-gift,
    html[data-s4tm-clean="1"] #hy-watermark,
    html[data-s4tm-clean="1"] .player-app-qrcode,
    html[data-s4tm-clean="1"] .player-subscribe,
    html[data-s4tm-clean="1"] #player-subscribe-wap,
    html[data-s4tm-clean="1"] #player-login-guide-tip,
    html[data-s4tm-clean="1"] #player-share-btn,
    html[data-s4tm-clean="1"] #player-report-btn,
    html[data-s4tm-clean="1"] .player-top-right-btn,
    html[data-s4tm-clean="1"] .player-live-recommend-card,
    html[data-s4tm-clean="1"] .small-handle-tip {
      display: none !important;
    }

    /* 内联 display 被站点强制时，兜底把礼物栏压成 0 高且不可交互 */
    html[data-s4tm-clean="1"] #player-gift-wrap {
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      overflow: hidden !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* ---------- 隐藏：持续吃 CPU / GPU 的特效与广告容器 ---------- */
    /*
     * 这些容器会不断创建 DOM、跑动画或绘制 canvas（礼物飘屏、跑马灯、
     * 活动横幅、播放器内推荐卡片）。隐藏后浏览器不再布局与绘制它们，
     * 也不影响视频画面和右侧弹幕文本。类名取自 vplayer.css 的 mod-simple 列表
     * 与虎牙直播间 SSR 结构，少量历史类名作为兜底，不匹配时无副作用。
     * 刻意不用 player-panel / common-popup 这类泛化弹窗类名，
     * 它们可能承载表情、屏蔽词等互动面板，不能为了省一点开销误伤发言。
     */
    html[data-s4tm-clean="1"] .danmu-effect-wrap,
    html[data-s4tm-clean="1"] #player-marquee-wrap,
    html[data-s4tm-clean="1"] .player-marquee-item,
    html[data-s4tm-clean="1"] .player-banner-activity,
    html[data-s4tm-clean="1"] .player-banner-drop,
    html[data-s4tm-clean="1"] .player-banner-enter,
    html[data-s4tm-clean="1"] .player-banner-pugc,
    html[data-s4tm-clean="1"] .player-banner-question,
    html[data-s4tm-clean="1"] #huya-ab,
    html[data-s4tm-clean="1"] #huya-ab-fixed,
    html[data-s4tm-clean="1"] .room-gg-chat,
    html[data-s4tm-clean="1"] #sidebarBanner,
    html[data-s4tm-clean="1"] .sidebar-banner,
    html[data-s4tm-clean="1"] #player-download-guide-tip,
    html[data-s4tm-clean="1"] .diy-comps-wrap,
    html[data-s4tm-clean="1"] .diy-toutu,
    html[data-s4tm-clean="1"] .special-bg {
      display: none !important;
    }

    /*
     * 动态礼物 / 充值面板的类名由站点拼接，只能用子串匹配（并非明确类名）。
     * 规则带清爽模式前缀并排除脚本自建节点；站点改版若误伤，按 Alt + H 即刻还原。
     */
    html[data-s4tm-clean="1"] [class*="gift-panel"]:not([data-s4tm]),
    html[data-s4tm-clean="1"] [class*="giftPanel"]:not([data-s4tm]),
    html[data-s4tm-clean="1"] [class*="gift-bar"]:not([data-s4tm]),
    html[data-s4tm-clean="1"] [class*="giftBar"]:not([data-s4tm]),
    html[data-s4tm-clean="1"] [class*="recharge-panel"]:not([data-s4tm]),
    html[data-s4tm-clean="1"] [class*="noble-panel"]:not([data-s4tm]) {
      display: none !important;
    }

    /* ---------- 降级：站点自己的网页全屏 / 剧场模式优先，工具条让位 ---------- */
    html[data-s4tm-clean="1"] body.mode-page-theater #s4tm-huya-com-bar,
    html[data-s4tm-clean="1"] body.mode-page-full #s4tm-huya-com-bar {
      display: none !important;
    }

    html[data-s4tm-clean="1"] body.mode-page-theater .main-wrap,
    html[data-s4tm-clean="1"] body.mode-page-full .main-wrap {
      padding: 0 !important;
    }

    /* 站点全屏时顶栏已隐藏，36px 不能再扣，容器交回站点自己的 100% */
    html[data-s4tm-clean="1"] body.mode-page-theater .room-player-wrap,
    html[data-s4tm-clean="1"] body.mode-page-full .room-player-wrap {
      height: 100% !important;
    }

    /* 窄屏：弹幕栏改为播放器下方，避免两栏被压成细条 */
    @media (max-width: 900px) {
      html[data-s4tm-clean="1"] .room-core-l {
        margin-right: 0 !important;
      }

      html[data-s4tm-clean="1"] .room-core-r {
        position: static !important;
        width: 100% !important;
        height: 420px !important;
        margin-top: 10px;
      }

      /* 上下排列时播放器恢复 16:9，避免整个视口高加 420px 弹幕区过长 */
      html[data-s4tm-clean="1"] .room-player-wrap {
        height: auto !important;
        padding-top: 56.25% !important;
        padding-bottom: 0 !important;
      }
    }
  `;

  /* ---------- 工具 ---------- */

  /** 原生 API 包装标记：重复注入时不再层层代理 */
  const PATCHED = Symbol('s4tm-patched');

  /*
   * 统一登记脚本持有的资源。油猴禁用脚本不会通知已注入实例，
   * 所以 destroy() 只作为 debug 模式下的手动还原入口；普通用户刷新页面即可彻底回收。
   */
  const runtime = {
    listeners: [],
    timers: new Set(),
    cleanups: new Set(),
    restores: [],
    disposed: false,
  };

  function on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    runtime.listeners.push([target, type, handler, options]);
  }

  function later(fn, delay) {
    const id = setTimeout(() => {
      runtime.timers.delete(id);
      fn();
    }, delay);
    runtime.timers.add(id);
    return id;
  }

  function clearLater(id) {
    if (!id) return;
    clearTimeout(id);
    runtime.timers.delete(id);
  }

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
        runtime.cleanups.delete(cleanup);
      }

      runtime.cleanups.add(cleanup);
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
    // 重复注入时不层层代理 history，也避免 destroy 后把包装又装回去
    if (state.routePatched) return;
    state.routePatched = true;

    let lastUrl = location.href;
    const fire = () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      log('路由变化', lastUrl);
      handler(lastUrl);
    };

    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      const patched = function patchedHistory(...args) {
        const result = original.apply(this, args);
        fire();
        return result;
      };
      history[method] = patched;
      runtime.restores.push(() => {
        // 只有仍是自己包装的函数才还原，不覆盖站点后续的改写
        if (history[method] === patched) history[method] = original;
      });
    }

    on(window, 'popstate', fire);
    on(window, 'hashchange', fire);
  }

  /**
   * 配置读写：脚本用 @grant none 直接在页面上下文运行，网络拦截才能生效，
   * 因此只写同源 localStorage 的两个布尔值，不读站点其它存储项。
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

  /* ---------- 业务：性能拦截 ---------- */

  /** 用 Symbol 标记被拦的 XHR 实例，不往站点对象上加可见属性 */
  const XHR_SKIP = Symbol('s4tm-skip');

  /**
   * 判断请求是否属于明确的上报 / 广告黑名单。
   * 只解析 URL 字符串，不读请求体、不改响应内容、不碰业务数据。
   * @param {string} rawUrl
   * @returns {boolean}
   */
  function shouldBlock(rawUrl) {
    // 离开直播间（含 SPA 跳到首页）后一律放行，不把拦截带到别的页面
    if (!state.perfEnabled || !looksLikeRoom()) return false;
    try {
      const url = new URL(String(rawUrl), location.href);
      if (BLOCKED_HOSTS.some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )) return true;
      return url.hostname === 'i.huya.com' && SENTRY_PATH.test(url.pathname);
    } catch (err) {
      return false;
    }
  }

  /** 计数只用于按钮文案，防抖避免高频 DOM 写入 */
  function countBlocked() {
    state.blockedCount += 1;
    if (state.countTimer) return;
    state.countTimer = later(() => {
      state.countTimer = 0;
      updatePerfButton();
    }, CONFIG.countDebounce);
  }

  function updatePerfButton() {
    if (!state.perfToggle) return;
    state.perfToggle.textContent = state.perfEnabled
      ? `省流 ${state.blockedCount}`
      : '省流 关';
    state.perfToggle.title = state.perfEnabled
      ? `已拦截 ${state.blockedCount} 个上报 / 广告请求，点此或 Alt + P 暂停`
      : '拦截已暂停，点此或 Alt + P 恢复';
  }

  /** fetch 必须返回可解析的空响应，否则站点的 await 链会永久挂起 */
  function emptyResponse() {
    if (typeof Response === 'function') {
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
    };
  }

  function patchFetch() {
    const native = window.fetch;
    if (typeof native !== 'function' || native[PATCHED]) return;

    const patched = function patchedFetch(input) {
      const rawUrl = typeof input === 'string'
        ? input
        : (input && typeof input.url === 'string' ? input.url : '');
      if (rawUrl && shouldBlock(rawUrl)) {
        countBlocked();
        return Promise.resolve(emptyResponse());
      }
      return native.apply(this, arguments);
    };
    patched[PATCHED] = true;
    window.fetch = patched;
    runtime.restores.push(() => {
      if (window.fetch === patched) window.fetch = native;
    });
  }

  function patchXhr() {
    const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (!proto || typeof proto.open !== 'function' || typeof proto.send !== 'function') return;
    if (proto.open[PATCHED] || proto.send[PATCHED]) return;

    const nativeOpen = proto.open;
    const nativeSend = proto.send;

    const patchedOpen = function patchedOpen(method, url, ...rest) {
      this[XHR_SKIP] = shouldBlock(url);
      return nativeOpen.call(this, method, url, ...rest);
    };

    const patchedSend = function patchedSend(body) {
      if (this[XHR_SKIP]) {
        countBlocked();
        return; // 静默丢弃，不触发 error 回调，站点不会打印上报失败
      }
      return nativeSend.call(this, body);
    };

    patchedOpen[PATCHED] = true;
    patchedSend[PATCHED] = true;
    proto.open = patchedOpen;
    proto.send = patchedSend;
    runtime.restores.push(() => {
      if (proto.open === patchedOpen) proto.open = nativeOpen;
      if (proto.send === patchedSend) proto.send = nativeSend;
    });
  }

  function patchBeacon() {
    const nav = window.navigator;
    if (!nav || typeof nav.sendBeacon !== 'function' || nav.sendBeacon[PATCHED]) return;

    const native = nav.sendBeacon;
    const patched = function patchedBeacon(url, data) {
      if (shouldBlock(url)) {
        countBlocked();
        return true; // 告诉调用方已排队，避免它退回 new Image 再发一次
      }
      return native.call(nav, url, data);
    };
    patched[PATCHED] = true;
    nav.sendBeacon = patched;
    runtime.restores.push(() => {
      if (nav.sendBeacon === patched) nav.sendBeacon = native;
    });
  }

  /** 虎牙的启动 / 点击埋点是 (new Image).src = url，必须拦 setter 才有效 */
  function patchImageSrc() {
    const proto = window.HTMLImageElement && window.HTMLImageElement.prototype;
    if (!proto) return;

    const desc = Object.getOwnPropertyDescriptor(proto, 'src');
    if (!desc || !desc.set || !desc.configurable || desc.set[PATCHED]) return;

    const patchedSet = function (value) {
      if (shouldBlock(String(value))) {
        countBlocked();
        return;
      }
      desc.set.call(this, value);
    };
    patchedSet[PATCHED] = true;

    Object.defineProperty(proto, 'src', {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set: patchedSet,
    });
    runtime.restores.push(() => {
      const current = Object.getOwnPropertyDescriptor(proto, 'src');
      if (current?.set === patchedSet) Object.defineProperty(proto, 'src', desc);
    });
  }

  /** 每个 patch 独立 try/catch：某个 API 被抢占也不能带崩其它功能 */
  function installNetworkGuard() {
    for (const patch of [patchFetch, patchXhr, patchBeacon, patchImageSrc]) {
      try {
        patch();
      } catch (err) {
        warn('网络拦截安装失败', patch.name, err);
      }
    }
    log('网络拦截已安装，黑名单域名数', BLOCKED_HOSTS.length);
  }

  /** 幂等：初始是首页、后来 SPA 跳进直播间时补装一次 */
  function installGuardOnce() {
    if (state.guardInstalled) return;
    state.guardInstalled = true;
    state.perfEnabled = store.get('perfMode', true) !== false;
    installNetworkGuard();
  }

  function setPerfEnabled(enabled) {
    state.perfEnabled = enabled;
    store.set('perfMode', enabled);
    updatePerfButton();
    log('性能拦截', enabled ? '开启' : '暂停');
  }

  /* ---------- 业务：页面精简 ---------- */

  /** 直播间 URL 是数字 ID 或字母短链，先用路径排除明显的非直播间页面 */
  function looksLikeRoom() {
    return !NON_ROOM_PATHS.some((pattern) => pattern.test(location.pathname));
  }

  /** 顶栏文案只取自页面文本，用 textContent 写入，不拼接 HTML */
  function readRoomMeta() {
    const titleEl = document.getElementById('J_roomTitle');
    const anchorEl = document.querySelector('.host-name');
    const pageTitle = document.title.replace(/\s*[-_]\s*虎牙直播.*$/, '').trim();

    return {
      title: (titleEl?.getAttribute('title') || titleEl?.textContent || '').trim() || pageTitle,
      anchor: (anchorEl?.getAttribute('title') || anchorEl?.textContent || '').trim(),
    };
  }

  function updateBarText() {
    if (!state.bar) return;
    const meta = readRoomMeta();
    const room = state.bar.querySelector('.s4tm-room');
    const anchor = state.bar.querySelector('.s4tm-anchor');
    const put = (node, text) => {
      if (node && node.textContent !== text) node.textContent = text;
    };

    put(room, meta.title || '虎牙直播间');
    put(anchor, meta.anchor);
  }

  function setEnabled(enabled) {
    state.enabled = enabled;
    store.set('cleanMode', enabled);

    if (enabled) {
      document.documentElement.setAttribute(CLEAN_ATTR, '1');
    } else {
      document.documentElement.removeAttribute(CLEAN_ATTR);
    }

    if (state.toggle) {
      state.toggle.textContent = enabled ? '原版界面' : '清爽模式';
      state.toggle.setAttribute('aria-pressed', String(enabled));
      state.toggle.title = enabled
        ? '恢复虎牙原始界面（Alt + H）'
        : '开启清爽模式（Alt + H）';
    }

    log('清爽模式', enabled ? '开启' : '关闭');
  }

  function onKeyDown(event) {
    // 非直播间页面（含 SPA 跳走后）不响应快捷键，避免给首页挂上清爽开关
    if (!state.mounted || !looksLikeRoom()) return;
    if (!event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;

    const key = event.key?.toLowerCase();
    if (key !== CONFIG.hotkey && key !== CONFIG.perfHotkey) return;
    if (event.target instanceof Element
      && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;

    event.preventDefault();
    if (key === CONFIG.perfHotkey) {
      setPerfEnabled(!state.perfEnabled);
    } else {
      setEnabled(!state.enabled);
    }
  }

  /**
   * 房间切流 / 标题异步回填时同步顶栏。观察器只留一份、可重建、可注销，
   * 回调先防抖再读 DOM，避免标题子树高频变动时反复全文档查询。
   */
  async function watchRoomMeta() {
    // 并发调用（mount 与路由回调撞车）只保留最后一次，避免建出多个观察者
    const generation = ++state.metaGeneration;
    state.metaObserver?.disconnect();
    state.metaObserver = null;
    clearLater(state.metaTimer);
    state.metaTimer = 0;

    let titleEl;
    try {
      titleEl = await waitFor('#J_roomTitle');
    } catch (err) {
      log('房间标题节点未出现，顶栏标题不自动刷新', err.message);
      return;
    }
    if (runtime.disposed || generation !== state.metaGeneration || !titleEl.isConnected) return;

    const observer = new MutationObserver(() => {
      clearLater(state.metaTimer);
      state.metaTimer = later(() => {
        state.metaTimer = 0;
        updateBarText();
      }, CONFIG.metaDebounce);
    });

    observer.observe(titleEl, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title'],
    });
    state.metaObserver = observer;
    updateBarText();
  }

  function createBar() {
    // 并发 mount 竞态的兜底：已有工具条就复用，不建第二个同 id 节点
    const existing = document.getElementById(BAR_ID);
    if (existing) {
      state.bar = existing;
      state.perfToggle = existing.querySelector('.s4tm-toggle--perf');
      state.toggle = existing.querySelector('.s4tm-toggle:not(.s4tm-toggle--perf)');
      updateBarText();
      updatePerfButton();
      return;
    }

    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.setAttribute('data-s4tm', 'toolbar');
    bar.setAttribute('data-s4tm-mounted', '1');

    const room = document.createElement('span');
    room.className = 's4tm-room';
    const anchor = document.createElement('span');
    anchor.className = 's4tm-anchor';
    const hint = document.createElement('span');
    hint.className = 's4tm-hint';
    hint.textContent = 'Alt + H / P';

    const perfToggle = document.createElement('button');
    perfToggle.type = 'button';
    perfToggle.className = 's4tm-toggle s4tm-toggle--perf';
    perfToggle.setAttribute('data-s4tm', 'perf-toggle');
    on(perfToggle, 'click', () => setPerfEnabled(!state.perfEnabled));

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 's4tm-toggle';
    toggle.setAttribute('data-s4tm', 'toggle');
    on(toggle, 'click', () => setEnabled(!state.enabled));

    bar.append(room, anchor, hint, perfToggle, toggle);
    (document.body || document.documentElement).appendChild(bar);

    state.bar = bar;
    state.perfToggle = perfToggle;
    state.toggle = toggle;
    updateBarText();
    updatePerfButton();
  }

  /** SPA 跳到首页 / 分类页时收起开关；样式规则带前缀，属性一移除站点立刻复原 */
  function suspendCleanMode() {
    document.documentElement.removeAttribute(CLEAN_ATTR);
    if (state.bar) state.bar.style.display = 'none';
  }

  function resumeCleanMode() {
    if (state.bar) state.bar.style.removeProperty('display');
    setEnabled(state.enabled);
  }

  async function mount() {
    // awaiting 之前先占位，避免等待 .room-core 的十几秒里并发注入两个工具条
    if (state.mounted || state.mounting || document.getElementById(BAR_ID)) return;
    if (!looksLikeRoom()) {
      log('非直播间路径，跳过');
      return;
    }

    state.mounting = true;
    try {
      // 样式里的规则都带 html[data-s4tm-clean] 前缀，未确认页面前不会生效
      injectStyle(STYLE_ID, CLEAN_CSS);
      await waitFor(ROOM_SELECTOR);

      // await 期间可能已有另一次 mount 完成，或脚本已被卸载
      if (runtime.disposed || state.mounted || document.getElementById(BAR_ID)) return;

      state.mounted = true;
      createBar();
      setEnabled(store.get('cleanMode', true) !== false);
      watchRoomMeta().catch((err) => warn('房间标题监听失败', err));
      log('挂载完成');
    } catch (err) {
      warn('未识别到直播间结构，本次跳过', err.message);
    } finally {
      state.mounting = false;
    }
  }

  /* ---------- 启动 ---------- */

  /**
   * 一次性回收全部资源：注销监听、断开观察者、清定时器、还原被包装的原生 API，
   * 移除注入节点与清爽模式属性。禁用脚本不会自动触发它，debug 模式下手动调用。
   */
  function destroy() {
    if (runtime.disposed) return;
    runtime.disposed = true;

    for (const [target, type, handler, options] of runtime.listeners) {
      target.removeEventListener(type, handler, options);
    }
    runtime.listeners.length = 0;

    state.metaGeneration += 1;
    state.metaObserver?.disconnect();
    state.metaObserver = null;
    clearLater(state.metaTimer);
    clearLater(state.countTimer);
    state.metaTimer = 0;
    state.countTimer = 0;

    for (const id of runtime.timers) clearTimeout(id);
    runtime.timers.clear();
    for (const cleanup of runtime.cleanups) cleanup();
    runtime.cleanups.clear();
    for (const restore of runtime.restores) restore();
    runtime.restores.length = 0;

    document.documentElement.removeAttribute(CLEAN_ATTR);
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(BAR_ID)?.remove();
    state.bar = null;
    state.toggle = null;
    state.perfToggle = null;
    state.mounted = false;
    state.mounting = false;
    state.routePatched = false;

    if (CONFIG.debug && window.__S4TM__) delete window.__S4TM__;
    log('已卸载');
  }

  function main() {
    const safeMount = () => {
      mount().catch((err) => warn('挂载失败', err));
    };
    const safeMeta = () => {
      watchRoomMeta().catch((err) => warn('房间标题监听失败', err));
    };

    // 网络拦截必须在页面脚本执行前安装，且只在直播间 URL 生效
    try {
      if (looksLikeRoom()) installGuardOnce();
    } catch (err) {
      warn('性能拦截初始化失败', err);
    }

    try {
      safeMount();
      onUrlChange(() => {
        if (!looksLikeRoom()) {
          suspendCleanMode();
          return;
        }
        installGuardOnce();
        safeMount();
        resumeCleanMode();
        safeMeta(); // SPA 切房间会替换标题节点，重新绑定观察器
      });
      on(document, 'keydown', onKeyDown, true);
    } catch (err) {
      warn('初始化失败', err);
    }
  }

  main();

  // 2.2 只允许一个调试接口，且默认不启用
  if (CONFIG.debug) {
    window.__S4TM__ = { destroy };
  }
})();
