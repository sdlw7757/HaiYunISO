// 清理 msdngho features 末尾遗留的孤立小节编号（如"五、"）
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
const re = /[\s\u3000]*[一二三四五六七八九十]+、\s*$/;
const rows = db.prepare(`
  SELECT y.id, y.features FROM systems y JOIN sites s ON s.id = y.site_id
  WHERE s.code = 'msdngho' AND y.features IS NOT NULL
`).all();
let fixed = 0;
const upd = db.prepare('UPDATE systems SET features = ? WHERE id = ?');
for (const r of rows) {
  const cleaned = (r.features || '').replace(re, '').trim();
  if (cleaned !== (r.features || '').trim()) {
    upd.run(cleaned, r.id);
    fixed++;
  }
}
console.log('修正 features 末尾孤立编号:', fixed, '条');
// 复查
const left = db.prepare(`
  SELECT COUNT(*) AS n FROM systems y JOIN sites s ON s.id = y.site_id
  WHERE s.code='msdngho' AND (y.features LIKE '%五、' OR y.features LIKE '%六、' OR y.features LIKE '%七、')
`).get().n;
console.log('仍以 五/六/七、 结尾:', left, '条');
