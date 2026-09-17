// 端到端验证：公共 API 白名单 / 后台 API / 数据抽查
const BASE = 'http://127.0.0.1:3088';
const TOKEN = process.env.HAIYUN_ADMIN_TOKEN || 'haiyun-admin';

async function j(pathname, opts) {
  const r = await fetch(BASE + pathname, opts);
  return { status: r.status, body: await r.json().catch(() => null) };
}

(async () => {
  console.log('== 1. 公共 stats ==');
  const s = await j('/api/stats');
  console.log('status:', s.status, '| total:', s.body.total, '| 分类:', JSON.stringify(s.body.byCategory),
    '| 站点:', s.body.sites.map(x => `${x.name}:${x.status}:${x.systems}`).join(' | '));

  console.log('\n== 2. 列表 API（白名单检查）==');
  const list = await j('/api/systems?page_size=3&sort=latest');
  console.log('total:', list.body.total, '返回条数:', list.body.items.length);
  const item = list.body.items[0];
  console.log('字段白名单:', Object.keys(item).sort().join(','));
  const leaked = Object.keys(item).filter(k => /source_url|gate|crawl_status|created_at|updated/i.test(k));
  console.log('泄漏字段检查:', leaked.length === 0 ? '✅ 无泄漏' : '❌ ' + leaked.join(','));

  console.log('\n== 3. 搜索与筛选 ==');
  const q1 = await j('/api/systems?q=26100&page_size=5');
  console.log('搜索 26100:', q1.body.total, '条 |', q1.body.items.slice(0, 3).map(x => x.title.slice(0, 28)).join(' / '));
  const q2 = await j('/api/systems?category=win11&source_type=%E4%B8%8D%E5%BF%98%E5%88%9D%E5%BF%83&page_size=3');
  console.log('Win11+不忘初心:', q2.body.total, '条');
  const q3 = await j('/api/systems?variant=%E6%B8%B8%E6%88%8F%E7%89%88&page_size=3');
  console.log('游戏版:', q3.body.total, '条');
  const q4 = await j('/api/systems?sort=hot&page_size=3');
  console.log('热门排序 top:', q4.body.items.map(x => `#${x.id} 浏览${x.view_count}`).join(', '));

  console.log('\n== 4. 详情 API（白名单 + 浏览计数）==');
  const d1 = await j('/api/systems/' + item.id);
  console.log('status:', d1.status, '| view:', d1.body.item.view_count);
  const d2 = await j('/api/systems/' + item.id);
  console.log('再次访问 view:', d2.body.item.view_count, d2.body.item.view_count === d1.body.item.view_count + 1 ? '✅ 递增' : '❌');
  console.log('样例:', JSON.stringify({ t: d2.body.item.title, build: d2.body.item.build, sha256: (d2.body.item.sha256 || '').slice(0, 16) + '…', tags: d2.body.item.tags }));

  console.log('\n== 5. 后台 API 鉴权 ==');
  const noAuth = await j('/api/admin/overview');
  console.log('无令牌:', noAuth.status, noAuth.status === 401 ? '✅ 拒绝' : '❌');
  const badAuth = await j('/api/admin/overview', { headers: { 'x-admin-token': 'wrong' } });
  console.log('错误令牌:', badAuth.status, badAuth.status === 401 ? '✅ 拒绝' : '❌');
  const ov = await j('/api/admin/overview', { headers: { 'x-admin-token': TOKEN } });
  console.log('正确令牌:', ov.status, '| 档案:', ov.body.stats.total, '| 链接:', ov.body.stats.linkTotal, '| 受限:', ov.body.stats.gated);
  console.log('链接类型分布:', ov.body.linksByType.slice(0, 8).map(x => `${x.link_type}/${x.provider}:${x.n}`).join(', '));
  console.log('最近日志:', ov.body.logs.slice(0, 2).map(l => `${l.site_code}:${l.status}`).join(', '));

  console.log('\n== 6. 后台档案全字段（含下载链接）==');
  const sys = await j('/api/admin/systems?status=ok&page_size=1', { headers: { 'x-admin-token': TOKEN } });
  const sid = sys.body.items[0].id;
  const full = await j('/api/admin/systems/' + sid, { headers: { 'x-admin-token': TOKEN } });
  console.log(`档案 #${sid} [${full.body.item.site_code}] ${full.body.item.title.slice(0, 34)}`);
  console.log('状态:', full.body.item.crawl_status, '| Build:', full.body.item.build, '| SHA256:', (full.body.item.sha256 || '—').slice(0, 16) + '…');
  full.body.links.forEach(l => console.log(`  🔗 [${l.link_type}/${l.provider}] ${l.url.slice(0, 80)}${l.extract_code ? ' 码:' + l.extract_code : ''}`));

  console.log('\n== 7. 手动补录链接测试 ==');
  const add = await fetch(`${BASE}/api/admin/systems/${sid}/links`, {
    method: 'POST',
    headers: { 'x-admin-token': TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://pan.baidu.com/s/test-manual-xyz?pwd=hy99', link_type: 'netdisk', provider: 'baidu', extract_code: 'hy99' }),
  });
  const addBody = await add.json();
  console.log('补录:', add.status, JSON.stringify(addBody), addBody.existed === false ? '✅' : '⚠️');
  // 清理测试数据
  if (addBody.id) {
    await fetch(`${BASE}/api/admin/links/${addBody.id}`, { method: 'DELETE', headers: { 'x-admin-token': TOKEN } });
    console.log('测试链接已删除');
  }

  console.log('\n== 8. 页面可达性 ==');
  for (const p of ['/', '/list.html', '/detail.html?id=' + sid, '/disclaimer.html', '/admin.html']) {
    const r = await fetch(BASE + p);
    console.log(`${p} => ${r.status} ${r.status === 200 ? '✅' : '❌'}`);
  }
})().catch(e => { console.error('验证失败:', e.message); process.exit(1); });
