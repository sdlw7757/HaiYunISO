// HAIYUN ISO 服务端：静态页面 + 公共白名单 API + 后台管理 API（Token 保护）
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const dbm = require('./db');
const crawler = require('./crawler/crawler');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function sendJSON(res, status, obj) { send(res, status, JSON.stringify(obj)); }

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

// ---------------- 公共 API（严格白名单，绝不输出下载链接 / source_url） ----------------
function apiStats(res) {
  const s = dbm.stats();
  // 数据更新时间：取各站点最近一次采集时间（任意站有记录即为最新）
  const last = s.bySite.map(x => x.last_crawled_at).filter(Boolean).sort().reverse()[0] || null;
  sendJSON(res, 200, {
    total: s.total,
    updated_at: last, // 数据更新时间（最近采集时刻）
    byCategory: s.byCategory,
    byStatus: s.byStatus,
    sites: s.bySite.map(x => ({
      name: x.name, status: x.status, note: x.note,
      last_crawled_at: x.last_crawled_at, last_crawl_status: x.last_crawl_status,
      systems: x.systems,
    })),
  });
}

function listQuery(url) {
  const q = url.searchParams;
  const page = Math.max(1, Number(q.get('page') || 1));
  const pageSize = Math.min(48, Math.max(1, Number(q.get('page_size') || 12)));
  const where = ['is_active = 1'];
  const vals = [];
  const category = q.get('category');
  if (category && category !== 'all') { where.push('category = ?'); vals.push(category); }
  const sourceType = q.get('source_type');
  if (sourceType && sourceType !== 'all') { where.push('source_type = ?'); vals.push(sourceType); }
  const variant = q.get('variant');
  if (variant && variant !== 'all') { where.push('(variant = ? OR variant LIKE ?)'); vals.push(variant, `%${variant}%`); }
  const updateType = q.get('update_type');
  if (updateType && updateType !== 'all') { where.push('update_type LIKE ?'); vals.push(`%${updateType}%`); }
  const tag = q.get('tag');
  if (tag) { where.push('tags LIKE ?'); vals.push(`%${tag}%`); }
  const kw = q.get('q');
  if (kw) {
    where.push('(title LIKE ? OR description LIKE ? OR build LIKE ? OR edition LIKE ? OR features LIKE ?)');
    const like = `%${kw}%`;
    vals.push(like, like, like, like, like);
  }
  const sort = q.get('sort') === 'hot' ? 'view_count DESC, id DESC'
    : q.get('sort') === 'oldest' ? 'release_date ASC, id ASC'
      : 'release_date DESC, id DESC'; // latest 默认
  return { where, vals, page, pageSize, sort };
}

function apiSystems(req, res, url) {
  const { where, vals, page, pageSize, sort } = listQuery(url);
  const wsql = where.join(' AND ');
  const total = dbm.db.prepare(`SELECT COUNT(*) AS n FROM systems WHERE ${wsql}`).get(...vals).n;
  const rows = dbm.db.prepare(
    `SELECT y.*, s.code AS site_code, s.name AS site_name
       FROM systems y JOIN sites s ON s.id = y.site_id
      WHERE ${wsql} ORDER BY ${sort} LIMIT ? OFFSET ?`
  ).all(...vals, pageSize, (page - 1) * pageSize);
  sendJSON(res, 200, {
    total, page, page_size: pageSize,
    items: rows.map(dbm.toPublic),
  });
}

function apiSystemDetail(res, id) {
  const row = dbm.getSystemFullJoined(Number(id));
  if (!row || !row.is_active) return sendJSON(res, 404, { error: 'not found' });
  dbm.db.prepare('UPDATE systems SET view_count = view_count + 1 WHERE id = ?').run(row.id);
  row.view_count += 1;
  // 详情页对外提供聚合下载链接（仅链接字段，不含后台采集元数据）
  const links = dbm.getSystemLinks(row.id).map(l => ({
    id: l.id,
    link_type: l.link_type,
    provider: l.provider,
    url: l.url,
    extract_code: l.extract_code,
  }));
  sendJSON(res, 200, {
    item: { ...dbm.toPublic(row), source_url: row.source_url },
    links,
  });
}

// ---------------- 后台 API（无登录，输出全部字段含下载链接） ----------------
function apiAdmin(req, res, url, pathname) {
  const sub = pathname.replace(/^\/api\/admin/, '');

  if (sub === '/overview' && req.method === 'GET') {
    const s = dbm.stats();
    const bySite = dbm.db.prepare(`
      SELECT s.code, s.name, s.status, s.note, s.last_crawled_at, s.last_crawl_status,
             COUNT(DISTINCT y.id) AS systems
        FROM sites s LEFT JOIN systems y ON y.site_id = s.id
       GROUP BY s.id ORDER BY s.id`).all();
    const linksByType = dbm.db.prepare(
      'SELECT link_type, provider, COUNT(*) AS n FROM download_links GROUP BY link_type, provider ORDER BY n DESC').all();
    return sendJSON(res, 200, {
      stats: s, bySite, linksByType, logs: dbm.listLogs(30),
      crawl_running: crawler.isRunning(),
    });
  }

  if (sub === '/systems' && req.method === 'GET') {
    const q = url.searchParams;
    const page = Math.max(1, Number(q.get('page') || 1));
    const pageSize = Math.min(100, Math.max(1, Number(q.get('page_size') || 20)));
    const where = ['1=1']; const vals = [];
    const site = q.get('site');
    if (site && site !== 'all') { where.push('s.code = ?'); vals.push(site); }
    const status = q.get('status');
    if (status && status !== 'all') { where.push('y.crawl_status = ?'); vals.push(status); }
    const category = q.get('category');
    if (category && category !== 'all') { where.push('y.category = ?'); vals.push(category); }
    const kw = q.get('q');
    if (kw) { where.push('(y.title LIKE ? OR y.build LIKE ?)'); vals.push(`%${kw}%`, `%${kw}%`); }
    const wsql = where.join(' AND ');
    const total = dbm.db.prepare(
      `SELECT COUNT(*) AS n FROM systems y JOIN sites s ON s.id=y.site_id WHERE ${wsql}`).get(...vals).n;
    const rows = dbm.db.prepare(`
      SELECT y.*, s.code AS site_code, s.name AS site_name,
             (SELECT COUNT(*) FROM download_links l WHERE l.system_id = y.id) AS link_count
        FROM systems y JOIN sites s ON s.id = y.site_id
       WHERE ${wsql} ORDER BY y.id DESC LIMIT ? OFFSET ?`).all(...vals, pageSize, (page - 1) * pageSize);
    return sendJSON(res, 200, { total, page, page_size: pageSize, items: rows });
  }

  let m;
  if ((m = sub.match(/^\/systems\/(\d+)$/)) && req.method === 'GET') {
    const row = dbm.getSystemFull(Number(m[1]));
    if (!row) return sendJSON(res, 404, { error: 'not found' });
    const site = dbm.getSiteById(row.site_id);
    return sendJSON(res, 200, {
      item: { ...row, site_code: site?.code, site_name: site?.name },
      links: dbm.getSystemLinks(row.id),
    });
  }

  if ((m = sub.match(/^\/systems\/(\d+)\/links$/)) && req.method === 'POST') {
    readBody(req).then(body => {
      if (!body.url) return sendJSON(res, 400, { error: 'url required' });
      try {
        const r = dbm.addLinkManual(Number(m[1]), body);
        sendJSON(res, 200, r);
      } catch (e) { sendJSON(res, 400, { error: e.message }); }
    });
    return;
  }

  if ((m = sub.match(/^\/links\/(\d+)$/)) && req.method === 'DELETE') {
    dbm.deleteLink(Number(m[1]));
    return sendJSON(res, 200, { ok: true });
  }

  if (sub === '/crawl' && req.method === 'POST') {
    readBody(req).then(body => {
      const site = String(body.site || 'active');
      try {
        // 异步执行，立即返回；进度见 /api/admin/overview 的 logs
        crawler.runCrawl(site).catch(e => console.error('crawl error:', e.message));
        sendJSON(res, 200, { started: true, site });
      } catch (e) { sendJSON(res, 409, { error: e.message }); }
    });
    return;
  }

  // 采集日志清理：全部 / 单条
  if (sub === '/logs' && req.method === 'DELETE') {
    return sendJSON(res, 200, { ok: true, cleared: dbm.clearLogs() });
  }
  if ((m = sub.match(/^\/logs\/(\d+)$/)) && req.method === 'DELETE') {
    return sendJSON(res, 200, { ok: true, cleared: dbm.deleteLog(Number(m[1])) });
  }

  // 站点管理：自定义添加 / 删除 / 启用停用（决定"采集活跃站"的目标集合）
  if (sub === '/sites' && req.method === 'POST') {
    readBody(req).then(body => {
      try { sendJSON(res, 200, { ok: true, site: dbm.addSite(body) }); }
      catch (e) { sendJSON(res, 400, { error: e.message }); }
    });
    return;
  }
  if ((m = sub.match(/^\/sites\/([a-z0-9_-]+)\/status$/)) && req.method === 'PATCH') {
    readBody(req).then(body => {
      try { sendJSON(res, 200, { ok: true, site: dbm.setSiteStatus(m[1], body.status) }); }
      catch (e) { sendJSON(res, 400, { error: e.message }); }
    });
    return;
  }
  if ((m = sub.match(/^\/sites\/([a-z0-9_-]+)$/)) && req.method === 'DELETE') {
    try { sendJSON(res, 200, { ok: true, ...dbm.deleteSite(m[1]) }); }
    catch (e) { sendJSON(res, 400, { error: e.message }); }
    return;
  }

  sendJSON(res, 404, { error: 'not found' });
}

// ---------------- 静态资源 ----------------
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel === '/list' || rel === '/detail' || rel === '/disclaimer' || rel === '/admin') rel += '.html';
  const file = path.normalize(path.join(config.PUBLIC_DIR, rel));
  if (!file.startsWith(config.PUBLIC_DIR)) return send(res, 403, 'forbidden', 'text/plain');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, '404 Not Found', 'text/plain; charset=utf-8');
    send(res, 200, buf, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
}

// ---------------- 路由 ----------------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/admin/')) return apiAdmin(req, res, url, pathname);
  if (pathname === '/api/stats') return apiStats(res);
  if (pathname === '/api/systems') return apiSystems(req, res, url);
  let m;
  if ((m = pathname.match(/^\/api\/systems\/(\d+)$/))) return apiSystemDetail(res, m[1]);
  if (pathname.startsWith('/api/')) return sendJSON(res, 404, { error: 'not found' });

  return serveStatic(req, res, pathname);
});

server.listen(config.PORT, config.HOST, () => {
  console.log(`HAIYUN ISO 已启动: http://${config.HOST}:${config.PORT}`);
  console.log(`后台管理: http://${config.HOST}:${config.PORT}/admin （无登录，仅限内网/本机使用）`);
});

module.exports = server;
