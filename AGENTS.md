# AGENTS.md

本文件是本仓库内 Agent 的项目级常驻指令。开始工作前，先阅读本文件，并同时遵守根目录 `CLAUDE.md` 中的工程约定。

## 文档阅读顺序

1. 根 `CLAUDE.md`（栈 / 命令 / 部署须知）→ 2. `docs/README.md`（文档地图与权威级）→ 3. 按改动区域读 `docs/PRODUCT.md`（产品红线）、`docs/api/README.md`（API 契约）、`docs/STATUS.md`（生产状态）。
改站内助手必须先读 `docs/PRD-SITE-ASSISTANT.md` + `docs/TODO-SITE-ASSISTANT.md`。`docs/archive/` 是退役方案，禁止当现行契约。

## 生产拓扑（2026-09-03 切流后）

- 访客：`www.iwalk.pro`（Vercel 静态，push main 自动发）→ `/api/*` 反代 → `api.iwalk.pro`（盒子上 Caddy + Let's Encrypt）→ Nest `127.0.0.1:8788` → SQLite / DeepSeek Harness。
- **公网白名单双侧同步**：放行新公开路由必须同时改 `apps/api/src/app.module.ts`（exclude 表）和 `ops/windows/Caddyfile`，漏一侧即 401/404。管理路由另有 `WALKER_ADMIN_TOKEN` + Caddy basic auth 双防线。
- 盒子（腾讯云轻量，Windows Server 2C2G，新加坡）运行目录 `C:\Walker`：`app`（Git 工作树）/ `data`（持久数据，**不得覆盖**）/ `bin`（node/pnpm/git/caddy/dsh）/ `logs`。

## 盒子部署与运维坑（实测教训）

- 部署流：SSH 进盒子 → `cd C:\Walker\app && git pull origin main` → `pnpm build:shared` → `pnpm build:api`（admin 改了再 build:admin）→ `schtasks /End + /Run /TN WalkerApi`（网关是 `WalkerGateway`）。
- **SSH 会熔断**：短连接多次后出现 `Connection closed by ... port 22`（sshd 频次限制，等几分钟也不一定恢复）。带外替代：腾讯云控制台 → 实例 → 「执行命令」（TAT，不走 22 端口），可远程 git pull + 构建 + 重启，实测 23 秒跑完全套。
- 2C2G 内存紧张：**构建（tsc/vite）可能把 sshd 打僵死**（TCP 可连但无 banner）→ 控制台重启实例可解；避免在 API 服务运行时跑重构建。
- PowerShell 脚本含中文必须带 **UTF-8 BOM**，否则 Windows PowerShell 按 ANSI 解析报错。
- DeepSeek Harness（dsh）安全机制：**拒绝从 .env 文件继承 `DSH_*` 启动变量**——生产用 `WALKER_DSH_RUNTIME_BIN` / `ASSISTANT_DSH_HOME`（见 `ops/windows/README.md`），且子进程 cwd 必须是不含 .env 的中立目录。
- SSH 不通时先按下方「腾讯云服务器连接」查防火墙来源 IP（家宽 IP 会轮换）。

## 站内助手 / AI 红线（改助手代码前必读）

- **AI 可关**：`AI_ENABLED≠true` 时一切 AI 功能走规则兜底，回答仍非空；任何降级（超时/坏输出/预算触顶）都路由到规则版，`aiUsedFlag` 如实标注。
- **aiUsePolicy fail-closed**：模型输出经 `parseAssistantOutput` / `parseAiNextStepOutput` 校验，引用 slug 必须 ⊆ citable 集合；citations/参数来自网关与索引，不信任模型原文。
- **禁止 AI 自动主选**：问题池转题苗、线索 promote 永远人工点击。
- Nest DI：接口 token 注入必须显式 `@Inject(TOKEN)`，构造函数裸接口参数在 provider 化后会炸（已踩过）。
- 诚实原则：失败如实报错，不假装成功（全站产品气质，见 `docs/PRODUCT.md`）。

## 腾讯云服务器连接

本机已经配置好 SSH 公钥认证和连接别名。需要操作项目服务器时，直接运行：

```bash
ssh walker-tencent
```

开始服务器操作前，可用以下命令进行非交互验证：

```bash
ssh -o BatchMode=yes -o ConnectTimeout=15 walker-tencent "whoami && hostname"
```

- 连接参数和私钥位置由本机 SSH 配置管理，不要在仓库中复制 IP、用户名、密钥内容或基础设施细节。
- 不得读取、输出、提交、上传或转发私钥内容。
- 当前执行环境的公网出口 IP 可能在不同对话间变化。如果连接超时或被远端关闭：
  1. 运行 `curl -fsS https://api.ipify.org` 获取本次对话的公网出口 IP；
  2. 在腾讯云实例防火墙中，把 TCP 22 的 SSH 规则来源更新为 `<当前公网IP>/32`；
  3. 再次运行上面的非交互验证命令。
- 连接失败时不要直接重装系统、重置密码或创建新密钥。
- 未经用户明确授权，不得重装系统、重置密码、删除服务器数据或替换 SSH 密钥。
