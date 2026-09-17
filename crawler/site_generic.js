// 通用站点适配器 —— 为后台自定义添加的站点自动提供采集能力，无需手写代码
// 策略：
//  列表：抓站点 base_url 页面，提取同域文章链接（.html/.shtml 或含系统关键词的路径），按标题启发式过滤
//  详情：整页正文提取下载链接（网盘/直链/磁力）、哈希、文件名、大小；特性为正文全文
const { fetchText } = require('./http');
const P = require('./parse');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function sameHost(url, base) {
  try { return new URL(url).host === new URL(base).host; } catch { return false; }
}

// 从列表页 HTML 提取候选条目
function parseItems(html, base) {
  const items = [];
  const seen = new Set();
  const baseNorm = base.replace(/\/+$/, '') + '/';
  for (const m of html.matchAll(/<a[^>]*href="([^"#?]+)"[^>]*>([\s\S]{0,300}?)<\/a>/g)) {
    let href = m[1].trim();
    if (href.startsWith('//')) href = 'http:' + href;
    else if (!/^https?:\/\//i.test(href)) {
      try { href = new URL(href, base).href; } catch { continue; }
    }
    if (!sameHost(href, base) || seen.has(href) || href === baseNorm) continue;
    const label = P.stripTags(m[2]).replace(/\s+/g, ' ').trim();
    if (!label || label.length < 6 || !P.isOsItem(label)) continue;
    seen.add(href);
    items.push({
      source_url: href,
      source_anchor: base,
      title: label,
      category: null, // 详情入库时按标题识别
      description: null,
      date_raw: null,
      list_size: null,
      list_hot: null,
    });
  }
  return items;
}

async function crawlGeneric(code, { log = () => {} } = {}, dbm, buildRecord, upsertLink, config) {
  const site = dbm.getSiteByCode(code);
  if (!site) throw new Error(`unknown site: ${code}`);
  const logId = dbm.startLog(code);
  log(`=== 开始采集 ${site.name} (${code})［通用适配器］ ===`);
  const stat = { pages_fetched: 0, systems_found: 0, links_found: 0, gated_count: 0 };
  try {
    const html = await fetchText(site.base_url);
    stat.pages_fetched++;
    const items = parseItems(html, site.base_url);
    log(`${code} 列表解析条目 ${items.length}`);
    for (const item of items) {
      let detail;
      try {
        const dhtml = await fetchText(item.source_url);
        stat.pages_fetched++;
        const meta = dhtml.match(/<meta name="description" content="([^"]*)"/);
        const text = P.stripTagsKeepBreaks(dhtml);
        const links = P.extractLinks(dhtml, item.source_url).filter(l => l.link_type !== 'other');
        detail = {
          description: meta ? meta[1] : item.description,
          features: text.slice(0, 8000),
          content_text: text.slice(0, 20000),
          links,
          hashes: P.hashesOf(text),
          file_name: P.fileNamesOf(text)[0] || null,
          file_size: P.fileSizeOf(item.title, text),
          raw_download_note: null,
          crawl_status: links.length > 0 ? 'ok' : 'no_links',
          gate_note: null,
        };
      } catch (e) {
        log(`${code} 详情失败 ${item.source_url}：${e.message}`);
        continue;
      }
      const rec = buildRecord(site.id, item, detail);
      const { id } = dbm.upsertSystem(rec);
      for (const l of detail.links) {
        dbm.upsertLink({ system_id: id, site_id: site.id, url: l.url, link_type: l.link_type, provider: l.provider, raw_text: l.raw_text });
        stat.links_found++;
      }
      stat.systems_found++;
      log(`${code} 详情：${item.title.slice(0, 40)} [${rec.crawl_status}] 链接 ${detail.links.length}`);
      await sleep(400);
    }
    dbm.finishLog(logId, {
      ...stat, site_code: code,
      status: stat.systems_found ? 'success' : 'partial',
      message: stat.systems_found
        ? `通用适配器采集完成（${stat.systems_found} 条）；如结构特殊可反馈优化解析规则`
        : '通用适配器未在首页发现系统类条目；站点可能需进入栏目页或结构特殊',
    });
    return { ok: true, ...stat };
  } catch (e) {
    dbm.finishLog(logId, { ...stat, site_code: code, status: 'failed', message: `通用适配器采集失败：${e.message}` });
    return { ok: false, error: String(e.message || e), ...stat };
  }
}

module.exports = { crawlGeneric, parseItems };
