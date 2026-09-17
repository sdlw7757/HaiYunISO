const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
console.log('== 采集状态分布 ==');
db.prepare('SELECT crawl_status, COUNT(*) n FROM systems GROUP BY crawl_status').all().forEach(r => console.log(`  ${r.crawl_status} = ${r.n}`));
console.log('\n== 52ybcj 受限/无链残留 ==');
const bad = db.prepare(`SELECT y.id, y.crawl_status, y.title FROM systems y JOIN sites s ON s.id=y.site_id WHERE s.code='52ybcj' AND y.crawl_status != 'ok'`).all();
console.log(bad.length ? bad.map(r => `  #${r.id} [${r.crawl_status}] ${r.title.slice(0, 30)}`).join('\n') : '  无（全部 ok）');
console.log('\n== 原受限 26 条的链接数 ==');
const l = db.prepare(`
  SELECT y.id, y.title, COUNT(l.id) AS links
  FROM systems y JOIN sites s ON s.id=y.site_id
  LEFT JOIN download_links l ON l.system_id = y.id
  WHERE s.code='52ybcj' AND y.title LIKE '%不忘初心%'
  GROUP BY y.id ORDER BY links DESC LIMIT 30
`).all();
l.forEach(r => console.log(`  #${r.id} ${String(r.links).padStart(2)} 条 | ${r.title.slice(0, 36)}`));
console.log('\n== 全库总计 ==');
console.log('  档案:', db.prepare('SELECT COUNT(*) n FROM systems').get().n, '| 链接:', db.prepare('SELECT COUNT(*) n FROM download_links').get().n);