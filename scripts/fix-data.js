// 数据修正：清理 PE 工具条目、修正 IoT LTSC 2024 分类
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');

for (const t of ['微PE工具箱_x64位_V2.3 维护增强版 (2026.09.06)', '优启通(EasyU) v3.7.2025.0326 官方VIP纯净版', '微PE工具箱 v2.3 官方正式版']) {
  const row = db.prepare('SELECT id FROM systems WHERE title = ?').get(t);
  if (row) {
    db.prepare('DELETE FROM download_links WHERE system_id = ?').run(row.id);
    db.prepare('DELETE FROM systems WHERE id = ?').run(row.id);
    console.log('已清理 PE 工具条目 #' + row.id, ':', t.slice(0, 26));
  }
}

const r = db.prepare("UPDATE systems SET category='win11' WHERE category='other' AND (title LIKE '%LTSC 2024%' OR title LIKE '%IoT 企业版%')").run();
console.log('IoT/LTSC2024 分类修正:', r.changes, '条');

const byCat = db.prepare("SELECT category, COUNT(*) AS n FROM systems GROUP BY category ORDER BY n DESC").all();
console.log('最终分类分布:', byCat.map(x => `${x.category}:${x.n}`).join(', '));
console.log('最终总数:', db.prepare('SELECT COUNT(*) AS n FROM systems').get().n,
  '| 链接:', db.prepare('SELECT COUNT(*) AS n FROM download_links').get().n);
