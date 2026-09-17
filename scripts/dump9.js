const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
const r = db.prepare('SELECT title, features FROM systems WHERE id=9').get();
const f = r.features || '';
console.log('features 总长:', f.length);
// 打印 更新记录 / 游戏版特色 / 保留列表 在 features 中的位置
for (const kw of ['更新记录', '游戏版特色', '系统特色', '保留列表', '优化列表']) {
  console.log(kw, '@', f.indexOf(kw));
}
console.log('\n--- features 完整内容（前 3000 字） ---');
console.log(f.slice(0, 3000));