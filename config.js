// HAIYUN ISO 全局配置
const path = require('node:path');

const ROOT = __dirname;

module.exports = {
  ROOT,
  PORT: Number(process.env.HAIYUN_PORT || 3088),
  HOST: process.env.HAIYUN_HOST || '127.0.0.1',
  DB_PATH: path.join(ROOT, 'data', 'haiyun.db'),
  LOG_DIR: path.join(ROOT, 'logs'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  // 后台管理：无登录（后台页面与 /api/admin/* 均不做鉴权，仅限内网/本机使用）
  // 采集设置
  CRAWL: {
    UA: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    TIMEOUT_MS: 25000,
    RETRY: 1,               // 失败重试次数
    DELAY_MS: 1200,         // 同站请求间隔（礼貌采集）
    MAX_PAGES_DEFAULT: 6,   // 默认最大翻页数（每站）
    DETAIL_CONCURRENCY: 1,  // 串行采集详情页
  },
  // 前端白名单字段（公共 API 仅允许返回以下系统字段，其余仅存后台）
  // 严格对应定稿：系统标题、系统分类、版本代号、Build内部版本号、系统类型标签、
  // 特性标签、硬件适配、发布时间、简介、MD5、SHA256（外加版本参数：架构/文件名/大小）
  PUBLIC_FIELDS: [
    'id', 'title', 'category', 'edition', 'build', 'arch',
    'source_type', 'variant', 'update_type', 'tags',
    'hardware_notes', 'description', 'features',
    'release_date', 'file_name', 'file_size',
    'md5', 'sha256', 'view_count',
    'site_name', 'site_code', // 来源站点显示（卡片来源徽标）
  ],
  // 三站定义
  SITES: [
    {
      code: '52ybcj',
      name: '我爱云',
      base_url: 'https://www.52ybcj.com/system',
      status: 'active', // 活跃采集
      note: '系统版本列表：Win11 26H1/25H2/23H2/LTSC2024、Win10 22H2/LTSC2021、Server 2022/2025（官方原版 & 精简版）',
      list_url: (p) => (p <= 1 ? 'https://www.52ybcj.com/system' : `https://www.52ybcj.com/system/page/${p}`),
    },
    {
      code: 'msdngho',
      name: 'MSDN',
      base_url: 'http://www.msdngho.com/',
      status: 'active', // 已启用采集：原版系统 /win11 /win10 + 品牌机系统 /oem（10 个品牌子页）
      note: '补全 OEM 分类：品牌机系统（联想/戴尔/惠普/华硕/华为/小米/宏碁/三星/索尼/苹果）+ Win10/Win11 原版系统，详情页含高速直链与网盘链接',
      list_url: (p) => 'http://www.msdngho.com/',
    },
    {
      code: 'hellowindows',
      name: 'HelloWindows 激活工具',
      base_url: 'https://hellowindows.cn/',
      status: 'active', // 激活工具大分类：MAS / KMS / 数字权利 等
      note: '激活工具大分类（MAS / AACT / 云萌数字权利 / HWID GEN 等），链接经中转还原为迅雷网盘/网盘真实地址',
      list_url: (p) => 'https://hellowindows.cn/',
    },
  ],
};
