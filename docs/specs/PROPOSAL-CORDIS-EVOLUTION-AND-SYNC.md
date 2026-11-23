---
status: draft
type: proposal
title: 向 Cordis 时空可组合演进的分阶裁决（先修正确性，再证插件价值）
version: v0.1
last_verified: 2026-11-23
ssot: false
applies_to: [api, admin, web, agent, ops]
---

# 提案：向 Cordis 时空可组合演进的分阶裁决

> **状态：第 0 关裁决完成（`53855fd`）、第 1 关已部署上线（`137e447`）、第 2 关（2A：`apps/agent` 响应式 `KnowledgeService`）已验收。** 本文是任务书 + 审理记录，不是执行进度源；原子进度仍只在根 `to-do.md`。
> 第 0 关前置取证与一页裁决书见：[GATE0-CORDIS-AND-SYNC-2026-11-23.md](../evidence/GATE0-CORDIS-AND-SYNC-2026-11-23.md)。

## 一、来由（两条线如何合为一件事）

1. **痛点线**：在 `admin.iwalk.pro` 登录后同步不了文章、发布难受；需要本地（Obsidian / VS Code）与网页后台两端都能写、单篇顺畅上线、可靠备份到 GitHub。
2. **方向线**：整体项目最终想走向 Cordis（*A Programming Paradigm for Spatiotemporal Composability*）式「一切皆插件」架构。
3. **融合原则**：同步修复是检验架构方向的第一块真实切片，但**正确性修复不得等待架构迁移**，且两者的收益必须能分开归因（见第四节）。

## 二、审理记录：上一版融合题目的缺陷（以仓库实测为据）

上一版融合题目「变大而没有变深」，经核对发现以下问题。数字为 2026-11-23 在本仓库实测。

| # | 上一版声称 | 实测事实 | 判定 |
|---|---|---|---|
| 1 | 项目缺能力缝，应收敛到「≤6–8 条正交能力缝」 | `apps/api/src/ports` 70 个端口、`adapters` 73 个适配器、[kernel.module.ts](../../apps/api/src/kernel.module.ts) 76 个注册项——已是端口/适配器分层；「6–8」是拍脑袋数字 | 前提错：缺的不是缝，是集中接线与生命周期语义 |
| 2 | Cordis 应覆盖全仓 40+ 目录 | Cordis 管的是**运行时效应的生命周期**；API 中长驻生命周期效应约 7 处：`harness-assistant.adapter`、`prisma.adapter`、`assistant-event-recorder.service`、`agent-execution.service`、`conversation-deletion.service`、`conversation-export.service`、`reminder-scan.service`，外加同步任务 | 适用面放错 |
| 3 | 以同步/发布作 Cordis 首块验证切片 | 同步/发布本质是不可逆效应（git push、Vercel 部署、版本追加）；修好它主要靠拓扑改变，不依赖 Cordis | 因果混淆：修好了说不清是谁的功劳，且会拖慢正确性修复 |
| 4 | 「连续 5–10 篇真实写作」验收 | 共 32 篇；近 90 天 `content/log` 仅 7 次提交 | 基础频率不成立，验收要等 2–4 个月 |
| 5 | 用 `git log` 共变统计衡量变更放大 | `kernel.module.ts` 在 507 个提交中被改 23 次，但这些提交平均每次改约 88 个文件（批量提交） | 测量无效：共变统计被提交粒度淹没 |
| 6 | 「挂载/卸载 20 轮句柄归零」作主验收 | 这证明 Cordis 能用（论文与 Koishi 已证），不证明项目变好 | 量的是手段不是结果 |
| 7 | 论文编号 arXiv:2608.25512 及作者 | 来自搜索摘要，未读原文 | 未核实，不得作前提 |
| 8 | 隐含「统一 Context 树」 | `apps/agent` 依赖 `@deepseek-ai/cordis ^4.0.1`，`apps/api` 依赖 `4.0.2`（经 dsh），两版本并存（目前分属不同进程，暂无冲突） | 若要合并，版本统一是前置条件 |
| 9 | 「复核 PLAN.md 的否决」 | [PLAN.md](../../PLAN.md) §6 有明确触发条件：「工作站成为长驻编排器（热装卸真需求出现）」 | 应核验触发条件是否满足，而非泛泛重议 |
| 10 | 未提及 | 最危险的状态是半迁移：同一进程内 Nest 与 Cordis 两套依赖注入容器长期并存 | 缺「禁止永久半迁移」规则 |

### 已从代码证实的同步/发布缺陷（第一轮取证，供第 1 关使用）

- 盒子上 `C:\Walker\app` 既是运行中的代码目录又是网页后台写文章的工作区；[content-sync.service.ts](../../apps/api/src/content-sync/content-sync.service.ts) 直接对它执行 `git pull --rebase --autostash`。
- [content-publish.ts](../../scripts/content-publish.ts) 把派生产物 `apps/web/src/generated/{content,graph,article-versions}.json` 提交进主分支，而 [build-web.ts](../../scripts/build-web.ts) 在 Vercel 构建时本就会重新生成——两端改不同文章也必然在 JSON 上冲突。
- [content-release.service.ts](../../apps/api/src/content-release/content-release.service.ts) 在线上核验通过**之后**才向 `content/versions` 追加版本文件，每次发布成功都会重新弄脏工作区。
- 预检遇到其他文章有未提交改动即以 `other-content-dirty` 阻断单篇发布。
- [.gitattributes](../../.gitattributes) 没有 `eol=lf`；Mac（LF）与 Windows（CRLF）混写会让基于字节的 SHA-256 CAS 与 `git status` 产生假脏。
- [GitSyncBadge.tsx](../../apps/admin/src/components/GitSyncBadge.tsx) 把 `unknown / diverged / ahead / dirty` 都显示为「GitHub 已同步」；`git fetch` 失败被静默吞掉。
- 公网 `POST /webhooks/github` 无 HMAC 签名校验（见 [content-sync.controller.ts](../../apps/api/src/content-sync/content-sync.controller.ts) 与 [Caddyfile](../../ops/windows/Caddyfile)）。

## 三、专家框架（本提案的方法依据）

**顶尖专家会额外做的事**：分开「结果」与「手段」；把正确性修复与架构押注拆开并分段归因；先找 Cordis 在本项目的真实杠杆点；动手前预注册预测；做事前尸检（预设失败原因：双容器长期并存、样板净增、2C2G 内存越线）；区分单向门与双向门并设预算上限；核实一手引用。

**原始素材**：本提案逐句对照源码；论文原文与 `node_modules/@deepseek-ai/cordis@4.0.2` 源码；端口/适配器/接线清单与 7 处生命周期文件；PLAN.md §2/§5/§6 与 `docs/archive/TODO-AGENT.md` 的否决理由；生产 `ContentRelease`、`AdminRequestLog`、`api.log` 基线；`to-do.md` 中本项目的历史失败记录（如 G03 热路径方案致 28 个测试失败）。

**方法与工具**：说法–证据审计表；目标–问题–指标分解（GQM）；奥卡姆剃刀删除测试；分段因果测量（基线 → 第 1 关 → 第 2 关）；受控需求回放（选 3 个历史需求在新旧结构分支各做一遍，用 `git diff --stat` 计数）；预测预注册（先提交再实施）；真实 Git 故障注入（Vitest + 临时裸仓库 + 双克隆）；无上下文盲审。

**独立证据来源**：论文原文与 Cordis 源码；Git 时间戳证明预测先于实施；生产数据库与日志中的耗时与人工介入次数；受控回放的分支 diff；CI；盲审结论。

## 四、任务书（正式题目）

> **题目：AdgaiWalker 向 Cordis 时空可组合演进的分阶裁决——先修正确性，再证插件价值**
>
> **一、目标与判定原则**
> 让站主在本地（Obsidian / VS Code）与 `admin.iwalk.pro` 两端顺畅写作、单篇发布、可靠备份到 GitHub；并让项目逐步演进为对标 Cordis 的「薄核 + 可逆插件」架构。
> **成功只看站主收益**（保存到上线耗时、人工介入次数、新增一项能力需改动的文件数）；Cordis 的可逆性只作辅助指标。**更深，不更大。**
>
> **二、硬约束**
> 1. 物理拓扑不变：2C2G Windows 盒子（单进程 + 单 SQLite + Caddy）、Vercel、GitHub；不引入 Docker、Redis、PostgreSQL、CMS、CRDT、插件市场。
> 2. `aiUsePolicy`、Caddy 与 Nest 两侧白名单对等、`AdminRequestLog` fail-closed、内容 CAS 与只追加版本历史、既有公开 URL 零退化。
> 3. **禁止永久半迁移**：同一进程内两套依赖注入容器并存须写明到期日，到期未完成即回退。
>
> **三、前置取证（只取裁决所需）**
> 1. 核实论文原文与 `@deepseek-ai/cordis@4.0.2` 源码，写清 Cordis 管什么、不管什么。
> 2. 盘点现有接缝（70 端口 / 73 适配器 / `kernel.module.ts`），列出全部长驻生命周期效应（已知约 7 处 + 同步任务）——这是 Cordis 唯一候选适用面。
> 3. 核验 PLAN.md §6 触发条件（「长驻编排器、热装卸真需求」）今天是否成立。
> 4. 测生产基线：每次发布的失败率与人工介入次数（`ContentRelease`、`AdminRequestLog`、`api.log`）；取不到的给出可执行的只读命令，并区分「代码已证实」与「待采集假设」。
>
> **四、三道关（后一关以前一关的证据为前提）**
> - **第 0 关 · 一页裁决书**：Cordis 适用 / 不适用清单；单向门与双向门分类；预算上限（净增行数、天数、内存）；**预注册预测值**（阈值由基线推出，不拍数字）。
> - **第 1 关 · 正确性修复（不依赖 Cordis）**：改同步与发布拓扑——不再从运行中的代码目录写 Git、派生 JSON 不进主分支、发布核验后不回写工作区、多草稿不阻断单篇、统一 LF、Webhook 验签、界面不再假绿灯。按「日后可直接作为插件」的接口形状编写，并兑现拆除清单。覆盖 5 类对抗场景：两端改不同文章、两端改同一篇、推代码与发文章交错、多草稿时单篇发布、断网或进程被杀。
> - **第 2 关 · 插件化验证切片（仅当第 0 关判定有杠杆）**：把第 1 关的同步任务（或另一处生命周期效应）迁入 Cordis，以第 1 关数据为基线计算 Cordis 的净贡献。
>
> **五、验收与止损（全部由外部证据裁定）**
> 1. **结果**：生产日志中的保存到上线耗时与人工介入次数相对基线达到预注册值；受控回放 3 个历史需求，新结构下改动文件数下降。
> 2. **正确性**：真实裸仓库 + 双克隆故障注入（5 类场景 + LF/CRLF 混写 + 伪造签名）在 CI 全绿；任何发布或中断后服务器工作区仍干净、GitHub 提交只含目标文章。
> 3. **机制（仅第 2 关）**：卸载后路由、监听器、定时器归零；撤离上游时下游按契约降级、零未捕获异常；仅改装配清单即可拔除该插件，消费方零改动。
> 4. **真实使用**：按自然发布频率累计（近 90 天仅 7 次内容提交），不设「N 篇」截止；期间任一次需手动 SSH、草稿静默丢失或假绿灯即判失败。
> 5. **止损**：第 2 关后出现以下任一即退回第 1 关形态，并在 PLAN.md 记录否决理由——样板代码净增超预算、内存越线、门禁退化、双容器超期并存。

## 五、待站主确认

- 第一个可见成果是「同步变好用」，而不是「一切皆插件」。是否同意此顺序？
- 本地写作是否常用图片附件（影响第 1 关的资产归属设计）？
- 能否执行只读命令贴回盒子上的 `git status`、`git stash list`、`api.log` 尾部（用于第三节第 4 条基线）？
