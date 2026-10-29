#!/usr/bin/env node
/**
 * sites/ 规范检查器：核对站点目录是否符合 docs/CONVENTIONS.md。
 *
 * 用法：
 *   node tools/check.mjs             # 检查全部站点
 *   node tools/check.mjs example-com # 只检查指定站点
 *
 * 退出码：0 = 通过（可能有警告），1 = 存在错误。
 * 只读脚本，不修改任何文件，也不依赖任何第三方包。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITES_DIR = join(ROOT, 'sites');
const ROOT_README = join(ROOT, 'README.md');

const REQUIRED_FIELDS = [
  'name',
  'namespace',
  'version',
  'description',
  'author',
  'match',
  'grant',
  'run-at',
  'noframes',
  'homepageURL',
  'supportURL',
];

/** 无值标记：只要求出现，不要求取值 */
const FLAG_FIELDS = new Set(['noframes']);

const REQUIRED_SECTIONS = [
  '## 功能',
  '## 使用说明',
  '## 触发条件与覆盖页面',
  '## 权限与隐私',
  '## 已知限制',
  '## 变更记录',
  '## 开发说明',
];

const SITE_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const RUN_AT_VALUES = new Set(['document-start', 'document-end', 'document-idle']);

const errors = [];
const warnings = [];

const fail = (site, message) => errors.push(`[${site}] ${message}`);
const warn = (site, message) => warnings.push(`[${site}] ${message}`);

/** 解析 `// ==UserScript==` 头部的 @字段，返回 { 字段名: [值...] } */
function parseMetadata(source) {
  const block = source.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
  if (!block) return null;
  const meta = {};
  for (const line of block[1].split(/\r?\n/)) {
    const item = line.match(/^\s*\/\/\s*@([\w-]+)(?:\s+(.*?))?\s*$/);
    if (!item) continue;
    const [, key, value = ''] = item;
    (meta[key] ??= []).push(value);
  }
  return meta;
}

function checkMetadata(site, scriptPath) {
  const source = readFileSync(scriptPath, 'utf8');
  const meta = parseMetadata(source);
  if (!meta) {
    fail(site, '缺少 // ==UserScript== ... // ==/UserScript== 元数据块');
    return null;
  }

  if (meta.version && meta.version.length > 1) {
    fail(site, `@version 重复声明（${meta.version.join(', ')}）`);
  }

  for (const field of REQUIRED_FIELDS) {
    const values = meta[field];
    if (!values) {
      fail(site, `缺少 @${field}`);
      continue;
    }
    if (!FLAG_FIELDS.has(field) && values.every((value) => value.trim() === '')) {
      fail(site, `@${field} 不能为空`);
    }
  }

  const version = meta.version?.[0] ?? '';
  if (version && !SEMVER_RE.test(version)) {
    fail(site, `@version 不是语义化版本：${version}`);
  }

  if (meta.name?.[0] && !meta.name[0].startsWith('S4TM')) {
    warn(site, `@name 未使用 "S4TM · " 前缀：${meta.name[0]}`);
  }

  for (const match of meta.match ?? []) {
    if (match.includes('<all_urls>') || match === '*://*/*') {
      fail(site, `@match 过于宽泛：${match}`);
    }
  }

  for (const connect of meta.connect ?? []) {
    if (connect.trim() === '*') {
      fail(site, '@connect 禁止使用通配 *');
    }
  }

  const runAt = meta['run-at']?.[0];
  if (runAt && !RUN_AT_VALUES.has(runAt)) {
    fail(site, `@run-at 取值非法：${runAt}`);
  }

  for (const field of ['updateURL', 'downloadURL']) {
    if (!meta[field]) warn(site, `缺少 @${field}，用户将无法自动更新`);
  }

  return { meta, source, version };
}

function checkReadme(site, readmePath, version) {
  const text = readFileSync(readmePath, 'utf8');

  if (!/^#\s+\S+/m.test(text)) {
    fail(site, 'README.md 缺少一级标题');
  }
  if (version && !text.includes(version)) {
    fail(site, `README.md 未出现当前版本 ${version}`);
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!text.includes(section)) {
      fail(site, `README.md 缺少章节「${section}」`);
    }
  }
}

function checkChangelog(site, changelogPath, version) {
  const text = readFileSync(changelogPath, 'utf8');
  const latest = text.match(/^##\s*\[([^\]]+)\]/m);
  if (!latest) {
    warn(site, 'CHANGELOG.md 没有版本小节（应形如 "## [0.1.0] - YYYY-MM-DD"）');
    return;
  }
  if (version && latest[1] !== version) {
    warn(site, `CHANGELOG.md 最新版本 ${latest[1]} 与 @version ${version} 不一致`);
  }
}

/** 根 README 的站点索引里必须有该站点，且版本一致 */
function checkIndex(site, version) {
  if (!existsSync(ROOT_README)) {
    fail(site, '根 README.md 不存在，无法核对站点索引');
    return;
  }
  const rows = readFileSync(ROOT_README, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes(`sites/${site}/`));

  if (rows.length === 0) {
    fail(site, '未在根 README.md 的站点索引中登记');
    return;
  }
  if (version && !rows.some((row) => row.includes(version))) {
    fail(site, `根 README.md 索引中的版本与 @version ${version} 不一致`);
  }
}

function checkSite(site) {
  const siteDir = join(SITES_DIR, site);
  const readmePath = join(siteDir, 'README.md');
  const scriptPath = join(siteDir, `${site}.user.js`);

  if (!SITE_KEY_RE.test(site)) {
    fail(site, '目录名不符合命名规则（小写字母、数字、单个连字符）');
  }
  if (!existsSync(readmePath)) {
    fail(site, '缺少 README.md');
  }
  if (!existsSync(scriptPath)) {
    const variants = readdirSync(siteDir).filter((name) => name.endsWith('.user.js'));
    if (variants.length === 0) {
      fail(site, `缺少 ${site}.user.js`);
    } else {
      warn(site, `未找到 ${site}.user.js，仅发现多脚本变体：${variants.join(', ')}`);
    }
  }

  let version = null;
  if (existsSync(scriptPath)) {
    const result = checkMetadata(site, scriptPath);
    version = result?.version ?? null;
  }

  if (existsSync(readmePath)) {
    checkReadmeHasNoPlaceholders(site, readmePath);
    checkReadme(site, readmePath, version);
  }

  const changelogPath = join(siteDir, 'CHANGELOG.md');
  if (existsSync(changelogPath) && version) {
    checkChangelog(site, changelogPath, version);
  }

  checkIndex(site, version);
}

/** 真实 HTML 标签，避免把文档里的 `<div>` 误判成未替换的占位符 */
const HTML_TAGS = new Set([
  'a', 'br', 'code', 'div', 'em', 'img', 'input', 'kbd', 'li',
  'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th',
  'thead', 'tr', 'ul',
]);

/** 模板占位符残留（<site-key>、<selector> 等）会让脚本或文档出错 */
function checkReadmeHasNoPlaceholders(site, readmePath) {
  const text = readFileSync(readmePath, 'utf8');
  const hits = [...new Set(text.match(/<[a-z][a-z0-9-]*>/g) ?? [])]
    .filter((tag) => !HTML_TAGS.has(tag.slice(1, -1)));
  if (hits.length > 0) {
    fail(site, `文档中残留未替换的占位符：${hits.join(' ')}`);
    return false;
  }
  return true;
}

function main() {
  if (!existsSync(SITES_DIR)) {
    console.log('sites/ 目录不存在，跳过。');
    return 0;
  }

  const targets = process.argv.slice(2);
  const sites = readdirSync(SITES_DIR).filter((name) => {
    const full = join(SITES_DIR, name);
    if (!statSync(full).isDirectory() || name.startsWith('.') || name.startsWith('_')) return false;
    return targets.length === 0 || targets.includes(name);
  });

  if (sites.length === 0) {
    console.log('没有需要检查的站点目录。');
    return 0;
  }

  for (const site of sites) checkSite(site);

  for (const message of warnings) console.warn(`警告 ${message}`);
  for (const message of errors) console.error(`错误 ${message}`);

  const judged = sites.length;
  if (errors.length > 0) {
    console.error(`\n检查失败：${errors.length} 个错误，${warnings.length} 个警告（共 ${judged} 个站点）。`);
    return 1;
  }
  console.log(`检查通过：${judged} 个站点，${warnings.length} 个警告。`);
  return 0;
}

process.exit(main());
