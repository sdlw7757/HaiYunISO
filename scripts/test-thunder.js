// 验证 thunder 解码逻辑 + 页面新代码
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
const th = db.prepare("SELECT url FROM download_links WHERE url LIKE 'thunder%' LIMIT 1").get();
function decodeThunder(u) {
  try {
    const b64 = u.replace(/^thunder:\/\//i, '');
    let s = Buffer.from(b64, 'base64').toString('utf8');
    if (s.startsWith('AA')) s = s.slice(2);
    if (s.endsWith('ZZ')) s = s.slice(0, -2);
    return /^https?:\/\//i.test(s) ? s : '';
  } catch { return ''; }
}
if (th) {
  const real = decodeThunder(th.url);
  console.log('原始:', th.url.slice(0, 40) + '…');
  console.log('解码:', real);
  console.log('host:', new URL(real).host);
} else console.log('无 thunder 链接');
