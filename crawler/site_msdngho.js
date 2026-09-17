// msdngho.com（MSDN）适配器
// 实测结构：原版系统分类 /win11/ /win10/（单页列表）+ 品牌机系统 /oem/ → 10 个品牌子页
// 列表项：<li class="list-item fix"> 内含 item-title / 大小 / 时间 / info-desc / 人气
// 详情页：<a class="local_download" href="...">高速下载一 / 夸克网盘 / 百度网盘 / 天翼云盘 / 迅雷下载</a>
const { fetchText } = require('./http');
const P = require('./parse');

const BASE = 'http://www.msdngho.com';
const SYSTEM_CATEGORIES = [
  { path: '/win11/', category: 'win11' },
  { path: '/win10/', category: 'win10' },
  { path: '/win8/', category: 'win8' },
  { path: '/win7/', category: 'win7' },
  { path: '/xp/', category: 'xp' },
];
const OEM_INDEX = '/oem/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const abs = (href) => (!href ? null : (href.startsWith('http') ? href : BASE + href));

// 解析 li.list-item 列表项
function parseListItems(html, { category, anchor }) {
  const items = [];
  const blocks = html.split(/<li class="list-item fix">/).slice(1);
  for (const b of blocks) {
    const h3 = b.match(/<h3 class="item-title">([\s\S]*?)<\/h3>/);
    const a = b.match(/<a href="([^"]+\.html)"[^>]*title="([^"]*)"/);
    const url = a ? abs(a[1]) : null;
    const title = h3 ? P.stripTags(h3[1]) : (a ? a[2] : null);
    if (!url || !title || !P.isOsItem(title)) continue;
    const size = b.match(/大小[：:]\s*([\d.]+\s*[GT]MB?)/i);
    const date = b.match(/时间[：:]\s*(\d{4}-\d{2}-\d{2})/);
    const desc = b.match(/<p class="info-desc">([\s\S]*?)<\/p>/);
    const hot = b.match(/人气[：:]\s*(\d+)/);
    items.push({
      source_url: url,
      source_anchor: anchor,
      title,
      category,
      description: desc ? P.stripTags(desc[1]).slice(0, 1200) : null,
      date_raw: date ? date[1] : null,
      list_size: size ? size[1].replace(/\s+/g, '') : null,
      list_hot: hot ? Number(hot[1]) : null,
    });
  }
  return items;
}

async function crawlAll({ log = () => {} } = {}) {
  const items = [];
  const seen = new Set();
  const push = (arr) => {
    for (const it of arr) if (!seen.has(it.source_url)) { seen.add(it.source_url); items.push(it); }
  };
  let pages = 0;

  // 1) 原版系统分类（单页）
  for (const c of SYSTEM_CATEGORIES) {
    try {
      const html = await fetchText(BASE + c.path);
      pages++;
      const got = parseListItems(html, { category: c.category, anchor: BASE + c.path });
      log(`msdngho ${c.path} 解析条目 ${got.length}`);
      push(got);
    } catch (e) {
      log(`msdngho ${c.path} 抓取失败：${e.message}`);
    }
    await sleep(800);
  }

  // 2) 品牌机系统 /oem/ → 品牌子页
  try {
    const oemHtml = await fetchText(BASE + OEM_INDEX);
    pages++;
    const brands = [...new Set([...oemHtml.matchAll(/href="(\/oem\/[a-z]+\/)"/g)].map(m => m[1]))];
    log(`msdngho /oem/ 发现品牌子页 ${brands.length} 个：${brands.join(' ')}`);
    for (const brand of brands) {
      try {
        const html = await fetchText(BASE + brand);
        pages++;
        const got = parseListItems(html, { category: 'oem', anchor: BASE + brand });
        log(`msdngho ${brand} 解析条目 ${got.length}`);
        push(got);
      } catch (e) {
        log(`msdngho ${brand} 抓取失败：${e.message}`);
      }
      await sleep(800);
    }
  } catch (e) {
    log(`msdngho /oem/ 抓取失败：${e.message}`);
  }

  return { items, pages, parse_failed: items.length === 0 };
}

async function crawlDetail(item) {
  const html = await fetchText(item.source_url);
  const meta = html.match(/<meta name="description" content="([^"]*)"/);

  // 下载链接：class="local_download" 锚点
  const links = [];
  const seen = new Set();
  for (const m of html.matchAll(/<a class="local_download"[^>]*href="([^"]+)"[^>]*>([\s\S]{0,100}?)<\/a>/g)) {
    const url = m[1].trim().replace(/&amp;/g, '&');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const label = P.stripTags(m[2]);
    const c = P.classifyLink(url);
    // 站内"高速下载X"入口按其语义归为直链
    const isPortal = /高速下载/.test(label);
    links.push({
      url,
      raw_text: label.slice(0, 200),
      link_type: isPortal ? 'direct' : c.link_type,
      provider: isPortal ? 'direct' : c.provider,
    });
  }

  // 版本特性按定稿裁剪：仅保留 系统特色 / 系统智能与自动技术 / 系统更新日志 / 集成软件 小节
  // 源站小节标题为 <p class="intro-tit">一、系统特色</p> 等，位于下载区块之前
  const ii = html.indexOf('<p class="intro-tit"');
  const di = html.indexOf('local_download');
  const introRegion = (ii >= 0 ? html.slice(ii, di > 0 ? di : html.length) : '');
  const curated = P.extractSections(introRegion, /<p class="intro-tit"[^>]*>/i, /系统特色|系统智能与自动技术|系统更新日志|集成软件/);
  // 目标小节之后常紧跟 原版系统安装方法/常见问题解答/免责条款 等通用段落（普通 p 标签，非小节标题），按关键词截断排除
  const features = P.cutAtMarkers(curated || text || '', [
    '原版系统安装方法', '常见问题解答', '免责条款', '免责声明',
    '一键装机大师', '装机大师', 'U盘启动盘', '启动盘制作工具',
  ]);

  // 正文区（下载区起）与全页文本
  const text = P.stripTagsKeepBreaks(di > 0 ? html.slice(di) : html);
  const fullText = P.stripTagsKeepBreaks(html);

  const size = (fullText.match(/大小[：:]\s*([\d.]+\s*[GT]MB?)/i) || [])[1];
  const realLinks = links.filter(l => l.link_type !== 'other');

  return {
    description: (meta ? meta[1] : item.description || '').slice(0, 1500),
    features: (features || '').slice(0, 8000),
    content_text: fullText.slice(0, 20000),
    links,
    hashes: P.hashesOf(fullText),
    file_name: P.fileNamesOf(fullText)[0] || null,
    file_size: size || item.list_size || null,
    raw_download_note: null,
    crawl_status: realLinks.length > 0 ? 'ok' : 'no_links',
    gate_note: null,
  };
}

module.exports = { code: 'msdngho', crawlAll, crawlDetail, BASE, SYSTEM_CATEGORIES, OEM_INDEX };
