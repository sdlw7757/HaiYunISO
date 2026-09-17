const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
const rows = db.prepare(`
  SELECT y.id, y.title, y.features, y.crawl_status FROM systems y JOIN sites s ON s.id=y.site_id
  WHERE y.title LIKE '%不忘初心%' ORDER BY y.id
`).all();
console.log('不忘初心 档案:', rows.length, '条');
const BAD = ['系统特色', '系统集成', '优化列表', '安装方法', '免责声明', '系统截图', '应用下载', '版本区别', '应用预览', '文件信息', '下载地址', '精简列表', '美化版特色', '游戏版特色'];
for (const r of rows) {
  const f = r.features || '';
  const leak = BAD.filter(k => f.includes(k));
  console.log(`#${r.id} [${r.crawl_status}] ${r.title.slice(0, 40)} | 更新记录:${f.includes('更新记录') ? '✓' : '✗'} 保留列表:${f.includes('保留列表') ? '✓' : '✗'} | 泄露: ${leak.length ? leak.join('/') : '无'}`);
}