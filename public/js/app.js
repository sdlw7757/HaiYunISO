// HAIYUN ISO 共享脚本：粒子背景 / 顶栏 / 工具函数
(function () {
  // ---------- 粒子网格背景 ----------
  const canvas = document.getElementById('particles');
  if (canvas && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const ctx = canvas.getContext('2d');
    let W, H, dots;
    const N = Math.min(110, Math.floor(window.innerWidth / 12));
    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    function init() {
      resize();
      dots = Array.from({ length: N }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
        r: Math.random() * 1.6 + .4,
      }));
    }
    function frame() {
      ctx.clearRect(0, 0, W, H);
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0 || d.x > W) d.vx *= -1;
        if (d.y < 0 || d.y > H) d.vy *= -1;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(125, 211, 252, .55)';
        ctx.fill();
      }
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i], b = dots[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < 150 * 150) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(56, 189, 248, ${0.09 * (1 - dist2 / 22500)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(frame);
    }
    init(); frame();
    window.addEventListener('resize', init);
  }

  // ---------- 背景装饰 ----------
  const bg = document.createElement('div');
  bg.innerHTML = '<div class="bg-grid"></div><div class="bg-glow g1"></div><div class="bg-glow g2"></div>';
  document.body.prepend(...bg.children);

  // ---------- 顶栏（相对路径，兼容 GitHub Pages 子目录部署） ----------
  const header = document.createElement('header');
  header.className = 'topbar';
  const here = location.pathname.split('/').pop() || 'index.html';
  const on = (p) => (p === 'index.html' ? here === '' || here === 'index.html' : here === p) ? ' class="on"' : '';
  header.innerHTML = `
    <div class="wrap">
      <a class="logo" href="./index.html">
        <span class="logo-mark">HI</span>
        <span><b>HAIYUN ISO</b><i>系统资源链接聚合 · 信息归档库</i></span>
      </a>
      <nav class="nav">
        <a href="./index.html"${on('index.html')}>首页</a>
        <a href="./list.html"${on('list.html')}>系统库</a>
        <a href="./disclaimer.html"${on('disclaimer.html')}>免责声明</a>
      </nav>
    </div>`;
  document.body.prepend(header);

  // ---------- 页脚 ----------
  const footer = document.createElement('footer');
  footer.innerHTML = `
    <div class="wrap">
      <span>© HAIYUN ISO · 系统资源链接聚合归档</span>
      <a href="./disclaimer.html">免责声明</a>
      <a href="./admin.html" id="footAdmin">后台管理</a>
      <span class="policy">本站聚合展示第三方来源站点的公开系统信息与下载链接，不存储、不托管任何镜像文件，资源仅供学习研究使用。</span>
    </div>`;
  document.body.appendChild(footer);

  // ---------- 工具函数 ----------
  // 部署模式自动探测：存在 data/stats.json → GitHub Pages 静态模式；否则走 Node 后端 API
  let MODE = 'server';
  let modePromise = null;
  function ensureMode() {
    if (!modePromise) {
      modePromise = (async () => {
        try {
          const r = await fetch('data/stats.json', { method: 'HEAD' });
          if (r.ok) {
            MODE = 'static';
            const fa = document.getElementById('footAdmin');
            if (fa) fa.remove(); // 静态站无后端，隐藏后台入口
          }
        } catch { /* 保持 server 模式 */ }
      })();
    }
    return modePromise;
  }

  // 静态模式：data/systems.json 缓存 + 客户端筛选/排序/分页（语义同 server.js listQuery）
  let _all = null;
  async function allSystems() {
    if (!_all) _all = (await rawJson('data/systems.json')).items;
    return _all;
  }
  async function rawJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw Object.assign(new Error('static api error'), { status: res.status });
    return res.json();
  }
  async function staticApi(pathname) {
    const [p, qs] = pathname.split('?');
    if (p === '/api/stats') return rawJson('data/stats.json');
    if (p.startsWith('/api/systems/')) return rawJson('data/systems/' + p.split('/').pop() + '.json');
    if (p === '/api/systems') {
      const q = new URLSearchParams(qs || '');
      const all = await allSystems();
      let list = all;
      const category = q.get('category');
      if (category && category !== 'all') list = list.filter(it => it.category === category);
      const sourceType = q.get('source_type');
      if (sourceType && sourceType !== 'all') list = list.filter(it => it.source_type === sourceType);
      const variant = q.get('variant');
      if (variant && variant !== 'all') list = list.filter(it => it.variant === variant || (it.variant || '').includes(variant));
      const updateType = q.get('update_type');
      if (updateType && updateType !== 'all') list = list.filter(it => (it.update_type || '').includes(updateType));
      const tag = q.get('tag');
      if (tag) list = list.filter(it => (it.tags || []).some(t => String(t).includes(tag)));
      const kw = (q.get('q') || '').toLowerCase();
      if (kw) list = list.filter(it =>
        [it.title, it.description, it.build, it.edition, it.features]
          .some(v => (v || '').toLowerCase().includes(kw)));
      const sort = q.get('sort');
      const rd = (it) => it.release_date || '';
      if (sort === 'hot') list = [...list].sort((a, b) => (b.view_count || 0) - (a.view_count || 0) || b.id - a.id);
      else if (sort === 'oldest') list = [...list].sort((a, b) => rd(a).localeCompare(rd(b)) || a.id - b.id);
      else list = [...list].sort((a, b) => rd(b).localeCompare(rd(a)) || b.id - a.id);
      const page = Math.max(1, Number(q.get('page') || 1));
      const pageSize = Math.min(48, Math.max(1, Number(q.get('page_size') || 12)));
      return { total: list.length, page, page_size: pageSize, items: list.slice((page - 1) * pageSize, page * pageSize) };
    }
    throw Object.assign(new Error('静态部署不支持该接口'), { status: 501 });
  }

  window.H = {
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
      ));
    },
    async api(pathname, opts = {}) {
      await ensureMode();
      if (MODE === 'static') return staticApi(pathname);
      const res = await fetch(pathname, opts);
      if (!res.ok) throw Object.assign(new Error('api error'), { status: res.status });
      return res.json();
    },
    catName(c) { return { win11: 'Windows 11', win10: 'Windows 10', win8: 'Windows 8', win7: 'Windows 7', xp: 'Windows XP', server: 'Windows Server', oem: 'OEM 定制', activator: '激活工具', other: '其他' }[c] || c || '未分类'; },
    badgeClass(c) { return ({ win11: 'c-win11', win10: 'c-win10', win8: 'c-server', win7: 'c-win10', xp: 'c-server', server: 'c-server', oem: 'c-oem', activator: 'c-activator' })[c] || ''; },
    srcTypeClass(t) {
      if (t === '不忘初心') return 't-bwcx';
      if (t === '原版') return 't-original';
      if (t && /精简|xb21cn/i.test(t)) return 't-lite';
      return '';
    },
    statusName(s) {
      return {
        ok: '链接已归档', gated: '源站受限', no_links: '暂无链接', pending: '待采集',
        placeholder: '空占位', success: '成功', partial: '部分完成', failed: '失败',
        running: '进行中', active: '活跃采集', passive_placeholder: '被动空占位',
      }[s] || s;
    },
    card(item) {
      const badges = [
        `<span class="badge ${H.badgeClass(item.category)}">${H.esc(H.catName(item.category))}</span>`,
        item.edition ? `<span class="badge">${H.esc(item.edition)}</span>` : '',
        item.build ? `<span class="badge">Build ${H.esc(item.build)}</span>` : '',
        item.source_type ? `<span class="badge ${H.srcTypeClass(item.source_type)}">${H.esc(item.source_type)}</span>` : '',
        item.variant ? `<span class="badge t-lite">${H.esc(item.variant)}</span>` : '',
        item.update_type ? `<span class="badge">${H.esc(item.update_type)}</span>` : '',
      ].filter(Boolean).join('');
      const tags = (item.tags || []).slice(0, 4).map(t => `<span class="tag">${H.esc(t)}</span>`).join('');
      const srcBadge = item.site_name
        ? `<span class="badge src">📡 来源 · ${H.esc(item.site_name)}</span>`
        : '';
      return `
        <div class="card">
          <div class="badges">${badges}${srcBadge}</div>
          <div class="t"><a href="./detail.html?id=${item.id}">${H.esc(item.title)}</a></div>
          ${tags ? `<div class="tags">${tags}</div>` : ''}
          <div class="desc">${H.esc(item.description || '暂无简介')}</div>
          <div class="meta">
            <span>📅 ${H.esc(item.release_date || '—')}</span>
            <span>👁 ${item.view_count || 0}</span>
            <a class="go" href="./detail.html?id=${item.id}">查看详情 →</a>
          </div>
        </div>`;
    },
    copy(text, btn) {
      const done = () => { if (btn) { const o = btn.textContent; btn.textContent = '✓ 已复制'; setTimeout(() => btn.textContent = o, 1200); } };
      const s = String(text || '');
      // Clipboard API 需安全上下文；不可用或失败时降级 execCommand（兼容局域网 IP 访问）
      const legacy = () => {
        try {
          const ta = document.createElement('textarea');
          ta.value = s;
          ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand('copy');
          ta.remove();
          if (ok) done();
        } catch { /* 忽略 */ }
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(s).then(done).catch(legacy);
      } else legacy();
    },
  };
})();
