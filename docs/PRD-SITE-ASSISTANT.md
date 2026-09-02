# AdgaiWalker 站内助手 PRD

## 0. 文档信息

| 字段 | 内容 |
|---|---|
| 产品名称 | Walker 站内助手（访客问答 + 内容推荐） |
| 文档类型 | 特性 PRD（含已拍板的技术决策） |
| 版本 | v1.0 |
| 日期 | 2026-08-30 |
| 核心用户 | 想了解站主的访客；带问题来找内容的读者 |
| 产品形态 | Nest API 端点 + web 对话框；DeepSeek Harness 作执行框架 |
| 首个证明点 | 访客在对话框问「duola 是谁」，得到正确且引用站内文章的回答 |
| 权威级别 | 规划文档；与 PRODUCT/ENGINEERING/STATUS 冲突时以后者为准 |

## 1. 产品结论

站内助手不是通用聊天机器人，它验证一个明确承诺：

> 访客用一句话就能了解站主与站内内容；助手的每个回答都落在站内证据上（引用可引用的文章），答不上就承认、并把访客送到正确的入口（卡口或联系渠道）。

助手管**认知**（了解人、找到内容），卡口管**行动**（拿下一步）。两者不合并、不互抢。

## 2. 决策锚点

本 PRD 依据以下已确认结论；后续范围判断以本节为准。

### 2.1 产品决策

1. 站主提出的四项需求（对话了解我 / 开放文章阅读 / 资源教程推荐 / 智能搜索）**收敛为一个助手引擎 + 三个入口**，不做四个功能。
2. 三个入口：① 对话框（核心交付）；② 搜索无结果时升级（普通搜索保留不动）；③ 推荐（不独立做，即助手回答中的自然引用）。
3. 「获取」与卡口（/tools）**不动**。卡口的 AI nextStep（已实现的 V2）与本助手共用 aiUsePolicy 接地与校验哲学，但职责分离。
4. 首发渠道**仅网页对话框**。多平台（QQ/公众号）是后续加脸，微信个人号任何阶段都不做（灰产易封）。
5. 知识注入用**整库进 prompt**：全站 28 篇正文约 3.4 万字符（≈1.7 万 token）直接进上下文，零检索代码；文章超过约 50 篇再切换「索引 + 按需取正文」。
6. 文章阅读权限 V1 **不做权限层**：助手只引用 `published` 且 `aiUsePolicy.citable` 的文章；草稿与不可引用内容绝不进入回答（fail-closed）。付费/会员需求出现后再议。
7. 助手收到的每个问题**落库进线索池管线**（FeatureEvent），供站主人工筛选为题苗——问得最多的问题就是下一篇该写的内容。线索主选永远人工。
8. AI 三点论在本站的落位：**教师 = 助手的回答方式**（学习路径式回答，非百科式）；**跨领域协作 = 助手的转化出口**（把工程语言翻译成人话，末尾带协作入口）；**辅助工作 = 卡口**（已由卡口承担）。
9. 对外部 AI 已能经 llms.txt 读站这一事实，站内助手的增量是四点：站主口吻、强制执行 aiUsePolicy 边界、转化路径、问题数据留存。
10. 站内助手的战略意义：对话框是新的线索入口；同时「官方 harness 驱动自己的站」是「样板节点」最硬的证据，本身就是一篇站内文章的素材。

### 2.2 技术决策

| 决策项 | 结论 | 备注 |
|---|---|---|
| 执行框架 | DeepSeek Harness **0.1.2-alpha.1**，官方 GitHub 基线（非 itab 内嵌份） | 本地 clone 于 `~/Desktop/deepseek-harness`，不 vendor 进本仓库 |
| 接入形态 | TS SDK client（`@deepseek-ai/dsh-sdk-client`）spawn `--profile sdk` 子进程，stdio JSON-RPC | Web 实例 HTTP 层 loopback-only + 浏览器鉴权，不用于服务间通信 |
| 公开入口 | Nest `/api/assistant` 是唯一公开面 | 限流 / 配额 / citation 校验 / 落库全在网关 |
| 隔振层 | Run 合同 v1 先行：`{ question, answer, citations, sessionId, turnId, aiUsedFlag, elapsedMs }` | harness rc 阶段破坏性变更频发，合同保证实现可换 |
| 模型 | 现成 DeepSeek key（`DEEPSEEK_API_KEY`；`DEEPSEEK_BASE_URL` 可换 OpenAI 兼容端点） | 架构不锁模型；凭据不进仓库 |
| 只读边界 | `DSH_PERMISSION_MODE=read-only`；V1 不给助手挂任何工具（整库已在 prompt 中，无需 bash/fs） | 沙箱只读 + ask 审批；进一步收敛攻击面 |
| 超时策略 | 单问 15s，超时弃结果走规则兜底 | TS SDK 无 mid-turn cancel；需要 cancel/close 时升级 ACP profile（`--profile acp` 已确认支持） |
| 兜底 | RuleAssistantAdapter：静态回答（热门文章 + 卡口引导 + 联系入口），`aiUsedFlag=false` 如实标注 | AI 关 / 超时 / 异常 / 输出不合合同，全部走兜底 |
| 部署纪律 | 开发锁本地 clone 版本；生产锁同一 tag 不可变部署；key 只经 env / `$DSH_HOME/.credentials.yaml` | 盒子 2C2G，runtime 常驻内存在阶段 0 实测后再确认 |
| 包管理 | pnpm 全程（仓库锁定 pnpm@11.7.0，经 Corepack） | — |

### 2.3 被否决的备选（记录理由，防止重议）

- **Cordis 裸用**：harness 本身就是 Cordis 应用——选 harness 已同时得到 Cordis 底座，无需二选一。
- **itab 内嵌 harness（0.1.0-rc.5）当运行时**：落后 5 个版本且带 itab 专用补丁；仅当历史参考。
- **pi / Codex CLI 进生产服务**：编码工具的强项（shell/文件写）在公开服务里全是攻击面；pi 留在个人开发位。
- **Nest 内裸调模型 API**：最快但多轮会话/运行时形态要自建，放弃 harness 的会话层；保留为「推翻条件触发时」的逃生路线。
- **向量库 / RAG 管道**：28 篇 1.7 万 token，整库进 prompt 即可，属过度设计。

## 3. 背景与问题

- 访客带着问题来，站内唯一的提问入口（卡口）只服务「拿下一步」；想了解站主、找内容只能靠翻页 + 关键词搜索。
- 实测痛点：搜索输入自然语言（「我想用 AI 帮我写周报」）必然无结果——本地实现是子串匹配，生产 Pagefind 也只到分词检索。
- 站主画像、方法论、装备清单分散在 /about /me /gear 等页，没有「一句话问到」的路径。
- 外部 AI 已经在读这个站（llms.txt / llms-full.txt 是构建产物），站内自己却没有 AI——增量价值没有被站主侧收回。

## 4. 目标用户与核心任务

| 用户 | 场景 | 期待 |
|---|---|---|
| 想了解站主的访客 | 「duola 是谁」「他为什么用 Mac」 | 一句话得到基于站内证据的回答 |
| 带问题的读者 | 「想学 AI 从哪开始」「有没有省钱的教程」 | 得到路径式推荐并附文章链接 |
| 卡在别处的访客 | 问的其实是行动问题 | 被诚实地送到卡口，而不是硬答 |
| 站主（间接） | 看助手问题池 | 从真实问题里挑下一篇文章的题苗 |

## 5. 范围

### 5.1 V1 范围

- `/api/assistant` 端点：多轮会话（按访客匿名标识映射 harness session）、限流、游客配额、citation fail-closed 校验、问题落库；
- DeepSeekHarnessAdapter + RuleAssistantAdapter（双实现，AI 可关）；
- 人设 + 整库 prompt（复用 V2 的 `FsSiteContentIndex`，仅 citable 条目）；
- web 对话框面板（抽屉或独立页 `/ask`）+ 关于页/关于我入口 + 搜索无结果升级按钮；
- 「AI / 规则」来源徽标（沿用卡口的如实标注模式）。

### 5.2 明确不做（V1）

- 文章权限层、账号体系、登录；
- 独立推荐系统（推荐 = 助手回答的自然引用）；
- 全局悬浮聊天窗（入口收敛：对话框有明确入口，不到处跟着）；
- ACP / MCP / 多平台渠道（QQ、公众号、Telegram）；
- 向量库、embedding 管道；
- 微信个人号接入（任何阶段）。

### 5.3 后续边界（按验证证据启动，不提前建设）

1. 文章超过约 50 篇 → 知识注入切「索引 + 按需取正文」；
2. 需要会话取消/关闭/多会话管理 → SDK 升级 ACP profile；
3. 公网部署 → Nest + harness 子进程上盒子（顺手清 STATUS 的公网 API 缺口）；
4. 对话质量稳定后 → QQ/公众号渠道（DSH 插件生态已有 dsh-im、腾讯官方维护的 dsh-qqbot 等 IM 接入插件，接入成本远低于自建；另立 PRD）。

## 6. 非协商原则

1. **AI 可关。** `AI_ENABLED≠true` 时助手仍返回非空静态回答；规则版永远在。
2. **禁止 AI 自动主选。** 问题池进线索管线，筛选与主选永远人工。
3. **aiUsePolicy 不可放宽。** 回答中引用的文章 slug 必须 ⊆ citable 集合，违规即拒收该引用；不可引用内容绝不进入 prompt。
4. **诚实。** 答不上就说答不上并给出正确入口；AI/规则来源如实标注；不假装智能。
5. **Razor。** 不做不增加线索、对准、可验结果的能力。
6. **密钥不落仓库。** key 只经环境变量或 `$DSH_HOME/.credentials.yaml`。

## 7. 人与 AI 的责任边界

| 环节 | 人（站主） | AI（助手） |
|---|---|---|
| 人设与口径 | 定义人设 prompt、审核回答风格 | 在人设内回答，不即兴发明站主观点 |
| 内容引用 | 定 aiUsePolicy（每篇） | 只引用 citable 条目，fail-closed |
| 问题池 | 筛选、主选为题苗 | 记录问题，不筛选、不主选 |
| 行动建议 | — | 不做；行动问题送卡口 |
| 兜底内容 | 维护静态推荐清单 | AI 不可用时原样呈现 |

## 8. 观测与日志

三层分工，执行真相不复制：

| 层 | 载体 | 记什么 | 谁消费 |
|---|---|---|---|
| 执行真相 | harness 会话日志（`$DSH_HOME/sessions`，append-only JSONL，seq 连续可重放校验；`session-query` 可查） | 每轮完整事件：turn 起止与结束原因、assistant 消息、usage（token 计量） | 审计与排查，按 sessionId/turnId 查 |
| 业务日志 | Nest：FeatureEvent（`assistant.ask` attempt/success/fail）+ Run 合同记录（SQLite） | 问题原文、回答摘要、citations、sessionId/turnId/traceId、aiUsedFlag、elapsedMs、降级原因 | 问题池（站主筛题苗）、运营观测 |
| 运维日志 | 进程层（阶段 3 部署时建设，盒子为 Windows 形态） | 子进程 spawn/exit、异常摘要、内存采样、延迟分布；stdout/stderr 不透传（防 key/路径泄漏） | 部署健康 |

纪律：

1. traceId 贯穿：request-id（网关现有 middleware）→ harness turnId → FeatureEvent props → Run 记录，一次「答歪」可定位到具体 turn。
2. 降级即事件：超时/合同拒收/规则兜底每次落 fail 记录——兜底率是第 11 节推翻条件的观测信号。
3. 执行真相留 harness，Walker 库只存合同摘要与问题原文，靠 sessionId 关联；换 runtime 不丢业务数据。
4. 密钥与内部路径不进任何日志（非协商第 6 条）。

四个看板数据源全部由日志长出：问什么（问题池）、答得稳不稳（兜底率）、花多少（harness usage 聚合）、快不快（延迟分布）。

## 9. 端到端流程

```text
访客在对话框提问
→ Nest 网关：限流/配额/匿名会话映射
→ AI 开：人设+整库 prompt 的 harness 会话回答（15s 超时）
   → Run 合同校验（citations ⊆ citable）→ 通过则返回 aiUsedFlag=true
   → 任何失败 → 规则兜底（静态回答）
→ AI 关：直接规则兜底
→ 问题落 FeatureEvent（线索池管线）
→ 回答渲染：来源徽标 + 引用文章链接 + 转化出口（卡口/联系）
```

搜索无结果升级：普通搜索保持现状；`hadResults=false` 时弹窗显示「没找到？问站内助手 →」，携带搜索词直达对话框。

## 10. 验收标准

| 项 | 验收线 |
|---|---|
| harness 冒烟 | 阶段 0：源码 build 后 `dsh headless` 出答案；runtime 子进程常驻内存已实测记录（盒子预算依据） |
| AI 关 | `/api/assistant` 返回非空静态回答，`aiUsedFlag=false`，不调用 harness |
| AI 开（质量） | 本地 e2e：「duola 是谁」「想学 AI 从哪开始」回答正确、引用站内文章且 citations ⊆ citable |
| AI 开（降级） | 模拟超时/异常/输出不合合同 → 规则兜底，不抛错、不假装成功 |
| 边界 | 不可引用内容不出现在任何回答中（注入测试用例） |
| 工程 | 全仓 typecheck + 相关单测全绿 |
| 线索 | 每个问题落 FeatureEvent，可在管理侧查到 |

## 11. 推翻条件

出现以下任一结果时，不沿当前路线扩建，先重审本 PRD：

- 回答质量持续差（身份/引用错误率高）→ 重审 prompt 与知识注入方式，或切「索引 + 按需取正文」；
- 单问延迟长期逼近 15s、兜底率过高 → 换更小模型或轻量直连 API（Run 合同保证可换）；
- harness runtime 常驻内存超盒子预算（约 >800MB）→ 换 headless 最小 profile 或裸 API 路线；
- harness rc 版本升级的适配成本持续高于合同隔振收益 → 评估放弃 harness 运行时、保留合同直连模型；
- 访客问题量长期为零 → 重新评估入口位置（对话框本身可能不是需求）。

## 12. 实施切片与当前进度

| 切片 | 范围 | 状态 |
|---|---|---|
| 阶段 0 | harness 本机跑通：pnpm install/build → headless 冒烟 → 凭据检查 → 内存实测 | 进行中（2026-08-30） |
| 阶段 1 | Run 合同 + AssistantRunnerPort + 双 Adapter + `/api/assistant` + 单测 + 本地 e2e | 待开始 |
| 阶段 2 | web 对话框面板 + 关于页入口 + 搜索无结果升级 | 未开始 |
| 阶段 3 | 公网部署（盒子）+ 渠道扩展评估 | 未开始 |

## 13. 风险与应对

| 风险 | 会破坏什么 | 应对 |
|---|---|---|
| harness rc 破坏性变更 | adapter 编译失败 | 锁版本不可变部署；Run 合同隔振；升级是主动动作 |
| 公开面滥用 / token 成本 | 费用失控 | 网关限流 + 游客配额；必要时加全站每日 token 预算熔断（网关刚性，不指望模型自觉） |
| 模型幻觉站主信息 | 信任 | 整库进 prompt + 只引用 citable + 「答不上就承认」人设 + 网关 citation 校验 |
| 无 cancel 导致超时后空转 | 资源浪费 | 弃结果走兜底；并发上限 1–2；需要时升 ACP |
| 密钥泄漏 | 安全 | key 只经 env / `$DSH_HOME`；不进 Git、日志、错误报告 |
| 过早扩张（多平台/权限/推荐系统） | 延迟核心验证 | 本 PRD 的「不做」清单 + Razor 原则约束 |
