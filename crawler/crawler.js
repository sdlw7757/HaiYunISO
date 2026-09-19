// HAIYUN ISO 采集编排器
// 用法：node crawler/crawler.js [--site=active|all|52ybcj|msdngho] [--max-pages=N]
// 默认 --site=active：采集两个活跃站（52ybcj + msdngho，含 OEM 品牌机系统）。
const config = require('../config');
const dbm = require('../db');
const P = require('./parse');
const adapter52 = require('./site_52ybcj');
const adapterMsdn = require('./site_msdngho');
const adapterHello = require('./site_hellowindows');
const { crawlGeneric } = require('./site_generic');

const adapters = { '52ybcj': adapter52, 'msdngho': adapterMsdn, 'hellowindows': adapterHello };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let running = false;

function log(...args) {
  const line = `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] ${args.join(' ')}`;
  console.log(line);
  require('node:fs').appendFileSync(require('node:path').join(config.LOG_DIR, 'crawl.log'), line + '\n');
}

function buildRecord(siteId, item, detail) {
  const title = item.title;
  const content = detail.content_text || '';
  const tags = [...new Set([...(detail.site_tags || []), ...P.tagsOf(title, content)])];
  return {
    site_id: siteId,
    source_url: item.source_url,
    source_anchor: item.source_anchor || null,
    title,
    category: item.category || P.categoryOf(title),
    edition: P.editionOf(title),
    build: P.buildOf(title, content),
    arch: P.archOf(title),
    source_type: P.sourceTypeOf(title, content),
    variant: P.variantOf(title),
    update_type: P.updateTypeOf(title),
    tags: JSON.stringify(tags),
    hardware_notes: P.hardwareNotesOf(title, content),
    description: detail.description || item.description || null,
    features: detail.features || null,
    release_date: P.normalizeDate(item.date_raw),
    file_name: detail.file_name || null,
    file_size: detail.file_size || null,
    md5: detail.hashes?.md5 || null,
    sha256: detail.hashes?.sha256 || null,
    sha1: detail.hashes?.sha1 || null,
    crawl_status: detail.crawl_status || 'no_links',
    gate_note: detail.gate_note || null,
  };
}

async function crawlStandardSite(code, { maxPages } = {}) {
  const site = dbm.getSiteByCode(code);
  const adapter = adapters[code];
  if (!site || !adapter) throw new Error(`unknown site: ${code}`);
  const max = Math.max(1, Math.min(maxPages || config.CRAWL.MAX_PAGES_DEFAULT, 50));
  const logId = dbm.startLog(code);
  log(`=== 开始采集 ${site.name} (${code}) ===`);
  const stat = { pages_fetched: 0, systems_found: 0, links_found: 0, gated_count: 0 };
  try {
    // 1) 列表页
    const items = [];
    const seen = new Set();
    let siteMax = max;
    for (let p = 1; p <= Math.min(max, siteMax); p++) {
      let pageItems, maxPage;
      try {
        ({ items: pageItems, maxPage } = await adapter.crawlListPage(p));
      } catch (e) {
        // 翻页超出实际页数等情况：停止翻页而不是整站失败
        log(`${code} 列表第 ${p} 页抓取失败（${e.message}），停止翻页`);
        break;
      }
      stat.pages_fetched++;
      siteMax = Math.min(siteMax, Math.max(maxPage || p, p));
      for (const it of pageItems) {
        if (!seen.has(it.source_url)) { seen.add(it.source_url); items.push(it); }
      }
      log(`${code} 列表第 ${p}/${Math.min(max, siteMax)} 页：累计条目 ${items.length}`);
      if (p < Math.min(max, siteMax)) await sleep(config.CRAWL.DELAY_MS);
    }
    // 1.5) 分类栏目页补充（windows7/windows10/windows11 专属栏目，去重后合并）
    if (adapter.crawlCategoryPages) {
      try {
        const catItems = await adapter.crawlCategoryPages();
        let added = 0;
        for (const it of catItems) {
          if (!seen.has(it.source_url)) { seen.add(it.source_url); items.push(it); added++; }
        }
        if (added) { stat.pages_fetched += catItems.__pages || 0; log(`${code} 分类栏目页补充 ${added} 条新条目`); }
      } catch (e) {
        log(`${code} 分类栏目页抓取失败（${e.message}），跳过`);
      }
    }
    // 2) 详情页
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let detail;
      try {
        detail = await adapter.crawlDetail(item);
      } catch (e) {
        log(`${code} 详情失败 ${item.source_url}：${e.message}`);
        continue;
      }
      const rec = buildRecord(site.id, item, detail);
      const realLinks = (detail.links || []).filter(l => l.link_type !== 'other');
      // 状态兜底重算：以真实资源链接为准（gated 由适配器判定并保留）
      if (rec.crawl_status !== 'gated') {
        rec.crawl_status = realLinks.length > 0 ? 'ok' : 'no_links';
      }
      const { id } = dbm.upsertSystem(rec);
      let linkCount = 0;
      for (const l of realLinks) {
        dbm.upsertLink({
          system_id: id, site_id: site.id, url: l.url,
          link_type: l.link_type, provider: l.provider,
          raw_text: [l.raw_text, detail.raw_download_note].filter(Boolean).join('\n').slice(0, 1000),
          extract_code: P.extractCode(l.url, `${l.raw_text || ''}\n${detail.raw_download_note || ''}`),
        });
        linkCount++;
      }
      stat.systems_found++;
      stat.links_found += linkCount;
      if (rec.crawl_status === 'gated') stat.gated_count++;
      if ((i + 1) % 5 === 0 || i === items.length - 1) {
        log(`${code} 详情 ${i + 1}/${items.length}：${rec.title.slice(0, 40)} [${rec.crawl_status}] 链接 ${linkCount}`);
      }
      await sleep(config.CRAWL.DELAY_MS);
    }
    const status = stat.systems_found > 0 ? 'success' : 'partial';
    dbm.finishLog(logId, { ...stat, site_code: code, status, message: `采集完成（${stat.systems_found} 条，${stat.links_found} 条链接，${stat.gated_count} 条受限）` });
    log(`=== ${code} 采集完成：系统 ${stat.systems_found}，链接 ${stat.links_found}，受限 ${stat.gated_count} ===`);
    return { ok: true, ...stat };
  } catch (e) {
    dbm.finishLog(logId, { ...stat, site_code: code, status: 'failed', message: String(e.message || e) });
    log(`${code} 采集失败：${e.message}`);
    return { ok: false, error: String(e.message || e), ...stat };
  }
}

async function crawlMsdngho() {
  const site = dbm.getSiteByCode('msdngho');
  const logId = dbm.startLog('msdngho');
  log('=== 采集 msdngho（原版系统 + OEM 品牌机系统） ===');
  const stat = { pages_fetched: 0, systems_found: 0, links_found: 0, gated_count: 0 };
  try {
    let res;
    try {
      res = await adapterMsdn.crawlAll({ log });
    } catch (e) {
      dbm.finishLog(logId, { ...stat, site_code: 'msdngho', status: 'failed', message: `解析失败：${e.message}（维持空占位）` });
      return { ok: false, error: String(e.message || e), ...stat };
    }
    stat.pages_fetched = res.pages || 0;
    log(`msdngho 详情抓取开始，共 ${res.items.length} 条（此阶段进度每 5 条打印一次）`);
    for (const item of res.items) {
      let detail;
      try { detail = await adapterMsdn.crawlDetail(item); }
      catch (e) { log(`msdngho 详情失败 ${item.source_url}：${e.message}`); continue; }
      const rec = buildRecord(site.id, item, detail);
      const realLinks = (detail.links || []).filter(l => l.link_type !== 'other');
      if (rec.crawl_status !== 'gated') {
        rec.crawl_status = realLinks.length > 0 ? 'ok' : 'no_links';
      }
      const { id } = dbm.upsertSystem(rec);
      for (const l of realLinks) {
        dbm.upsertLink({ system_id: id, site_id: site.id, url: l.url, link_type: l.link_type, provider: l.provider, raw_text: l.raw_text });
        stat.links_found++;
      }
      stat.systems_found++;
      if (stat.systems_found % 5 === 0 || stat.systems_found === res.items.length) {
        log(`msdngho 详情 ${stat.systems_found}/${res.items.length}：${rec.title.slice(0, 40)} 链接 ${stat.links_found}`);
      }
      await sleep(config.CRAWL.DELAY_MS);
    }
    const failed = res.parse_failed && stat.systems_found === 0;
    dbm.finishLog(logId, {
      ...stat, site_code: 'msdngho',
      status: failed ? 'failed' : (stat.systems_found ? 'success' : 'partial'),
      message: failed
        ? '页面解析失败无法抓取内容，维持被动空占位策略；站点恢复后重试 --site=msdngho 自动补采'
        : `补采完成（${stat.systems_found} 条）`,
    });
    return { ok: !failed, ...stat };
  } catch (e) {
    dbm.finishLog(logId, { ...stat, site_code: 'msdngho', status: 'failed', message: `解析失败：${e.message}（维持被动空占位）` });
    return { ok: false, error: String(e.message || e), ...stat };
  }
}

async function runCrawl(site = 'active', { maxPages } = {}) {
  if (running) throw new Error('已有采集任务在运行中');
  running = true;
  try {
    let targets;
    if (site === 'active' || site === 'all') {
      // 活跃采集站集合由后台站点管理维护：sites 表 status='active' 即参与
      targets = dbm.db.prepare("SELECT code FROM sites WHERE status = 'active' ORDER BY id").all().map(r => r.code);
      log(`活跃采集站集合：${targets.join(' ') || '（空）'}`);
    } else if (dbm.getSiteByCode(site)) targets = [site];
    else throw new Error(`未知站点：${site}`);
    const results = {};
    for (const t of targets) {
      // 内置适配器优先；其余（含自定义站点）走通用适配器自动采集
      if (t === 'msdngho') results[t] = await crawlMsdngho();
      else if (adapters[t]) results[t] = await crawlStandardSite(t, { maxPages });
      else results[t] = await crawlGeneric(t, { log }, dbm, buildRecord, dbm.upsertLink, config);
      await sleep(config.CRAWL.DELAY_MS);
    }
    return results;
  } finally {
    running = false;
  }
}

module.exports = { runCrawl, isRunning: () => running };

// CLI
if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const m = a.match(/^--([a-z-]+)(?:=(.*))?$/i);
    return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
  }));
  const site = String(args.site || 'active');
  const maxPages = args['max-pages'] ? Number(args['max-pages']) : undefined;
  runCrawl(site, { maxPages })
    .then(r => { log('全部完成', JSON.stringify(r)); process.exit(0); })
    .catch(e => { log('任务中止：' + e.message); process.exit(1); });
}
