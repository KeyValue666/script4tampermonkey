// ==UserScript==
// @name         S4TM · 哔哩哔哩 · 首页增强
// @namespace    https://github.com/KeyValue666/script4tampermonkey/sites/bilibili-com
// @version      2.0.1
// @description  B 站首页隐藏轮播让推荐视频排成 2 行 × 5 列、Alt+R 旋转竖屏视频、可拖拽面板
// @author       KeyValue666
// @match        https://www.bilibili.com/*
// @match        https://t.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        none
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/KeyValue666/script4tampermonkey/blob/main/sites/bilibili-com/README.md
// @supportURL   https://github.com/KeyValue666/script4tampermonkey/issues
// @updateURL    https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/bilibili-com/bilibili-com.user.js
// @downloadURL  https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/bilibili-com/bilibili-com.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- 配置 ---------- */

  const SITE_KEY = 'bilibili-com';
  const PREFIX = `[s4tm:${SITE_KEY}]`;
  const STORAGE_KEY = 's4tm:bilibili-com:settings';

  const CONFIG = {
    /** 本地调试改 true，控制台会输出布局识别过程 */
    debug: false,
    /** 站点重绘频繁，布局重算必须防抖 */
    layoutDebounce: 260,
    /** 与你在控制台手动使用的变换保持一致 */
    rotateTransform: 'rotate(-90deg) scale(1.78)',
  };

  const DEFAULTS = {
    panelVisible: true,
    left: null,
    top: 96,
    rotateEnabled: true,
    homeGridEnabled: true,
  };

  /** 全部标记都带 s4tm 前缀，避免与站点属性冲突 */
  const ATTR = {
    hiddenCarousel: 'data-s4tm-carousel-hidden',
  };

  const CAROUSEL_SELECTORS = [
    '.recommended-swipe',
    '[class*="recommended-swipe"]',
  ];
  const VIDEO_LINK_SELECTOR = 'a[href*="/video/"]';

  /* ---------- 工具 ---------- */

  const log = (...args) => {
    if (CONFIG.debug) console.log(PREFIX, ...args);
  };
  const warn = (...args) => console.warn(PREFIX, ...args);

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { ...DEFAULTS, ...saved };
    } catch (err) {
      warn('读取配置失败，使用默认值', err);
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
      warn('保存配置失败', err);
    }
  }

  function isVisible(element) {
    return !!element && element.getClientRects().length > 0;
  }

  function isEditableElement(element) {
    // 键盘事件的 target 不一定是元素（例如直接派发到 document），必须防御
    if (!(element instanceof Element)) return false;
    return !!element.closest(
      'input, textarea, select, [contenteditable="true"]',
    );
  }

  function isHomePage() {
    return location.hostname === 'www.bilibili.com'
      && (location.pathname === '/' || location.pathname === '/index.html');
  }

  /* ---------- 功能一：Alt+R 旋转视频 ---------- */

  const settings = loadSettings();

  const state = {
    rotatedVideo: null,
    savedVideoStyle: null,
    panel: null,
    carousel: null,
    container: null,
    layoutTimer: 0,
  };

  function getCurrentVideo() {
    const videos = [...document.querySelectorAll('video')];
    const visible = videos.filter(
      (video) => video.offsetWidth > 0 && video.offsetHeight > 0,
    );

    // 优先当前正在播放的那个，其次取第一个可见视频。
    return visible.find((video) => !video.paused) || visible[0] || null;
  }

  function restoreVideoStyle(video) {
    if (!video || !state.savedVideoStyle) return;
    video.style.transform = state.savedVideoStyle.transform;
    video.style.transformOrigin = state.savedVideoStyle.transformOrigin;
  }

  function rotateVideo() {
    if (!settings.rotateEnabled) return;

    const video = getCurrentVideo();
    if (!video) {
      warn('当前页面没有可旋转的视频');
      return;
    }

    // 同一视频再次触发：恢复。
    if (state.rotatedVideo === video) {
      restoreVideoStyle(video);
      state.rotatedVideo = null;
      state.savedVideoStyle = null;
      log('视频已恢复');
      return;
    }

    // 之前旋转的是另一个视频（例如切集后换了 video 元素）：先恢复它。
    if (state.rotatedVideo && state.rotatedVideo.isConnected) {
      restoreVideoStyle(state.rotatedVideo);
    }

    state.savedVideoStyle = {
      transform: video.style.transform,
      transformOrigin: video.style.transformOrigin,
    };
    state.rotatedVideo = video;

    video.style.transformOrigin = 'center center';
    video.style.transform = CONFIG.rotateTransform;

    log('视频已旋转，再按一次 Alt+R 恢复');
  }

  document.addEventListener('keydown', (event) => {
    if (
      event.altKey
      && event.key.toLowerCase() === 'r'
      && !event.ctrlKey
      && !event.metaKey
      && !event.repeat
      && !isEditableElement(event.target)
    ) {
      event.preventDefault();
      event.stopPropagation();
      rotateVideo();
    }
  }, true);

  /* ---------- 功能二：首页推荐 2 行 × 5 列 ---------- */

  /*
   * B 站首页真实结构（2026-10 实机抓取）：
   *
   *   .recommended-container_floor-aside
   *     └─ .container.is-version8        display: grid，5 列（245px × 5）
   *          ├─ .recommended-swipe      轮播，占 2 列 × 2 行
   *          ├─ .feed-card × 10         推荐视频卡片（前 6 张排在轮播右侧）
   *          └─ .floor-single-card / .bili-video-card / .load-more-anchor …
   *
   * 关键：容器本身就是 5 列网格，只是被轮播占了 2 列。把轮播隐藏后，
   * 10 张 .feed-card 会自然回填成 2 行 × 5 列，下面的楼层内容整体上移。
   *
   * 因此这里只做两件事：定位轮播、隐藏轮播。绝不修改容器的布局属性，
   * 也不插入任何卡片 —— 这是 1.0.0 造成整页错乱的根源，不能再犯。
   */

  const CARD_SELECTOR = '.feed-card, .bili-video-card, [class*="feed-card"]';

  function isCardLike(element) {
    return element instanceof Element && element.matches(CARD_SELECTOR);
  }

  function findCarousel() {
    for (const selector of CAROUSEL_SELECTORS) {
      const found = [...document.querySelectorAll(selector)].find((element) =>
        (isVisible(element) || element.hasAttribute(ATTR.hiddenCarousel))
        && element.querySelector(VIDEO_LINK_SELECTOR),
      );
      if (found) return found;
    }
    return null;
  }

  /**
   * 向上找承载“轮播 + 推荐卡片”的那个网格/flex 容器。
   * 必须同时满足：容器是 grid/flex、直接子元素里至少有 4 个卡片、且包含轮播。
   * 三条任一不满足就放弃，不改任何样式。
   */
  function findCardContainer(carousel) {
    let node = carousel.parentElement;

    for (let depth = 0; node && node !== document.body && depth < 4; depth += 1) {
      const display = getComputedStyle(node).display;
      if (display === 'grid' || display === 'flex') {
        const cards = [...node.children].filter(isCardLike);
        if (cards.length >= 4) {
          return { container: node, cards };
        }
      }
      node = node.parentElement;
    }

    return null;
  }

  function applyHomeLayout() {
    if (!settings.homeGridEnabled || !isHomePage()) return;

    const carousel = findCarousel();
    if (!carousel) {
      log('未找到首页轮播');
      return;
    }

    const found = findCardContainer(carousel);
    // 结构不认识就什么都不做：宁可本次不生效，也不能改坏页面
    if (!found) {
      warn('未识别到推荐网格结构，本次跳过');
      return;
    }

    state.carousel = carousel;
    state.container = found.container;
    found.container.setAttribute('data-s4tm-home', '1');

    if (!carousel.hasAttribute(ATTR.hiddenCarousel)) {
      carousel.setAttribute(ATTR.hiddenCarousel, '1');
      carousel.style.setProperty('display', 'none', 'important');
      log(`已隐藏轮播，推荐卡片 ${found.cards.length} 个，容器已复原为 5 列`);
    }

    if (found.cards.length < 10) {
      log(`推荐卡片只有 ${found.cards.length} 个，可能不足 2 行 × 5 列`);
    }
  }

  function resetHomeLayout() {
    document.querySelectorAll(`[${ATTR.hiddenCarousel}]`).forEach((element) => {
      element.style.removeProperty('display');
      element.removeAttribute(ATTR.hiddenCarousel);
    });

    document.querySelectorAll('[data-s4tm-home]').forEach((element) => {
      element.removeAttribute('data-s4tm-home');
    });

    state.carousel = null;
    state.container = null;
  }

  function scheduleLayout(delay = CONFIG.layoutDebounce) {
    if (state.layoutTimer) clearTimeout(state.layoutTimer);
    state.layoutTimer = setTimeout(() => {
      state.layoutTimer = 0;
      try {
        applyHomeLayout();
      } catch (err) {
        warn('首页布局调整失败', err);
      }
    }, delay);
  }

  function startLayoutWatcher() {
    const observer = new MutationObserver(() => {
      if (!isHomePage()) return;
      scheduleLayout();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // 后台标签页加载首页时也必须完成布局，切回前台再补一次
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleLayout(0);
    });

    // 站内跳转回首页时不一定会重建推荐区，补一次立即重算
    window.addEventListener('popstate', () => scheduleLayout(400));
    window.addEventListener('pageshow', () => scheduleLayout(400));
  }

  /* ---------- 样式 ---------- */

  function installStyles() {
    if (document.getElementById('s4tm-styles')) return;

    const style = document.createElement('style');
    style.id = 's4tm-styles';
    style.textContent = `
      /* ---------- 个性化面板 ---------- */
      #s4tm-panel {
        position: fixed;
        z-index: 2147483647;
        width: 272px;
        max-width: calc(100vw - 16px);
        color: #e8e8e8;
        background: linear-gradient(180deg, rgba(36, 39, 44, 0.97), rgba(27, 29, 33, 0.97));
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 14px;
        box-shadow:
          0 12px 40px rgba(0, 0, 0, 0.32),
          0 2px 8px rgba(0, 0, 0, 0.18);
        font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow: hidden;
        backdrop-filter: blur(14px);
        animation: s4tm-panel-in 0.24s ease-out;
      }

      /* display 切换会重放此动画，正好充当打开面板的过渡 */
      @keyframes s4tm-panel-in {
        from {
          opacity: 0;
          transform: translateY(-6px) scale(0.98);
        }

        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      #s4tm-panel * {
        box-sizing: border-box;
      }

      #s4tm-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 11px 12px;
        background: linear-gradient(90deg, rgba(0, 174, 236, 0.16), rgba(0, 174, 236, 0.04));
        cursor: move;
        user-select: none;
        touch-action: none;
      }

      #s4tm-title {
        display: flex;
        align-items: center;
        gap: 7px;
        font-weight: 600;
        letter-spacing: 0.2px;
        white-space: nowrap;
      }

      #s4tm-title::before {
        content: '';
        flex: none;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #00aeec;
        box-shadow: 0 0 6px rgba(0, 174, 236, 0.8);
      }

      .s4tm-actions {
        display: flex;
        gap: 5px;
      }

      .s4tm-btn {
        min-width: 24px;
        border: 0;
        border-radius: 7px;
        padding: 4px 8px;
        color: inherit;
        background: rgba(255, 255, 255, 0.1);
        cursor: pointer;
        font-size: 13px;
        line-height: 1;
        transition: background 0.15s ease, transform 0.1s ease;
      }

      .s4tm-btn:hover {
        background: rgba(255, 255, 255, 0.22);
      }

      .s4tm-btn:active {
        transform: scale(0.9);
      }

      #s4tm-body {
        padding: 12px;
      }

      .s4tm-section-title {
        margin: 0 0 8px;
        color: #aeb6c2;
        font-size: 12px;
        letter-spacing: 0.4px;
      }

      .s4tm-option {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        margin: 0 -8px;
        padding: 9px 8px;
        border-radius: 9px;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .s4tm-option:hover {
        background: rgba(255, 255, 255, 0.06);
      }

      .s4tm-option input {
        flex: none;
        width: 15px;
        height: 15px;
        margin-top: 4px;
        accent-color: #00aeec;
        cursor: pointer;
      }

      .s4tm-option small {
        display: block;
        margin-top: 2px;
        color: #aeb6c2;
        font-size: 11px;
      }

      #s4tm-footer {
        margin-top: 8px;
        padding-top: 9px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        color: #aeb6c2;
        font-size: 11px;
      }

      #s4tm-show-panel {
        display: none;
        position: fixed;
        z-index: 2147483647;
        right: 18px;
        bottom: 100px;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border: 0;
        border-radius: 50%;
        padding: 0;
        color: #fff;
        background: linear-gradient(135deg, #00aeec, #0093d4);
        box-shadow: 0 4px 16px rgba(0, 174, 236, 0.35);
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
      }

      #s4tm-show-panel:hover {
        background: linear-gradient(135deg, #01b8f5, #009ddf);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 174, 236, 0.45);
      }

      #s4tm-show-panel:active {
        transform: translateY(0);
      }

      /* 用户偏好减少动效时，去掉全部过渡与动画 */
      @media (prefers-reduced-motion: reduce) {
        #s4tm-panel {
          animation: none;
        }

        #s4tm-show-panel,
        .s4tm-btn,
        .s4tm-option {
          transition: none;
        }
      }

      /*
       * 首页：轮播隐藏后，原本位于“轮播下方第二段”的第 7–10 张卡片带着
       * 40px 的楼层间距，排进第二行时会被压低，看起来像两行错位。
       * 只在这个容器内清零，楼层以下的卡片不动。
       */
      [data-s4tm-home] > .feed-card {
        margin-top: 0 !important;
      }

      @media (max-width: 520px) {
        #s4tm-panel {
          width: 236px;
        }
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  /* ---------- 面板 ---------- */

  function setPanelVisible(visible) {
    settings.panelVisible = visible;
    saveSettings();

    if (state.panel) state.panel.style.display = visible ? '' : 'none';
    getShowButton().style.display = visible ? 'none' : 'flex';
  }

  function placePanel() {
    if (!state.panel) return;

    const width = state.panel.offsetWidth || 272;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - 56);

    if (settings.left === null) settings.left = maxLeft;
    settings.left = Math.min(maxLeft, Math.max(8, settings.left));
    settings.top = Math.min(maxTop, Math.max(8, settings.top));

    state.panel.style.left = `${settings.left}px`;
    state.panel.style.top = `${settings.top}px`;
  }

  function getShowButton() {
    const existing = document.getElementById('s4tm-show-panel');
    if (existing) return existing;

    const button = document.createElement('button');
    button.id = 's4tm-show-panel';
    button.type = 'button';
    button.title = 'B站工具';
    button.setAttribute('aria-label', '打开 B站工具面板');
    // 静态吉祥物图标（小电视：白底 + 蓝色双目 + 腮红，透明背景），无任何站点数据参与拼接
    button.innerHTML = `
      <svg viewBox="0 0 48 48" width="32" height="32" aria-hidden="true">
        <path d="M14.5 5.5 21 12.5" stroke="#fff" stroke-width="3.5"
          stroke-linecap="round" fill="none" />
        <path d="M33.5 5.5 27 12.5" stroke="#fff" stroke-width="3.5"
          stroke-linecap="round" fill="none" />
        <rect x="6" y="12" width="36" height="28" rx="9" fill="#fff" />
        <rect x="17.5" y="21.5" width="4.6" height="9.4" rx="2.3" fill="#00a0d8" />
        <rect x="25.9" y="21.5" width="4.6" height="9.4" rx="2.3" fill="#00a0d8" />
        <circle cx="13.2" cy="28.6" r="2.3" fill="#b8e2f2" />
        <circle cx="34.8" cy="28.6" r="2.3" fill="#b8e2f2" />
      </svg>
    `;
    button.addEventListener('click', () => setPanelVisible(true));

    document.body.appendChild(button);
    return button;
  }

  function makeDraggable(element, handle) {
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let dragging = false;

    handle.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;

      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      initialLeft = element.offsetLeft;
      initialTop = element.offsetTop;

      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    handle.addEventListener('pointermove', (event) => {
      if (!dragging) return;

      const maxLeft = Math.max(0, window.innerWidth - element.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - 40);

      const left = Math.min(
        maxLeft,
        Math.max(0, initialLeft + event.clientX - startX),
      );
      const top = Math.min(
        maxTop,
        Math.max(0, initialTop + event.clientY - startY),
      );

      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    });

    const stopDragging = () => {
      if (!dragging) return;
      dragging = false;

      settings.left = element.offsetLeft;
      settings.top = element.offsetTop;
      saveSettings();
    };

    handle.addEventListener('pointerup', stopDragging);
    handle.addEventListener('pointercancel', stopDragging);
  }

  function createPanel() {
    if (document.getElementById('s4tm-panel')) return;

    const panel = document.createElement('section');
    panel.id = 's4tm-panel';

    panel.innerHTML = `
      <div id="s4tm-header">
        <span id="s4tm-title">B站个性化增强</span>
        <div class="s4tm-actions">
          <button class="s4tm-btn" id="s4tm-hide" type="button" title="隐藏面板">×</button>
        </div>
      </div>
      <div id="s4tm-body">
        <div class="s4tm-section-title">功能设置</div>

        <label class="s4tm-option">
          <input type="checkbox" id="s4tm-rotate">
          <span>
            视频旋转快捷键
            <small>Alt + R：旋转 / 恢复视频</small>
          </span>
        </label>

        <label class="s4tm-option">
          <input type="checkbox" id="s4tm-grid">
          <span>
            首页推荐 2 行 × 5 列
            <small>隐藏轮播图，推荐视频自动回填为 2 × 5</small>
          </span>
        </label>

        <div id="s4tm-footer">配置自动保存 · 仅作用于 B 站</div>
      </div>
    `;

    document.body.appendChild(panel);

    state.panel = panel;

    const rotateToggle = panel.querySelector('#s4tm-rotate');
    const gridToggle = panel.querySelector('#s4tm-grid');

    rotateToggle.checked = settings.rotateEnabled;
    gridToggle.checked = settings.homeGridEnabled;

    rotateToggle.addEventListener('change', (event) => {
      settings.rotateEnabled = event.target.checked;
      saveSettings();
    });

    gridToggle.addEventListener('change', (event) => {
      settings.homeGridEnabled = event.target.checked;
      saveSettings();

      if (settings.homeGridEnabled) {
        scheduleLayout(0);
      } else {
        resetHomeLayout();
      }
    });

    panel.querySelector('#s4tm-hide').addEventListener('click', () => {
      setPanelVisible(false);
    });

    makeDraggable(panel, panel.querySelector('#s4tm-header'));

    placePanel();
    getShowButton();

    if (!settings.panelVisible) {
      setPanelVisible(false);
    }

    window.addEventListener('resize', placePanel);
  }

  /* ---------- 启动 ---------- */

  function init() {
    if (!document.body) return;

    installStyles();
    createPanel();
    startLayoutWatcher();

    if (isHomePage()) scheduleLayout(0);

    log('已启动');
  }

  if (document.body) {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
