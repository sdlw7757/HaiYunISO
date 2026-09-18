// 回归检查：52ybcj 所有档案，features 是否含整页泄漏特征（entry-content 残留 / 版权声明 等正文外内容）
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
const rows = db.prepare(`
  SELECT y.id, y.title, y.features, y.category, y.source_type FROM systems y JOIN sites s ON s.id=y.site_id WHERE s.code='52ybcj'
`).all();
let leak = 0;
for (const r of rows) {
  const f = r.features || '';
  const bad = f.includes('entry-content"') || f.includes('本文由') || f.includes('相关文章') || f.includes('热门文章') || f.includes('请转载');
  if (bad) { leak++; console.log(`#${r.id} [${r.category}/${r.source_type}] ${(r.title || '').slice(0, 36)} ❗含正文外残留`); }
}
console.log(leak === 0 ? '全部正常：无整页泄漏' : `${leak} 条有残留`);
// 抽查各类型特性开头
console.log('\n各类型 features 开头（前38字）:');
db.prepare(`
  SELECT y.category, y.title, y.features FROM systems y JOIN sites s ON s.id=y.site_id WHERE s.code='52ybcj' ORDER BY y.category, y.id
`).all().forEach(r => {
  const f = (r.features || '').replace(/\s+/g, ' ').slice(0, 38);
  console.log(`  [${r.category}] ${f}`);
});