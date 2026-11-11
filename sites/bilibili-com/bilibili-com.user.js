// ==UserScript==
// @name         S4TM · 哔哩哔哩 · 首页增强
// @namespace    https://github.com/KeyValue666/script4tampermonkey/sites/bilibili-com
// @version      2.2.2
// @description  B 站首页隐藏轮播让推荐视频排成 2 行 × 5 列、Alt+R 旋转竖屏视频、一键提取视频音频
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
    /** 本地调试改 true：输出布局识别过程，并挂载 __S4TM__ 调试接口 */
    debug: false,
    /** 站点重绘频繁，布局重算必须防抖 */
    layoutDebounce: 260,
    /** 与你在控制台手动使用的变换保持一致 */
    rotateTransform: 'rotate(-90deg) scale(1.78)',
    /** 音轨直链可能较大，超时放宽到 30 秒 */
    fetchTimeout: 30000,
    /** 下载落盘是异步的，留短暂宽限期再释放 Blob，避免几十 MB 常驻内存 */
    revokeDelay: 3000,
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

  /*
   * 统一登记脚本持有的资源。Tampermonkey 禁用脚本时不会通知已注入实例，
   * 所以不假装有自动卸载钩子：destroy() 只作为调试接口按需调用，
   * 彻底还原的可靠方式仍是刷新页面（浏览器回收整个 JS 上下文）。
   */
  const runtime = {
    listeners: [],
    observer: null,
    timers: new Set(),
    objectUrls: new Set(),
    controllers: new Set(),
    disposed: false,
    initialized: false,
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

  function createController() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.fetchTimeout);
    runtime.timers.add(timer);
    runtime.controllers.add(controller);
    return { controller, timer };
  }

  function releaseController(token) {
    clearTimeout(token.timer);
    runtime.timers.delete(token.timer);
    runtime.controllers.delete(token.controller);
  }

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
    dragFrame: 0,
    extracting: false,
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

  /** 旧视频节点被站点替换后立刻断开引用，避免闭包长期持有 detached <video> */
  function releaseDetachedVideo() {
    if (!state.rotatedVideo || state.rotatedVideo.isConnected) return;
    state.rotatedVideo = null;
    state.savedVideoStyle = null;
  }

  function rotateVideo() {
    if (!settings.rotateEnabled) return;

    releaseDetachedVideo();
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

  function onKeyDown(event) {
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
  }

  on(document, 'keydown', onKeyDown, true);

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

    // 站点重绘会替换推荐区，旧节点一脱离 DOM 就断开引用
    if (state.carousel && !state.carousel.isConnected) state.carousel = null;
    if (state.container && !state.container.isConnected) state.container = null;

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
    clearLater(state.layoutTimer);
    state.layoutTimer = later(() => {
      state.layoutTimer = 0;
      try {
        applyHomeLayout();
      } catch (err) {
        warn('首页布局调整失败', err);
      }
    }, delay);
  }

  function onVisibilityChange() {
    if (!document.hidden) scheduleLayout(0);
  }

  function onRouteChange() {
    scheduleLayout(400);
  }

  function startLayoutWatcher() {
    // 幂等：重复注入或重复 init 不再叠加观察者与监听
    if (runtime.observer) return;

    runtime.observer = new MutationObserver(() => {
      if (!isHomePage()) return;
      scheduleLayout();
    });

    runtime.observer.observe(document.body, { childList: true, subtree: true });

    // 后台标签页加载首页时也必须完成布局，切回前台再补一次
    on(document, 'visibilitychange', onVisibilityChange);

    // 站内跳转回首页时不一定会重建推荐区，补一次立即重算
    on(window, 'popstate', onRouteChange);
    on(window, 'pageshow', onRouteChange);
  }

  /* ---------- 功能三：提取当前视频音频 ---------- */

  /*
   * B 站视频页内嵌 window.__playinfo__，其中 dash.audio 是与画面分开的完整音轨
   * （AAC / fMP4，一个 URL 就是整段音频）。直接下载这条音轨即可：秒级完成、
   * 无损、不需要播放，也不用 MediaRecorder 实时录音。
   *
   * 浏览器没有 MP3 编码器：MediaRecorder 只给 opus / AAC，WebCodecs 也没有
   * mp3 AudioEncoder。硬把 AAC 改名成 .mp3 只会产出坏文件，所以这里如实导出
   * 为 .m4a；需要 mp3 必须用 ffmpeg 之类的工具转码（见站点 README）。
   */

  const PLAYINFO_PATTERN = /window\s*\.\s*__playinfo__\s*=\s*/;
  const INITIAL_STATE_PATTERN = /window\s*\.\s*__INITIAL_STATE__\s*=\s*/;

  /** 从 startIndex 起截出一个完整 JSON 对象，避免内联 script 后面还有别的语句 */
  function extractJsonObject(text, startIndex) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) return text.slice(startIndex, index + 1);
      }
    }

    return null;
  }

  /**
   * 优先读页面全局；脚本跑在隔离世界时回退到解析内联 script。
   * cache 由单次提取创建、随函数返回回收，避免把大对象挂在模块级长期持有。
   */
  function readPageObject(globalKey, assignPattern, cache) {
    if (cache?.has(globalKey)) return cache.get(globalKey);

    let value = null;
    const direct = window[globalKey];
    if (direct && typeof direct === 'object') {
      value = direct;
    } else {
      for (const script of document.querySelectorAll('script')) {
        const source = script.textContent || '';
        const match = assignPattern.exec(source);
        if (!match) continue;

        const json = extractJsonObject(source, match.index + match[0].length);
        if (!json) continue;

        try {
          value = JSON.parse(json);
        } catch (err) {
          warn(`解析 ${globalKey} 失败`, err);
        }
        if (value) break;
      }
    }

    if (cache) cache.set(globalKey, value);
    return value;
  }

  function getPlayInfo(cache) {
    return readPageObject('__playinfo__', PLAYINFO_PATTERN, cache);
  }

  function getCid(cache) {
    const initial = readPageObject('__INITIAL_STATE__', INITIAL_STATE_PATTERN, cache);
    return initial?.videoData?.cid || window.cid || null;
  }

  function sanitizeFileName(name) {
    return name
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.\s]+$/, '')
      .slice(0, 80)
      .trim();
  }

  /** 文件名与视频标题一致：优先页面内嵌状态，其次标题 DOM，最后清洗 document.title */
  function getVideoTitle(cache) {
    const initial = readPageObject('__INITIAL_STATE__', INITIAL_STATE_PATTERN, cache);
    const fromState = initial?.videoData?.title || initial?.mediaInfo?.title;
    if (fromState && fromState.trim()) return fromState.trim();

    const heading = document.querySelector(
      'h1.video-title, h1.title, .video-title, .media-title, #viewbox_report h1',
    );
    const fromDom = heading?.textContent?.trim();
    if (fromDom) return fromDom;

    return document.title
      .replace(/[_|–—-]\s*哔哩哔哩.*$/i, '')
      .replace(/[_|–—-]\s*bilibili.*$/i, '')
      .trim();
  }

  /** 只挑 AAC 音轨；杜比 / FLAC 编码不能塞进 m4a 容器 */
  function pickAudioTrack(dash) {
    const tracks = [
      ...(dash?.audio || []),
      ...(dash?.dolby?.audio || []),
    ];
    const aac = tracks.filter((item) => !item.codecs || item.codecs.includes('mp4a'));
    const candidates = aac.length ? aac : tracks;

    return candidates.reduce(
      (best, item) => ((item.bandwidth || 0) > (best?.bandwidth || 0) ? item : best),
      null,
    );
  }

  /** 页面只给 durl（旧格式）时，向官方 playurl 接口补一份 dash 信息 */
  async function requestDashAudio(cache) {
    const bvid = location.pathname.match(/\/video\/(BV\w+)/i)?.[1];
    const cid = getCid(cache);
    if (!bvid || !cid) return null;

    const api = 'https://api.bilibili.com/x/player/playurl'
      + `?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}`
      + '&qn=0&fnval=16&fnver=0&fourk=1';

    const token = createController();
    try {
      const response = await fetch(api, {
        credentials: 'include',
        signal: token.controller.signal,
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data?.data?.dash || null;
    } catch (err) {
      warn('playurl 查询失败', err);
      return null;
    } finally {
      releaseController(token);
    }
  }

  /**
   * 直链由官方 playurl 下发，这里只挡最坏情况：裸 IP / 内网 / 非 HTTPS。
   * 不做 CDN 域白名单：B 站 CDN 域随调度变化，硬白名单会误伤正常下载。
   */
  function isTrustedAudioUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
      if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
        return false;
      }
      return !host.endsWith('.local') && !host.endsWith('.internal');
    } catch (err) {
      return false;
    }
  }

  /** 依次尝试主直链与备用直链；每个请求独立配 AbortController 超时 */
  async function fetchAudioBlob(track) {
    const backups = track.backupUrl || track.backup_url || [];
    const urls = [track.baseUrl || track.base_url, ...backups]
      .filter((url) => typeof url === 'string' && isTrustedAudioUrl(url))
      .slice(0, 3);

    if (!urls.length) throw new Error('播放信息里没有可用的音频直链');

    let lastError = null;
    for (const url of urls) {
      const token = createController();

      try {
        const response = await fetch(url, { signal: token.controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (blob.size < 1024) throw new Error('返回的音频数据为空');
        return blob;
      } catch (err) {
        lastError = err;
        log('音频直链失败，尝试备用地址', err);
      } finally {
        releaseController(token);
      }
    }

    throw lastError || new Error('音频下载失败');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    runtime.objectUrls.add(url);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    link.remove();

    // 落盘是异步的，立刻 revoke 会让部分浏览器中断下载；3 秒足够，
    // 句柄登记后 destroy() 也能提前释放，不再让几十 MB Blob 挂 60 秒。
    later(() => {
      URL.revokeObjectURL(url);
      runtime.objectUrls.delete(url);
    }, CONFIG.revokeDelay);
  }

  function setAudioUi(isBusy, message) {
    const button = document.getElementById('s4tm-audio');
    const status = document.getElementById('s4tm-audio-status');

    if (button) {
      button.disabled = isBusy;
      button.textContent = isBusy ? '提取中…' : '提取音频';
    }
    if (status && message) status.textContent = message;
  }

  async function extractAudio() {
    if (state.extracting) return;
    state.extracting = true;
    setAudioUi(true, '正在读取页面播放信息…');

    // 一次提取内复用解析结果，函数返回后整块缓存随栈回收
    const pageCache = new Map();

    try {
      let dash = getPlayInfo(pageCache)?.data?.dash;
      if (!dash?.audio?.length) {
        setAudioUi(true, '页面未内嵌音轨，正在查询播放地址…');
        dash = await requestDashAudio(pageCache);
      }

      const track = pickAudioTrack(dash);
      if (!track) {
        setAudioUi(false, '没找到独立音轨：刷新页面或登录后重试');
        return;
      }

      setAudioUi(true, '正在下载完整音频轨…');
      const blob = await fetchAudioBlob(track);
      const filename = sanitizeFileName(getVideoTitle(pageCache)) || 'bilibili-audio';
      downloadBlob(blob, `${filename}.m4a`);

      log('音频已导出', blob.size);
      setAudioUi(false, `已保存 ${(blob.size / 1048576).toFixed(1)} MB · m4a / AAC 无损`);
    } catch (err) {
      warn('音频提取失败', err);
      setAudioUi(false, `提取失败：${err?.message || '网络异常，可刷新后重试'}`);
    } finally {
      pageCache.clear();
      state.extracting = false;
    }
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

      .s4tm-section-title--spaced {
        margin-top: 14px;
      }

      #s4tm-audio {
        display: block;
        width: 100%;
        padding: 8px 10px;
        border-radius: 9px;
        color: #e6f7fe;
        background: rgba(0, 174, 236, 0.2);
        font-size: 13px;
        transition: background 0.15s ease, transform 0.1s ease;
      }

      #s4tm-audio:hover {
        background: rgba(0, 174, 236, 0.32);
      }

      #s4tm-audio:disabled {
        cursor: wait;
        opacity: 0.7;
      }

      #s4tm-audio:active {
        transform: scale(0.98);
      }

      #s4tm-audio-status {
        margin-top: 7px;
        color: #aeb6c2;
        font-size: 11px;
        line-height: 1.45;
        overflow-wrap: anywhere;
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
    const height = state.panel.offsetHeight || 220;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - Math.min(height, window.innerHeight - 16) - 8);

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
    on(button, 'click', () => setPanelVisible(true));

    document.body.appendChild(button);
    return button;
  }

  function makeDraggable(element, handle) {
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let dragging = false;
    let width = 0;
    let height = 0;
    let pendingLeft = 0;
    let pendingTop = 0;

    const flushDrag = () => {
      element.style.left = `${pendingLeft}px`;
      element.style.top = `${pendingTop}px`;
    };

    on(handle, 'pointerdown', (event) => {
      if (event.target.closest('button')) return;

      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      initialLeft = element.offsetLeft;
      initialTop = element.offsetTop;
      // 尺寸只在按下时读一次，避免每次 pointermove 强制同步布局
      width = element.offsetWidth;
      height = element.offsetHeight;
      pendingLeft = initialLeft;
      pendingTop = initialTop;

      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    on(handle, 'pointermove', (event) => {
      if (!dragging) return;

      const maxLeft = Math.max(0, window.innerWidth - width);
      const maxTop = Math.max(0, window.innerHeight - height);

      pendingLeft = Math.min(maxLeft, Math.max(0, initialLeft + event.clientX - startX));
      pendingTop = Math.min(maxTop, Math.max(0, initialTop + event.clientY - startY));

      // 一帧只写一次 DOM，避免 60–120Hz 指针事件下的读写抖动
      if (state.dragFrame) return;
      state.dragFrame = requestAnimationFrame(() => {
        state.dragFrame = 0;
        flushDrag();
      });
    });

    const stopDragging = () => {
      if (!dragging) return;
      dragging = false;
      if (state.dragFrame) {
        cancelAnimationFrame(state.dragFrame);
        state.dragFrame = 0;
        flushDrag();
      }

      settings.left = element.offsetLeft;
      settings.top = element.offsetTop;
      saveSettings();
    };

    on(handle, 'pointerup', stopDragging);
    on(handle, 'pointercancel', stopDragging);
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

        <div class="s4tm-section-title s4tm-section-title--spaced">音频提取</div>

        <button class="s4tm-btn" id="s4tm-audio" type="button">提取音频</button>
        <div id="s4tm-audio-status">一键导出完整音轨 · m4a / AAC 无损</div>

        <div id="s4tm-footer">配置自动保存 · 仅作用于 B 站</div>
      </div>
    `;

    document.body.appendChild(panel);

    state.panel = panel;

    const rotateToggle = panel.querySelector('#s4tm-rotate');
    const gridToggle = panel.querySelector('#s4tm-grid');

    rotateToggle.checked = settings.rotateEnabled;
    gridToggle.checked = settings.homeGridEnabled;

    on(rotateToggle, 'change', (event) => {
      settings.rotateEnabled = event.target.checked;
      saveSettings();
    });

    on(gridToggle, 'change', (event) => {
      settings.homeGridEnabled = event.target.checked;
      saveSettings();

      if (settings.homeGridEnabled) {
        scheduleLayout(0);
      } else {
        resetHomeLayout();
      }
    });

    on(panel.querySelector('#s4tm-hide'), 'click', () => {
      setPanelVisible(false);
    });

    on(panel.querySelector('#s4tm-audio'), 'click', () => {
      extractAudio();
    });

    makeDraggable(panel, panel.querySelector('#s4tm-header'));

    placePanel();
    getShowButton();

    if (!settings.panelVisible) {
      setPanelVisible(false);
    }

    on(window, 'resize', placePanel);
  }

  /* ---------- 启动 ---------- */

  /**
   * 一次性回收全部资源。禁用脚本不会触发它（油猴不通知已注入实例），
   * 调试模式下可在控制台调用 __S4TM__.destroy() 主动还原；
   * 普通用户禁用脚本后刷新一次页面即可彻底还原。
   */
  function destroy() {
    if (runtime.disposed) return;
    runtime.disposed = true;

    for (const [target, type, handler, options] of runtime.listeners) {
      target.removeEventListener(type, handler, options);
    }
    runtime.listeners.length = 0;

    runtime.observer?.disconnect();
    runtime.observer = null;

    for (const id of runtime.timers) clearTimeout(id);
    runtime.timers.clear();
    for (const controller of runtime.controllers) controller.abort();
    runtime.controllers.clear();
    for (const url of runtime.objectUrls) URL.revokeObjectURL(url);
    runtime.objectUrls.clear();

    if (state.dragFrame) {
      cancelAnimationFrame(state.dragFrame);
      state.dragFrame = 0;
    }
    state.layoutTimer = 0;

    if (state.rotatedVideo?.isConnected) restoreVideoStyle(state.rotatedVideo);
    state.rotatedVideo = null;
    state.savedVideoStyle = null;
    resetHomeLayout();

    for (const id of ['s4tm-styles', 's4tm-panel', 's4tm-show-panel']) {
      document.getElementById(id)?.remove();
    }
    state.panel = null;

    if (CONFIG.debug && window.__S4TM__) delete window.__S4TM__;
    log('已卸载');
  }

  function init() {
    // 重复注入 / DOMContentLoaded 与立即执行撞车时只初始化一次
    if (!document.body || runtime.disposed || runtime.initialized) return;
    runtime.initialized = true;

    installStyles();
    createPanel();
    startLayoutWatcher();

    if (isHomePage()) scheduleLayout(0);

    log('已启动');
  }

  if (document.body) {
    init();
  } else {
    on(window, 'DOMContentLoaded', init, { once: true });
  }

  // 2.2 只允许一个调试接口，且默认不启用
  if (CONFIG.debug) {
    window.__S4TM__ = { destroy };
  }
})();
