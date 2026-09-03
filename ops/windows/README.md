# Windows 单机运行基线

## 结论

这台 2 核 2GB Windows Server 先采用**单进程、单库、双表面**：公开 LM Wiki 继续由 Vercel 托管；腾讯云只运行一个 Nest 进程和一个 Caddy 进程；私有 Admin 只经 SSH 隧道访问。

```text
访客 → www.iwalk.pro (Vercel 静态 Wiki)
                └─ /api/* → Caddy 公共路由白名单 → Nest :8788 → SQLite

站主 → SSH 隧道 → Caddy 127.0.0.1:8790 → Admin 静态文件
                                      └─ /api/* → Nest :8788 → 同一 SQLite
```

业务真相仍只有一套：`Clue → Seed → Execution → Evidence`。公开入口负责产生线索，私有工作台负责推进、交付与检验。后续 Agent 运行时接入同一过程，不另建第二套任务系统。

## 为什么不是 Docker / 本机 PostgreSQL / 微服务

Windows 与宝塔当前已占用大部分 2GB 内存。第一阶段禁止在本机增加 Docker、Redis、本机 PostgreSQL或多份 Nest 进程。SQLite 对当前单实例、低并发、小生产足够；达到迁移条件后，再把数据库适配器切到托管 PostgreSQL，Nest 契约不变。

迁移到 PostgreSQL 的触发条件满足任一即可：

- 需要两个以上 API/Worker 进程并发写；
- SQLite 写锁开始形成可观测等待；
- 需要数据库级高可用或时间点恢复；
- 过程数据量或备份恢复时间超出单机可控范围。

## 网络边界

- Nest 默认只监听 `127.0.0.1:8788`，不能从公网直连。
- Caddy 公网面只转发 `health`、`intake`、点赞、内容反馈、搜索缺口和只读 support。
- `/clues`、`/seeds`、`/executions`、`/metrics`、`/admin/content` 以及写 support 不进入公网路由。
- Admin 静态站只监听 `127.0.0.1:8790`。
- **第二道防线（凭据）**：
  - Nest 对白名单之外的所有路由要求管理凭据（`apps/api/src/auth/admin-token.middleware.ts`），凭据来自 `apps/api/.env` 的 `WALKER_ADMIN_TOKEN`；白名单在 `app.module.ts` 中逐条对齐 Caddyfile，两侧需同步修改。生产环境未配置该 token 时 API 拒绝启动。
  - Caddy Admin 面启用 basic auth（块形式，user/hash 经环境变量 `WALKER_ADMIN_USER` / `WALKER_ADMIN_HASH` 注入），由 `run-caddy.ps1` 从 `C:\Walker\data\admin-basic-auth.txt`（格式 `user:password`，明文仅存服务器 data 目录，不进 Git）实时派生 bcrypt 哈希。**密码必须与 `WALKER_ADMIN_TOKEN` 一致**。浏览器首次访问会弹一次密码框，Basic 头随后被 Caddy 转发给 Nest，由 Nest 校验密码部分等于 token。

脚本/curl 调用管理接口时带 `x-admin-token` 头即可：

```bash
curl -H "x-admin-token: <WALKER_ADMIN_TOKEN>" http://127.0.0.1:8790/api/clues
```

私有工作台连接（主路径走 Tailscale 虚拟内网，与 VPN / 出口 IP 无关）：

```bash
ssh -N -L 5174:127.0.0.1:8790 walker-tencent
```

然后访问 `http://127.0.0.1:5174`（首次会要求输入 `admin-basic-auth.txt` 中的凭据）。

- `walker-tencent`（`100.115.242.59`）走 Tailscale；服务器端已加 `--unattended`，无用户会话也常驻。两端设备须登录同一 Tailscale 账号。
- `walker-tencent-public`（`43.163.4.104`）为公网备用路径，仅当腾讯云防火墙 22 端口白名单含当前出口 IP 时可用。

## 构建与运行

运行时目录固定分层：`C:\Walker\app` 是 Git 工作树，`C:\Walker\data` 是持久数据，`C:\Walker\bin` 是运行工具。更新或替换 app 时不得覆盖 data。服务器上安装 Node、pnpm、Git、Caddy 后：

```powershell
Set-Location C:\Walker\app
pnpm install --frozen-lockfile
pnpm build:shared
pnpm db:generate
pnpm db:push
pnpm build:api
pnpm build:admin
```

`apps\api\.env` 不进 Git，首期至少包含：

```dotenv
WALKER_DB_PROVIDER=sqlite
DATABASE_URL=file:C:/Walker/data/walker.db
HOST=127.0.0.1
PORT=8788
NODE_ENV=production
AI_ENABLED=false
```

### 站内助手 runtime（AI 开启前执行一次）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Walker\app\ops\windows\install-dsh.ps1
```

脚本安装 `@deepseek-ai/dsh@0.1.2-alpha.3` 到 `C:\Walker\bin`、初始化助手专用 `%USERPROFILE%\.dsh-assistant`（deepseek + read-only）并预热 sdk profile。之后在 `apps\api\.env` 追加：

```dotenv
AI_ENABLED=true
WALKER_DSH_RUNTIME_BIN=C:/Walker/bin/node_modules/@deepseek-ai/dsh/lib/bin.js
ASSISTANT_DSH_HOME=C:/Users/<用户名>/.dsh-assistant
ASSISTANT_DAILY_LIMIT=200
```

凭据 `%USERPROFILE%\.dsh-assistant\.credentials.yaml` 人工放置（DeepSeek key，不经 git）。Nest 会以只读沙箱子进程形态拉起 runtime；内存预算实测约 224MB 常驻。

前台运行验证：

```powershell
powershell -NoProfile -File C:\Walker\app\ops\windows\run-api.ps1
powershell -NoProfile -File C:\Walker\app\ops\windows\run-caddy.ps1 -PublicApiHost api.example.com
```

在配置开机任务前，必须先验证：

```powershell
curl.exe http://127.0.0.1:8788/health
curl.exe http://127.0.0.1:8790/api/health
```

验证通过后，以管理员 PowerShell 注册并立即启动开机任务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Walker\app\ops\windows\install-tasks.ps1
```

默认公共入口仍只绑定本机测试地址 `http://127.0.0.1:8080`。准备好 API 域名与 HTTPS 后，重新执行并显式传入正式域名：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Walker\app\ops\windows\install-tasks.ps1 -PublicApiHost api.example.com
```

## 尚未切流

只有在 API 域名、HTTPS、公共路由白名单、SQLite 备份和 intake 冒烟全部通过后，才修改 `vercel.json` 增加 `/api/:path*` 反代。切流前生产事实仍是“静态 Wiki 可用，公网写路径未通”。
