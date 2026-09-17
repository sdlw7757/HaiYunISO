// hellowindows.cn 适配器 —— 激活工具大分类
// 结构：首页为落地页，内嵌 items JSON（32 个分类）；其中【激活工具】分类为工具条目
// 每条：title / info(简介) / links[{name,url,hide}]；url 为 https://hellowindows.cn/link?target=... 中转，
//       302 跳转到真实网盘（如 pan.xunlei.com?pwd=提取码）
const { fetchText } = require('./http');
const P = require('./parse');

const BASE = 'https://hellowindows.cn';
const TARGET_CATEGORY = '激活工具';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 字符串感知的括号平衡提取
function extractBalanced(html, start) {
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  return null;
}

// 解析首页 items JSON，取激活工具分类
function parseItemsJson(html) {
  let from = 0, best = null;
  while (true) {
    const i = html.indexOf('items:', from);
    if (i < 0) break;
    const start = html.indexOf('[', i);
    if (start >= 0 && html.slice(start, start + 40).includes('"category"')) {
      const raw = extractBalanced(html, start);
      if (raw && (!best || raw.length > best.length)) best = raw;
    }
    from = i + 6;
  }
  if (!best) return [];
  let data;
  try { data = JSON.parse(best); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const cat = data.find(c => c && c.category === TARGET_CATEGORY);
  return (cat && Array.isArray(cat.list)) ? cat.list : [];
}

function cleanTitle(t) {
  // 去掉前缀 emoji 与 "强烈推荐：" 等
  return String(t || '').replace(/^[\u{1F300}-\u{1FAFF}\u{FE0F}\u2600-\u27BF\s:：]*/u, '').replace(/^强烈推荐[：:]\s*/, '').trim();
}

let cache = null; // 首页缓存（同一次运行内复用）

async function crawlListPage(pageNo) {
  if (!cache) {
    const html = await fetchText(BASE + '/');
    cache = parseItemsJson(html);
  }
  const items = cache.map((it, idx) => {
    const rawLinks = (it.links || []).filter(l => !l.hide && l.name && !/🚩/.test(l.name));
    return {
      source_url: `${BASE}/item/${it.id || ('tool' + idx)}`,
      source_anchor: BASE + '/',
      title: cleanTitle(it.title),
      category: 'activator',
      description: (it.info || '').replace(/\n+/g, '\n').slice(0, 1500),
      date_raw: it.date || null,
      list_size: null,
      list_hot: null,
      _links: rawLinks,
      _bit: it.bit || null,
    };
  });
  return { items, maxPage: 1 };
}

async function crawlDetail(item) {
  const links = [];
  for (const l of item._links || []) {
    try {
      // 跟随中转 302，还原真实网盘地址
      const r = await fetch(l.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120' }, redirect: 'manual' });
      let real = r.headers.get('location');
      if (!real && r.status === 200) {
        // 无重定向：尝试直接跟随后取最终 URL
        const r2 = await fetch(l.url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120' }, redirect: 'follow' });
        real = r2.url;
      }
      if (!real) { console.log(`hellowindows 链接解析失败（无跳转）: ${l.url.slice(0, 60)}`); continue; }
      const c = P.classifyLink(real);
      if (c.link_type === 'other') continue; // 非资源链接丢弃
      links.push({ url: real, raw_text: (l.name || '').slice(0, 200), ...c });
    } catch (e) {
      console.log(`hellowindows 链接解析异常: ${e.message}`);
    }
    await sleep(500);
  }
  const realLinks = links.filter(l => l.link_type !== 'other');
  return {
    description: item.description || null,
    features: '', // 激活工具不套用系统版本特性
    content_text: '',
    links,
    hashes: {},
    file_name: null,
    file_size: null,
    raw_download_note: null,
    crawl_status: realLinks.length > 0 ? 'ok' : 'no_links',
    gate_note: null,
  };
}

module.exports = { code: 'hellowindows', crawlListPage, crawlDetail, BASE };
