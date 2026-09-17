// 静态导出：SQLite → GitHub Pages 可用的纯静态站
// 输出 dist/ = public/ 全量复制 + data/*.json（前端 H.api 在静态模式下读这些 JSON）
//   data/stats.json        首页统计（同 /api/stats 形状）
//   data/systems.json      全量档案列表（公共白名单字段，客户端筛选/排序/分页）
//   data/systems/{id}.json 档案详情 { item, links }（同 /api/systems/:id 形状）
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');
const SNAPSHOT = path.join(ROOT, 'data-static'); // 仓库内数据快照（混合模式：本地采集 → 提交 → Actions 部署）

const hasSnapshot = fs.existsSync(path.join(SNAPSHOT, 'systems.json'));
let dbm = null;
if (!hasSnapshot) dbm = require('../db');

// 1) 复制 public → dist
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(PUBLIC, DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, 'data', 'systems'), { recursive: true });

// 2) 数据源：优先仓库快照（云端部署无需采集），否则读本地 SQLite
let statsJson, items, linksOf;
if (hasSnapshot) {
  console.log('数据源: data-static/ 仓库快照（混合模式）');
  const src = SNAPSHOT;
  statsJson = fs.readFileSync(path.join(src, 'stats.json'), 'utf8');
  const list = JSON.parse(fs.readFileSync(path.join(src, 'systems.json'), 'utf8'));
  items = list.items;
  linksOf = (id) => {
    const p = path.join(src, 'systems', `${id}.json`);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')).links : [];
  };
} else {
  console.log('数据源: 本地 SQLite（现场读取）');
  const s = dbm.stats();
  statsJson = JSON.stringify({
    total: s.total,
    byCategory: s.byCategory,
    byStatus: s.byStatus,
    sites: s.bySite.map(x => ({
      name: x.name, status: x.status, note: x.note,
      last_crawled_at: x.last_crawled_at, last_crawl_status: x.last_crawl_status,
      systems: x.systems,
    })),
  });
  const rows = dbm.db.prepare(`
    SELECT y.*, s.code AS site_code, s.name AS site_name
      FROM systems y JOIN sites s ON s.id = y.site_id
     WHERE y.is_active = 1 ORDER BY y.release_date DESC, y.id DESC
  `).all();
  items = rows.map(dbm.toPublic);
  linksOf = (id) => dbm.getSystemLinks(id).map(l => ({
    id: l.id, link_type: l.link_type, provider: l.provider,
    url: l.url, extract_code: l.extract_code,
  }));
}

// 3) 写入 dist/data
fs.writeFileSync(path.join(DIST, 'data', 'stats.json'), statsJson);
fs.writeFileSync(path.join(DIST, 'data', 'systems.json'), JSON.stringify({ total: items.length, items }));
let nLinks = 0;
for (const it of items) {
  const links = linksOf(it.id);
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
