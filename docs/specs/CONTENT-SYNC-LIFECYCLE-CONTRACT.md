---
status: active
type: contract
title: 后台内容全生命周期（增删改查导）与 GitHub 对称同步契约
version: v1.0
last_verified: 2026-11-24
applies_to: [admin, api, web, shared, scripts]
---

# 后台内容全生命周期（增删改查导）与 GitHub 对称同步契约

> 本文为 2026-11-24 针对 `2026-11-19`（`type: wise`）卡死 `VERIFYING`、`DELETE` 不触达 GitHub、全站 34 篇线上 2 篇 404、「导」无契约等根因的架构重收口规范与机器可证伪契约。

---

## 一、原始实证账本（改前状态）

| 观测维度 | 真实数据（2026-11-24 实测） | 暴露的根因 |
| --- | --- | --- |
| **双端 90 天写入分布** | 最近 8 次 `content/` 提交：`Walker Publisher`（网页后台）4 次，`happy`（Mac 本地 Git）4 次 | 确属高频异步双端写作（Web 端 + 本地 Git），不能一刀切废掉 Git 双向同步，但也不该保留无谓副本 |
| **生产发布单终态** | `ContentRelease` 共 5 条：**4 `VERIFYING` + 1 `UNKNOWN` + 0 `PUBLISHED`**，`content.delete` 审计 0 条 | 自动核验在构建未就绪或页面 404 时静默退避耗尽，从不落 `FAILED` 或告知错误原因，导致历史无一确证 |
| **公网 URL 全量实测** | `public-manifest.json` 共 34 条，实测 `https://www.iwalk.pro/posts/:slug`：32 篇 `200`、**2 篇 `404`**（`2026-11-19` `type: wise`、`idea-cocreate` `type: tool`） | `BROWSE_TYPES` 硬编码四类、`prerender-web.ts` 跳过其余类型、preflight 不检查构建输出可达性与摘要唯一性，`2026-11-19` 与 `2026-11-02` 还共享 `"待写完后提炼"` 撞 `verify:geo` 门禁 |
| **草稿分支实测** | `origin/drafts`：**不存在（0 次使用）** | `backupDrafts` 属于孤立通道 |
| **现行副本与不对称写** | 7 份投影/副本（VPS `content-repo`、VPS `app/content`、GitHub `main`、Vercel 静态页+manifest、`PublicSnapshot`、`SQLite Release/Change`） | `PUT` 只写本地、发布只推送 `main`、`DELETE` 只删 VPS 磁盘不推 GitHub、「导」完全缺失 |

---

## 二、三条本质路线的减法取舍

| 路线 | 核心做法 | 在本项目约束下的评估 |
| --- | --- | --- |
| **路线 A：彻底无工作树（SQLite 草稿 + GitHub API/裸仓直推 `main`）** | 取消 VPS 本地 `content-repo` 检出，所有草稿存 SQLite，公开读走静态缓存 | 破坏既有多份本地端口契约（`CONTENT_FILE_REPOSITORY`、`CONTENT_LEDGER_REPOSITORY`、`GIT_STATUS`、`FsKnowledgeGraph`），需新增多张 SQLite 表迁移，违反零迁移收口边界 |
| **路线 B：单一稀疏内容仓 + 全操作 Plumbing 对称闭环（选用）** | 保留 `WALKER_CONTENT_REPO_DIR` 唯一稀疏内容仓，**把 `删/放弃草稿/导/发/Webhook 同步` 全部收口到同一套无工作树 `GIT_INDEX_FILE` + 三方同步引擎，并在 `packages/shared` 钉死唯一发布/路由/包契约** | **改动最薄、零 SQLite 迁移、净删分叉规则、兼容现有 7 端测试且可直接压测到 `git --bare`** |
| **路线 C：SQLite 为唯一热写权威，GitHub 降格单向备份** | 禁止 Mac 本地推送 | 违背实测过去 90 天 50% 提交来自 Mac 本地的事实 |

---

## 三、核心架构决策：唯一权威与 6 条硬不变量

1. **双区物理职责**
   - **公开权威**：GitHub `origin/main` 分支 `content/log/*.md(x)` + `content/versions/*`；
   - **草稿暂存区**：VPS 稀疏仓 `WALKER_CONTENT_REPO_DIR/content/log` 中未提交改动（未创建/未修改 `main` 前绝不触发 Vercel）；
   - **版本不可变区**：`content/versions/<slug>/index.json` + `blobs/<sha256>.md` 只追加、零删除路径，文章下架/删除仅作用于 `content/log`。
2. **6 条硬不变量（Invariants）**
   - **I1（Manifest ↔ HTML 逐字节一致）**：进入 `public-manifest.json` 的每一条 `visibility: public` 内容，构建后必有对应 `/posts/<slug>/index.html` 且 `<meta name="content-hash">` 与 manifest hash 逐字节相等（`tool` 类型标记 `noindex, follow` 以继续隔离 GEO 列表与 feeds）。
   - **I2（零静默覆盖）**：无论推送、拉取还是删除，当 `remoteBlob !== baseBlob` 且未经过显式选择时，必须返回 409 冲突并保留本地/远端各自完整文本。
   - **I3（删后不复活）**：对已进 `origin/main` 的文章执行删除时，经无工作树提交 `git rm` 并推送 `main` 同步三方同步态，随后拉取与 Webhook 不得将旧文复活；对仅本地未推草稿，删除只清理工作区；想撤销对已发布文章的本地改稿时，走 `discard-draft` 从 `HEAD` 还原。
   - **I4（历史版本只追加不可变）**：`deleteSingleArticle` 仅移除 `content/log/<slug>.<ext>`，绝不删除 `content/versions/<slug>` 与内容寻址 blob。
   - **I5（导出导入无损且幂等）**：`walker-content-bundle/v1` 导出携带逐条 `sha256` 与整包 `bundleHash`；导入先验整包完整性与 `---` frontmatter，`dryRun` 只计算计划，`conflictPolicy='skip'` 对相同目录重复导入 0 覆盖、0 报错。
   - **I6（失败确定性收敛）**：`preflight` 在推送前拦截缺少必需字段、非 `public`、坏日期、缺 `aiUsePolicy.level` 或与其他可浏览文章 `summary` 重复的发布；自动核验在退避耗尽时必将 `VERIFYING` 推进至 `FAILED` 并写入具体 `errorCode`（如 `remote-http-404`），绝不无限悬停。

---

## 四、「5 操作 × 2 写端 × 4 故障」真值表

| 操作 | 后台 Web (`admin.iwalk.pro`) | Mac 本地 Git (`origin/main`) | 同篇并发冲突 | 断网 / 超时 / 半失败 |
| --- | --- | --- | --- | --- |
| **增** | 写本地 `visibility: draft`（`expectedHash=null` 防覆写） | 本地创建后 `git push main` | 后台撞同名报 409；Mac 冲突时 `syncFromRemote` 保本地报冲突 | 本地写入为同目录原子重命名，失败无半文件 |
| **改** | 写本地（带 `expectedHash` CAS 锁） | 本地编辑后 `git push main` | 409 返回远端对比；三方同步检出 `local≠base && remote≠base` 保双方报冲突 | 保持工作区草稿，绝不污染 `.git/index` |
| **删 / 下架** | 未进 `HEAD` 草稿直接删盘；已进 `HEAD` 走无工作树 `deleteSingleArticle` 推 `main` 下架；`discard-draft` 还原 `HEAD` | 本地 `git rm` 推 `main` 后由 Webhook 跑 `applyThreeWayContentSync` 删除本地未改文件 | `remoteBlob ≠ baseBlob` 时拒绝删除返 409；Mac 删文件但本地有未推改稿时记冲突保草稿 | `git push` 失败零脏工作树、不删本地、返回 502 可重试 |
| **查 / 发** | `preflight` 执行 `validatePublishablePost` → 单篇 `publishSingleArticle` 推 `main` → 自动核验并切快照 | Mac 推 `main` → GitHub HMAC Webhook 验签 → 3-way 拉取 → 延迟同步线上 `PublicSnapshot` | 后台发布前 `remoteBlob ≠ baseBlob` 拒覆盖；推送撞 `non-fast-forward` 自动重试 1 轮 | 自动核验最多 6 轮，超期落 `FAILED(errorCode)` 显式提示 |
| **导** | `GET /admin/content/export`（单篇 `.md` / 全量 `walker-content-bundle/v1`）；`POST /admin/content/import`（支持 `dryRun`、`skip/overwrite`、CAS 保存） | Git 仓自身即完整开源快照 | `import(skip)` 自动跳过已有 slug；`overwrite` 按同篇 CAS 检查并发修改 | 包哈希不自洽整包 400 拒绝写入；单篇失败收集报告 |

---

## 五、机器可证伪验证体系

1. **Shared 契约与 Bundle 单测**（[content-bundle.test.ts](../../packages/shared/src/content-bundle.test.ts)）：验证 `isBrowsePostType`、`validatePublishablePost` 与 `buildContentBundle`/`verifyContentBundle` 篡改拒绝。
2. **Git Bare-Repo 随机交错故障压测**（[git-content-plumbing.property.test.ts](../../apps/api/src/adapters/git-content-plumbing.property.test.ts)）：真实 `git init --bare` 模拟远端，80+ 步随机交错双端写/删/放弃草稿/拉取/并发 push 竞争，每步自动检验 I2–I4、I6。
3. **CI 全站 Manifest↔HTML 门禁**（[verify-geo.ts](../../scripts/verify-geo.ts)）：遍历 `public-manifest.json` 全部条目，逐条验证 `apps/web/dist/posts/<slug>/index.html` 存在且 `<meta name="content-hash">` 与 manifest hash 逐字节相等。
4. **线上 34/34 实测验收**：部署后实测 `https://www.iwalk.pro/posts/:slug` 全部 `34/34` 返回 `HTTP 200` 且 hash 匹配（包含曾 404 的 `2026-11-19` `type: wise` 与 `idea-cocreate` `type: tool`）。
