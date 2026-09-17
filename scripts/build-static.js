// 静态导出：SQLite → GitHub Pages 可用的纯静态站
// 输出 dist/ = public/ 全量复制 + data/*.json（前端 H.api 在静态模式下读这些 JSON）
//   data/stats.json        首页统计（同 /api/stats 形状）
//   data/systems.json      全量档案列表（公共白名单字段，客户端筛选/排序/分页）
//   data/systems/{id}.json 档案详情 { item, links }（同 /api/systems/:id 形状）
const fs = require('node:fs');
const path = require('node:path');
const dbm = require('../db');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');

// 1) 复制 public → dist
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(PUBLIC, DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, 'data', 'systems'), { recursive: true });

// 2) stats.json（同 /api/stats 形状）
const s = dbm.stats();
fs.writeFileSync(path.join(DIST, 'data', 'stats.json'), JSON.stringify({
  total: s.total,
  byCategory: s.byCategory,
  byStatus: s.byStatus,
  sites: s.bySite.map(x => ({
    name: x.name, status: x.status, note: x.note,
    last_crawled_at: x.last_crawled_at, last_crawl_status: x.last_crawl_status,
    systems: x.systems,
  })),
}, null, 1));

// 3) systems.json 全量列表（is_active=1，公共白名单字段）
const rows = dbm.db.prepare(`
  SELECT y.*, s.code AS site_code, s.name AS site_name
    FROM systems y JOIN sites s ON s.id = y.site_id
   WHERE y.is_active = 1 ORDER BY y.release_date DESC, y.id DESC
`).all();
const items = rows.map(dbm.toPublic);
fs.writeFileSync(path.join(DIST, 'data', 'systems.json'), JSON.stringify({ total: items.length, items }));

// 4) 每档案详情 JSON（同 /api/systems/:id 形状；不含浏览量自增）
let nLinks = 0;
for (const it of items) {
  const links = dbm.getSystemLinks(it.id).map(l => ({
    id: l.id, link_type: l.link_type, provider: l.provider,
    url: l.url, extract_code: l.extract_code,
  }));
  nLinks += links.length;
  fs.writeFileSync(
    path.join(DIST, 'data', 'systems', `${it.id}.json`),
    JSON.stringify({ item: it, links })
  );
}

const mb = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(2) + ' MB';
console.log(`静态导出完成 → dist/`);
console.log(`  档案 ${items.length} · 链接 ${nLinks}`);
console.log(`  data/systems.json ${mb(path.join(DIST, 'data', 'systems.json'))}`);
console.log(`  dist 总大小 ${mb(DIST)}`);
