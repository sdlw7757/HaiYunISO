// 数据快照导出：SQLite → data-static/（进仓库，供 Actions 免采集直接部署）
// 用途：GitHub Actions 海外 runner 采集不到国内源站（WAF），改为本地采集后提交快照
//   data-static/stats.json        首页统计
//   data-static/systems.json      全量档案列表
//   data-static/systems/{id}.json 档案详情
const fs = require('node:fs');
const path = require('node:path');
const dbm = require('../db');

const OUT = path.join(__dirname, '..', 'data-static');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'systems'), { recursive: true });

const s = dbm.stats();
const now = new Date();
const updated_at = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify({
  total: s.total,
  updated_at, // 数据更新时间（采集/快照导出时刻）
  byCategory: s.byCategory,
  byStatus: s.byStatus,
  sites: s.bySite.map(x => ({
    name: x.name, status: x.status, note: x.note,
    last_crawled_at: x.last_crawled_at, last_crawl_status: x.last_crawl_status,
    systems: x.systems,
  })),
}));

const rows = dbm.db.prepare(`
  SELECT y.*, s.code AS site_code, s.name AS site_name
    FROM systems y JOIN sites s ON s.id = y.site_id
   WHERE y.is_active = 1 ORDER BY y.release_date DESC, y.id DESC
`).all();
const items = rows.map(dbm.toPublic);
fs.writeFileSync(path.join(OUT, 'systems.json'), JSON.stringify({ total: items.length, items }));

let nLinks = 0;
for (const it of items) {
  const links = dbm.getSystemLinks(it.id).map(l => ({
    id: l.id, link_type: l.link_type, provider: l.provider,
    url: l.url, extract_code: l.extract_code,
  }));
  nLinks += links.length;
  fs.writeFileSync(path.join(OUT, 'systems', `${it.id}.json`), JSON.stringify({ item: it, links }));
}

const mb = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(2) + ' MB';
console.log(`快照导出完成 → data-static/  档案 ${items.length} · 链接 ${nLinks} · ${mb(path.join(OUT, 'systems.json'))}`);
