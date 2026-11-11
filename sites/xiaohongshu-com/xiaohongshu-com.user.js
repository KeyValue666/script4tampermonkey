// ==UserScript==
// @name         S4TM · 小红书 · 笔记原图批量下载
// @namespace    https://github.com/KeyValue666/script4tampermonkey/sites/xiaohongshu-com
// @version      0.1.0
// @description  小红书笔记页一键打包下载全部图片，自动取 CDN 原始尺寸、去掉压缩与水印参数
// @author       KeyValue666
// @match        https://www.xiaohongshu.com/*
// @match        https://xiaohongshu.com/*
// @icon         https://www.xiaohongshu.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      xhscdn.com
// @connect      xiaohongshu.com
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/KeyValue666/script4tampermonkey/blob/main/sites/xiaohongshu-com/README.md
// @supportURL   https://github.com/KeyValue666/script4tampermonkey/issues
// @updateURL    https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/xiaohongshu-com/xiaohongshu-com.user.js
// @downloadURL  https://raw.githubusercontent.com/KeyValue666/script4tampermonkey/main/sites/xiaohongshu-com/xiaohongshu-com.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- 配置 ---------- */

  const SITE_KEY = 'xiaohongshu-com';
  const PREFIX = `[s4tm:${SITE_KEY}]`;
  const MOUNTED_ATTR = 'data-s4tm-mounted';
  const PANEL_ID = 's4tm-xhs-panel';

  const CONFIG = {
    /** 本地调试时改 true；提交前必须恢复为 false */
    debug: false,
    /** 等待目标元素出现的超时（毫秒） */
    waitTimeout: 10000,
    /** 单张原图可能好几 MB，超时放宽 */
    fetchTimeout: 25000,
    /** 同时下载的图片数，别把 CDN 打爆 */
    concurrency: 3,
    /** 无声明尺寸时，认为达到高清的最低宽度 */
    minWidth: 1080,
    /** 无声明尺寸时，认为不是占位图的最低体积 */
    minBytes: 30 * 1024,
    /** DOM 变动后的刷新防抖 */
    refreshDebounce: 160,
    /** 逐张保存的间隔，避免浏览器把多次下载合并拦截 */
    saveInterval: 320,
  };

  const DEFAULTS = {
    /** 逐个尝试干净 CDN 源，取分辨率最高的那个 */
    probeQuality: true,
  };

  const NOTE_ROOT_SELECTOR = [
    '.note-detail-mask',
    '#noteContainer',
    '.note-container',
    '[class*="note-detail"]',
    '.note-slider',
    '.note-detail-slider',
  ].join(', ');

  /* ---------- 工具 ---------- */

  const log = (...args) => {
    if (CONFIG.debug) console.log(PREFIX, ...args);
  };
  const warn = (...args) => console.warn(PREFIX, ...args);

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
   * 站点是 Vue SSR，状态里的数组 / 对象可能被 ref 包了几层。
   * @param {*} value
   * @returns {*}
   */
  function unwrap(value) {
    let current = value;
    for (let i = 0; i < 4; i += 1) {
      if (!current || typeof current !== 'object') break;
      if ('_rawValue' in current) current = current._rawValue;
      else if ('value' in current && !Array.isArray(current) && !('imageList' in current)) {
        current = current.value;
      } else break;
    }
    return current;
  }

  /**
   * 限流并发执行，单个任务失败不影响其余任务。
   * @template T
   * @param {T[]} items
   * @param {number} limit
   * @param {(item: T, index: number) => Promise<*>} worker
   * @returns {Promise<*>}
   */
  async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        try {
          results[index] = await worker(items[index], index);
        } catch (err) {
          warn('单项处理失败', index, err);
          results[index] = null;
        }
      }
    });
    await Promise.all(runners);
    return results;
  }

  /** @param {string} text @returns {string} */
  function sanitize(text) {
    return String(text)
      .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || '小红书笔记';
  }

  /* ---------- 业务一：读取当前笔记的图片清单 ---------- */

  /**
   * 有 @grant 时脚本在沙箱里，页面自定义全局变量只挂在 unsafeWindow 上。
   * @returns {Window}
   */
  function getPageWindow() {
    return typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window;
  }

  /** @returns {object|null} */
  function readInitialState() {
    const candidates = [getPageWindow().__INITIAL_STATE__, window.__INITIAL_STATE__];
    for (const raw of candidates) {
      if (!raw) continue;
      if (typeof raw === 'string') {
        // 少数 SSR 模板会把状态序列化成带 undefined 字面量的字符串。
        try {
          return JSON.parse(raw.replace(/\bundefined\b/g, 'null'));
        } catch (err) {
          log('SSR 状态解析失败', err);
          continue;
        }
      }
      return raw;
    }
    return null;
  }

  /** @returns {string} */
  function getNoteIdFromUrl() {
    const pathHit = location.pathname.match(
      /\/(?:explore|discovery\/item|search_result)\/([0-9a-z]{24})(?:\/|$)/i,
    );
    if (pathHit) return pathHit[1];
    const queryHit = location.search.match(/[?&](?:note_?id|id)=([0-9a-z]{24})/i);
    return queryHit ? queryHit[1] : '';
  }

  /**
   * CDN 直链才可能是原图，头像 / 表情 / 视频域名一律排除。
   * @param {string} raw
   * @returns {boolean}
   */
  function isValidCdnUrl(raw) {
    try {
      const url = new URL(String(raw).replace(/^http:/i, 'https:'));
      const host = url.hostname;
      const allowed = host === 'xhscdn.com' || host.endsWith('.xhscdn.com')
        || host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com');
      return url.protocol === 'https:' && allowed
        && !/(avatar|emoji|logo|video)/i.test(url.pathname);
    } catch (err) {
      return false;
    }
  }

  /**
   * 剥掉 CDN 的缩放、格式转换与水印参数：?imageView2…、!nd_dft_wlteh_webp_3 等。
   * @param {string} raw
   * @returns {string}
   */
  function stripTransform(raw) {
    return String(raw)
      .replace(/^http:/i, 'https:')
      .split('#')[0]
      .split('?')[0]
      .split('!')[0];
  }

  /**
   * 只认形如 1040g2sg… 的纯资源 token；带日期目录的新版 URL 不能拼 ci 域名。
   * @param {object} entry
   * @param {string} cleanUrl
   * @returns {string}
   */
  function extractToken(entry, cleanUrl) {
    const direct = [entry.fileId, entry.traceId, entry.file_id, entry.trace_id]
      .find((value) => typeof value === 'string' && /^[0-9a-z_-]{16,}$/i.test(value));
    if (direct) return direct;
    try {
      const path = new URL(cleanUrl).pathname.replace(/^\/+|\/+$/g, '');
      const last = path.split('/').pop().replace(/\.[a-z0-9]{2,5}$/i, '');
      return /^[0-9a-z_-]{16,}$/i.test(last) ? last : '';
    } catch (err) {
      return '';
    }
  }

  /**
   * 生成候选源：同域去参数原图优先，其次官方原图域名，最后才是带处理参数的兜底链。
   * 兜底链标记为 clean: false，结果里会明确提示它不是原图；kind 用于跨图复用最优源。
   * @param {string} raw
   * @param {string} token
   * @returns {{ url: string, clean: boolean, kind: string }[]}
   */
  function buildCandidates(raw, token) {
    const clean = stripTransform(raw);
    const list = [{ url: clean, clean: true, kind: 'origin' }];
    if (token) {
      list.push({ url: `https://ci.xiaohongshu.com/${token}`, clean: true, kind: 'ci' });
      list.push({ url: `https://sns-img-bd.xhscdn.com/${token}`, clean: true, kind: 'bd' });
      list.push({ url: `https://sns-img-hw.xhscdn.com/${token}`, clean: true, kind: 'hw' });
    }
    if (raw !== clean) {
      list.push({
        url: String(raw).replace(/^http:/i, 'https:'),
        clean: false,
        kind: 'raw',
      });
    }
    const seen = new Set();
    return list.filter((item) => {
      if (seen.has(item.url) || !isValidCdnUrl(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }

  /**
   * 把首图验证出的最优源排到前面，后续图片就不用每个源都试一遍。
   * @param {object} image
   * @param {string} kind
   * @returns {object[]}
   */
  function prioritize(image, kind) {
    if (!kind) return image.candidates;
    const preferred = image.candidates.filter((item) => item.kind === kind);
    if (preferred.length === 0) return image.candidates;
    return [...preferred, ...image.candidates.filter((item) => item.kind !== kind)];
  }

  /** @param {object} entry @returns {string} */
  function sceneRank(entry) {
    if (entry?.imageScene === 'WB_DFT') return 2;
    if (entry?.imageScene === 'WB_PRV') return 1;
    return 0;
  }

  /**
   * 不同版本字段形状不一样，按可靠性依次回退。
   * @param {object} entry
   * @returns {string}
   */
  function pickImageUrl(entry) {
    const info = entry.infoList;
    let fromInfo = '';
    if (Array.isArray(info)) {
      const ordered = [...info].sort((a, b) => sceneRank(b) - sceneRank(a));
      fromInfo = ordered.find((item) => typeof item?.url === 'string')?.url ?? '';
    } else if (info && typeof info === 'object') {
      fromInfo = info.WB_DFT?.url || info.WB_PRV?.url || '';
    }
    for (const value of [entry.urlDefault, entry.url, entry.urlPre, fromInfo]) {
      if (typeof value === 'string' && isValidCdnUrl(value)) return value;
    }
    return '';
  }

  /** @param {object[]} images @returns {object[]} */
  function dedupeImages(images) {
    const seen = new Set();
    return images.filter((image) => {
      const key = stripTransform(image.url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** @param {string} url @returns {object} */
  function makeImage(url) {
    const clean = stripTransform(url);
    return {
      url,
      width: 0,
      height: 0,
      candidates: buildCandidates(url, extractToken({}, clean)),
    };
  }

  /**
   * 优先读 SSR 状态里的 imageList：顺序与作者发布顺序一致，且不受懒加载影响。
   * @returns {object|null}
   */
  function findCurrentNote() {
    const state = readInitialState();
    if (!state) return null;
    const noteId = getNoteIdFromUrl();
    const noteState = unwrap(state.note) || {};
    const map = unwrap(noteState.noteDetailMap);
    let note = null;

    if (map && typeof map === 'object') {
      const ids = Object.keys(map);
      const preferred = [];
      if (noteId && map[noteId]) preferred.push(noteId);
      const current = unwrap(noteState.currentNoteId);
      if (typeof current === 'string' && map[current] && !preferred.includes(current)) {
        preferred.push(current);
      }
      preferred.push(...ids.filter((id) => !preferred.includes(id)).reverse());

      for (const id of preferred) {
        const holder = unwrap(map[id]);
        const candidate = unwrap(holder?.note || holder?.noteInfo || holder);
        if (candidate && Array.isArray(unwrap(candidate.imageList))) {
          note = candidate;
          break;
        }
      }
    }

    if (!note) {
      const legacy = unwrap(state.noteData?.data?.noteData);
      const candidate = unwrap(legacy?.note || legacy);
      if (candidate && Array.isArray(unwrap(candidate.imageList))) note = candidate;
    }
    if (!note) return null;

    const list = unwrap(note.imageList) || [];
    const images = [];
    for (const raw of list) {
      const entry = unwrap(raw);
      if (!entry) continue;
      const url = pickImageUrl(entry);
      if (!url) continue;
      const clean = stripTransform(url);
      images.push({
        url,
        width: Number(entry.width) || 0,
        height: Number(entry.height) || 0,
        candidates: buildCandidates(url, extractToken(entry, clean)),
      });
    }

    const user = unwrap(note.user) || {};
    return {
      id: noteId || String(note.noteId || note.note_id || note.id || ''),
      title: String(note.title || note.displayTitle || '').trim(),
      author: String(user.nickname || user.nickName || '').trim(),
      images: dedupeImages(images),
      source: 'state',
    };
  }

  /**
   * 状态被站点改版拿掉时的降级路径：只在笔记容器内找 img，避免抓到信息流的其它笔记。
   * @returns {object|null}
   */
  function collectFromDom() {
    let root = document;
    for (const selector of NOTE_ROOT_SELECTOR.split(', ')) {
      const el = document.querySelector(selector);
      if (el && el.querySelectorAll('img').length > 0) {
        root = el;
        break;
      }
    }

    const urls = [...root.querySelectorAll('img')]
      .filter((img) => root !== document || (img.naturalWidth || img.width || 0) >= 200)
      .map((img) => img.currentSrc || img.getAttribute('src')
        || img.getAttribute('data-src') || '')
      .filter((url) => isValidCdnUrl(url));
    const og = document.querySelector('meta[property="og:image"]');
    if (og && isValidCdnUrl(og.content || '')) urls.push(og.content);
    if (urls.length === 0) return null;

    const titleEl = document.querySelector('#detail-title, .title, h1');
    return {
      id: getNoteIdFromUrl(),
      title: String(titleEl?.textContent || document.title || '').trim(),
      author: '',
      images: dedupeImages(urls.map(makeImage)).slice(0, 30),
      source: 'dom',
    };
  }

  /** @returns {object|null} */
  function resolveNote() {
    let note = null;
    try {
      note = findCurrentNote();
    } catch (err) {
      warn('解析页面状态失败，改用 DOM 降级', err);
    }
    if (note && note.images.length > 0) return note;
    try {
      return collectFromDom() || note;
    } catch (err) {
      warn('DOM 降级失败', err);
      return note;
    }
  }

  /* ---------- 业务二：拉取原图并校验清晰度 ---------- */

  /**
   * 跨域取图：优先 GM_xmlhttpRequest（不受 CORS 限制），管理器不支持时退回 fetch。
   * @param {string} url
   * @returns {Promise<Blob>}
   */
  async function fetchBlob(url) {
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          responseType: 'blob',
          timeout: CONFIG.fetchTimeout,
          headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
          onload: (res) => {
            if (res.status >= 200 && res.status < 300 && res.response) resolve(res.response);
            else reject(new Error(`HTTP ${res.status}`));
          },
          onerror: () => reject(new Error('网络错误')),
          ontimeout: () => reject(new Error('请求超时')),
        });
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.fetchTimeout);
    try {
      const res = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.blob();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 读真实像素尺寸，用来确认拿到的是原图而不是缩略图。
   * @param {Blob} blob
   * @returns {Promise<{ width: number, height: number }>}
   */
  async function probeSize(blob) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(blob);
        const size = { width: bitmap.width, height: bitmap.height };
        if (typeof bitmap.close === 'function') bitmap.close();
        return size;
      } catch (err) {
        log('位图解码失败，改用 Image', err);
      }
    }
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * 用文件魔数定扩展名，CDN 返回的 Content-Type 经常与真实格式不符。
   * @param {Uint8Array} bytes
   * @returns {string}
   */
  function detectExt(bytes) {
    const ascii = (from, to) => String.fromCharCode(...bytes.slice(from, to));
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
    if (ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 12))) return 'avif';
    if (ascii(0, 3) === 'GIF') return 'gif';
    return 'jpg';
  }

  /** 干净原图优先，其次比像素面积，最后比体积。 */
  function compareRecord(a, b) {
    if (a.clean !== b.clean) return a.clean ? 1 : -1;
    if (a.pixels !== b.pixels) return a.pixels - b.pixels;
    return a.bytes - b.bytes;
  }

  /**
   * 依次尝试候选源并比较真实分辨率 / 体积，取最优。
   * forceProbe 用于首图：把所有干净源都比一遍，找出质量最高的那个源类型。
   * @param {object} image
   * @param {boolean} probe 是否启用多源择优
   * @param {boolean} forceProbe 是否强制比完所有干净源
   * @param {object[]} candidates 已排序的候选源
   * @returns {Promise<object|null>}
   */
  async function resolveImage(image, probe, forceProbe, candidates) {
    let best = null;
    const target = image.width > 0 && image.height > 0 ? image.width * image.height : 0;

    for (const candidate of candidates) {
      // 已经有干净原图了就没必要再取带处理参数的版本。
      if (!candidate.clean && best) break;
      try {
        const blob = await fetchBlob(candidate.url);
        const buffer = new Uint8Array(await blob.arrayBuffer());
        if (buffer.length < 1024) continue;
        const size = await probeSize(blob);
        const pixels = size.width * size.height;
        const record = {
          buffer,
          ext: detectExt(buffer),
          size,
          pixels,
          bytes: buffer.length,
          clean: candidate.clean,
          kind: candidate.kind,
        };
        if (!best || compareRecord(record, best) > 0) best = record;
        if (!probe) break;
        const meetsTarget = target > 0 && pixels >= target * 0.9;
        const meetsHeuristic = target === 0
          && (size.width >= CONFIG.minWidth || buffer.length >= CONFIG.minBytes);
        if (!forceProbe && candidate.clean && (meetsTarget || meetsHeuristic)) break;
      } catch (err) {
        log('候选源不可用', candidate.url, err.message);
      }
    }
    return best;
  }

  /* ---------- 业务三：本地打包 ZIP（store 模式，零依赖） ---------- */

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let value = i;
      for (let k = 0; k < 8; k += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[i] = value >>> 0;
    }
    return table;
  })();

  /** @param {Uint8Array} bytes @returns {number} */
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** @param {Date} date @returns {{ time: number, day: number }} */
  function dosDateTime(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const day = ((date.getFullYear() - 1980) << 9)
      | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time: time & 0xffff, day: day & 0xffff };
  }

  /**
   * 手写 ZIP：图片本身已压缩，用 store 模式原样封装，避免引入外部库。
   * @param {{ name: string, data: Uint8Array }[]} entries
   * @returns {Blob}
   */
  function buildZip(entries) {
    const encoder = new TextEncoder();
    const now = dosDateTime(new Date());
    const parts = [];
    const central = [];
    let offset = 0;

    for (const entry of entries) {
      const name = encoder.encode(entry.name);
      const data = entry.data;
      const crc = crc32(data);

      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, now.time, true);
      lv.setUint16(12, now.day, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);
      parts.push(local, data);

      const cd = new Uint8Array(46 + name.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(12, now.time, true);
      cv.setUint16(14, now.day, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      cd.set(name, 46);
      central.push(cd);
      offset += local.length + data.length;
    }

    const centralSize = central.reduce((sum, item) => sum + item.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }

  /* ---------- 业务四：下载与界面 ---------- */

  const state = {
    busy: false,
    note: null,
    hasNoteRoot: false,
    refreshTimer: 0,
    ui: null,
  };

  /**
   * 触发一次浏览器下载。
   * @param {Blob} blob
   * @param {string} filename
   */
  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 落盘是异步的，立刻 revoke 会让部分浏览器写出空文件。
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function injectPanelStyle() {
    injectStyle(`s4tm-${SITE_KEY}-style`, `
      #s4tm-xhs-panel {
        position: fixed;
        right: 20px;
        bottom: 24px;
        z-index: 2147483000;
        color: #262626;
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
        text-align: left;
      }
      #s4tm-xhs-panel * { box-sizing: border-box; }
      .s4tm-xhs-fab {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
        padding: 9px 16px;
        border: 0;
        border-radius: 999px;
        background: #ff2442;
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(255, 36, 66, .3);
      }
      .s4tm-xhs-fab:hover { background: #e51e3b; }
      .s4tm-xhs-count {
        min-width: 18px;
        padding: 0 5px;
        border-radius: 9px;
        background: rgba(255, 255, 255, .25);
        text-align: center;
      }
      .s4tm-xhs-card {
        width: 268px;
        margin-bottom: 10px;
        padding: 14px;
        border: 1px solid #f0f0f0;
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 8px 32px rgba(0, 0, 0, .14);
      }
      .s4tm-xhs-card[hidden] { display: none; }
      .s4tm-xhs-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 14px;
        font-weight: 600;
      }
      .s4tm-xhs-close {
        border: 0;
        background: none;
        color: #999;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
      }
      .s4tm-xhs-title {
        margin-top: 8px;
        overflow: hidden;
        color: #595959;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .s4tm-xhs-meta { margin-top: 4px; color: #8c8c8c; font-size: 12px; }
      .s4tm-xhs-btn {
        display: block;
        width: 100%;
        margin-top: 10px;
        padding: 9px 12px;
        border: 1px solid #ff2442;
        border-radius: 8px;
        background: #ff2442;
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .s4tm-xhs-btn:hover:not(:disabled) { background: #e51e3b; }
      .s4tm-xhs-btn--ghost { background: #fff; color: #ff2442; }
      .s4tm-xhs-btn--ghost:hover:not(:disabled) { background: #fff2f4; }
      .s4tm-xhs-btn:disabled { opacity: .55; cursor: not-allowed; }
      .s4tm-xhs-option {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 12px;
        color: #595959;
        font-size: 12px;
        cursor: pointer;
      }
      .s4tm-xhs-check { margin: 0; accent-color: #ff2442; }
      .s4tm-xhs-progress {
        height: 4px;
        margin-top: 12px;
        overflow: hidden;
        border-radius: 2px;
        background: #f2f2f2;
      }
      .s4tm-xhs-progress-fill {
        display: block;
        width: 0;
        height: 100%;
        background: #ff2442;
        transition: width .2s ease;
      }
      .s4tm-xhs-status {
        margin-top: 8px;
        min-height: 18px;
        color: #8c8c8c;
        font-size: 12px;
        word-break: break-all;
      }
      .s4tm-xhs-status--warn { color: #d46b08; }
      .s4tm-xhs-status--ok { color: #389e0d; }
      @media (max-width: 480px) {
        #s4tm-xhs-panel { right: 12px; bottom: 12px; }
        .s4tm-xhs-card { width: 232px; }
      }
    `);
  }

  /** @param {string} text @param {'info'|'warn'|'ok'} [tone] */
  function setStatus(text, tone = 'info') {
    const el = state.ui?.status;
    if (!el) return;
    el.textContent = text;
    el.className = `s4tm-xhs-status s4tm-xhs-status--${tone}`;
  }

  /** @param {number} done @param {number} total */
  function setProgress(done, total) {
    const bar = state.ui?.progress;
    if (!bar) return;
    bar.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
  }

  /** @param {boolean} enabled */
  function setButtonsEnabled(enabled) {
    for (const btn of [state.ui?.zipBtn, state.ui?.eachBtn]) {
      if (btn) btn.disabled = !enabled;
    }
  }

  function renderMeta() {
    const note = state.note;
    const count = note?.images.length ?? 0;
    if (state.ui?.count) state.ui.count.textContent = String(count);
    if (state.ui?.title) {
      state.ui.title.textContent = note?.title || '尚未识别到笔记';
    }
    if (state.ui?.meta) {
      const from = note?.source === 'dom' ? '页面元素（降级）' : '页面数据';
      state.ui.meta.textContent = count > 0
        ? `共 ${count} 张 · 来源：${from}`
        : '打开一篇图文笔记后点击下载';
    }
  }

  function refresh() {
    state.note = resolveNote();
    renderMeta();
  }

  /** @param {'zip'|'each'} mode */
  async function downloadAll(mode) {
    if (state.busy) return;
    // 每次点击都重新读一次，弹窗切换笔记时不会下到上一篇。
    refresh();
    const note = state.note;
    if (!note || note.images.length === 0) {
      setStatus('没找到图片：可能是视频笔记，或笔记还没加载完，稍后再试。', 'warn');
      return;
    }

    state.busy = true;
    setButtonsEnabled(false);
    setProgress(0, note.images.length);
    setStatus('正在取原图…', 'info');

    try {
      const probe = store.get('probeQuality', DEFAULTS.probeQuality) !== false;
      const total = note.images.length;
      // 首图把所有干净源都比一遍，确定这篇笔记哪种源返回的原始质量最高。
      const first = await resolveImage(note.images[0], probe, probe, note.images[0].candidates);
      setProgress(1, total);
      // 只有干净原图的最优源才值得复用；带处理参数的兜底源不能变成后续首选。
      const preferredKind = first?.clean ? first.kind : '';
      const rest = await mapLimit(
        note.images.slice(1),
        CONFIG.concurrency,
        async (image, index) => {
          const record = await resolveImage(
            image,
            probe,
            false,
            prioritize(image, preferredKind),
          );
          setProgress(index + 2, total);
          return record;
        },
      );
      const valid = [first, ...rest].filter((record) => record && record.buffer);
      if (valid.length === 0) {
        setStatus('全部取图失败：检查网络、登录态，以及脚本管理器的跨域授权。', 'warn');
        return;
      }

      const base = sanitize(note.title || note.id || '小红书笔记');
      const entries = valid.map((record, index) => ({
        name: `${base}_${String(index + 1).padStart(2, '0')}.${record.ext}`,
        data: record.buffer,
      }));

      if (mode === 'zip') {
        saveBlob(buildZip(entries), `${base}_原图.zip`);
      } else {
        for (const entry of entries) {
          saveBlob(new Blob([entry.data], { type: 'application/octet-stream' }), entry.name);
          await delay(CONFIG.saveInterval);
        }
      }

      const failed = total - valid.length;
      const degraded = valid.filter((record) => !record.clean).length;
      const withSize = valid.filter((record) => record.pixels > 0);
      const minRecord = withSize.length > 0
        ? withSize.reduce((a, b) => (a.pixels <= b.pixels ? a : b))
        : null;
      const sizeText = minRecord
        ? `最小 ${minRecord.size.width}×${minRecord.size.height}`
        : '分辨率未能解析';
      const notes = [];
      if (failed > 0) notes.push(`${failed} 张失败`);
      if (degraded > 0) notes.push(`${degraded} 张只取到带处理参数的版本`);
      setStatus(
        `完成：${valid.length} 张已${mode === 'zip' ? '打包' : '逐张'}下载，${sizeText}`
        + `${notes.length ? `；${notes.join('，')}` : ''}。`,
        failed > 0 || degraded > 0 ? 'warn' : 'ok',
      );
    } catch (err) {
      warn('下载失败', err);
      setStatus(`下载失败：${err.message}`, 'warn');
    } finally {
      state.busy = false;
      setButtonsEnabled(true);
    }
  }

  /** 元素创建统一走 createElement，标题等站点文本一律 textContent，杜绝注入。 */
  function createButton(className, text) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = text;
    return btn;
  }

  function createPanel() {
    const host = document.createElement('div');
    host.id = PANEL_ID;
    host.dataset.s4tm = 'xhs-downloader';
    host.setAttribute(MOUNTED_ATTR, '1');

    const card = document.createElement('div');
    card.className = 's4tm-xhs-card';
    card.hidden = true;

    const head = document.createElement('div');
    head.className = 's4tm-xhs-head';
    const heading = document.createElement('span');
    heading.textContent = '笔记原图下载';
    const close = createButton('s4tm-xhs-close', '×');
    close.setAttribute('aria-label', '关闭');
    head.append(heading, close);

    const title = document.createElement('div');
    title.className = 's4tm-xhs-title';
    const meta = document.createElement('div');
    meta.className = 's4tm-xhs-meta';

    const zipBtn = createButton('s4tm-xhs-btn', '打包下载 ZIP');
    const eachBtn = createButton('s4tm-xhs-btn s4tm-xhs-btn--ghost', '逐张保存');

    const option = document.createElement('label');
    option.className = 's4tm-xhs-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 's4tm-xhs-check';
    checkbox.checked = store.get('probeQuality', DEFAULTS.probeQuality) !== false;
    const optionText = document.createElement('span');
    optionText.textContent = '多源择优，保证最高清';
    option.append(checkbox, optionText);

    const progress = document.createElement('div');
    progress.className = 's4tm-xhs-progress';
    const progressFill = document.createElement('i');
    progressFill.className = 's4tm-xhs-progress-fill';
    progress.appendChild(progressFill);

    const status = document.createElement('div');
    status.className = 's4tm-xhs-status';
    status.textContent = '只下载当前这篇笔记的图片，全部在本地处理。';

    card.append(head, title, meta, zipBtn, eachBtn, option, progress, status);

    const fab = createButton('s4tm-xhs-fab', '原图下载');
    const count = document.createElement('span');
    count.className = 's4tm-xhs-count';
    count.textContent = '0';
    fab.appendChild(count);

    host.append(card, fab);
    document.body.appendChild(host);

    state.ui = {
      host, card, fab, count, title, meta, zipBtn, eachBtn,
      checkbox, progress: progressFill, status,
    };

    fab.addEventListener('click', () => {
      card.hidden = !card.hidden;
      if (!card.hidden) refresh();
    });
    close.addEventListener('click', () => { card.hidden = true; });
    zipBtn.addEventListener('click', () => {
      downloadAll('zip').catch((err) => warn('下载异常', err));
    });
    eachBtn.addEventListener('click', () => {
      downloadAll('each').catch((err) => warn('下载异常', err));
    });
    checkbox.addEventListener('change', () => {
      store.set('probeQuality', checkbox.checked);
      setStatus(
        checkbox.checked ? '已开启多源择优。' : '已关闭多源择优，只取第一个可用源。',
        'info',
      );
    });
  }

  /** 笔记弹窗常在不改 URL 的情况下打开，用轻量观察 + 防抖刷新计数。 */
  function observeNoteRoot() {
    const observer = new MutationObserver((mutations) => {
      const changed = mutations.some((item) => item.addedNodes.length || item.removedNodes.length);
      if (!changed) return;
      const hasNote = !!document.querySelector(NOTE_ROOT_SELECTOR);
      if (hasNote === state.hasNoteRoot) return;
      state.hasNoteRoot = hasNote;
      clearTimeout(state.refreshTimer);
      state.refreshTimer = setTimeout(refresh, CONFIG.refreshDebounce);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ---------- 启动 ---------- */

  async function mount() {
    if (document.getElementById(PANEL_ID)) {
      refresh();
      return;
    }
    injectPanelStyle();
    createPanel();
    refresh();
    log('挂载完成');
  }

  function main() {
    const safeMount = () => {
      mount().catch((err) => warn('挂载失败', err));
    };

    try {
      safeMount();
      onUrlChange(() => {
        // 面板常驻，路由变化只刷新当前笔记数据，不重复注入。
        refresh();
      });
      observeNoteRoot();
    } catch (err) {
      warn('初始化失败', err);
    }
  }

  main();
})();
