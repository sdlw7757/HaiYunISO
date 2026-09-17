// 删除分享迷 fenxm 全部相关数据
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');

const site = db.prepare("SELECT id, name FROM sites WHERE code = 'fenxm'").get();
if (!site) {
  console.log('未找到 fenxm 站点行');
} else {
  console.log('fenxm 站点 #' + site.id, site.name);
  const dl = db.prepare('DELETE FROM download_links WHERE site_id = ?').run(site.id);
  console.log('删除 download_links:', dl.changes, '条');
  const sys = db.prepare('DELETE FROM systems WHERE site_id = ?').run(site.id);
  console.log('删除 systems:', sys.changes, '条');
  const lg = db.prepare("DELETE FROM crawl_logs WHERE site_code = 'fenxm'").run();
  console.log('删除 crawl_logs:', lg.changes, '条');
  const s = db.prepare("DELETE FROM sites WHERE code = 'fenxm'").run();
  console.log('删除 sites 行:', s.changes, '条');
}
console.log('\n删除后统计:');
console.log('  systems:', db.prepare('SELECT COUNT(*) AS n FROM systems').get().n);
console.log('  links:', db.prepare('SELECT COUNT(*) AS n FROM download_links').get().n);
console.log('  sites:', db.prepare('SELECT code, name FROM sites ORDER BY id').all().map(r => r.code).join(', '));
