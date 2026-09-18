const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
const rows = db.prepare(`
  SELECT y.id, y.title, substr(y.features,1,90) AS f
  FROM systems y WHERE y.title LIKE '%xb21cn%' ORDER BY y.category
`).all();
console.log('xb21cn 档案:', rows.length, '条');
for (const r of rows) {
  const clean = String(r.f || '').replace(/\s+/g, ' ').slice(0, 55);
  const head = /^entry-content|^\s*$/.test(clean) ? '❗含残留/空' : '正常';
  console.log(`#${r.id} [${head}] ${(r.title || '').slice(0, 34)} | ${clean}`);
}