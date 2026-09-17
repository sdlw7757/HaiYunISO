// 最终验证：OEM 数据 + 详情下载链接 + 页面
const BASE = 'http://127.0.0.1:3088';
const TOKEN = process.env.HAIYUN_ADMIN_TOKEN || 'haiyun-admin';
const j = async (p, o) => { const r = await fetch(BASE + p, o); return { status: r.status, body: await r.json().catch(() => null) }; };

(async () => {
  const s = await j('/api/stats');
  console.log('== 分类分布 ==');
  s.body.byCategory.forEach(c => console.log(`  ${c.category}: ${c.n}`));
  const oem = s.body.byCategory.find(c => c.category === 'oem');
  console.log('OEM 分类: ' + (oem ? oem.n : 0) + ' 条', oem && oem.n > 0 ? '✅' : '❌');

  console.log('\n== OEM 列表 ==');
  const oemList = await j('/api/systems?category=oem&page_size=5');
  oemList.body.items.forEach(x => console.log(`  #${x.id} [${x.source_type}] ${x.title.slice(0, 40)}`));

  console.log('\n== 详情接口返回下载链接 ==');
  // 取一个 52ybcj 原版（有链接）与一个 msdngho OEM
  const d1 = await j('/api/systems/' + oemList.body.items[0].id);
  console.log(`OEM 详情 #${d1.body.item.id}: 链接数 ${(d1.body.links || []).length}`);
  (d1.body.links || []).slice(0, 6).forEach(l => console.log(`   [${l.link_type}/${l.provider}] ${l.url.slice(0, 74)}${l.extract_code ? ' 码:' + l.extract_code : ''}`));

  const w11 = await j('/api/systems?category=win11&source_type=%E5%8E%9F%E7%89%88&page_size=1');
  const d2 = await j('/api/systems/' + w11.body.items[0].id);
  console.log(`\nWin11 原版详情 #${d2.body.item.id}: ${d2.body.item.title.slice(0, 30)} | 链接数 ${(d2.body.links || []).length}`);
  (d2.body.links || []).slice(0, 4).forEach(l => console.log(`   [${l.link_type}/${l.provider}] ${l.url.slice(0, 74)}${l.extract_code ? ' 码:' + l.extract_code : ''}`));

  // 受限档案（fenxm 不忘初心）→ 应有 source_url 兜底
  const gated = await j('/api/systems?source_type=%E4%B8%8D%E5%BF%98%E5%88%9D%E5%BF%83&page_size=1');
  const dg = await j('/api/systems/' + gated.body.items[0].id);
  console.log(`\n受限档案 #${dg.body.item.id}: 链接 ${(dg.body.links || []).length} 条 | 来源站兜底: ${dg.body.item.source_url ? '有 ✅' : '无 ❌'}`);

  console.log('\n== 后台总览 ==');
  const ov = await j('/api/admin/overview', { headers: { 'x-admin-token': TOKEN } });
  console.log(`档案 ${ov.body.stats.total} | 链接 ${ov.body.stats.linkTotal} | 受限 ${ov.body.stats.gated} | 三站: ${ov.body.bySite.map(x => `${x.code}=${x.systems}`).join(' ')}`);

  console.log('\n== 页面 ==');
  for (const p of ['/', '/list.html', '/disclaimer.html', '/admin.html']) {
    const r = await fetch(BASE + p);
    console.log(`${p} => ${r.status}`);
  }
})().catch(e => { console.error('验证失败:', e.message); process.exit(1); });