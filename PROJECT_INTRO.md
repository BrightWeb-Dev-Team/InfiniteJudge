# InfiniteJudge 项目介绍

> 跨平台在线评测与算法训练平台
> 开发团队：BrightWeb Dev Team ｜ 当前版本：**v5.0.0 Professional**
> 仓库：<https://github.com/BrightWeb-Dev-Team/InfiniteJudge>

---

## 一、项目定位

InfiniteJudge 是一个面向学校、社团、竞赛团队和个人学习者的自托管在线评测（OJ）系统。它把「出题 → 练习 → 比赛 → 反馈 → 社区」串成一个完整闭环，同时强调**零 Docker 依赖、开箱即用**：只要能跑 Node.js 并安装好编译器，就能在 macOS、Windows 或 Linux 上把一套完整的评测站跑起来。

与以 Hydro 为代表的社区 OJ 相比，InfiniteJudge 的主要差异在于：

- **不依赖 Docker / MongoDB**——数据库使用 Node.js 内置的 SQLite（`node:sqlite`），单机部署即可；
- **原生进程沙箱**——按操作系统自动选择隔离策略，无需额外配置容器；
- **内置 AI 作弊检测**——从题面水印、答题会话到代码相似度，形成一套可审计的防代做机制；
- **自带插件兼容层**——兼容 Hydro 的公开插件编程模型（`apply(ctx)`），便于迁移已有生态。

---

## 二、核心功能

### 1. 在线评测

- 支持 **C++（C++20）/ Python / Java** 三种语言，编译与运行由本地沙箱完成。
- 返回 Accepted / Wrong Answer / Compile Error / Runtime Error / Time Limit / Output Limit 等状态，并记录每个测试点的耗时与内存。
- 支持 **Special Judge（SPJ）**：管理员可为题目附带自定义判题程序。
- 对每个用户、每道题记录 `submissions / accepted` 统计，显示通过率。

### 2. 题库与做题

- 题号、标题、标签模糊搜索，难度筛选（入门 / 简单 / 中等 / 困难）。
- 编程题 + **客观题**（单选、多选、判断，以及由多道小题组成的混合客观题）。
- 题目包导入：标准题目包一键导入，另有测试点单独导入接口，支持大体量数据（测试点包最大 256 MB）。
- Markdown 题面，支持 KaTeX 数学公式（`remark-math` + `rehype-katex`）。

### 3. 比赛系统（InfiniteJudge 的特色）

| 功能 | 说明 |
| --- | --- |
| 赛制 | ACM（通过题数 + 罚时）、OI / IOI（分数）、OIL（综合赛制） |
| OIL 独家能力 | 个人题 / 团队题 / 神秘题混合编排、组队与座位管理、**Hack 机制**（偷取对手分数） |
| 参赛管理 | 团队邀请码、参赛者锁定、裁判实时记分修正（`contest_score_overrides`） |
| 直播与公告 | 赛内消息频道、实时排行榜 |
| 反作弊 | 比赛级反作弊开关，可单独关闭 |

### 4. 训练计划与作业

- 「训练」用于开放式练习，「作业」带起止时间，到期后自动截止。
- 管理员选题建集合，学员逐题完成，系统自动统计进度。

### 5. 社区与社交

- **讨论区**：带节点的主题与回复。
- **博客**：Markdown 文章，支持编辑与浏览量统计。
- **私信 / 通知**：未读提醒、在线状态（presence）。
- **好友与朋友圈**：好友申请、动态发布、点赞与评论。
- **视频通话**：基于浏览器媒体能力与信令通道的实时通话。
- **文件中心**：个人文件上传、下载与管理。

### 6. 组织与身份

- **管理域（Domain）**：类似「分站 / 学院」，拥有独立的头像、公告、轮播和成员体系；加入方式支持申请审批或邀请码。
- **用户标签与认证**：全局 / 个人标签（如「作弊者」标记），认证申请与管理员审核，公开认证展示。
- **RP 排行榜**：按「AC 名次」动态计算 RP（`1000 / √(名次 × 该题 AC 人数)`），兼顾做题数量与质量。

### 7. AI 能力

- **站内 AI 助手**：管理员配置任意 OpenAI 兼容接口（自定义 Base URL / 模型 / 系统提示词 / 温度 / 超时），支持多会话历史。出于安全考虑，非本地地址强制 HTTPS，且禁止指向内网地址。
- **AI 作弊检测**（可选题目开启）：
  - 题面嵌入**零宽字符指纹**，复制或 OCR 出去的题面可追溯到具体学生的答题会话；
  - 向无障碍树注入随机会话令牌，记录「谁读取了题面」；
  - 生成**诱饵运行结果**，识别自动化工具直接在编辑器里操作的行为；
  - 基于代码骨架相似度、注释与题面相关性等信号评分，超过阈值可自动判零；
  - 管理员可查看被标记会话的事件时间线、源码与基线快照。

---

## 三、技术架构

```text
┌──────────────────────────── 浏览器 ────────────────────────────┐
│  React 18 + TypeScript 单页应用（Vite 构建）                    │
│  KaTeX 公式 · Markdown · 亮色/暗色/流星雨/Miku 主题              │
└───────────────────────────────┬────────────────────────────────┘
                                │ REST /api/*
┌───────────────────────────────▼────────────────────────────────┐
│  Express 4 API 服务（server/index.js）                          │
│  ├─ 认证层：Session / 密码哈希 / WebAuthn 通行密钥 / Auth0 OIDC │
│  ├─ 业务层：题库 · 比赛 · 训练 · 社区 · 域 · 消息 · 文件         │
│  ├─ 反作弊：integrity.js（指纹 / 会话 / 相似度）                │
│  ├─ 插件层：PluginRuntime（Hydro 风格 ctx）                     │
│  └─ 更新器：在线拉取 + 上传更新包，校验 SHA-256 后热更新        │
├─────────────────┬──────────────────────────┬─────────────────────┤
│ SQLite          │ 评测沙箱（sandbox.js）    │ 授权与密钥平台       │
│ node:sqlite     │ 编译/运行/超时/隔离        │ keyplatform :5031   │
│ 单文件数据库     │                          │ key.brightweb.top   │
└─────────────────┴──────────────────────────┴─────────────────────┘
                                │ 可选：独立评测节点
                     GET /api/judge/pull → POST /api/judge/result
```

### 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18、TypeScript 5.7、Vite 6、lucide-react 图标、react-markdown、KaTeX |
| 后端 | Node.js（ESM）、Express 4、multer、nodemailer、jose、tar / unzipper |
| 数据库 | `node:sqlite`（SQLite，WAL 模式，带轻量自迁移） |
| 认证 | 加盐密码哈希、会话令牌、`@simplewebauthn`（Passkey）、Auth0 OIDC |
| 部署 | Dockerfile（多阶段构建）、compose.yaml、`deploy.sh` / `start.sh` |

### 评测沙箱（无 Docker 原生隔离）

| 平台 | 隔离策略 |
| --- | --- |
| macOS | `sandbox-exec`：默认拒绝，禁止网络，仅允许写入本次提交的临时目录 |
| Linux | 独立工作目录 + 受限环境变量 + 进程组终止；生产可设置 `IJ_SANDBOX_COMMAND` 接入 namespace / cgroup |
| Windows | 独立工作目录 + 受限环境 + `taskkill /T` 进程树终止；可对接 Windows Sandbox |

运行环境采用 `detached` 进程组，超时或输出超限（默认 1 MB）时整组终止；`/api/health` 会回报当前生效的沙箱后端。

### 分布式评测

站点与评测机解耦：站点将任务以数据库事务从 `Pending` 原子领取为 `Judging`，保证同一提交不会被重复执行。节点站在 `remote-worker.js` 上，兼容 HydroJudge 的 `judge.yaml` 配置字段，可通过 `install-judge.sh` 单独部署到多台机器，并用 systemd / pm2 / supervisor 托管。

---

## 四、安全设计

- **密码**：加盐哈希存储，不保存明文；邮箱验证可选，默认关闭。
- **通行密钥**：基于 WebAuthn，私钥只留在用户设备，服务器仅保存公钥凭据；管理员二次认证有效期 4 小时。
- **统一登录**：Auth0 回调由服务端校验 ID Token，浏览器通过一次性凭据绑定本地会话，Client Secret 不回显。
- **AI 接口安全**：强制 HTTPS、禁内网地址，限制消息条数 / 单条长度 / 总长度 / 响应字节数。
- **文件上传**：头像、用户文件、题目包、测试点包、更新包分别限类型或限大小。
- **系统更新**：下载更新包后先校验 SHA-256，仅覆盖程序文件，保留 `data/`；更新包禁止携带数据库、`.env`、`.git`、`node_modules`。
- **管理操作**：根管理员、管理员、需二次认证的管理员三级权限；关键操作写审计字段。

---

## 五、扩展机制

### Hydro 风格插件

插件放在 `plugins/<插件名>/`，入口导出 `apply(ctx)`，当前兼容上下文包括：

```js
ctx.Route(name, path, Handler)  // 注册路由
ctx.on() / ctx.emit()           // 事件系统
ctx.injectUI()                  // 注入前端界面
ctx.interval()                  // 定时任务
ctx.collection()                // 插件数据存储
```

插件运行在服务进程内，因此只应安装可信来源的插件。完整的编写说明见 `docs/插件编写指南.md`。

### 授权与密钥平台

`keyplatform/` 是独立于站点的商家授权控制台（端口 5031），负责签发 `Community` / `Professional` 授权 key。站点通过 `IJ_LICENSE_KEY` 激活，页脚会展示对应版本标识。

---

## 六、部署方式

### 开发模式

```bash
npm install
npm run dev      # 前端 :5173，API 与评测 :4001，密钥控制台 :5031
```

### 一键部署（macOS / Linux）

```bash
chmod +x deploy.sh
./deploy.sh      # 生产模式，访问 http://localhost:4001
./stop.sh        # 停止服务
```

首次启动进入初始化向导：设置品牌、Logo、服务地址与管理员账号，之后按需安装 `g++`、`python3`、`javac/java`。

### Docker / Compose

```bash
docker compose up -d
```

镜像基于 `node:22-bookworm-slim`，内置 g++、OpenJDK 17、Python 3，以非 root 用户运行，挂载 `./data` 持久化数据，并配置了健康检查。

### 常用环境变量

| 变量 | 作用 |
| --- | --- |
| `PORT` | API 服务端口（默认 4001） |
| `DB_PATH` | SQLite 数据库路径 |
| `IJ_LICENSE_KEY` / `IJ_LICENSE_SERVER_URL` | 授权 key 与授权服务器 |
| `IJ_INTEGRITY_KEY` | AI 作弊检测指纹密钥 |
| `IJ_SANDBOX_COMMAND` | 外部沙箱命令（Linux / Windows 生产环境） |
| `IJ_DISABLE_LOCAL_JUDGE` | 关闭站点内置评测，改用独立节点 |
| `IJ_JUDGE_SERVER` / `IJ_JUDGE_NODE` | 评测节点连接地址与节点名 |
| `IJ_PUBLIC_URL` | 站点对外地址（生成 Auth0 回调等） |

---

## 七、项目结构

```text
InfiniteJudge/
├── server/            # Express API、数据库、评测、沙箱、反作弊、插件、更新器
├── src/               # React 前端（题库/比赛/社区/设置/控制台等页面与样式）
├── plugins/           # Hydro 风格插件示例
├── keyplatform/       # 授权 key 签发控制台
├── docs/              # 中文功能与运维文档
├── public/            # 静态资源（吉祥物等）
├── data/              # SQLite 数据库与用户上传文件（运行时生成）
├── Dockerfile / compose.yaml / deploy.sh / start.sh / install-judge.sh
└── README.md / ABOUT.md / LICENSE
```

---

## 八、适用场景

- **学校 / 高校课程**：作业发布、训练计划、客观题与编程题混合考核。
- **算法社团 / 竞赛队**：ACM/OI/OIL 赛制模拟、Hack 赛、团队赛训练。
- **个人刷题**：RP 排行榜、好友与朋友圈、博客题解。
- **私有化部署**：无需公有云 OJ，数据完全掌握在自己手里。

---

## 九、许可证

项目采用自定义的 **InfiniteJudge 部署与署名许可协议**：允许部署、运行与修改，但所有网页必须保留可见且可点击的页脚版权信息：

> Powered by ©2025-2026 BrightWeb Dev Team

详细条款见 [LICENSE](LICENSE) 或站内 `/about/license` 页面。

---

## 附：版本信息

- 产品版本：**InfiniteJudge v5.0.0 Professional**
- 包名：`infinite-judge`
- 运行时要求：Node.js 22+（依赖 `node:sqlite` 内置模块）
