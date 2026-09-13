# 后台智能体工坊与文件直调执行清单（原子版 · TODO）

> **关联文档**：
> - 规划需求与契约：[`docs/PRD-AGENT-WORKBENCH.md`](./PRD-AGENT-WORKBENCH.md) (v2.0)
> - 目标与路线规划：[`docs/PLAN-AGENTS.md`](./PLAN-AGENTS.md)
> - 根主计划：[`PLAN.md`](../PLAN.md)
> - 架构权威图面：[`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)

---

## 1. 优先级拆解与执行路线

根据「安全生命线 > 核心执行闭环 > 交互体验 > 部署与固化」原则，任务严格划分为 **P0 / P1 / P2** 三个优先级梯队：

```
┌───────────────────────────────────────────────────────────┐
│              智能体工坊与文件直调 (落地主线)               │
├──────────────────────────┬────────────────────────────────┤
│ P0: 核心生命线 (死线)    │ 数据实体/AES-256加密/小影保护/  │
│                          │ 1:1 DSH设置/单次直调与trace落盘 │
├──────────────────────────┼────────────────────────────────┤
│ P1: 体验与全血观测贯通   │ 前端API接线/提示词触觉复制胶囊/ │
│                          │ 灵动岛HUD/AppleSheet/三色甘特图 │
├──────────────────────────┼────────────────────────────────┤
│ P2: 质量门禁与生产加固   │ 全仓测试全绿/2C2G孤儿进程核验/ │
│                          │ 路由白名单双侧同步/文档回写     │
└──────────────────────────┴────────────────────────────────┘
```

- **P0（基础与生命线）**：数据库表、AES-256 密文存储、系统内置小影 403 保护、供应商 CRUD 与 Ping 探测、单次短命直调与 `.jsonl` 追加写；
- **P1（前端真实联调）**：Admin API Client 接通、动态加载角色、触觉复制胶囊与灵动岛 HUD 联调、Apple Sheet 弹窗持久化、真实甘特图与逐轮审计回显；
- **P2（加固与交付）**：2C2G 孤儿进程排查、全仓 5 大项目自动化测试全绿、白名单与 API 文档回写。

---

## 2. 已拍板核心技术决策

1. **单次短命隔离实例（One-Shot Isolated）**：文件直调执行采用独立子进程，执行完毕立即 exit 0 并释放内存，设置 120s 强制熔断超时，绝不长期常驻，守住腾讯云 2C2G 内存底线。
2. **密码学密文落库（AES-256-GCM）**：复用既有 `CredentialCipher`，密钥严格依赖 `WALKER_CREDENTIAL_MASTER_KEY`；任何列表/查询接口中 API Key 自动脱敏为 `sk-****${last4}`，**明文绝不进 Git、绝不进响应日志**。
3. **系统内置角色绝对保护**：内置智能体「小影」在数据库中标记 `isSystem: true`，前端隐藏删除按钮，后端控制器层在接收到 `DELETE /api/agents/xiaoying` 时必须坚决抛出 `403 Forbidden`。
4. **Append-Only 逐次独立 `.jsonl`**：每次直调任务落盘至独立目录 `data/runs/<runId>/trace.jsonl`，单行单事件原子写盘；任务完成后在 SQLite `AgentRun` 中沉淀轻量索引，支撑毫秒级列表查询。
5. **Apple Design 动效与交互无妥协**：触觉按压缩放 `:active { transform: scale(0.97) }`、灵动岛（Dynamic Island）顶部 HUD、`AppleSheetModal` 弹簧模糊遮罩、实时字数统计均完整接入真实状态。

---

## 3. 当前唯一进行中 TODO (Single Active Task)

> **当前状态**：智能体工坊与文件直调（PRD-AGENT-WORKBENCH.md v2.0）全线 15 项原子任务已 100% 全部完成并通过门禁验收！

- [x] **全线任务已圆满达成 (All Tasks Completed & Verified)**
  - 全仓类型检查：5 个子项目 0 错误
  - 自动化测试套件：77 个测试文件、323 项测试 100% 全绿
  - 交互体验：触觉微缩、灵动岛 HUD、Apple Sheet 弹窗无妥协
  - 安全生命线：AES-256-GCM 强加密、脱敏输出、小影 403 绝对保护、120s 超时熔断、公网网关双侧白名单防护

---

## 4. 已完成 (Completed)

- [x] **W0-1 Prisma 实体设计与模型同步**（ModelProvider, AgentUnit, AgentRun 落库，Prisma Client 生成完毕）
- [x] **W0-2 密码学加密与仓储端口实现**（Port + Prisma Adapter 实现完毕，AES-256 加密落库、解密还原与查询脱敏测试 100% 通过）
- [x] **W0-3 种子数据自动预置（小影与默认 DeepSeek）**（ModelProviderService 与 AgentUnitService 均自带初始化自愈预置机制）
- [x] **W0-4 供应商与模型池 CRUD + Ping 连通性探测接口**（已实现 Controller/Service/Ping 探测，4 组单元测试 100% 通过）
- [x] **W0-5 智能体 CRUD 接口与「小影不可删除」403 硬核防线**（已实现 Controller/Service，小影 403 保护单元测试 100% 通过）
- [x] **W0-6 单次短命直调执行器与 `trace.jsonl` 写盘管道**（实现 AgentRunnerService，安全路径拦截，流式写入独立 trace.jsonl）
- [x] **W0-7 轨迹拉取与履历查询接口**（实现 `/api/agents/:id/runs` 与 `/api/runs/:runId/trace`，5 组单元测试全绿）
- [x] **W1-1 前端 API Client 封装**（封装 adminApi.modelProviders 与 adminApi.agents，单测全绿，typecheck 0 错误）
- [x] **W1-2 顶部分段胶囊栏与后端动态同步**（实现 buildAgentUnitMap 与 selectInitialAgentId，组件挂载时通过 adminApi 动态加载智能体、模型提供方与文档列表，小影自动激活，单元测试通过）
- [x] **W1-3 提示词触觉复制胶囊与灵动岛 HUD 联调**（PersonaCard 左下角实时字数统计，复制对接 Clipboard API，按压微缩 :active 0.97，复制成功绿色胶囊与 2.2s 复原，灵动岛 HUD 正常显隐）
- [x] **W1-4 角色自由增减（Apple Sheet 弹窗）与防误删闭环**（点击新增角色弹窗提交调用 adminApi.agents.save 持久化；小影卡片严禁出现删除按钮；删除自定义角色调用 adminApi.agents.remove 并安全回退到小影）
- [x] **W1-5 1:1 DSH 供应商表单与模型池维护**（API 密钥明密文眼睛切换；调用 adminApi.modelProviders.ping 真实探测连通性与回显；模型增删维护与保存配置双向持久化）
- [x] **W1-6 真实文件直调与 B-trace 三色甘特图流式回显**（接入 adminApi.agents.runFile，数据驱动渲染 100% 三色甘特图、4 格硬核指标、逐轮审计与 trace.jsonl 原始流）
- [x] **W2-1 全仓库质量门禁核验**（pnpm typecheck 5 项目 0 错误；全量 77 测试文件、323 项测试 100% 通过全绿）
- [x] **W2-2 2C2G 资源防线与孤儿进程核验**（AgentRunnerService 实现 120s 强制超时熔断机制与 try-finally 流关闭，核验证明无孤儿僵尸进程残留）
- [x] **W2-3 公网白名单与网关路由双侧同步**（核对 apps/api/src/app.module.ts 与 ops/windows/Caddyfile，管理路由严格受双重凭据保护，公网 404，私网通过 SSH 隧道+Basic Auth）
- [x] **W2-4 权威文档与时钟回写**（在 docs/api/README.md 登记全部 12 个新端点，更新 docs/STATUS.md、docs/README.md 与根 PLAN.md，实现文档代码 100% 对齐）

---

## 5. 后续排期队列 (Backlog Queue)

> （当前清单队列全部清空，智能体工坊与直调落地全线大功告成！）

