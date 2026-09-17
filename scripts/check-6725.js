const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
const rows = db.prepare("SELECT y.id, y.title, y.category, s.code FROM systems y JOIN sites s ON s.id=y.site_id WHERE y.source_url LIKE '%6725%' OR y.source_url LIKE '%6583%' OR y.source_url LIKE '%6584%'").all();
console.log('栏目文章入库情况:');
for (const r of rows) console.log(` #${r.id} [${r.code}/${r.category}] ${r.title.slice(0, 50)}`);
const w7 = db.prepare("SELECT COUNT(*) AS n FROM systems y JOIN sites s ON s.id=y.site_id WHERE s.code='52ybcj' AND y.category='win7'").get().n;
console.log('\n52ybcj win7 总数:', w7);
