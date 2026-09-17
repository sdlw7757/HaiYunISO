// 采集 HTTP 层：UA、超时、重试、限速 + Cookie 会话（源站登录抓取用）
const config = require('../config');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchText(url, { timeout = config.CRAWL.TIMEOUT_MS, retry = config.CRAWL.RETRY } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retry; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      const res = await fetch(url, {
        headers: {
          'User-Agent': config.CRAWL.UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        redirect: 'follow',
        signal: ctl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      let text = buf.toString('utf8');
      // GBK 站点兜底解码
      if (/charset=["']?(gb2312|gbk)/i.test(text.slice(0, 2000))) {
        try { text = new TextDecoder('gbk').decode(buf); } catch { /* keep utf8 */ }
      }
      return text;
    } catch (e) {
      lastErr = e;
      if (attempt < retry) await sleep(1500);
    }
  }
  throw lastErr;
}

// ---------------- Cookie 会话（源站登录抓取） ----------------
// 手动跟随重定向，逐跳收集 set-cookie；供 WordPress 登录后抓取受限内容
class Session {
  constructor() { this.jar = new Map(); }

  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  store(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const c of list) {
      const pair = c.split(';')[0];
      const i = pair.indexOf('=');
      if (i > 0) this.jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }

  hasCookie(prefix) {
    return [...this.jar.keys()].some(k => k.startsWith(prefix));
  }

  // 单请求：手动重定向，返回 {status, ok, url, text}
  async request(url, { method = 'GET', body = null, headers = {}, timeout = config.CRAWL.TIMEOUT_MS, maxRedirects = 5 } = {}) {
    let cur = url;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      const hdrs = {
        'User-Agent': config.CRAWL.UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        ...headers,
      };
      if (this.jar.size) hdrs['Cookie'] = this.cookieHeader();
      if (body != null && !hdrs['Content-Type']) hdrs['Content-Type'] = 'application/x-www-form-urlencoded';
      const res = await fetch(cur, { method, body, headers: hdrs, redirect: 'manual', signal: ctl.signal });
      clearTimeout(timer);
      this.store(res);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (loc) { cur = new URL(loc, cur).href; continue; }
      }
      const buf = Buffer.from(await res.arrayBuffer());
      let text = buf.toString('utf8');
      if (/charset=["']?(gb2312|gbk)/i.test(text.slice(0, 2000))) {
        try { text = new TextDecoder('gbk').decode(buf); } catch { /* keep utf8 */ }
      }
      return { status: res.status, ok: res.ok, url: cur, text };
    }
    throw new Error('重定向次数超限');
  }

  // WordPress 标准登录：GET 收 testcookie → POST log/pwd → 302 落地
  async loginWp(loginUrl, { user, pass, referer } = {}) {
    await this.request(loginUrl); // 预取 Cookie（wordpress_test_cookie / CDN）
    await sleep(400);
    const body = new URLSearchParams({
      log: user, pwd: pass,
      rememberme: 'forever',
      'wp-submit': '登录',
      redirect_to: referer || loginUrl,
      testcookie: 'WP Cookie check',
    }).toString();
    const r = await this.request(loginUrl, { method: 'POST', body });
    return { ok: this.hasCookie('wordpress_logged_in'), status: r.status, url: r.url };
  }
}

module.exports = { fetchText, sleep, Session };
