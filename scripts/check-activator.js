const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
const rows = db.prepare(`
  SELECT y.id, y.title, y.category, y.crawl_status, y.source_type, s.code AS site
  FROM systems y JOIN sites s ON s.id = y.site_id
  WHERE s.code = 'hellowindows'
`).all();
console.log('激活工具档案:', rows.length, '条');
for (const r of rows) {
  const links = db.prepare('SELECT link_type, provider, extract_code, substr(url,1,60) AS u FROM download_links WHERE system_id=?').all(r.id);
  console.log(`\n#${r.id} [${r.category}/${r.crawl_status}] ${r.title}`);
  for (const l of links) console.log(`   [${l.link_type}/${l.provider}] 码:${l.extract_code || '—'} ${l.u}`);
}
console.log('\n分类统计(全库):');
db.prepare('SELECT category, COUNT(*) AS n FROM systems GROUP BY category ORDER BY n DESC').all().forEach(r => console.log(`  ${r.category}=${r.n}`));