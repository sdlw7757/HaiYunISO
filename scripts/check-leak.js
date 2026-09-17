const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
for (const id of [9, 33]) {
  const r = db.prepare('SELECT title, features FROM systems WHERE id=?').get(id);
  const f = r.features || '';
  console.log(`\n===== #${id} ${r.title.slice(0, 40)} =====`);
  for (const kw of ['游戏版特色', '精简列表']) {
    let idx = f.indexOf(kw);
    if (idx >= 0) console.log(`  [${kw}] ...${f.slice(Math.max(0, idx - 40), idx + 50).replace(/\n/g, '⏎')}...`);
    else console.log(`  [${kw}] 无`);
  }
}