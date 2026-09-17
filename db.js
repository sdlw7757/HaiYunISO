// HAIYUN ISO 数据库层（node:sqlite，零外部依赖）
// 设计原则：后台全字段存储（含下载链接），前端仅白名单投影（见 config.PUBLIC_FIELDS）
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true });
fs.mkdirSync(config.LOG_DIR, { recursive: true });

const db = new DatabaseSync(config.DB_PATH);

db.exec(`
PRAGMA busy_timeout = 5000;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT,
  last_crawled_at TEXT,
  last_crawl_status TEXT
);

CREATE TABLE IF NOT EXISTS systems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id),
  source_url TEXT NOT NULL,
  source_anchor TEXT,
  title TEXT NOT NULL,
  category TEXT,
  edition TEXT,
  build TEXT,
  arch TEXT,
  source_type TEXT,
  variant TEXT,
  update_type TEXT,
  tags TEXT,
  hardware_notes TEXT,
  description TEXT,
  features TEXT,
  release_date TEXT,
  file_name TEXT,
  file_size TEXT,
  md5 TEXT,
  sha256 TEXT,
  sha1 TEXT,
  keywords TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  crawl_status TEXT NOT NULL DEFAULT 'pending',
  gate_note TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE(site_id, source_url)
);
CREATE INDEX IF NOT EXISTS idx_systems_category ON systems(category);
CREATE INDEX IF NOT EXISTS idx_systems_site ON systems(site_id);
CREATE INDEX IF NOT EXISTS idx_systems_status ON systems(crawl_status);

CREATE TABLE IF NOT EXISTS download_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  system_id INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'other',
  provider TEXT,
  url TEXT NOT NULL,
  extract_code TEXT,
  raw_text TEXT,
  origin TEXT NOT NULL DEFAULT 'crawl',
  status TEXT NOT NULL DEFAULT 'unchecked',
  collected_at TEXT,
  UNIQUE(system_id, url)
);
CREATE INDEX IF NOT EXISTS idx_links_system ON download_links(system_id);

CREATE TABLE IF NOT EXISTS crawl_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_code TEXT,
  started_at TEXT,
  finished_at TEXT,
  status TEXT,
  pages_fetched INTEGER DEFAULT 0,
  systems_found INTEGER DEFAULT 0,
  links_found INTEGER DEFAULT 0,
  gated_count INTEGER DEFAULT 0,
  message TEXT
);
`);

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ---------- sites ----------
function ensureSites() {
  const get = db.prepare('SELECT id, name, base_url, status, note FROM sites WHERE code = ?');
  const ins = db.prepare('INSERT INTO sites (code, name, base_url, status, note) VALUES (?, ?, ?, ?, ?)');
  for (const s of config.SITES) {
    const row = get.get(s.code);
    if (!row) ins.run(s.code, s.name, s.base_url, s.status, s.note);
    else if (row.name !== s.name || row.base_url !== s.base_url || row.status !== s.status || row.note !== s.note) {
      db.prepare('UPDATE sites SET name=?, base_url=?, status=?, note=? WHERE id=?')
        .run(s.name, s.base_url, s.status, s.note, row.id);
    }
  }
}
ensureSites();

function getSiteByCode(code) {
  return db.prepare('SELECT * FROM sites WHERE code = ?').get(code);
}
function getSiteById(id) {
  return db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
}
function listSites() {
  return db.prepare('SELECT * FROM sites ORDER BY id').all();
}

// ---------- systems ----------
const SYS_COLS = [
  'site_id', 'source_url', 'source_anchor', 'title', 'category', 'edition', 'build', 'arch',
  'source_type', 'variant', 'update_type', 'tags', 'hardware_notes', 'description', 'features',
  'release_date', 'file_name', 'file_size', 'md5', 'sha256', 'sha1', 'keywords',
  'crawl_status', 'gate_note',
];

function upsertSystem(item) {
  const existing = db.prepare('SELECT id FROM systems WHERE site_id = ? AND source_url = ?')
    .get(item.site_id, item.source_url);
  const ts = now();
  if (existing) {
    const sets = [];
    const vals = [];
    for (const c of SYS_COLS) {
      if (item[c] !== undefined) { sets.push(`${c} = ?`); vals.push(item[c]); }
    }
    sets.push('updated_at = ?'); vals.push(ts);
    vals.push(existing.id);
    db.prepare(`UPDATE systems SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return { id: existing.id, created: false };
  }
  const cols = [...SYS_COLS, 'created_at', 'updated_at'];
  const vals = SYS_COLS.map(c => (item[c] !== undefined ? item[c] : null));
  vals.push(ts, ts);
  const r = db.prepare(
    `INSERT INTO systems (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
  ).run(...vals);
  return { id: Number(r.lastInsertRowid), created: true };
}

function getSystemFull(id) {
  return db.prepare('SELECT * FROM systems WHERE id = ?').get(id);
}

function getSystemFullJoined(id) {
  return db.prepare(
    'SELECT y.*, s.code AS site_code, s.name AS site_name FROM systems y JOIN sites s ON s.id = y.site_id WHERE y.id = ?'
  ).get(id);
}

function getSystemLinks(systemId) {
  return db.prepare('SELECT * FROM download_links WHERE system_id = ? ORDER BY id').all(systemId);
}

// ---------- download_links ----------
function upsertLink(link) {
  const existing = db.prepare('SELECT id, origin FROM download_links WHERE system_id = ? AND url = ?')
    .get(link.system_id, link.url);
  const ts = now();
  if (existing) {
    if (existing.origin === 'manual') return existing.id; // 手动补录的不覆盖
    db.prepare('UPDATE download_links SET link_type=?, provider=?, extract_code=?, raw_text=?, collected_at=? WHERE id=?')
      .run(link.link_type || 'other', link.provider || null, link.extract_code || null,
        link.raw_text || null, ts, existing.id);
    return existing.id;
  }
  const r = db.prepare(
    `INSERT INTO download_links (system_id, site_id, link_type, provider, url, extract_code, raw_text, origin, status, collected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'crawl', 'unchecked', ?)`
  ).run(link.system_id, link.site_id, link.link_type || 'other', link.provider || null,
    link.url, link.extract_code || null, link.raw_text || null, ts);
  return Number(r.lastInsertRowid);
}

function addLinkManual(systemId, { url, link_type, provider, extract_code, raw_text }) {
  const sys = getSystemFull(systemId);
  if (!sys) throw new Error('system not found');
  const existing = db.prepare('SELECT id FROM download_links WHERE system_id = ? AND url = ?').get(systemId, url);
  if (existing) return { id: existing.id, existed: true };
  const r = db.prepare(
    `INSERT INTO download_links (system_id, site_id, link_type, provider, url, extract_code, raw_text, origin, status, collected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', 'unchecked', ?)`
  ).run(systemId, sys.site_id, link_type || 'other', provider || null, url, extract_code || null, raw_text || null, now());
  // 手动补录后，若系统处于 gated/no_links 状态则升级为 ok
  if (sys.crawl_status !== 'ok') {
    db.prepare("UPDATE systems SET crawl_status='ok', gate_note=COALESCE(gate_note,'') || ' [人工补录]', updated_at=? WHERE id=?").run(now(), systemId);
  }
  return { id: Number(r.lastInsertRowid), existed: false };
}

function deleteLink(id) {
  db.prepare('DELETE FROM download_links WHERE id = ?').run(id);
}

// ---------- crawl_logs ----------
function startLog(siteCode) {
  const r = db.prepare('INSERT INTO crawl_logs (site_code, started_at, status) VALUES (?, ?, ?)')
    .run(siteCode, now(), 'running');
  return Number(r.lastInsertRowid);
}
function finishLog(id, patch) {
  db.prepare(
    `UPDATE crawl_logs SET finished_at=?, status=?, pages_fetched=?, systems_found=?, links_found=?, gated_count=?, message=? WHERE id=?`
  ).run(now(), patch.status, patch.pages_fetched || 0, patch.systems_found || 0,
    patch.links_found || 0, patch.gated_count || 0, patch.message || '', id);
  if (patch.site_code) {
    db.prepare('UPDATE sites SET last_crawled_at=?, last_crawl_status=? WHERE code=?')
      .run(now(), patch.status, patch.site_code);
  }
}
function listLogs(limit = 30) {
  return db.prepare('SELECT * FROM crawl_logs ORDER BY id DESC LIMIT ?').all(limit);
}
function clearLogs() {
  return db.prepare('DELETE FROM crawl_logs').run().changes;
}
function deleteLog(id) {
  return db.prepare('DELETE FROM crawl_logs WHERE id = ?').run(id).changes;
}

// ---------- 站点管理（自定义活跃采集站） ----------
function addSite({ code, name, base_url, note }) {
  code = String(code || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,24}$/.test(code)) throw new Error('站点代码需为 2-24 位小写字母/数字/连字符');
  if (!name || !base_url) throw new Error('名称与 URL 必填');
  if (getSiteByCode(code)) throw new Error(`站点代码 ${code} 已存在`);
  const r = db.prepare("INSERT INTO sites (code, name, base_url, status, note) VALUES (?, ?, ?, 'active', ?)")
    .run(code, String(name).trim(), String(base_url).trim(), note || '自定义站点');
  return getSiteById(Number(r.lastInsertRowid));
}
function setSiteStatus(code, status) {
  db.prepare('UPDATE sites SET status=? WHERE code=?').run(status === 'active' ? 'active' : 'paused', code);
  return getSiteByCode(code);
}
function deleteSite(code) {
  const site = getSiteByCode(code);
  if (!site) throw new Error('站点不存在');
  const links = db.prepare('DELETE FROM download_links WHERE site_id = ?').run(site.id).changes;
  const systems = db.prepare('DELETE FROM systems WHERE site_id = ?').run(site.id).changes;
  const logs = db.prepare('DELETE FROM crawl_logs WHERE site_code = ?').run(code).changes;
  db.prepare('DELETE FROM sites WHERE id = ?').run(site.id);
  return { site, systems, links, logs };
}

// ---------- 前端白名单投影 ----------
function toPublic(row) {
  if (!row) return null;
  const out = {};
  for (const f of config.PUBLIC_FIELDS) {
    out[f] = row[f];
  }
  // tags 以 JSON 数组形式返回
  if (typeof out.tags === 'string') {
    try { out.tags = JSON.parse(out.tags || '[]'); } catch { out.tags = []; }
  }
  if (Array.isArray(out.tags)) out.tags = out.tags;
  return out;
}

// ---------- 统计 ----------
function stats() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM systems WHERE is_active=1').get().n;
  const byCategory = db.prepare(
    "SELECT category, COUNT(*) AS n FROM systems WHERE is_active=1 GROUP BY category"
  ).all();
  const bySite = db.prepare(
    `SELECT s.code, s.name, s.status, s.note, s.last_crawled_at, s.last_crawl_status,
            COUNT(y.id) AS systems
       FROM sites s LEFT JOIN systems y ON y.site_id = s.id AND y.is_active=1
      GROUP BY s.id ORDER BY s.id`
  ).all();
  const byStatus = db.prepare(
    'SELECT crawl_status, COUNT(*) AS n FROM systems WHERE is_active=1 GROUP BY crawl_status'
  ).all();
  const linkTotal = db.prepare(
    'SELECT COUNT(*) AS n FROM download_links l JOIN systems y ON y.id=l.system_id WHERE y.is_active=1'
  ).get().n;
  const gated = db.prepare(
    "SELECT COUNT(*) AS n FROM systems WHERE is_active=1 AND crawl_status='gated'"
  ).get().n;
  return { total, byCategory, bySite, byStatus, linkTotal, gated };
}

module.exports = {
  db, now,
  getSiteByCode, getSiteById, listSites,
  upsertSystem, getSystemFull, getSystemFullJoined, getSystemLinks,
  upsertLink, addLinkManual, deleteLink,
  startLog, finishLog, listLogs, clearLogs, deleteLog,
  addSite, setSiteStatus, deleteSite,
  toPublic, stats,
};
