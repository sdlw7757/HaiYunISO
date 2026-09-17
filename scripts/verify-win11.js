const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');
function check(label, id, keep, drop) {
  const r = db.prepare('SELECT title, features FROM systems WHERE id=?').get(id);
  const f = r ? r.features || '' : '';
  console.log(`\n【${label}】#${id} ${(r?.title || '').slice(0, 40)}`);
  console.log('  应保留: ' + keep.map(k => `${k}${f.includes(k) ? '✓' : '✗'}`).join(' '));
  console.log('  应排除: ' + drop.map(k => `${k}${f.includes(k) ? '✗(仍在)' : '✓'}`).join(' '));
  console.log('  开头80字: ' + f.replace(/\s+/g, ' ').slice(0, 80));
}
check('xb21cn win11', 1, ['本版介绍', '详细特点'], ['更新日志', '应用下载', '系统截图', '文件信息']);
check('RTM集成 win11', 4, ['本版介绍', '详细特点'], ['应用下载', '应用预览']);
check('不忘初心 win11(2026)', 9, ['更新记录', '保留列表'], ['系统特色', '优化列表', '安装方法', '免责声明', '系统截图']);
check('不忘初心 win11(2023)', 69, ['更新记录', '保留列表'], ['系统特色', '系统集成', '优化列表', '系统截图']);
check('原版 win11(无本版介绍兜底)', 15, ['更新日志'], ['应用下载', '版本区别', '应用预览']);