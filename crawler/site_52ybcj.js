// 52ybcj.com（我爱云）适配器
// 列表：/system/page/N（WordPress + Begin 主题）
// 详情：原版类文章直接含网盘/直链/SHA-256；不忘初心转载类存在登录墙（read-secret）
//       配置源站账号后自动登录抓取受限页（环境变量 HAIYUN_52YBCJ_USER/HAIYUN_52YBCJ_PASS 或 data/credentials.json）
const fs = require('node:fs');
const path = require('node:path');
const { fetchText, Session } = require('./http');
const P = require('./parse');

const BASE = 'https://www.52ybcj.com';
// 系统分类栏目页（各单页，无分页）：列表页翻页之外的补充来源
const CATEGORY_PAGES = [
  '/system/windows11',
  '/system/windows10',
  '/system/windows7',
];

// ---------------- 源站登录会话（登录一次，整轮复用；失败自动回退匿名） ----------------
let _session = null;       // 已登录会话
let _anonSession = null;   // 匿名会话（有 Cookie 历史也比裸 fetch 稳）
let _loginTried = false;

function loadCredentials() {
  if (process.env.HAIYUN_52YBCJ_USER && process.env.HAIYUN_52YBCJ_PASS) {
    return { user: process.env.HAIYUN_52YBCJ_USER, pass: process.env.HAIYUN_52YBCJ_PASS };
  }
  try {
    const p = path.join(__dirname, '..', 'data', 'credentials.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const c = j['52ybcj'];
    if (c && c.user && c.pass) return { user: String(c.user), pass: String(c.pass) };
  } catch { /* 无凭据文件 */ }
  return null;
}

async function ensureSession(log = console.log) {
  if (_session) return _session;
  const cred = loadCredentials();
  if (!cred) {
    if (!_loginTried) { _loginTried = true; log('[52ybcj] 未配置源站账号，受限页保持 gated（可用 data/credentials.json 或环境变量配置）'); }
    return null;
  }
  if (_loginTried) return null; // 本轮已尝试过且失败
  _loginTried = true;
  try {
    const s = new Session();
    const r = await s.loginWp(BASE + '/wp-login.php', { user: cred.user, pass: cred.pass, referer: BASE + '/' });
    if (r.ok) {
      _session = s;
      log('[52ybcj] 源站登录成功，受限内容将带会话抓取');
      return s;
    }
    log(`[52ybcj] 源站登录失败（未获得登录 Cookie，HTTP ${r.status}），本轮按匿名抓取`);
  } catch (e) {
    log(`[52ybcj] 源站登录异常: ${e.message}，本轮按匿名抓取`);
  }
  return null;
}

async function crawlCategoryPage(path) {
  const url = BASE + path;
  const html = await fetchText(url);
  const items = [];
  const blocks = html.split(/<article\b[^>]*id="post-/).slice(1);
  for (const b of blocks) {
    const t = b.match(/<h2 class="entry-title"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!t) continue;
    const title = P.stripTags(t[2]);
    if (!P.isOsItem(title)) continue;
    const cat = b.match(/<span class="cat[^"]*"><a href="[^"]*">([^<]*)<\/a>/);
    const desc = b.match(/<div class="archive-content">([\s\S]*?)<\/div>/);
    const time = b.match(/<time datetime="([^"]+)"/);
    items.push({
      source_url: t[1].trim(),
      source_anchor: url,
      title,
      site_category: cat ? cat[1].trim() : null,
      description: desc ? P.stripTags(desc[1]).slice(0, 1200) : null,
      date_raw: time ? time[1] : null,
    });
  }
  return items;
}

async function crawlListPage(pageNo) {
  const url = pageNo <= 1 ? `${BASE}/system` : `${BASE}/system/page/${pageNo}`;
  const html = await fetchText(url);
  const items = [];
  // article 块切分
  const blocks = html.split(/<article\b[^>]*id="post-/).slice(1);
  for (const b of blocks) {
    const t = b.match(/<h2 class="entry-title"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!t) continue;
    const sourceUrl = t[1].trim();
    const title = P.stripTags(t[2]);
    const cat = b.match(/<span class="cat[^"]*"><a href="[^"]*">([^<]*)<\/a>/);
    const desc = b.match(/<div class="archive-content">([\s\S]*?)<\/div>/);
    const time = b.match(/<time datetime="([^"]+)"/);
    if (!sourceUrl || !title) continue;
    if (!P.isOsItem(title)) continue; // 过滤 PE 工具箱等非系统条目
    items.push({
      source_url: sourceUrl,
      source_anchor: url,
      title,
      site_category: cat ? cat[1].trim() : null,
      description: desc ? P.stripTags(desc[1]).slice(0, 1200) : null,
      date_raw: time ? time[1] : null,
    });
  }
  // 最大页码
  let maxPage = pageNo;
  const nav = html.match(/class="input-number"[^>]*max="(\d+)"/) || html.match(/max="(\d+)"[^>]*name="paged"/);
  const nums = [...html.matchAll(/href="https:\/\/www\.52ybcj\.com\/system\/page\/(\d+)"/g)].map(m => +m[1]);
  if (nums.length) maxPage = Math.max(...nums);
  else if (nav) maxPage = Math.max(pageNo, +nav[1]);
  return { items, maxPage };
}

async function crawlDetail(item) {
  const sess = await ensureSession();
  const html = sess ? (await sess.request(item.source_url)).text : await fetchText(item.source_url);
  const meta = html.match(/<meta name="description" content="([^"]*)"/);
  const desc = meta ? meta[1] : item.description;

  // 内容区：entry-content → 截断评论区
  let region = html;
  const ci = html.search(/id="comments"|class="comment-list"|<div id="respond"/);
  if (ci > 0) region = html.slice(0, ci);
  const ei = region.indexOf('entry-content');
  // 从 entry-content 所在标签的闭合 > 之后取正文，避免残留 "entry-content"> 字样
  if (ei > 0) {
    const gt = region.indexOf('>', ei);
    region = gt > 0 ? region.slice(gt + 1) : region.slice(ei);
  }

  // 版本特性按定稿裁剪（源站用 <h2 class="toch"> 作小节标题）
  //  - 不忘初心类：只保留 更新记录 / 保留列表
  //  - xb21cn 精简类：只保留 本版介绍（其内已含【详细特点/详细说明】）
  //  - Win11 类：只保留 本版介绍 / 详细特点（原版类无此小节则兜底保留 更新日志）
  //  - 其余：更新日志 / 集成功能 / 集成补丁
  const h2 = region.indexOf('<h2');
  const curatedRegion = h2 >= 0 ? region.slice(h2) : region;
  const isBW = /不忘初心/.test(item.title);
  const isXb21 = /xb21cn/i.test(item.title);
  const isWin11 = P.categoryOf(item.title) === 'win11';
  const primary = isBW ? /更新记录|保留/ : (isXb21 ? /本版介绍|详细/ : (isWin11 ? /本版介绍|详细特点/ : /更新日志|集成功能|集成补丁/));
  let curated = P.extractSections(curatedRegion, /<h2[^>]*>/i, primary);
  if (!curated && !isBW) {
    const secondary = isXb21 ? /本版介绍|详细/ : (isWin11 ? /更新日志/ : /更新日志|集成功能|集成补丁/);
    curated = P.extractSections(curatedRegion, /<h2[^>]*>/i, secondary);
  }
  // 兜底：绝不 dump 整页；取正文首段简介（首个 <h2 之前的说明文字）作为特性摘要
  const features = (isBW ? (curated || '') : (curated || (() => {
    const intro = h2 > 0 ? region.slice(0, h2) : region;
    return P.stripTagsKeepBreaks(intro).trim().slice(0, 2000);
  })())).slice(0, 8000);
  const text = P.stripTagsKeepBreaks(region);

  const gated = /read-secret|请注册登录后，查看文章详细内容/.test(html);
  const links = gated ? [] : P.extractLinks(region, item.source_url);
  const hashes = P.hashesOf(text);
  const fileNames = P.fileNamesOf(text);
  const size = P.fileSizeOf(item.title, text);

  // 下载相关文本行作为 raw_text 附注
  const dlLines = text.split('\n').filter(l =>
    /(网盘|直链|下载地址|文件名|SHA|MD5|链接[:：]|密码|提取码)/i.test(l)
  ).slice(0, 12).join('\n').slice(0, 2000);

  let crawl_status = 'no_links';
  if (gated) crawl_status = 'gated';
  else if (links.length > 0) crawl_status = 'ok';

  return {
    description: (desc || '').slice(0, 1500),
    features: (features || text || '').slice(0, 8000),
    content_text: text,
    links,
    hashes,
    file_name: fileNames[0] || null,
    file_size: size,
    raw_download_note: dlLines || null,
    crawl_status,
    gate_note: gated ? (sess ? '源站登录墙（会话仍受限，可能需要源站更高等级）' : '源站登录墙（请注册登录后查看）') : null,
  };
}

// 依次抓取三个系统分类栏目页（windows11/windows10/windows7）
async function crawlCategoryPages() {
  const items = [];
  for (const path of CATEGORY_PAGES) {
    try {
      const got = await crawlCategoryPage(path);
      items.push(...got);
      await sleep(1200);
    } catch { /* 单个栏目失败不影响其余 */ }
  }
  return items;
}

module.exports = { code: '52ybcj', crawlListPage, crawlDetail, crawlCategoryPages, BASE };
