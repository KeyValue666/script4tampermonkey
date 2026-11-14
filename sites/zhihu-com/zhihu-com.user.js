// ==UserScript==
// @name         S4TM · 知乎 · 净化与阅读增强
// @namespace    https://github.com/KeyValue666/script4tampermonkey/sites/zhihu-com
// @version      0.1.0
// @description  知乎问题页与文章页净化与阅读增强：去登录弹窗、去广告、宽屏、外链直跳、无水印原图、一键收起回答
// @author       KeyValue666
// @match        https://www.zhihu.com/*
// @icon         https://www.zhihu.com/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/KeyValue666/script4tampermonkey/blob/main/sites/zhihu-com/README.md
// @supportURL   https://github.com/KeyValue666/script4tampermonkey/issues
// @updateURL    https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/zhihu-com/zhihu-com.user.js
// @downloadURL  https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/zhihu-com/zhihu-com.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- 配置 ---------- */

  const SITE_KEY = 'zhihu-com';
  const PREFIX = `[s4tm:${SITE_KEY}]`;

  const CONFIG = {
    /** 本地调试时改 true；提交前必须恢复为 false */
    debug: false,
    /** 等待目标元素出现的超时（毫秒） */
    waitTimeout: 8000,
  };

  /** 功能开关默认值：键名即 store 中的短名，与面板勾选项一一对应 */
  const FEATURE_DEFAULTS = {
    removeLoginModal: true,
    removeAds: true,
    wideScreen: true,
    directLink: true,
    originalImage: true,
    expandDescription: true,
    topTimestamp: true,
    foldAnswers: false,
    blankClickCollapse: true,
    cleanCopy: true,
  };

  /** 各功能的显示名与说明，供面板渲染 */
  const FEATURE_META = {
    removeLoginModal: { name: '移除登录弹窗', desc: '游客访问时自动移除登录遮罩与弹窗' },
    removeAds: { name: '去除广告卡片', desc: '移除信息流中的广告与活动推广卡片' },
    wideScreen: { name: '宽屏模式', desc: '隐藏右侧边栏，主内容占满宽度' },
    directLink: { name: '外链直跳', desc: '站外链接直接打开，不经知乎跳转页' },
    originalImage: { name: '无水印原图', desc: '图片默认加载高清无水印原图' },
    expandDescription: { name: '展开问题描述', desc: '问题详情默认展开，不折叠' },
    topTimestamp: { name: '时间置顶显示', desc: '回答发布时间复制到顶部并显示完整时间' },
    foldAnswers: { name: '一键收起回答', desc: '右下角按钮收起/展开全部长回答' },
    blankClickCollapse: { name: '空白处收起', desc: '点击左右两侧空白收起当前回答' },
    cleanCopy: { name: '复制去版权', desc: '复制内容自动去掉著作权声明尾巴' },
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

  /* ---------- 状态与配置 ---------- */

  /** 已挂载标记：同一页面生命周期只注入一次面板 */
  const MOUNTED_ATTR = 'data-s4tm-mounted';

  /** 运行时功能开关（内存态，随面板开关即时生效，落地 store） */
  let settings = {};

  /** 读取全部功能开关，缺省项用默认值补齐 */
  function loadSettings() {
    const result = {};
    for (const key of Object.keys(FEATURE_DEFAULTS)) {
      result[key] = store.get(key, FEATURE_DEFAULTS[key]) === true;
    }
    return result;
  }

  /** 功能是否开启 */
  const isOn = (key) => settings[key] === true;

  /* ---------- 样式 ---------- */

  function injectBaseStyle() {
    injectStyle(
      `s4tm-${SITE_KEY}-style`,
      `
      /* 宽屏：隐藏问题页/文章页右侧边栏，主内容占满 */
      .s4tm-wide .Question-sideColumn,
      .s4tm-wide .Post-sideActions,
      .s4tm-wide .Question-mainColumn,
      .s4tm-wide .Post-Main {
        width: auto !important;
        max-width: none !important;
      }

      /* 时间置顶标签 */
      .s4tm-timestamp {
        display: block;
        margin: 4px 0 8px;
        font-size: 13px;
        line-height: 20px;
        color: #8590a6;
      }

      /* 悬浮齿轮按钮 */
      .s4tm-fab {
        position: fixed;
        right: 20px;
        bottom: 120px;
        z-index: 100000;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        background: #ffffff;
        color: #1f6feb;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        transition: transform 0.2s ease;
      }
      .s4tm-fab:hover {
        transform: rotate(45deg);
      }

      /* 设置面板 */
      .s4tm-panel {
        position: fixed;
        right: 20px;
        bottom: 176px;
        z-index: 100001;
        width: 300px;
        max-height: 70vh;
        overflow-y: auto;
        background: #ffffff;
        color: #1a1a1a;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);
        padding: 16px;
        font-size: 14px;
        line-height: 1.5;
      }
      .s4tm-panel--hidden {
        display: none;
      }
      .s4tm-panel__title {
        margin: 0 0 4px;
        font-size: 16px;
        font-weight: 600;
      }
      .s4tm-panel__subtitle {
        margin: 0 0 12px;
        font-size: 12px;
        color: #8590a6;
      }
      .s4tm-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 8px 0;
        border-top: 1px solid #f0f2f5;
      }
      .s4tm-row:first-of-type {
        border-top: none;
      }
      .s4tm-row input[type='checkbox'] {
        flex: 0 0 auto;
        margin-top: 2px;
        cursor: pointer;
      }
      .s4tm-row__text {
        flex: 1 1 auto;
      }
      .s4tm-row__name {
        display: block;
        font-weight: 500;
      }
      .s4tm-row__desc {
        display: block;
        font-size: 12px;
        color: #8590a6;
      }
    `,
    );
  }

  /* ---------- 业务 ---------- */

  /* ----- 1. 移除登录弹窗 ----- */

  /**
   * 持续移除登录弹窗：知乎在未登录时会动态插入登录遮罩，需要观察器兜底。
   * @returns {{ stop: () => void }}
   */
  function setupRemoveLoginModal() {
    // 常见登录弹窗选择器，按版本可能变化，命中即移除
    const LOGIN_SELECTORS = [
      '.Modal-wrapper',
      '.signFlowModal',
      '.Modal-closeButton',
      '[data-draft-type="login"]',
    ];

    const remove = () => {
      for (const selector of LOGIN_SELECTORS) {
        for (const el of document.querySelectorAll(selector)) {
          // 只移除确实属于登录流程的弹窗，避免误伤
          const text = el.textContent || '';
          if (/登录|注册|未登录|扫码登录|验证码/.test(text) || el.matches('.signFlowModal')) {
            el.remove();
          }
        }
      }
      // 移除登录遮罩背景
      for (const mask of document.querySelectorAll('.Modal-mask, .signFlowModal-mask')) {
        mask.remove();
      }
    };

    let timer = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        remove();
      }, 300);
    };

    const observer = new MutationObserver(() => {
      if (document.querySelector('.Modal-wrapper, .signFlowModal')) schedule();
    });

    remove();
    observer.observe(document.documentElement, { childList: true, subtree: true });

    return {
      stop() {
        observer.disconnect();
        if (timer) clearTimeout(timer);
      },
    };
  }

  /* ----- 2. 去除广告卡片 ----- */

  /**
   * 移除信息流中的广告与活动推广卡片。只作用明确选择器，不误伤正常内容。
   * @returns {{ stop: () => void }}
   */
  function setupRemoveAds() {
    // 知乎广告卡片常见的特征标记
    const AD_MARKERS = [
      '[data-za-detail-view-path-module*="Ad"]',
      '.AdvertCard',
      '.TopstoryItem--advertCard',
      '.Pc-feedAd-container',
      '.Card--advert',
    ];

    const remove = () => {
      for (const selector of AD_MARKERS) {
        for (const el of document.querySelectorAll(selector)) {
          el.remove();
        }
      }
    };

    let timer = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        remove();
      }, 500);
    };

    const observer = new MutationObserver(() => {
      if (document.querySelector(AD_MARKERS.join(','))) schedule();
    });

    remove();
    observer.observe(document.documentElement, { childList: true, subtree: true });

    return {
      stop() {
        observer.disconnect();
        if (timer) clearTimeout(timer);
      },
    };
  }

  /* ----- 3. 宽屏模式 ----- */

  /** 给 body 打标记，配合注入的 CSS 生效 */
  function applyWideScreen() {
    document.body.classList.add('s4tm-wide');
  }

  /* ----- 4. 外链直跳 ----- */

  /**
   * 知乎把站外链接改写为 /link?target=xxx 的跳转页，这里还原为真实直链。
   * @returns {{ stop: () => void }}
   */
  function setupDirectLink() {
    const rewrite = (root = document) => {
      for (const a of root.querySelectorAll('a[href*="/link?target="], a[href*="link.zhihu.com"]')) {
        let href = a.getAttribute('href');
        if (!href) continue;
        try {
          const url = new URL(href, location.href);
          const target = url.searchParams.get('target');
          if (target && /^https?:\/\//i.test(target)) {
            a.setAttribute('href', decodeURIComponent(target));
            a.removeAttribute('target');
          }
        } catch (err) {
          // 无法解析的链接跳过，保持原样
        }
      }
    };

    let timer = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        rewrite();
      }, 500);
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (!mutation.addedNodes.length) continue;
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && node.matches?.('a, a *')) {
            schedule();
            return;
          }
        }
      }
    });

    rewrite();
    observer.observe(document.documentElement, { childList: true, subtree: true });

    return {
      stop() {
        observer.disconnect();
        if (timer) clearTimeout(timer);
      },
    };
  }

  /* ----- 5. 无水印原图 ----- */

  /**
   * 知乎图片 URL 带压缩与水印参数，去掉后缀参数并改写为高清原图地址。
   * @returns {{ stop: () => void }}
   */
  function setupOriginalImage() {
    const rewrite = (root = document) => {
      for (const img of root.querySelectorAll('img')) {
        const src = img.getAttribute('src');
        if (!src || img.dataset.s4tmImg === '1') continue;
        // 只处理知乎图床地址
        if (!/picx?\.zhimg\.com|zhimg\.com/.test(src)) continue;
        // 去掉压缩/水印参数，改用原图端点
        try {
          const url = new URL(src, location.href);
          if (url.pathname.endsWith('_r.jpg') || url.pathname.endsWith('_r.jpeg')) {
            url.pathname = url.pathname.replace(/_r\.(jpe?g)$/i, '.$1');
          }
          // 清理可能的水印相关查询参数
          url.searchParams.delete('x-oss-process');
          url.searchParams.delete('refer');
          img.setAttribute('src', url.toString());
          img.dataset.s4tmImg = '1';
        } catch (err) {
          // 解析失败跳过
        }
      }
    };

    let timer = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        rewrite();
      }, 400);
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (!mutation.addedNodes.length) continue;
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && node.matches?.('img')) {
            schedule();
            return;
          }
        }
      }
    });

    rewrite();
    observer.observe(document.documentElement, { childList: true, subtree: true });

    return {
      stop() {
        observer.disconnect();
        if (timer) clearTimeout(timer);
      },
    };
  }

  /* ----- 6. 展开问题描述 ----- */

  /** 点击「展开」按钮展开问题描述（若处于折叠态） */
  function expandDescription() {
    for (const btn of document.querySelectorAll(
      '.QuestionRichText-more, .RichText-CollapseText, .QuestionHeader-detail .Button',
    )) {
      const text = btn.textContent || '';
      if (/展开|阅读全文|更多/.test(text)) {
        btn.click();
      }
    }
  }

  /* ----- 7. 时间置顶显示 ----- */

  /**
   * 把每个回答底部的发布时间复制一份到回答顶部，并显示完整时间（含时分）。
   * @returns {{ stop: () => void }}
   */
  function setupTopTimestamp() {
    const process = (root = document) => {
      for (const item of root.querySelectorAll('.AnswerItem')) {
        if (item.dataset.s4tmTime === '1') continue;
        // 知乎回答时间常见类名
        const timeEl = item.querySelector(
          '.ContentItem-time, .AnswerItem-time, [data-tooltip*="年"]',
        );
        if (!timeEl) continue;
        const full = timeEl.getAttribute('data-tooltip') || timeEl.textContent.trim();
        if (!full) continue;

        const tag = document.createElement('span');
        tag.className = 's4tm-timestamp';
        tag.dataset.s4tm = 'timestamp';
        tag.textContent = `发布于 ${full}`;

        // 插到回答正文最前面
        const body = item.querySelector('.RichContent, .AnswerItem-content');
        const anchor = body || item;
        anchor.prepend(tag);
        item.dataset.s4tmTime = '1';
      }
    };

    let timer = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        process();
      }, 400);
    };

    const observer = new MutationObserver(() => {
      if (document.querySelector('.AnswerItem:not([data-s4tm-time="1"])')) schedule();
    });

    process();
    observer.observe(document.documentElement, { childList: true, subtree: true });

    return {
      stop() {
        observer.disconnect();
        if (timer) clearTimeout(timer);
      },
    };
  }

  /* ----- 8. 一键收起 / 展开回答 ----- */

  /**
   * 收起或展开全部回答。知乎用按钮切换，脚本对每个回答的「收起/展开」按钮点击。
   * @param {boolean} collapse true 收起，false 展开
   */
  function toggleAnswers(collapse) {
    for (const item of document.querySelectorAll('.AnswerItem')) {
      const btn = item.querySelector('.Button--plain, .ContentItem-action');
      if (!btn) continue;
      const text = btn.textContent || '';
      const isCollapseBtn = /收起/.test(text);
      const isExpandBtn = /展开|阅读全文|显示全部/.test(text);
      if (collapse && isCollapseBtn) btn.click();
      if (!collapse && isExpandBtn) btn.click();
    }
  }

  /** 右下角「收起全部回答」按钮 */
  function setupFoldButton() {
    if (document.querySelector('[data-s4tm="fold-answers"]')) return;
    const btn = document.createElement('button');
    btn.dataset.s4tm = 'fold-answers';
    btn.className = 's4tm-fab';
    btn.style.bottom = '60px';
    btn.title = '收起 / 展开全部回答';
    btn.textContent = '≣';

    let collapsed = false;
    btn.addEventListener('click', () => {
      collapsed = !collapsed;
      toggleAnswers(collapsed);
      btn.textContent = collapsed ? '☰' : '≣';
    });

    document.body.appendChild(btn);
  }

  /* ----- 9. 点击空白处收起 ----- */

  /**
   * 点击页面左右两侧空白区域时，收起当前回答/评论。
   * @returns {{ stop: () => void }}
   */
  function setupBlankClickCollapse() {
    const onClick = (event) => {
      // 只处理点击落在页面左右两侧窄空白带的场景
      const x = event.clientX;
      const width = window.innerWidth;
      const margin = Math.max(40, width * 0.08);
      if (x > margin && x < width - margin) return;
      // 忽略点击在可交互元素上的情况
      if (event.target.closest('a, button, input, textarea, .s4tm-fab, .s4tm-panel')) return;
      // 点击空白收起当前回答：找到最近的回答项里的收起按钮
      const item = event.target.closest('.AnswerItem, .CommentItem');
      if (!item) return;
      const btn = item.querySelector('.Button--plain, .ContentItem-action');
      if (!btn) return;
      const text = btn.textContent || '';
      if (/收起/.test(text)) btn.click();
    };

    document.addEventListener('click', onClick);
    return {
      stop() {
        document.removeEventListener('click', onClick);
      },
    };
  }

  /* ----- 10. 复制去版权尾巴 ----- */

  /**
   * 监听复制事件，去掉知乎自动附加的版权声明段落。
   * @returns {{ stop: () => void }}
   */
  function setupCleanCopy() {
    const onCopy = (event) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const text = selection.toString();
      if (!text) return;
      // 版权尾巴以固定文案开头
      const idx = text.indexOf('著作权归作者所有');
      const cleaned = idx > 0 ? text.slice(0, idx).replace(/\s+$/, '') : text;
      if (cleaned === text) return;

      event.preventDefault();
      event.clipboardData.setData('text/plain', cleaned);
    };

    document.addEventListener('copy', onCopy);
    return {
      stop() {
        document.removeEventListener('copy', onCopy);
      },
    };
  }

  /* ----- 设置面板 ----- */

  /** 渲染设置面板：每个功能一个勾选项，即时生效并持久化 */
  function setupPanel() {
    if (document.querySelector('[data-s4tm="panel"]')) return;

    const fab = document.createElement('button');
    fab.dataset.s4tm = 'panel-fab';
    fab.className = 's4tm-fab';
    fab.title = '知乎脚本设置';
    fab.textContent = '⚙';

    const panel = document.createElement('div');
    panel.dataset.s4tm = 'panel';
    panel.className = 's4tm-panel s4tm-panel--hidden';

    const title = document.createElement('p');
    title.className = 's4tm-panel__title';
    title.textContent = '知乎净化与阅读增强';
    const subtitle = document.createElement('p');
    subtitle.className = 's4tm-panel__subtitle';
    subtitle.textContent = '勾选即生效，自动保存';

    panel.appendChild(title);
    panel.appendChild(subtitle);

    for (const [key, meta] of Object.entries(FEATURE_META)) {
      const row = document.createElement('label');
      row.className = 's4tm-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isOn(key);
      checkbox.dataset.s4tm = `toggle-${key}`;

      const textBox = document.createElement('span');
      textBox.className = 's4tm-row__text';
      const name = document.createElement('span');
      name.className = 's4tm-row__name';
      name.textContent = meta.name;
      const desc = document.createElement('span');
      desc.className = 's4tm-row__desc';
      desc.textContent = meta.desc;
      textBox.appendChild(name);
      textBox.appendChild(desc);

      checkbox.addEventListener('change', () => {
        settings[key] = checkbox.checked;
        store.set(key, checkbox.checked);
        applyFeature(key, checkbox.checked);
      });

      row.appendChild(checkbox);
      row.appendChild(textBox);
      panel.appendChild(row);
    }

    fab.addEventListener('click', () => {
      panel.classList.toggle('s4tm-panel--hidden');
    });

    document.body.appendChild(fab);
    document.body.appendChild(panel);
  }

  /** 各功能清理函数的句柄，供开关切换时启停 */
  const cleaners = {};

  /** 按开关值启用或停用某个功能（面板勾选时调用） */
  function applyFeature(key, enabled) {
    switch (key) {
      case 'removeLoginModal':
        if (enabled) cleaners[key] = setupRemoveLoginModal();
        else cleaners[key]?.stop();
        break;
      case 'removeAds':
        if (enabled) cleaners[key] = setupRemoveAds();
        else cleaners[key]?.stop();
        break;
      case 'wideScreen':
        if (enabled) applyWideScreen();
        else document.body.classList.remove('s4tm-wide');
        break;
      case 'directLink':
        if (enabled) cleaners[key] = setupDirectLink();
        else cleaners[key]?.stop();
        break;
      case 'originalImage':
        if (enabled) cleaners[key] = setupOriginalImage();
        else cleaners[key]?.stop();
        break;
      case 'expandDescription':
        if (enabled) expandDescription();
        break;
      case 'topTimestamp':
        if (enabled) cleaners[key] = setupTopTimestamp();
        else cleaners[key]?.stop();
        break;
      case 'foldAnswers':
        if (enabled) setupFoldButton();
        else document.querySelector('[data-s4tm="fold-answers"]')?.remove();
        break;
      case 'blankClickCollapse':
        if (enabled) cleaners[key] = setupBlankClickCollapse();
        else cleaners[key]?.stop();
        break;
      case 'cleanCopy':
        if (enabled) cleaners[key] = setupCleanCopy();
        else cleaners[key]?.stop();
        break;
      default:
        break;
    }
  }

  /** 按当前 settings 启动所有已开启的功能 */
  function applyAllFeatures() {
    for (const key of Object.keys(FEATURE_DEFAULTS)) {
      if (isOn(key)) applyFeature(key, true);
    }
  }

  /** 路由切换后，对新页面重新执行一次性功能（展开描述等） */
  function refreshOnRouteChange() {
    if (isOn('expandDescription')) expandDescription();
  }

  /* ---------- 启动 ---------- */

  async function mount() {
    if (document.querySelector(`[${MOUNTED_ATTR}]`)) {
      log('已挂载，跳过本次');
      return;
    }

    settings = loadSettings();
    injectBaseStyle();
    document.documentElement.setAttribute(MOUNTED_ATTR, '1');

    // 面板始终挂载（用户需要入口开关功能）
    setupPanel();
    applyAllFeatures();

    log('挂载完成', settings);
  }

  function main() {
    const safeMount = () => {
      mount().catch((err) => warn('挂载失败', err));
    };

    try {
      safeMount();
      onUrlChange(() => {
        safeMount();
        refreshOnRouteChange();
      });
    } catch (err) {
      warn('初始化失败', err);
    }
  }

  main();
})();
