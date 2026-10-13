# Walker 后台智能体工坊与模型设置 PRD (Model Settings & Agent Workbench)

## 0. 文档信息

| 字段 | 内容 |
|---|---|
| 产品名称 | Walker 后台智能体工坊与模型设置 (Model Settings & Agent Workbench) |
| 文档类型 | 产品需求与架构契约 (PRD v2.0) |
| 版本 | **v2.0 (全功能与 Apple Design 交互落地版)** |
| 日期 | 2026-09-09 |
| 核心用户 | 个人站站主（duola / 一人单兵创作者） |
| 产品形态 | Admin Web 页面（以 Agent 为核心的胶囊画廊 + 提示词触觉卡片 + 1:1 DSH 模型设置 + B-trace 轨迹可观测台）+ Nest API 端点 + 独立 `.jsonl` 事件流 |
| 访问路径 | 侧边栏「站」分类下的「智能体」(`ADMIN_ROUTES.agents = '/agents'`) |
| 首个证明点 | 站主在后台自由切换智能体，一键复制系统提示词（带触觉反馈与灵动岛 HUD）；无缝增减自定义角色与模型项；选定本地 `content/log/*.md` 发起直调，毫秒级流式回显时序甘特图、逐轮审计与 70%+ 提示词缓存账单 |
| 权威级别 | 规划与设计权威；遵守 `PLAN.md` 宪法、`docs/PRODUCT.md` 边界与 `AGENTS.md` 运维规范 |

---

## 1. 产品背景与定位：弃 A 留 B，以 Agent 为第一等公民

在对 DeepSeek Harness (DSH) 官方界面深度体验与实测后，本工坊明确以下核心技术取舍与产品哲学：

```
┌────────────────────────────────────────────────────────┐
│                   DeepSeek Harness                     │
├──────────────────────────┬─────────────────────────────┤
│   A 处：通用聊天会话树   │    B 处：运行轨迹 (Trace)    │
│  (itab / daily / 散漫闲聊)│  (时序甘特条 / 工具回显 / 账单)  │
├──────────────────────────┼─────────────────────────────┤
│         ❌ 彻底摒弃       │          ✅ 全血吸纳         │
│  • 散乱聊天噪音，无版本管理 │  • 时序甘特图（输入/模型/工具） │
│  • 污染博客文章工程结构     │  • 工具调用透明参数与产物审计   │
│  • 与本地 Markdown 体系脱节│  • 70%+ 提示词缓存命中省钱账单  │
└──────────────────────────┴─────────────────────────────┘
```

1. **彻底摒弃 A 处通用闲聊树**：Walker 不做随意的聊天工具，坚决不把个人站变成杂乱的无边界问答窗口。
2. **全血吸纳 B 处工业级轨迹观测台**：时序甘特图（三色流）、工具调用透明审计链（`tool_name { params } -> output`）、底层性能账单（耗时细分、吐字速率、Token 缓存命中率）完整移植。
3. **以 Agent 为第一等公民**：以顶部 Agent 分段胶囊栏与本地 Markdown 文件 (`content/log/*.md`) 为第一入口，实现精准人设定义、模型挂载与文件级直调。
4. **注入 Apple Design 灵魂**：摒弃机械粗糙的工程师后台，贯彻流体微动效、触觉缩放反馈、macOS Inset Grouped 扁平卡片与灵动岛（Dynamic Island）HUD。

---

## 2. 用户核心功能矩阵 (四大核心能力)

用户显式要求的四大核心功能已形成完整交互与逻辑闭环：

### 2.1 功能一：供应商与模型配置 (1:1 DSH API 规范)
1:1 还原 DeepSeek Harness 官方 API 设置区域，精炼克制：
- **Base URL**：文本输入框，支持自定义代理/中转端点（如 `https://api.deepseek.com/v1`）；
- **API 格式**：支持主流协议标准转换：
  - `Anthropic Messages (/v1/messages)`
  - `OpenAI Compatible (/v1/chat/completions)`
  - `DeepSeek Native (/v1/chat/completions)`
- **API Key**：密文密码框，附带 `👁️` 眼睛显隐切换。落库必须经 `WALKER_CREDENTIAL_MASTER_KEY` 实施 **AES-256-GCM 强加密**，**密钥绝不进 Git**；
- **模型池列表 (Model Catalog)**：展示当前供应商挂载的模型项，包含模型标识（等宽字体展示）、能力标签胶囊（如 `[思考]`, `[128K]`, `[视觉]`）；
- **连通测试 (Ping)**：单项模型支持一键连通性探测，毫秒级回显延迟状态（如 `200 OK · 112ms`）；
- **+ 添加模型**：位于模型池底部，点击弹出 Apple Sheet 弹窗，输入模型标识与能力标签后实时追加。

### 2.2 功能二：角色系统提示词与触觉复制胶囊
- **提示词卡片 (Persona Card)**：专属卡片展示当前 Agent 的核心职责设定与系统提示词（System Prompt）；
- **实时字数统计 (Character Counter)**：左侧徽章实时显示文本长度（如 `482 字符`），让站主对上下文容量消耗心中有数；
- **触觉复制胶囊 (Tactile Copy Capsule)**：
  - 常态显示：`[ 📋 复制提示词 ]`，支持轻触按压 `:active { transform: scale(0.97); }`；
  - 点击触发：通过浏览器剪贴板 API 写入系统剪贴板，按钮即刻平滑过渡为高亮绿色 `[ ✓ 已复制到剪贴板 ]`；
  - 灵动岛 HUD 呼应：页面正上方自顶部平滑滑出灵动岛（Dynamic Island）药丸 HUD，回显 `✓ 提示词已复制到剪贴板，可直接发给 AI 接入`；
  - 自动复原：2200ms 延迟后自动无缝回弹至常态，丝滑无残留。

### 2.3 功能三：角色增减与系统内置保护
- **顶部智能体胶囊栏 (Agent Capsule Bar)**：
  - 扁平药丸（Capsule）分段选择器，一目了然展示所有角色（如「小影」、「文章工匠」、「极客访客」）；
  - 活跃态高亮，选中带有柔和阴影与平滑过渡；
- **系统内置角色绝对保护 (System Guard)**：
  - 内置角色「小影」标记为 `isSystem: true`；
  - 界面隐藏删除按钮，禁止站主误删；
  - 后端 API 硬核校验：若收到删除小影的请求，直接抛出 `403 Forbidden`，确保底座核心智能体永不丢失；
- **自定义角色自由增减**：
  - 点击 `+ 新增角色` 按钮，唤出 Apple Sheet 磨砂半透明弹窗；
  - 填写智能体名称、选择角色图标（Bot / PenTool / Sparkles）、选择挂载模型、配置初始系统提示词；
  - 自定义角色卡片右上角显示微型删除图标，二次确认后可安全移除。

### 2.4 功能四：文件直调与 B-trace 全血可观测台
- **本地 Markdown 直连 (SSOT)**：
  - 拒绝假大空的聊天气泡，直接读取 `content/log/*.md` 下的真实博客文章；
  - 提供简洁指令输入框，让 Agent 直接针对目标文章执行优化、重构或审校；
- **时序甘特色块条 (Timeline Gantt Bar)**：
  - 真实反映运行全貌的三色流（总和严格 100%）：
    - 🟦 **输入阶段 (Input)**：上下文注入与文件装载耗时（占比 ~18%）；
    - 🟪 **模型推理 (Model)**：思考链与内容生成耗时（占比 ~58%）；
    - 🟧 **工具执行 (Tool)**：文件补丁与写盘动作耗时（占比 ~24%）；
- **4 格硬核性能账单 (Telemetry Ledger)**：
  - `执行耗时`：精准细分总耗时（如 `4.2s (LLM 2.4s + 工具 1.8s)`）；
  - `交互轮次 / 步数`：展示单次直调执行的 Turns / Steps；
  - `吐字速率`：首 Token 延迟与峰值速率（如 `48.5 tok/s`）；
  - `提示词缓存命中率`：直观展示 DeepSeek 提示词缓存命中比例（如 `72.5%`），直击省钱核心；
- **逐轮透明工具审计 (Turn-by-turn Audit)**：
  - 展开卡片清晰披露：`第 N 轮`、`用户指令`、`助手推导思考`、`工具调用入参 (JSON)`、`执行状态与产物`；
  - 拒绝黑盒操作，站主对所有代码与文章修改拥有完全知情权；
- **折叠式原始 Trace 日志**：
  - 支持一键展开查看底层的 Append-Only `trace.jsonl` 原文，方便极客调试与问题复现。

---

## 3. Apple Design 交互与物理动效设计契约

本工坊全面遵循 Apple Human Interface Guidelines 与流体微交互准则：

| 交互维度 | 设计规范 | 落地实现 |
|---|---|---|
| **触觉按压 (Tactile Press)** | 模拟物理按键行程，所有操作按钮按下时微缩 | `button:active { transform: scale(0.97); }`（搭配 `cubic-bezier(0.2, 0.8, 0.2, 1)`） |
| **灵动岛 HUD (Dynamic Island)** | 顶部浮动悬浮胶囊，提示成功状态，轻量克制 | 黑色半透明亚克力胶囊、绿色圆点、毛玻璃背景滤镜 `backdrop-blur(16px)`，自 `-20px` 弹性下落 |
| **Apple Sheet 弹窗** | 居中悬浮卡片、大圆角、背景弹簧虚化 | `AppleSheetModal` 组件：`rgba(0,0,0,0.5)` 磨砂遮罩 + Inset Grouped 圆角卡片（`rounded-3xl`） |
| **分段胶囊栏 (Capsules)** | 紧凑无界的高级灰胶囊列表 | 选中项纯白卡片加轻微阴影，未选中项浅灰半透，切换时无跳动 |
| **状态内聚 (State Isolation)** | 弹窗内输入不污染全局画布 | 弹窗内部表单状态封装在 Modal 组件内，输入过程外层画布 0 re-render |

---

## 4. 前端组件架构与解耦规范 (Clean Code 体系)

经严格架构重构，前端代码彻底告别单体臃肿，划分为 6 个单一职责组件与 1 个通用容器：

```
apps/admin/src/pages/AgentWorkbenchPage.tsx (页面根入口：管理全局状态与数据流)
│
├── components/AppleSheetModal.tsx (通用底座：Apple 弹簧毛玻璃 Sheet 弹窗容器)
│
├── AgentCapsuleBar (智能体分段胶囊栏：展示角色列表、当前激活项、新增按钮)
│
├── AgentPersonaCard (角色人设卡片：系统提示词定义、实时字数徽章、触觉复制胶囊)
│
├── ModelCatalogSection (1:1 DSH API 配置：Base URL、API 格式、API Key、模型池与 Ping 连通性)
│
├── TraceRunnerSection (文件直调与可观测台：文件下拉框、指令输入、三色甘特图、性能账单、工具审计)
│
├── NewAgentModal (新增智能体弹窗：名称、图标、挂载模型、初始提示词，状态完全内聚)
│
└── AddModelModal (添加模型弹窗：模型标识、能力标签勾选/输入，状态完全内聚)
```

---

## 5. 数据存储架构设计 (SQLite + Append-Only `.jsonl`)

为保证腾讯云轻量服务器（2C2G）稳定不崩，采用双层解耦存储：

### 5.1 Prisma Schema 规范

```prisma
/// 模型供应商配置
model ModelProvider {
  id           String      @id // 'deepseek', 'stepfun' 或 c_xxxx (自定义)
  name         String      // 供应商显示名
  category     String      // 'official' | 'custom'
  enabled      Boolean     @default(true)
  baseUrl      String      // 1. Base URL
  apiFormat    String      @default("openai-compatible") // 2. API 格式
  apiKey       String      // 3. API Key (AES-256-GCM 密文落库)
  modelsJson   String      // 4. 模型列表与能力标签 (JSON 数组)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  agents       AgentUnit[]
}

/// 智能体单位
model AgentUnit {
  id           String         @id // 'xiaoying' 或 c_xxxx (自定义)
  name         String         // 智能体名称
  icon         String         @default("bot") // 'bot' | 'pen-tool' | 'sparkles'
  isSystem     Boolean        @default(false) // 小影为 true，不可删除
  providerId   String?        // 挂载的供应商
  modelId      String         @default("deepseek-chat") // 挂载的具体模型标识
  prompt       String         // 系统提示词定义
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  provider     ModelProvider? @relation(fields: [providerId], references: [id], onDelete: SetNull)
  runs         AgentRun[]
}

/// 智能体运行履历索引
model AgentRun {
  id               String      @id @default(cuid())
  agentId          String
  targetFile       String?     // content/log/xxx.md
  instruction      String      // 指令文本
  output           String      // 最终产物
  model            String      // 调用模型
  tokensPrompt     Int         @default(0)
  tokensCompletion Int         @default(0)
  tokensCacheHit   Int         @default(0)
  cacheHitPercent  Float       @default(0.0) // 缓存命中率 (如 72.5)
  elapsedMs        Int         @default(0)
  traceLogPath     String?     // 对应的独立 trace.jsonl 物理路径
  status           String      @default("SUCCESS") // 'SUCCESS' | 'FAILED'
  createdAt        DateTime    @default(now())

  agent            AgentUnit   @relation(fields: [agentId], references: [id], onDelete: Cascade)
  @@index([agentId])
  @@index([createdAt])
}
```

### 5.2 为什么必须是逐次独立 `.jsonl`？
1. **Append-Only O(1) 写入**：单轮事件仅向文件尾部写单行 JSON，内存开销为常数级；
2. **按次隔离**：每次执行独立目录 `data/runs/<runId>/trace.jsonl`，彻底规避文件并发锁与全量 JSON 覆写导致的崩溃损坏；
3. **按需流式读取**：前端点击【查看原始日志】时才通过流式接口分片拉取，Node.js 进程不加载大体积 JSON 对象。

---

## 6. API 契约设计

| 方法 | 路径 | 鉴权 | 描述 |
|---|---|---|---|
| `GET` | `/api/model-providers` | Admin Token | 获取所有供应商及模型列表 |
| `POST` | `/api/model-providers` | Admin Token | 新增自定义供应商 |
| `PUT` | `/api/model-providers/:id` | Admin Token | 更新供应商设置（Base URL, API Key 等） |
| `DELETE` | `/api/model-providers/:id` | Admin Token | 删除自定义供应商 |
| `POST` | `/api/model-providers/:id/ping` | Admin Token | 连通测试，返回探测状态与毫秒延迟 |
| `GET` | `/api/agents` | Admin Token | 获取智能体列表（含小影与自定义角色） |
| `POST` | `/api/agents` | Admin Token | 新增或更新智能体配置 |
| `DELETE` | `/api/agents/:id` | Admin Token | 删除智能体（若为小影则硬核拦截抛 403） |
| `POST` | `/api/agents/:id/run-file` | Admin Token | **核心直调接口**：启动单次子进程执行并流式推送甘特进度与 B-trace |
| `GET` | `/api/agents/:id/runs` | Admin Token | 获取该 Agent 的历史运行轻量索引 |
| `GET` | `/api/runs/:runId/trace` | Admin Token | 读取该次运行的完整 `trace.jsonl` |

---

## 7. 可验证验收标准 (Provable Acceptance Criteria)

| 核心特性 | 验证操作 | 预期可观测结果 | 证明命令 / 手段 |
|---|---|---|---|
| **1. 模型配置** | 1. 访问 `/agents` 页面<br>2. 点击 API Key 密码框右侧眼睛 👁️<br>3. 点击模型的 Ping 按钮 | • 密文与明文自由切换<br>• Ping 按钮触发探测并在 500ms 内回显 `200 OK · 112ms` 绿色状态 | 页面交互检查 + 单元测试覆盖 |
| **2. 提示词复制** | 1. 查看提示词卡片左下角<br>2. 点击「📋 复制提示词」按钮 | • 准确显示当前字数（如 `482 字符`）<br>• 按钮微缩 0.97 按压，瞬间变绿 `✓ 已复制到剪贴板`<br>• 顶部灵动岛滑出提示，2.2s 后平滑淡出复原 | 剪贴板读取内容核对 + 单元测试 |
| **3. 增减角色** | 1. 选中系统角色「小影」<br>2. 点击「+ 新增角色」并提交「测试助手」<br>3. 选中「测试助手」点击右上角删除 | • 「小影」右上角无删除按钮<br>• 弹窗丝滑唤起，提交后胶囊栏即刻出现新角色且自动选中<br>• 删除新角色后平滑回退选中「小影」 | `AgentWorkbenchPage.test.ts` (用例 1 & 2) |
| **4. B-trace 直调** | 1. 选择一篇文章并输入指令<br>2. 点击「开始直调执行」 | • 按钮显示「执行中...」<br>• 甘特图呈现三色流（输入/模型/工具，占比总和 100%）<br>• 4 格账单回显真实耗时与 70%+ 缓存命中率<br>• 逐轮审计透明展示工具调用入参 | `AgentWorkbenchPage.test.ts` (用例 3: 甘特图 100% 校验) |
| **5. 代码质量与门禁** | 运行自动化测试与类型检查 | • 全局 0 TypeScript 错误<br>• 5 大项目（shared/api/web/admin/agent）单元测试全部通过 | `pnpm typecheck`<br>`pnpm test:shared && pnpm test:api && pnpm test:web && pnpm test:agent` |

