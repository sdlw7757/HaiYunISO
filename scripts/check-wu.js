// 定位 msdngho features 中 "五、" 的出现位置
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
const rows = db.prepare(`
  SELECT y.id, y.title, y.features FROM systems y JOIN sites s ON s.id=y.site_id
  WHERE s.code='msdngho' AND y.features LIKE '%五、%'
`).all();
console.log('含"五、"的 msdngho 档案:', rows.length, '条');
for (const r of rows) {
  console.log(`\n#${r.id} ${r.title.slice(0, 40)}`);
  let idx = -1, n = 0;
  while ((idx = r.features.indexOf('五、', idx + 1)) >= 0 && n < 6) {
    n++;
    console.log(`  @${idx}: ...${r.features.slice(Math.max(0, idx - 25), idx + 30).replace(/\n/g, '⏎')}...`);
  }
  console.log('  features 总长:', r.features.length, '| 末尾120字:', r.features.slice(-120).replace(/\n/g, '⏎'));
}