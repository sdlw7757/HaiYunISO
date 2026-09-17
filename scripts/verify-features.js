const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/haiyun.db');

function check(label, id, keep, drop) {
  const row = db.prepare('SELECT s.title, s.features, s.description, s.crawl_status FROM systems s JOIN sites t ON t.id=s.site_id WHERE s.id=?').get(id);
  if (!row) { console.log(label, ': 未找到 #' + id); return; }
  const f = row.features || '';
  console.log(`\n===== ${label} #${id} [${row.crawl_status}] ${row.title.slice(0, 40)} =====`);
  const keepHits = keep.filter(k => f.includes(k));
  const dropHits = drop.filter(k => f.includes(k));
  console.log('  应保留: ' + keep.map(k => `${k}${f.includes(k) ? '✓' : '✗'}`).join(' '));
  console.log('  应排除: ' + drop.map(k => `${k}${f.includes(k) ? '✗(仍在)' : '✓(已排除)'}`).join(' '));
  console.log('  features 前120字: ' + f.replace(/\s+/g, ' ').slice(0, 120));
}

// 52ybcj 原版（应只有 更新日志）
const w11 = db.prepare("SELECT id,title FROM systems WHERE site_id=(SELECT id FROM sites WHERE code='52ybcj') AND source_type='原版' AND build IS NOT NULL LIMIT 1").get();
if (w11) check('52ybcj 原版', w11.id, ['更新日志', '集成功能', '集成补丁'], ['应用下载', '版本区别', '应用预览', '免责']);

// msdngho win11 原版（应有 系统特色/系统智能/系统更新日志/集成软件；排除 安装方法/常见问题/免责）
const m = db.prepare("SELECT id,title FROM systems WHERE site_id=(SELECT id FROM sites WHERE code='msdngho') AND category IN ('win11','win10') LIMIT 1").get();
if (m) check('msdngho win11/10', m.id, ['系统特色', '系统智能与自动技术', '系统更新日志', '集成软件'], ['安装方法', '常见问题', '免责条款', 'U盘']);

// msdngho OEM（同样裁剪）
const mo = db.prepare("SELECT id,title FROM systems WHERE site_id=(SELECT id FROM sites WHERE code='msdngho') AND category='oem' LIMIT 1").get();
if (mo) check('msdngho OEM', mo.id, ['系统特色', '系统智能与自动技术', '系统更新日志', '集成软件'], ['安装方法', '常见问题', '免责条款', 'U盘']);

// 无字幕情况统计：多少条 features 为空
const empty = db.prepare("SELECT COUNT(*) AS n FROM systems WHERE features IS NULL OR trim(features)=''").get().n;
console.log('\nfeatures 为空的档案数: ' + empty);