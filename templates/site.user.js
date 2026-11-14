// ==UserScript==
// @name         S4TM · 站点中文名 · 功能名
// @namespace    https://github.com/KeyValue666/script4tampermonkey/sites/<site-key>
// @version      0.1.0
// @description  面向用户的一句话说明（≤ 80 字）：在哪个页面、做什么、有什么收益
// @author       KeyValue666
// @match        https://example.com/*
// @icon         https://example.com/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/KeyValue666/script4tampermonkey/blob/main/sites/<site-key>/README.md
// @supportURL   https://github.com/KeyValue666/script4tampermonkey/issues
// @updateURL    https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/<site-key>/<site-key>.user.js
// @downloadURL  https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/<site-key>/<site-key>.user.js
// ==/UserScript==

/*
 * 模板用法（详见 docs/CONVENTIONS.md 与 docs/NEW_SITE.md）：
 *   1. 复制本文件为 sites/<site-key>/<site-key>.user.js；
 *   2. 全文替换 <site-key> 与示例站点信息（仓库地址已按 KeyValue666/script4tampermonkey 填好）；
 *   3. 只保留实际需要的 @match / @grant / @connect；
 *   4. 在「业务」分区实现功能，工具函数按需增删；
 *   5. 同步填写站点 README（模板 templates/site-README.md）。
 */
(function () {
  'use strict';

  /* ---------- 配置 ---------- */

  const SITE_KEY = '<site-key>';
  const PREFIX = `[s4tm:${SITE_KEY}]`;

  const CONFIG = {
    /** 本地调试时改 true；提交前必须恢复为 false */
    debug: false,
    /** 等待目标元素出现的超时（毫秒） */
    waitTimeout: 10000,
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
   * 配置读写：优先 GM_*，没有对应 @grant 时退回 localStorage。
   * 键名自动加 `s4tm:<site-key>:` 前缀，调用处只传短名。
   */
  const store = {
    key: (name) => `s4tm:${SITE_KEY}:${name}`,
    get(name, fallback = null) {
      const fullKey = store.key(name);
      try {
        if (typeof GM_getValue === 'function') return GM_getValue(fullKey, fallback);
        const raw = localStorage.getItem(fullKey);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        warn('读取配置失败', name, err);
        return fallback;
      }
    },
    set(name, value) {
      const fullKey = store.key(name);
      try {
        if (typeof GM_setValue === 'function') {
          GM_setValue(fullKey, value);
          return;
        }
        localStorage.setItem(fullKey, JSON.stringify(value));
      } catch (err) {
        warn('写入配置失败', name, err);
      }
    },
  };

  /**
   * 让一个浮层元素可拖拽（规范 2.6.1：面板 / 工具按钮必须支持拖拽）。
   * 用 pointer 事件 + setPointerCapture 覆盖鼠标与触摸；直接更新 right/bottom 内联值，
   * 与元素「贴边定位」的锚定语义一致，拖拽后仍受视口钳制、不会拖出屏幕。
   * @param {Element} el 要拖动的元素（用 right/bottom 定位的 fixed 元素）
   * @param {{ handle?: Element, resetKey?: string, resetOn?: 'dblclick'|'none' }} [options]
   *   - handle：拖拽把手；缺省时整个元素都可拖
   *   - resetKey：store 里保存位置的键名，空则不持久化
   *   - resetOn：双击复位；缺省 'dblclick'（把手或元素上双击即复位）
   */
  function makeDraggable(el, { handle, resetKey = 'position', resetOn = 'dblclick' } = {}) {
    const dragTarget = handle || el;
    const PAD = 8;
    let startX = 0;
    let startY = 0;
    let startRight = 0;
    let startBottom = 0;
    let dragging = false;
    let moved = false;

    function readDefaults() {
      const cs = window.getComputedStyle(el);
      const right = parseFloat(cs.right);
      const bottom = parseFloat(cs.bottom);
      return {
        right: Number.isFinite(right) ? right : 20,
        bottom: Number.isFinite(bottom) ? bottom : 24,
      };
    }

    function clamp(right, bottom) {
      const rect = el.getBoundingClientRect();
      const maxRight = Math.max(PAD, window.innerWidth - rect.width - PAD);
      const maxBottom = Math.max(PAD, window.innerHeight - rect.height - PAD);
      return {
        right: Math.min(Math.max(right, PAD), maxRight),
        bottom: Math.min(Math.max(bottom, PAD), maxBottom),
      };
    }

    function apply(right, bottom) {
      const pos = clamp(right, bottom);
      el.style.right = `${pos.right}px`;
      el.style.bottom = `${pos.bottom}px`;
    }

    const defaults = readDefaults();
    const saved = resetKey ? store.get(resetKey, null) : null;
    if (saved && typeof saved.right === 'number' && typeof saved.bottom === 'number') {
      apply(saved.right, saved.bottom);
    }

    function reset() {
      apply(defaults.right, defaults.bottom);
      if (resetKey) store.set(resetKey, { right: defaults.right, bottom: defaults.bottom });
    }

    function onPointerDown(event) {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      const cs = window.getComputedStyle(el);
      startRight = parseFloat(cs.right) || defaults.right;
      startBottom = parseFloat(cs.bottom) || defaults.bottom;
      dragTarget.setPointerCapture?.(event.pointerId);
      el.style.userSelect = 'none';
      el.style.touchAction = 'none';
    }

    function onPointerMove(event) {
      if (!dragging) return;
      moved = true;
      // 向右拖 dx>0 → right 减小；向上拖 dy<0 → bottom 增大。
      apply(startRight - (event.clientX - startX), startBottom - (event.clientY - startY));
    }

    function onPointerUp(event) {
      if (!dragging) return;
      dragging = false;
      dragTarget.releasePointerCapture?.(event.pointerId);
      el.style.userSelect = '';
      el.style.touchAction = '';
      if (moved && resetKey) {
        const cs = window.getComputedStyle(el);
        store.set(resetKey, {
          right: Math.round(parseFloat(cs.right)),
          bottom: Math.round(parseFloat(cs.bottom)),
        });
      }
    }

    dragTarget.addEventListener('pointerdown', onPointerDown);
    dragTarget.addEventListener('pointermove', onPointerMove);
    dragTarget.addEventListener('pointerup', onPointerUp);
    dragTarget.addEventListener('pointercancel', onPointerUp);

    if (resetOn === 'dblclick') {
      dragTarget.addEventListener('dblclick', reset);
    }

    // 供调用方在 click 处理里区分「拖了一下」和「点了一下」。
    return () => moved;
  }

  /* ---------- 业务 ---------- */

  /** 已挂载标记：同一次页面生命周期内只注入一次，防止 SPA 重复挂载 */
  const MOUNTED_ATTR = 'data-s4tm-mounted';

  async function mount() {
    if (document.querySelector(`[${MOUNTED_ATTR}]`)) {
      log('已挂载，跳过本次');
      return;
    }

    let anchor;
    try {
      anchor = await waitFor('#example-target');
    } catch (err) {
      warn('未找到目标元素，本次跳过', err.message);
      return;
    }
    anchor.setAttribute(MOUNTED_ATTR, '1');

    // 以下是可运行的占位实现，请替换为真实功能。约定：
    // - 注入节点带 data-s4tm="<feature>" 标记，便于清理与自测定位；
    // - 样式走 injectStyle，类名加 s4tm- 前缀；
    // - 偏好用 store.get / store.set，不需要自己拼站点前缀。
    injectStyle(
      `s4tm-${SITE_KEY}-style`,
      `
      .s4tm-badge {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 9999;
        padding: 4px 10px;
        border-radius: 999px;
        background: #1f6feb;
        color: #fff;
        font-size: 12px;
        line-height: 20px;
        cursor: default;
        user-select: none;
      }
    `,
    );

    const badge = document.createElement('div');
    badge.className = 's4tm-badge';
    badge.dataset.s4tm = 'demo';
    badge.textContent = 'S4TM 模板';
    document.body.appendChild(badge);

    log('挂载完成');
  }

  /* ---------- 启动 ---------- */

  function main() {
    const safeMount = () => {
      mount().catch((err) => warn('挂载失败', err));
    };

    try {
      safeMount();
      onUrlChange(safeMount);
    } catch (err) {
      warn('初始化失败', err);
    }
  }

  main();
})();
