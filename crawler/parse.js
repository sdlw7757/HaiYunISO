// 通用 HTML 解析与资源链接分类
const P = {};

P.stripTags = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&#x?[0-9a-fA-F]+;/g, ' ')
  .replace(/[ \t\r]+/g, ' ')
  .replace(/\n{2,}/g, '\n')
  .trim();

P.stripTagsKeepBreaks = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h[1-6]|tr)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/[ \t\r]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// ---------- 网盘 / 直链识别 ----------
const PROVIDERS = [
  [/pan\.baidu\.com/i, 'baidu', '百度网盘'],
  [/(\.|^)189\.cn$/i, '189', '天翼云盘'],
  [/pan\.quark\.cn/i, 'quark', '夸克网盘'],
  [/(aliyundrive\.com|alipan\.com)/i, 'aliyun', '阿里云盘'],
  [/lanzou[a-z]?\.(com|cc|vip|icu)/i, 'lanzou', '蓝奏云'],
  [/pan\.xunlei\.com/i, 'xunlei', '迅雷云盘'],
  [/(1drv\.ms|onedrive\.live\.com|sharepoint\.com)/i, 'onedrive', 'OneDrive'],
  [/123pan\.com|123684\.com/i, '123pan', '123云盘'],
  [/(weiyun\.com)/i, 'weiyun', '腾讯微云'],
  [/caiyun\.139\.com/i, 'mobile', '中国移动云盘'],
  [/mega\.nz/i, 'mega', 'MEGA'],
  [/ctfile\.com/i, 'ctfile', '城通网盘'],
  [/115\.com/i, '115', '115网盘'],
  [/wenshushu\.cn/i, 'wss', '文叔叔'],
];

P.classifyLink = (url) => {
  let u = url;
  if (/^magnet:/i.test(u)) return { link_type: 'magnet', provider: 'magnet', label: '磁力链接' };
  if (/^ed2k:/i.test(u)) return { link_type: 'ed2k', provider: 'ed2k', label: 'eD2K' };
  if (/^thunder:/i.test(u)) return { link_type: 'thunder', provider: 'thunder', label: '迅雷' };
  let m;
  for (const [re, provider, label] of PROVIDERS) {
    if (re.test(u)) return { link_type: 'netdisk', provider, label };
  }
  m = u.match(/\.(iso|esd|gho|wim|zip|rar|7z)(\?|#|$)/i);
  if (m) return { link_type: 'direct', provider: 'direct', label: `${m[1].toUpperCase()} 直链` };
  // 目录型直链（/drive/xxx.iso 已在上面覆盖；这里兜底常见文件服务路径）
  if (/\/(drive|dl|download|file)s?\//i.test(u)) return { link_type: 'direct', provider: 'direct', label: '直链' };
  return { link_type: 'other', provider: 'other', label: '其他' };
};

P.extractLinks = (html, baseUrl = '') => {
  const out = [];
  const seen = new Set();
  const push = (url, rawText) => {
    url = url.trim().replace(/&amp;/g, '&');
    if (!url || seen.has(url)) return;
    if (!/^(https?|magnet|ed2k|thunder):/i.test(url)) return;
    seen.add(url);
    const c = P.classifyLink(url);
    out.push({ url, raw_text: (rawText || '').slice(0, 500), ...c });
  };
  // 1. anchor 标签
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    push(m[1], P.stripTags(m[2]));
  }
  // 2. 裸协议链接（magnet/ed2k/thunder 常不以 <a> 出现）
  for (const m of html.matchAll(/(magnet:\?xt=urn:btih:[A-Za-z0-9&=%._~-]+)/g)) push(m[1], '磁力');
  for (const m of html.matchAll(/(ed2k:\/\/\|file\|[^<"'|\s]+)/g)) push(m[1], 'eD2K');
  // 3. 文本中的裸 URL（仅网盘/直链特征，避免噪音）
  for (const m of html.matchAll(/(https?:\/\/[^\s"'<>（）《》【】,，]+(?:pan\.baidu|pan\.quark|lanzou|aliyundrive|alipan|cloud\.189|123pan|caiyun\.139|weiyun|1drv|mega\.nz)[^\s"'<>（）《》【】,，]*)/gi)) {
    push(m[1], '裸链');
  }
  for (const m of html.matchAll(/(https?:\/\/[^\s"'<>（）《》【】,，]+?\.(?:iso|esd|gho|wim))(?:\?[^"'<\s]*)?/gi)) {
    push(m[1], '文件直链');
  }
  return out;
};

// 提取码：链接邻近文本或 URL 参数
P.extractCode = (url, nearbyText = '') => {
  let m = url.match(/[?&](?:pwd|p|pass(?:word)?)=([0-9a-zA-Z]{4})/i);
  if (m) return m[1];
  m = nearbyText.match(/(?:提取码|提取密码|提码|访问码|密码)\s*[：:为]?\s*([0-9a-zA-Z]{4})\b/);
  if (m) return m[1];
  return null;
};

// ---------- 系统字段识别 ----------
P.categoryOf = (title = '') => {
  if (/Windows\s*Server|Server\s*20\d\d/i.test(title)) return 'server';
  // OEM / 品牌机系统优先于版本号判断（如"联想台式&笔记本系统 Windows 11 64位 OEM 安装版"）
  if (/OEM|品牌机|原装系统|笔记本系统|台式.{0,4}笔记本系统|联想|戴尔|惠普|华硕|华为|小米|宏碁|三星|索尼|苹果/i.test(title)) return 'oem';
  if (/Win\s*11|Windows\s*11/i.test(title)) return 'win11';
  if (/LTSC\s*2024|IoT 企业版|26100|26200|28000|28120/i.test(title)) return 'win11'; // Win11 内核兜底
  if (/Win\s*10|Windows\s*10/i.test(title)) return 'win10';
  if (/Win\s*8(\.1)?|Windows\s*8(\.1)?/i.test(title)) return 'win8';
  if (/Win\s*7|Windows\s*7/i.test(title)) return 'win7';
  if (/Win\s*XP|Windows\s*XP|\bXP\b/i.test(title)) return 'xp';
  return 'other';
};

P.editionOf = (title = '') => {
  const m = title.match(/(26H1|25H2|24H2|23H2|22H2|21H2|LTSC\s*20\d{2}|LTSC)/i);
  if (m) return m[1].toUpperCase().replace(/\s+/g, '');
  const y = title.match(/(20\d\d)(?![\d-])/);
  if (y && /Server/.test(title)) return y[1];
  return null;
};

P.buildOf = (title = '', content = '') => {
  const sources = [title, String(content).slice(0, 4000)];
  for (const s of sources) {
    let m = s.match(/[（(](\d{5}(?:\.\d+)?)[）)]/);
    if (m) return m[1];
    m = s.match(/(?:内部版本|Build|版本号)\s*[：:]?\s*(\d{5}(?:\.\d+)?)/i);
    if (m) return m[1];
  }
  return null;
};

P.archOf = (title = '') => {
  if (/ARM64|arm64/i.test(title)) return 'arm64';
  if (/X86|x86|32位/i.test(title)) return 'x86';
  if (/X64|x64|64位/i.test(title)) return 'x64';
  return null;
};

P.sourceTypeOf = (title = '', content = '') => {
  const s = `${title} ${String(content).slice(0, 500)}`;
  if (/不忘初心/i.test(s)) return '不忘初心';
  if (/xb21cn/i.test(s)) return 'xb21cn';
  if (/OEM|品牌机|GGK/i.test(s)) return 'OEM';
  if (/官方|原版|微软原版|MSDN/i.test(s)) return '原版';
  return '其他';
};

P.variantOf = (title = '') => {
  const m = title.match(/(深度精简版|纯净精简版|纯净版|游戏版|美化版|精简版|装机版|完整版)/);
  return m ? m[1] : null;
};

P.updateTypeOf = (title = '') => {
  const both = /可更新\/无更新|无更新\/可更新/.test(title);
  if (both) return '可更新/无更新';
  if (/无更新/.test(title)) return '无更新';
  if (/可更新/.test(title)) return '可更新';
  return null;
};

const TAG_RULES = [
  [/跳过TPM|跳过硬件检测|无TPM|跳过TPM检测/i, '跳过TPM/硬件检测'],
  [/保留.{0,6}Hyper|Hyper-V|保留Hyper/i, '保留Hyper'],
  [/Linux子系统|WSL|保留.{0,6}linux|linux/i, 'Linux子系统'],
  [/按流量计费/i, '按流量计费'],
  [/免激活|自动激活|数字权利/i, '免激活'],
  [/集成运行库|离线集成运行库|补齐DX/i, '集成运行库'],
  [/4K.{0,6}壁纸|高清壁纸/i, '4K壁纸'],
  [/任务栏透明/i, '任务栏透明'],
  [/自建账户|跳过微软账户|本地账户/i, '本地账户支持'],
  [/保留XBOX|XBOX组件/i, '保留XBOX组件'],
  [/保留Windows\s*Defender|保留Defender/i, '保留Defender'],
  [/无人值守|自动安装/i, '无人值守'],
  [/离线精简|离线优化/i, '离线精简优化'],
  [/非二次封装/i, '非二次封装'],
  [/OEM泄露版|泄露版/i, 'OEM泄露版'],
  [/集成中文语言包/i, '集成中文语言包'],
];

P.tagsOf = (title = '', content = '') => {
  const s = `${title}\n${String(content).slice(0, 6000)}`;
  const tags = new Set();
  for (const [re, tag] of TAG_RULES) if (re.test(s)) tags.add(tag);
  return [...tags];
};

P.hardwareNotesOf = (title = '', content = '') => {
  const text = String(content);
  const lines = text.split(/[\n。；;]/).map(l => l.trim()).filter(Boolean);
  const hits = lines.filter(l =>
    /TPM|硬件检测|老机器|老设备|适配|低配|配置要求| Secure ?Boot |UEFI|GPT/i.test(l) && l.length < 120
  ).slice(0, 6);
  return hits.join('；') || null;
};

P.hashesOf = (content = '') => {
  const text = String(content);
  const out = {};
  let m = text.match(/SHA-?256\s*[：:为]?\s*([0-9a-fA-F]{64})/i);
  if (m) out.sha256 = m[1].toLowerCase();
  m = text.match(/MD5\s*[：:为]?\s*([0-9a-fA-F]{32})/i);
  if (m) out.md5 = m[1].toLowerCase();
  m = text.match(/SHA-?1\s*[：:为]?\s*([0-9a-fA-F]{40})/i);
  if (m) out.sha1 = m[1].toLowerCase();
  return out;
};

P.fileNamesOf = (content = '') => {
  const names = new Set();
  for (const m of String(content).matchAll(/[\w\-.【】\[\]（）()]{6,}\.(?:iso|esd|gho|wim)\b/gi)) {
    names.add(m[0]);
  }
  return [...names].slice(0, 8);
};

P.fileSizeOf = (title = '', content = '') => {
  const s = `${title} ${String(content).slice(0, 3000)}`;
  const m = s.match(/[（\[【]?\s*([\d.]+\s*[GT]B)\s*[）\]】]?/i);
  return m ? m[1].toUpperCase().replace(/\s+/g, '') : null;
};

P.normalizeDate = (s) => {
  if (!s) return null;
  const m = String(s).match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
};

// 按小节标题裁剪版本特性：region 按标题开标签切块，仅保留标题命中 keepRe 的小节内容
// 适用于 52ybcj 的 <h2> 小节、msdngho 的 <p class="intro-tit"> 小节
P.extractSections = (region, headingOpenRe, keepRe) => {
  const parts = region.split(headingOpenRe);
  const kept = [];
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    // 只取标题本体（到 </h2> / </p> 为止）判断命中，避免正文开头误伤（如"保留游戏需要的…"）
    const close = seg.search(/<\/h[1-6]>\s*<\/p>|<\/h[1-6]>|<\/p>/i);
    const headRaw = close > 0 ? seg.slice(0, close) : seg.slice(0, 120);
    const headText = headRaw.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    if (headText && keepRe.test(headText)) {
      const txt = P.stripTagsKeepBreaks(seg).trim();
      if (txt) kept.push(txt);
    }
  }
  return kept.join('\n\n').trim();
};

// 从指定标记处截断文本（用于排除目标小节之后的 安装方法/常见问题/免责 等通用段落）
P.cutAtMarkers = (text, markers) => {
  let cut = text.length;
  for (const m of markers) {
    const i = text.indexOf(m);
    if (i >= 0 && i < cut) cut = i;
  }
  let out = cut < text.length ? text.slice(0, cut) : text;
  // 截断可能正好落在下一个小节标题之后（如"五、原版系统安装方法"），剔除末尾孤立的"X、"编号
  out = out.replace(/[\s\u3000]*[一二三四五六七八九十]+、\s*$/, '');
  return out.trim();
};

// 是否为目标源站的系统档案
P.isOsItem = (title = '') =>
  /Windows|Win\s?(10|11|12|8|8\.1|7|XP)|\bXP\b|GHOST\s*XP|Server\s*20\d\d|LTSC|不忘初心|OEM/i.test(title)
  && !/微PE|PE工具箱|工具箱|无需安装|概念|爆料|曝光|前瞻|预测|传闻|曝光台|安全卫士|影音|装机大师/i.test(title);

module.exports = P;
