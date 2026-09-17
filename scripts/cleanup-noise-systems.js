// 检查 other/无分类条目，清理明显非系统档案的遗留数据
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
const rows = db.prepare("SELECT id, title, category FROM systems WHERE category IN ('other') OR title LIKE '%无需安装%' OR title LIKE '%吊炸天%'").all();
console.log('待审查条目:');
rows.forEach(r => console.log(` #${r.id} [${r.category}] ${r.title}`));
const noise = rows.filter(r => /无需安装|吊炸天|概念|爆料|曝光|前瞻|预测|传闻/.test(r.title));
for (const n of noise) {
  db.prepare('DELETE FROM download_links WHERE system_id = ?').run(n.id);
  db.prepare('DELETE FROM systems WHERE id = ?').run(n.id);
  console.log('已清理:', n.id, n.title.slice(0, 30));
}
console.log('当前总数:', db.prepare('SELECT COUNT(*) AS n FROM systems').get().n,
  '| 链接:', db.prepare('SELECT COUNT(*) AS n FROM download_links').get().n);
