# HAIYUN ISO · 双站系统资源链接聚合系统

数据源：**52ybcj.com/system**（我爱云）｜ **msdngho.com**（MSDN·含品牌机系统/OEM）

> 核心定稿：后台全量抓取、存储、收录来源网站的下载链接（网盘链接 / 直链 / 磁力）；
> 前端为聚合展示站：完整展示版本档案 + **每个系统对应的聚合下载链接**（第三方来源公开链接），不存储、不托管任何镜像文件。

---

## 一、快速开始（零外部依赖）

环境要求：**Node.js ≥ 22.5**（使用内置 `node:sqlite`，无需 npm install）

```powershell
# 1. 采集入库（首次必跑；默认采集活跃站 52ybcj + msdngho）
node crawler/crawler.js --site=active --max-pages=6

# 2. 启动服务（默认 127.0.0.1:3088，可用环境变量 HAIYUN_PORT / HAIYUN_HOST 覆盖）
node server.js
```

访问：

| 页面 | 地址 |
|---|---|
| 首页（粒子网格 + 分类入口 + 最新/热门 + 全站搜索） | http://127.0.0.1:3088/ |
| 系统列表页（多维筛选 + 玻璃卡片） | http://127.0.0.1:3088/list.html |
| 系统详情页（版本参数 / 哈希 / 特性 / **聚合下载链接** / 来源站兜底） | http://127.0.0.1:3088/detail.html?id=N |
| 一键免责声明页 | http://127.0.0.1:3088/disclaimer.html |
| 后台管理（无登录，直接进入，查看全部归档链接） | http://127.0.0.1:3088/admin |

后台管理**无需账号密码**，访问 `/admin` 即进入；`/api/admin/*` 不做鉴权（仅限内网/本机使用）。

## 二、双站采集策略（按定稿落地）

| 站点 | 状态 | 实测情况与策略 |
|---|---|---|
| 52ybcj.com/system | ✅ active | WordPress 列表 4 页 → 详情页。**原版类文章**直接含夸克/百度/天翼网盘 + ISO 直链 + SHA-256；**不忘初心转载类**有源站登录墙 —— 配置源站账号后**自动登录抓取**（`data/credentials.json` 或环境变量 `HAIYUN_52YBCJ_USER`/`HAIYUN_52YBCJ_PASS`），登录失败自动回退匿名 |
| msdngho.com | ✅ active | **已启用采集**：原版系统 `/win10 /win11` + **品牌机系统 `/oem`（10 个品牌子页：联想/戴尔/惠普/华硕/华为/小米/宏碁/三星/索尼/苹果）**，详情页含高速直链 + 夸克/百度/天翼网盘 + 迅雷链接 —— **OEM 分类由此站点补全** |
| hellowindows.cn | ✅ active | **激活工具大分类**（MAS / AACT / 云萌数字权利 / HWID GEN / MicroKMS / HEU KMS 等 7 条）：解析首页内嵌 JSON，中转 `/link?target=` 自动还原真实网盘地址 + 提取码 |

采集器命令：

```powershell
node crawler/crawler.js --site=active            # 默认：52ybcj + msdngho + hellowindows
node crawler/crawler.js --site=all               # 同上（全量）
node crawler/crawler.js --site=52ybcj --max-pages=6
node crawler/crawler.js --site=msdngho           # 单独采集 msdngho（含 OEM）
```

礼貌采集：同站请求间隔 1.2s、超时 25s、失败重试 1 次；采集日志见 `logs/crawl.log` 与后台"采集日志"。

### 定时补采（可选，Windows 任务计划）

```powershell
# 每天凌晨 3 点自动补采（示例）
schtasks /create /tn "HAIYUN-Crawl" /tr "node C:\Users\Administrator\Desktop\yunISO\crawler\crawler.js --site=active" /sc daily /st 03:00
```

也可在后台页面点击"采集活跃站"按钮实时触发（异步执行，进度见采集日志）。

## 二·补 GitHub Pages 免费托管 + Actions 自动更新

本项目支持**纯静态部署**到 GitHub Pages（零服务器成本），由 GitHub Actions 定时采集并自动更新：

```powershell
node scripts/build-static.js      # SQLite → dist/（public + data/*.json 静态数据）
node scripts/serve-static.js      # 本地预览 dist/（http://127.0.0.1:3099）
```

部署步骤：
1. 新建 GitHub 仓库（public，Pages 免费要求），推送本项目（`.gitignore` 已排除数据库/凭据/日志/dist）
2. 仓库 Settings → Secrets and variables → Actions 添加 `HAIYUN_52YBCJ_USER` / `HAIYUN_52YBCJ_PASS`（52ybcj 登录抓取用）
3. 仓库 Settings → Pages → Source 选 **GitHub Actions**
4. 完成：`.github/workflows/crawl-deploy.yml` 每日 02:00 UTC 自动「采集 → 构建静态 JSON → 部署 Pages」，也可在 Actions 页手动触发

静态化说明：
- 前端自动探测模式：存在 `data/stats.json` → 读取静态 JSON（客户端筛选/排序/分页，语义与服务端 API 一致）；否则走 Node 后端
- 静态模式下后台 `/admin.html` 与浏览量自增不可用（无后端）；采集自动化由 Actions 承担
- 全库 123 档案导出仅 ~0.5MB，Pages 额度（1GB 站点 / 100GB 月流量）绰绰有余

## 三、数据库字段设计（后台全量 / 前端白名单）

SQLite 文件：`data/haiyun.db`（WAL 模式，支持服务器与采集器并发）。

**systems（系统档案，后台全字段）**
| 字段 | 说明 | 前端白名单 |
|---|---|---|
| title / category / edition / build / arch | 标题 / 分类(win11,win10,server,oem…) / 版本代号(25H2…) / Build 号 / 架构 | ✅ |
| source_type | 类型标签：原版 / 不忘初心 / xb21cn / OEM | ✅ |
| variant / update_type | 纯净版/深度精简版/游戏版/美化版；可更新/无更新 | ✅ |
| tags | 特性标签 JSON：跳过TPM、保留Hyper、Linux子系统、按流量计费… | ✅ |
| hardware_notes | 硬件适配说明（跳过TPM/硬件检测、老机器适配…） | ✅ |
| description / features | 简介 / 版本特性全文 | ✅ |
| release_date / file_name / file_size | 发布时间 / 文件名 / 大小 | ✅ |
| md5 / sha256 / sha1 | 校验哈希（MD5、SHA256） | ✅（MD5、SHA256） |
| view_count | 浏览量（热门排序依据） | ✅ |
| source_url / source_anchor / site_id | **来源页（仅后台）** | ❌ 仅后台 |
| crawl_status / gate_note | 采集状态 ok / gated / no_links / placeholder + 受限原因 | ❌ 仅后台 |

**download_links（下载链接表，仅后台可见）**
`system_id / site_id / link_type(netdisk|direct|magnet|ed2k) / provider(百度|夸克|天翼|阿里|蓝奏…) / url / extract_code(提取码) / raw_text(采集原文) / origin(crawl|manual) / status(valid|invalid|unchecked) / collected_at`

**sites / crawl_logs**：三站定义与状态（active / passive_placeholder）、每次采集审计日志。

白名单隔离在代码层强制执行：列表/首页公共 API 只经 `db.toPublic()`（`config.PUBLIC_FIELDS`）投影输出，**不返回任何下载链接与 source_url**；仅详情页 `/api/systems/:id` 按最新需求开放该档案的下载链接（link_type / provider / url / extract_code）与来源站兜底地址。

## 四、前端下载链接展示

- 系统卡片展示**来源徽标**（📡 来源 · 我爱云 / MSDN），卡片不放下载按钮，统一「查看详情」进详情页。
- 详情页「下载链接 · 第三方来源聚合」区块展示该档案全部下载链接（网盘 / 直链 / 磁力 / 迅雷），含**提取码一键复制**与链接地址复制。
- 源站受限的档案（如 52ybcj 登录墙转载类）无链接时展示「前往来源站点」兜底入口。
- 系统详情页下载面板与免责声明均明确：链接来自第三方来源站点，本站不存储、不托管任何镜像文件。

## 五、版本特性按来源站裁剪

详情页「版本特性」面板按来源站点只展示有效小节，自动排除通用教程/FAQ/免责段落：

| 来源站 | 只显示的小节 |
|---|---|
| 我爱云 | 更新日志、集成功能、集成补丁（排除 应用下载/版本区别/应用预览） |
| MSDN | 系统特色、系统智能与自动技术、系统更新日志、集成软件（按关键词截断排除 原版系统安装方法/常见问题解答/免责条款 等通用段落） |

实现于 `crawler/parse.js`（`extractSections` 按小节标题切块 + `cutAtMarkers` 关键词截断）与各站点适配器。

## 六、后台管理能力

- 双站状态总览（活跃 / 上次采集时间）与采集审计日志
- 档案全字段表 + 按站点 / 采集状态 / 分类 / 关键词检索
- 每条档案的**归档下载链接全览**（类型 / 网盘商 / 提取码 / 来源）
- **手动补录链接**（应对源站受限条目：登录墙），补录后状态自动升级
- 一键触发采集（active / msdngho 单站）

## 七、已知边界（如实说明）

1. **52ybcj 不忘初心转载类**：源站登录墙已通过**自动登录会话**破解（`data/credentials.json` 配置账号，登录一次整轮复用，失败自动回退匿名）；当前 26 条原受限档案已全部补全网盘链接。
2. **msdngho**：已启用采集（win10/win11/oem 全量，共 10 个品牌 OEM 子页），OEM 分类数据由此站补全；详情页含高速直链 + 网盘链接，全量入库。
3. **hellowindows.cn**：激活工具大分类来源；首页内嵌 JSON 解析，中转链接自动还原真实网盘地址。
4. 源站页面改版时对应适配器（`crawler/site_*.js`）需要微调选择器。

## 八、目录结构

```
yunISO/
├── server.js              # HTTP 服务 + 公共白名单 API + 后台 API
├── config.js              # 端口 / 令牌 / 站点定义 / 白名单字段
├── db.js                  # SQLite schema + upsert + 白名单投影
├── crawler/
│   ├── crawler.js         # 编排器 CLI（--site / --max-pages）
│   ├── http.js            # 限速 / 重试 / GBK 解码
│   ├── parse.js           # 链接分类(网盘/直链/磁力) + 版本字段识别
│   ├── site_52ybcj.js     # 52ybcj 适配器
│   └── site_msdngho.js    # msdngho 适配器（win10/win11/oem + 10 个品牌子页）
├── public/                # 前端（首页/列表/详情/免责声明/后台）
├── data/haiyun.db         # SQLite 数据（运行时生成）
├── logs/crawl.log         # 采集日志（运行时生成）
├── docs/实施方案.md        # 完整实施方案文档
└── _inspect/              # 结构分析取样页（开发用，可删除）
```
