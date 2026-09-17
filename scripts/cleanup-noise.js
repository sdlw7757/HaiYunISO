// 一次性清理：删除噪音 other 链接
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
const r = db.prepare("DELETE FROM download_links WHERE link_type='other'").run();
console.log('清理 other 噪音链接:', r.changes, '条');
const n = db.prepare('SELECT COUNT(*) AS n FROM download_links').get().n;
console.log('剩余归档链接:', n, '条');
