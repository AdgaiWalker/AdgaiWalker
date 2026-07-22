# Goal Document: 生产双入口真正可用

> 锚定：2026-07-21 对 `www.iwalk.pro` 的实测 + 仓库 `vercel.json` / `cutover-runbook` / S1 工程收尾。  
> 本文件是**执行权文档**；`docs/cutover-runbook.md` 仍是操作手册，切流状态与阶段验收以本 Goal 为准，完成后回写 `s1-go-live.md`。

## Go / No-Go

- **Judgment**: **Go after decisions**
- **Reason**: 工程代码在 `main` 已可演示；生产却是「React 静态壳半上线 + 双入口运行时缺失」。路线可走，但 **API/PG 宿主、Admin 部署形态、站主是否下令切流** 未钉死前，不得声称「生产双入口完成」。**Phase 0–1（诚实文档 + SPA rewrite）不依赖未决运维决策，可立即执行**；Phase 2+ 等决策。

## Target Outcome

访客在 **`https://www.iwalk.pro`（及 apex 跳转后）** 上可以：

1. **逛**：打开 `/`、`/posts`、文章详情，读到真实内容（预渲染或 SPA 均可，标题/正文可读）。
2. **卡**：打开 **`/tools` 不 404**；能提交 intake；得到**非空 nextStep**；线索进库（Admin 池可见或 API 可查）。
3. **诚实**：`GET /api/health` 返回真实健康 JSON；缺库时写路径 **503** `storage-unavailable`，不静默假持久。

完成时，文档不再写「生产切流未执行」与「半部署 SPA」并存的含糊状态——要么 **已切可用**，要么 **明确仅内容壳** 并写明缺口。

## Goal Definition

- **Type**: operational + delivery（生产可用性；非新功能研发）
- **Boundary**:
  - **In**：Vercel web 静态部署修正（SPA rewrites）；Nest API + PostgreSQL 生产部署；同源 `/api/*` 反代或等价网关；公开「卡」`/tools` + intake 闭环；健康探针；文档与 `s1-go-live` 状态对齐；最小回滚说明。
  - **Out**：新功能、UI 重构、pure-UI/脚手架 polish、Auth 真接、Admin 内容 Git 回迁、WorkItem/NorthStar 等旧后台全家桶、Match 双轨复活、A11 权重改版（验证盒时钟可开跑，改权重另项）。
- **Non-goals**:
  - 把本地工程验收再扫一遍当「上线」
  - 视觉保真 / 旧 Astro 页面全量复刻
  - 多副本分布式限流改造（单实例明示即可）
  - create-vite / 框架上升空间
- **Deferred work**:
  - 公开 Auth（`walker-session`）
  - Admin 同域 `/admin` vs 子域最终钉死后的体验 polish
  - 14 天 A11 复盘勾选（时钟从**生产卡可用日**起算或显式重置）
  - RSS / `llms.txt` / `index.json` 若产品需要再开
- **Verification rule**: 对**生产域名**做黑盒探测 + 一条真实 intake 闭环，全部 pass 才算完成。
- **Evidence source**: HTTP 行为（status + body）、生产 API 健康 JSON、Admin/API 可见线索记录、文档状态字段、可选 `pnpm accept:dual-entry` 对预发/同构环境。
- **Pass criteria**（全部满足）:
  1. `GET https://www.iwalk.pro/tools` → **200**，响应体为 SPA HTML（含 `#root` 或等价壳），**不是** Vercel `NOT_FOUND` 纯文本。
  2. `GET https://www.iwalk.pro/posts` → **200**，含真实文章 title。
  3. `GET https://www.iwalk.pro/api/health` → **200**，JSON 含 `ok`；写路径启用前 `db === true`（或文档声明的等价字段）。
  4. `POST https://www.iwalk.pro/api/intake`（合法 body）→ **2xx**，响应含非空 `nextStep` + `clueId`；随后管理面或 API 能查到该线索。
  5. 故意缺库或 `STORAGE_UNAVAILABLE` 类闸门在预发验证过：**写** → **503** + `storage-unavailable`（生产开启写前必须证明过一次）。
  6. `docs/s1-go-live.md`「生产切流」改为**已执行**（日期 + 部署拓扑一句话）；`cutover-runbook` 与事实一致。
- **Confidence note**: 黑盒生产探测是最强证据；本地 accept 只是前置，**不能**代替生产探针。半部署状态下「首页 200」不足以证明双入口。
- **Judgment owner**: **站主（Walker）** 在看过生产探针结果后口头/书面接受；执行代理可提交证据包，**无权**单方面改 s1-go-live 为「已切」若探针未全绿。

## Current State

- **代码**：`main` monorepo（web / admin / api + shared）；无 Astro 应用入口；S1 工程项见 `docs/STAGE1-ENGINEERING-DONE.md`。
- **生产（2026-07-21 实测）**:
  - Host: Vercel；`iwalk.pro` → 307 → `www.iwalk.pro`
  - **200**: `/`（Vite SPA `#root` + hashed assets）、`/posts`（预渲染静态列表）、`/assets/*`、`/pagefind/*`
  - **404 NOT_FOUND**: `/tools`、`/ideas`、`/projects`、`/learn`、`/about`、`/login`、`/admin`、`/content`、`/support`、`/api/health`、`/health`、`/api/match`、旧静态 AI 产物路径等
- **部署配置**：根目录 `vercel.json` 仅 `pnpm build:web` → `apps/web/dist`；**无 rewrites**；**无 API/Admin**。
- **客户端契约**：`apps/web` `publicRequest` → 同源 `fetch('/api' + path)`（如 `/api/intake`）。
- **文档**：写「生产切流未执行」；低估「SPA 壳已半上线」；验证盒日期已起但生产「卡」404。
- **约束**：Nest 需常驻 Node + `DATABASE_URL`；限流进程内内存、默认单实例；Admin 靠 `ADMIN_API_TOKEN` Bearer。
- **风险**:
  - 只加 SPA rewrite 而不上 API → `/tools` 能开但 intake 全挂，**假上线**
  - 只上 API 不同源/CORS/Cookie 错 → 配额 cookie `walker-anon` 失效
  - 误伤 `/posts` 预渲染或 pagefind 静态路径
  - 在未授权下改生产 env / 强制切流

## Plan Rewrite Notes

重写对象：`docs/cutover-runbook.md` 推荐顺序 + `docs/s1-go-live.md` 状态 + `STAGE1-ENGINEERING-DONE`「站主后续」。

| Existing item | Decision | Reason |
|---------------|----------|--------|
| Runbook：先 PG+Nest，再反代，再切「卡」 | **reorder / 插 Phase** | 生产已半上线 SPA；应先 **诚实状态 + SPA rewrite** 降「深链 404」可见伤，再 API——但 rewrite  alone 不得标完成 |
| Runbook：再切 `/` `/posts` | **remove as gate** | 二者已在生产；保持不回归即可 |
| Runbook：Admin 部署二选一不默认 | **keep as open decision** | 阻塞 Phase 3 管理可见性；卡闭环可用 API 查线索作临时 proof |
| s1-go-live：切流「未执行」 | **rewrite 文案** | 改为「web 半部署 / 运行时未切」或完成后「已切」 |
| s1 验证盒自 07-21 起算 | **rewrite 建议** | 生产卡 404 期间起算无效；**卡生产可用日**重置或脚注作废窗口 |
| STAGE1 工程 polish 清单 | **remove from this goal** | 不服务本 Target |
| PRD：生产域名切流 Out/另令 | **keep gate** | 本 Goal **等站主 Go** 才进 Phase 2+ 写生产；Phase 0–1 可预演 |
| strangler「旧部署下线」 | **keep simplified** | 仓内无 Astro 回滚；回滚=上一版 dist + API 镜像 |

## Drift Diagnosis

- **Goal drift**: 继续 pure-UI / 命名 / 脚手架 ≠ 生产双入口可用。
- **Phase drift**: 按「工程模块」收尾而非「生产探针绿」切片。
- **Validation drift**: 以 `pnpm typecheck` / 本地 accept / 合并 main 代替生产 HTTP 矩阵。
- **Compatibility drift**: 文档「未切流」vs Vercel 已挂 React dist；无单一真相。
- **Cleanup drift**: 文档大扫除、RSS 补全等不应挤进本 Goal 主路径。

## Priority Rationale

1. **先对齐事实（Phase 0）**：避免在错误心智模型上继续施工。
2. **再修 SPA 深链（Phase 1）**：低依赖、立刻消灭 `/tools` 等 404；与 API 解耦但**单独不宣称成功**。
3. **再 API+PG+反代（Phase 2）**：双入口价值在 intake 闭环；无此后端一切 UI 是空壳。
4. **再 Admin 可见与生产声明（Phase 3）**：站主能看见线索 + 文档/时钟诚实。
5. 高杠杆在 **部署拓扑**，不在组件纯度。

## Assumptions and Open Decisions

| Item | Status | Impact | Owner / Next step |
|------|--------|--------|-------------------|
| 站主下令执行生产切流（本 Goal Phase 2+） | **unresolved** | 无令则只做 Phase 0–1 与预发 | Walker 明确「切 / 不切 / 仅预发」 |
| Nest+PG 宿主（Fly/Railway/Render/自有 VPS 等） | **unresolved** | 决定反代写法与费用 | Walker 选一；执行方出最小配置 |
| `/api/*` 反代落点（Vercel rewrites 到外链 vs 边缘中间层 vs 独立网关） | **unresolved** | Cookie 与同源假设 | 选定宿主后钉死一种 |
| Admin：子域 vs 同域 `/admin` 静态 | **unresolved** | Phase 3 形态 | 默认建议：**子域或本地 Admin + 生产 API** 先闭环，同域后置 |
| 生产 `DATABASE_URL` / `ADMIN_API_TOKEN` / `AI_ENABLED` | **unresolved** | 无则不可写 | Walker 配置密钥；不入库 |
| 验证盒 14 天是否从卡生产可用日起算 | **assumed yes** | 复盘公正性 | 切流完成后改 `s1-go-live` |
| 当前 Vercel 项目仅绑定 web 构建 | **confirmed**（vercel.json） | 改 rewrites 即可影响深链 | Phase 1 |
| 限流单实例可接受 Stage1 | **assumed** | 多副本前不扩 | 文档标明 |

## Phases

### Phase 0: 生产事实单一真相源

- **Purpose**: 文档与决策面承认「半部署」；本 Goal 成为执行锚。
- **Entry condition**: 本文件已写入仓库（或站主认可副本）。
- **Phase rules**:
  - 只改 docs（及必要的状态表）；**不改**生产 env、不部署 API。
  - 禁止把「工程已验收」写成「生产已可用」。
  - 验证：文档互链无矛盾。
- **Todos**:
  - [x] 更新 `docs/s1-go-live.md`：生产状态改为 **「web 静态半部署；双入口运行时未切」** + 实测日期/矩阵摘要链接本 Goal
    - **Surface**: docs
    - **Proof**: 文件中可检索到半部署描述；「未执行」不再暗示「线上仍是旧站」
    - **Depends on**: none
  - [x] 在 `docs/cutover-runbook.md` 顶部增加「当前生产缺口」三行（SPA 无 rewrite / 无 Nest / 无 PG）
    - **Surface**: docs
    - **Proof**: 与 2026-07-21 探针一致
    - **Depends on**: none
  - [x] `STAGE1-ENGINEERING-DONE`「站主后续」第一条链到本 Goal
    - **Surface**: docs
    - **Proof**: 链接有效
    - **Depends on**: none
- **Exit proof**: 三处文档对生产状态表述一致。（**2026-07-22 已完成**）
- **Stop condition**: 站主否认半部署事实或域名已变——先重新探针再改文档。

### Phase 1: SPA 深链可达（不宣称双入口完成）

- **Purpose**: `/tools` 等客户端路由返回 SPA 壳，结束 Vercel 裸 404。
- **Entry condition**: Phase 0 完成或站主跳过文档但明确要求先修 404。
- **Phase rules**:
  - 允许改 `vercel.json` rewrites/headers；允许本地 `pnpm build:web` 验证产物路径。
  - **禁止**标记 s1「已切流」；**禁止**改 intake 业务逻辑「凑合上线」。
  - 必须保留：`/assets/*`、`/pagefind/*`、已有 `/posts/**` 静态文件优先于 fallback。
  - 合并前：说明「仅深链修复，API 仍缺」。
- **Todos**:
  - [x] 设计并写入 Vercel SPA fallback（未命中静态文件 → `/index.html`；**排除** `/api/*`）
    - **Surface**: `vercel.json` + `docs/cutover-runbook`
    - **Proof**: **待部署后**生产/preview：`GET /tools`、`/login`、`/about` → **200** HTML 含 `#root`；`GET /posts` 仍为预渲染列表；`GET /assets/…` 仍 200；`GET /api/health` **仍非** SPA HTML（404 或真 API）
    - **Depends on**: none（配置已合入仓库；**exit 需部署后探针**）
  - [ ] 回归：`/pagefind/pagefind.js` 仍 200（部署后）
    - **Surface**: 生产/预发探针
    - **Proof**: status 200
    - **Depends on**: rewrites 已部署
- **Exit proof**: 生产（或绑定同配置的 preview）深链矩阵：卡/逛相关路径不再 `x-vercel-error: NOT_FOUND`；posts 内容不丢。（**配置已写；部署探针未绿前 Phase 1 不算 exit**）
- **Stop condition**: rewrite 导致全站落到错误 HTML 或 posts 列表变空壳且无法快速回滚 → 回滚 vercel.json 并停下。

### Phase 2: API + PG + 同源 `/api`（双入口价值）

- **Purpose**: 生产具备可写后端；卡 intake 真闭环。
- **Entry condition**: **站主下令切流**；已选定 API/PG 宿主与密钥渠道。
- **Phase rules**:
  - 先 PG migrate，再起 Nest，再接反代；**无库不得对生产开放写**。
  - `ADMIN_API_TOKEN` ≥16；管理 API 无令牌 401。
  - 反代必须 **strip `/api`** 后到 Nest 裸路径（`/health`、`/intake`…），与 web 客户端一致。
  - Cookie `walker-anon`：HTTPS Secure、路径可用。
  - 本阶段可不完成 Admin 静态托管，但必须能用 API/临时手段证明线索入库。
  - 文档同步部署拓扑一句话。
- **Todos**:
  - [ ] 配置生产 PostgreSQL；`prisma migrate deploy`；记录宿主（不记密码）
    - **Surface**: 运维 / api
    - **Proof**: 直连或 Nest 日志 migrate 成功；health `db: true`
    - **Depends on**: 宿主决策、密钥
  - [ ] 部署 Nest（`build:api` + start）；env：`DATABASE_URL`、`ADMIN_API_TOKEN`、`AI_ENABLED`、`NODE_ENV=production`、`PORT`
    - **Surface**: api 宿主
    - **Proof**: `GET http(s)://<api-host>/health` → `{ ok, db, … }` 符合契约
    - **Depends on**: PG
  - [ ] 配置 `www.iwalk.pro/api/*` → API（Vercel rewrites 到外链或其它网关）；验证 strip 规则
    - **Surface**: vercel/网关
    - **Proof**: `GET https://www.iwalk.pro/api/health` → 200 JSON，**非** 404 文本
    - **Depends on**: Nest 可达公网
  - [ ] 生产 `POST /api/intake` 冒烟（合法短文 + source `tools-visitor`）
    - **Surface**: 生产 API + 可选 Admin
    - **Proof**: 2xx + `nextStep` 非空 + `clueId`；二次查询可见
    - **Depends on**: 反代
  - [ ] 预发或受控环境验证：存储不可写 → 写接口 503 `storage-unavailable`
    - **Surface**: api
    - **Proof**: 一次可复述的命令/响应记录
    - **Depends on**: API 可部署
- **Exit proof**: Pass criteria 1–5 中 API/卡相关项全绿（深链 + health + intake）。
- **Stop condition**: 密钥无法注入、PG 不可达、反代无法保留 Cookie、或出现假持久倾向 → 关闭写入口并暂停。

### Phase 3: 管理可见 + 状态落章 + 验证盒时钟

- **Purpose**: 站主能运营线索；对外/对内状态诚实；验证盒从有效日起算。
- **Entry condition**: Phase 2 exit proof 通过。
- **Phase rules**:
  - Admin 部署形态必须**钉死一种**并写入 runbook（禁止文档继续「二选一且未选」）。
  - 只改状态文档与必要运维说明；不做功能扩张。
  - A11 复盘日期：注明是否重置。
- **Todos**:
  - [ ] 部署 Admin 或确认用本地 Admin 连生产 API 的临时规程；能列出 Phase 2 的测试线索
    - **Surface**: admin / ops
    - **Proof**: 站主截图或 API 列表含 `tools-visitor` 测试条
    - **Depends on**: Phase 2
  - [ ] 更新 `s1-go-live.md`：生产切流 **已执行**、日期、拓扑一句、验证盒起算说明
    - **Surface**: docs
    - **Proof**: 与生产探针一致
    - **Depends on**: Phase 2
  - [ ] 更新 `cutover-runbook.md`「当前生产」为已切；回滚步骤指向真实上一版本标识
    - **Surface**: docs
    - **Proof**: 评审可读
    - **Depends on**: 部署完成
- **Exit proof**: Pass criteria 全部；站主接受证据包。
- **Stop condition**: Admin 决策反复导致无法「看见线索」超过必要时间——允许 API 查询作 formal proof，但须在文档写明「Admin 托管延后」。

## Dry-Run Findings

- **Phase 1 单独上线的假完成风险**：必须在规则与 s1 文案中显式降级声明——已写入 Phase 1 rules。
- **依赖缺口**：Phase 2 入口被「站主下令 + 宿主」阻塞；未决前执行方只应做 Phase 0–1 与本地/预发演练。
- **Rewrite 顺序风险**：SPA fallback 若过于贪婪会吃掉不存在的 API 路径返回 HTML；`/api/*` 必须在 Phase 2 配到后端或明确 404/502，**不能** fallback 成 index.html 冒充 API。
- **验证盒日期**：07-21 起算与生产卡 404 冲突——Phase 3 必须处理，否则 A11 结论无效。
- **无循环依赖**；Admin 不阻塞 intake 技术闭环，只阻塞「站主体验闭环」。
- **本地 accept** 不能替代生产探针——已写入 Final Validation。

## Final Validation

在生产域名执行并保存结果（日期、响应码、关键字段）：

```bash
# 1 深链 + 逛
curl -sS -o /dev/null -w "%{http_code}" https://www.iwalk.pro/tools      # 200
curl -sS -o /dev/null -w "%{http_code}" https://www.iwalk.pro/posts      # 200

# 2 健康
curl -sS https://www.iwalk.pro/api/health
# 期望 JSON ok/db

# 3 卡闭环（示例；以 docs/api 契约为准）
curl -sS -X POST https://www.iwalk.pro/api/intake \
  -H 'content-type: application/json' \
  -d '{"body":"生产切流冒烟：下一步是什么","source":"tools-visitor"}'
# 期望 clueId + nextStep 非空

# 4 文档
# s1-go-live 生产切流 = 已执行 + 日期
```

可选：同构预发 `pnpm accept:dual-entry` 全绿作为回归网，**附加**不替代上表。

站主确认后，本 Goal 勾选完成。

## First Execution Step

**立即（无需运维决策）**：执行 **Phase 0**——改 `docs/s1-go-live.md` / `cutover-runbook.md` / `STAGE1-ENGINEERING-DONE.md` 三处状态对齐「web 半部署、运行时未切」，并链到本文件。

**紧随（仍可不部署 API）**：Phase 1 提交 `vercel.json` SPA rewrites（保护 posts/assets/pagefind；**不要**把 `/api/*` fallback 到 index.html），在 preview 或生产验证 `/tools`→200。

**停下等待 Walker**：是否下令 Phase 2、API/PG 选哪家、Admin 形态——答复前不宣称双入口生产完成。
