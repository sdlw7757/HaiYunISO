const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
db.prepare("UPDATE sites SET base_url='https://www.52ybcj.com/system' WHERE code='ghozy'").run();
const s = db.prepare("SELECT code, base_url FROM sites WHERE code='ghozy'").get();
console.log('updated:', s.base_url);
