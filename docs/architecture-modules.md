# 核心模块与关系（双入口小生产）

> **当前运行栈（唯一）**：`apps/web` · `apps/admin`（React + Vite）· `apps/api`（Nest）· `packages/shared` · 内容 `content/log`。  
> **无 Astro 可运行入口**。旧设计文档见 `docs/archive/` / `docs/design/`（历史）。

> 标注约定：  
> - **依赖** A → B：编译/设计期需要 B 的抽象（优先接口）  
> - **调用** A → B：运行期发起请求/函数调用  
> - **触发** A → B：副作用，B 失败不推翻 A 主结果（若无特别说明）  
> - **实现** A ⇒ I：A 是接口 I 的具体适配器  

## 分层纪律（强制）

```text
页面/组件（只渲染与本地 UI 状态）
    │ 调用
    ▼
api/* 门面（HTTP 拼装，无业务 if 森林）
    │ 调用
    ▼
Controller（协议：DTO/状态码/Cookie）
    │ 调用
    ▼
Application Service（用例编排）
    │ 依赖 Port
    ▼
Adapter（Prisma / 规则 nextStep / 内存限流）
    +
SharedKernel（纯规则，无 I/O）
```

**禁止**：页面直写 fetch 业务分支；Controller 写主选/闭环规则；Service `new PrismaClient()`；React 复制状态机。

---

## 1. 核心模块（一句话职责）

### 前端壳

| 模块 | 一句话职责 |
|------|------------|
| **WebApp** | 公开站：卡/逛双入口 + 证据库阅读 |
| **web/api/public-api** | 公开 HTTP 门面（intake/赞/反馈） |
| **AdminApp** | 管理端：池/苗/检/数 |
| **admin/api/admin-api** | 管理 HTTP 门面（带 Bearer） |
| **admin/auth/token-store** | 本机令牌存取（无业务） |
| **ContentReadModel** | 构建期扫描 `content/log` 生成只读 JSON |
| **dual-entry** | 公开站卡/逛路径与文案单一配置（无硬编码散落） |

### 契约与领域（无 I/O）

| 模块 | 一句话职责 |
|------|------------|
| **SharedKernel** | 线索/主选/交付/闭环/nextStep 五桶/内容解析等**纯规则** |

### 应用用例（Nest）

| 模块 | 一句话职责 |
|------|------------|
| **HttpApi** | HTTP 进出、Cookie、状态码映射；不写领域规则 |
| **HealthApplication** | 聚合 `ok` / `db` / `aiEnabled` |
| **IntakeApplication** | 校验 → 限流/配额 → 入库线索 → 生成 nextStep |
| **ClueApplication** | 线索列表、手动入库、池状态 |
| **SeedApplication** | 题苗、挂线索、主选护栏、两问 |
| **ExecutionApplication** | 交付、检验、可计数判定 |
| **MetricsApplication** | 闭环计数 + 功能事件冷热聚合 |
| **EngagementApplication** | 点赞等保真互动（真实计数，无假基数） |

### 端口（接口）

| 端口 | 一句话职责 |
|------|------------|
| **PrismaPort** | 可写客户端与 ping；无 URL 则不可写 |
| **ClueRepository** | 线索持久化 |
| **SeedRepository** | 题苗与链接持久化 |
| **ExecutionRepository** | 执行卡持久化 |
| **RateLimitPort** | 滑动窗口限流 |
| **GuestQuotaPort** | 游客 1 次配额 |
| **NextStepStrategy** | 生成下一步（规则/可换 AI） |
| **FeatureEventPort** | 功能漏斗事件 |
| **LikeRepository** | 点赞计数持久化 |
| **AppConfigPort** | 环境配置 |

### 适配器

| 模块 | 一句话职责 |
|------|------------|
| **EnvConfigAdapter** | **实现** AppConfigPort |
| **PrismaAdapter** | **实现** PrismaPort |
| **Prisma*Repository** | **实现** 各仓储端口 |
| **InMemoryRateLimiter** | **实现** RateLimitPort（进程内） |
| **PrismaGuestQuotaAdapter** | **实现** GuestQuotaPort |
| **RuleNextStepAdapter** | **实现** NextStepStrategy（关 AI） |
| **PrismaFeatureEventAdapter** | **实现** FeatureEventPort |

---

## 2. 模块间关系

### A. 壳 → API

| 关系 | 类型 | 理由 |
|------|------|------|
| WebApp → HttpApi | **调用** | REST；不 import Nest/Prisma |
| AdminApp → HttpApi | **调用** | 同上 |
| WebApp → ContentReadModel | **依赖** | 构建期 JSON，不经 Nest 拉全文 |
| generate-content 脚本 → Shared 解析约定 | **调用** | 与 `toContentDoc`/visibility 规则对齐 |

### B. Http → 用例

| 关系 | 类型 | 理由 |
|------|------|------|
| Controllers → *Application | **调用** | 薄控制器 |
| IntakeApplication → ClueRepository / NextStep / RateLimit / GuestQuota | **依赖** | 端口注入 |
| SeedApplication → SeedRepository + ClueRepository + ExecutionRepository | **依赖** | 主选与自动建执行卡 |
| SeedApplication → ExecutionApplication 数据 | **调用**（仓储） | promote 后创建 doing 执行 |
| ExecutionApplication → SharedKernel.isCountableLoop | **依赖** | 纯规则 |
| MetricsApplication → 各 Repository + FeatureEvent | **依赖** | 只读聚合 |
| *Application 成功/失败 → FeatureEventPort | **触发** | 埋点失败不改业务结果 |

### C. 适配器 ⇒ 端口

| 关系 | 类型 | 理由 |
|------|------|------|
| Prisma* ⇒ Repository / PrismaPort | **实现** | PG |
| RuleNextStepAdapter ⇒ NextStepStrategy | **实现** | 可关 AI |
| InMemoryRateLimiter ⇒ RateLimitPort | **实现** | 首版单实例 |
| EnvConfigAdapter ⇒ AppConfigPort | **实现** | env |

### D. 依赖方向

```text
WebApp / AdminApp
    │ 调用 HTTP
    ▼
HttpApi
    │ 调用
    ▼
*Application
    │ 依赖 Ports + SharedKernel
    ▼
Adapters (Prisma / Rule / MemoryRateLimit)
    ▼
PostgreSQL
```

### E. 禁止

- Application → 具体 PrismaClient 散落 `new`
- Web 内复制主选/闭环状态机
- 无 DATABASE_URL 写成功（必须 503 `storage-unavailable`）
- Redis 必依赖 / 在 monorepo 外再启第二套可运行前台

---

## 3. 与实现目录对照

| 概念 | 路径 |
|------|------|
| SharedKernel | `packages/shared/src/*` |
| Ports | `apps/api/src/ports/*` |
| Adapters | `apps/api/src/adapters/*` |
| Use cases | `apps/api/src/{intake,clue,seed,execution,metrics,health}/*` |
| Web | `apps/web/src/*` |
| Admin | `apps/admin/src/*` |
| Content gen | `scripts/generate-content.ts`（tsx）→ `apps/web/src/generated/content.json` |
