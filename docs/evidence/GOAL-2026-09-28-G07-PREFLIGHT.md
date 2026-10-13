# Goal Document: G07 部署前候选与迁移复验

## Go / No-Go

- **Judgment**: Go（仅部署前准备）。
- **Reason**: 本地服务与迁移工具已可用；生产推送、停服和切库仍需要单独的最终批准。

## Target Outcome

形成可审查的 G07 提交范围，并用最新可取得的生产库一致快照验证旧库重建路径、数据保全和恢复路径。

## Goal Definition

- **Type**: 交付与运维质量。
- **Boundary**: 工作区盘点、候选清单、迁移复验、文档纠错；仅对生产进行只读侦察或创建独立快照。
- **Non-goals**: 不提交、推送、停服、修改生产库、部署或启用公共 AI。
- **Deferred work**: G07 实际切换及 G08 生产验收。
- **Verification rule**: 候选范围有明确的纳入/排除依据；生产副本 24 条迁移成功，逐表行数、外键、完整性、schema 和恢复演练全部通过。
- **Evidence source**: Git 状态、迁移命令输出、SQLite 检查、恢复演练与本文件实录。
- **Pass criteria**: 零未解释的数据差异和外键错误；能从独立备份恢复；不触碰开发库及生产原库。
- **Confidence note**: 快照复验可证明迁移机制和当前数据适配，不能代替实际生产停服后的最终核对。
- **Judgment owner**: 脚本/数据库检查声明本地预检是否通过；站主决定生产操作。

## Current State

- 本地 G01–G06 与七项发布审查修复已验收，G07 未部署。
- 工作区有大量已暂存、未暂存及未跟踪文件，本地 `main` 领先远程两个提交。
- 生产旧库无迁移历史且与基线 schema 不同，直接 `db:baseline` 已在副本上被证伪；旧路径为新库应用迁移后搬迁数据。
- 迁移工具最近修复了父子表复制顺序，已对本地旧库 689 行验证，需对最新生产副本复验。

## Priority Rationale

先固定候选范围和数据库证明，再安排会触发 Web 自动部署的推送与生产停服，避免把不相关改动或未经验证的数据迁移带入 G07。

## Assumptions and Open Decisions

| Item | Status | Impact | Owner / Next step |
|---|---|---|---|
| `main` 推送会触发 Web 生产部署 | confirmed | 决定提交边界 | 仓库部署配置与站主最终审查 |
| 生产旧库自上次快照后是否变化 | confirmed | 2026-09-28 一致快照仍为 8 表 218 行 | 见下方复验证据 |
| 哪些既存改动属于 G07 候选 | scoped | 535 个路径已逐项列在候选清单；512 个拟纳入、23 个排除 | 提交前仍需审阅精确差异 |
| 生产停服窗口 | unresolved | 决定实际部署时间 | 候选与复验完成后由站主决定 |

## Phases

### Phase 1: 固定候选边界

- **Purpose**: 让拟推送代码可审查。
- **Entry condition**: 当前 Git 状态可读取。
- **Phase rules**: 保留所有现存改动；只形成候选清单，不暂存或提交。
- **Todos**:
  - [x] 按改动来源与运行依赖划分纳入、排除及待确认文件；证明为可逐项核对的清单。
- **Exit proof**: 候选清单覆盖 Git 状态，并标出无法安全拆分的依赖。
- **Stop condition**: 发现候选依赖不明或生产凭据、私有数据混入。

### Phase 2: 最新生产数据迁移复验

- **Purpose**: 验证修复后的复制顺序适配真实生产数据。
- **Entry condition**: 可取得一致、独立的生产库快照。
- **Phase rules**: 不修改生产原库；副本及结果置于忽略目录或临时目录；失败即保留证据并停止。
- **Todos**:
  - [x] 获取并校验快照；证明来源、完整性与原库未受改动。
  - [x] 用 `rebuild:legacy-db` 在副本上重建；证明迁移、逐表行数、列保全、外键、完整性与 schema。
  - [x] 从独立备份还原副本并核验；证明回退材料可用。
- **Exit proof**: 上述检查均为零差异/零错误，恢复副本匹配备份。
- **Stop condition**: 快照不一致、源表有未搬迁数据、任何检查失败。

### Phase 3: 同步部署说明与最终门禁

- **Purpose**: 消除 `baseline` 旧说法并交付完整决策材料。
- **Entry condition**: Phase 1、2 有证据。
- **Phase rules**: 文档只记录实测，不把预检写成生产已完成。
- **Todos**:
  - [x] 修正现行部署说明与 G07 记录中的矛盾；证明文档与脚本一致。
  - [x] 执行相关检查并核对 Git 差异；证明开发库与生成文件无非预期变化。
- **Exit proof**: 预检报告、候选范围、残余风险及生产操作边界齐备。
- **Stop condition**: 文档或门禁暴露新的生产阻断项。

## Dry-Run Findings

- 不能将整个脏工作区默认当作 G07 候选；先做依赖与来源分类。
- 生产快照必须由 SQLite 一致备份产生，不能直接复制运行中的数据库文件。
- `db:baseline` 的旧描述与已经完成的生产副本实测相冲突，需先纠正。

## Final Validation

审阅候选清单、迁移日志、逐表差异、`integrity_check`、`foreign_key_check`、schema diff、回退验证、文档和 `git diff --check`。

## First Execution Step

读取完整 Git 状态及 G07 所需的代码、迁移、配置和文档依赖，生成候选清单。

## Execution Evidence（2026-09-28）

- **候选范围**：[逐文件清单](G07-CANDIDATE-FILES-2026-09-28.md)覆盖盘点时 535 个路径；拟纳入代码与契约 499、文档证据 13，排除独立游戏、独立 dsh 包及旧设计文件共 23。排除 dsh 包后，在临时六工作区执行 `pnpm install --frozen-lockfile --ignore-scripts --offline` 通过；本轮未改动已有暂存区，未提交或推送。
- **一致快照**：生产 SQLite 用只读连接执行 `VACUUM INTO`，服务器与本地副本 SHA-256 均为 `f8fd21a86fa84115900f1c44a3b6c536dbb124707c066e0d7bdb6e843e71c278`。服务器临时文件已清理；本地副本位于忽略的 `apps/api/data/backups/`，权限 `0600`。原库未写。
- **数据迁移**：快照 `integrity_check=ok`、`foreign_key_check=0`，8 张非空表共 218 行。`pnpm rebuild:legacy-db` 在 `/tmp` 新库应用 24 条迁移，搬迁 218 行；共有列值逐行一致，`Credential`/`ModelProvider` 源独有表均 0 行，目标 `integrity_check=ok`、`foreign_key_check=0`、schema diff 零差异。
- **恢复**：从独立旧库快照恢复到另一临时库，恢复文件 SHA-256 与备份一致、`integrity_check=ok`、218 行可读。临时迁移与恢复副本已清理；保留一份权限 `0600` 的本地一致快照。这证明备份副本可读，不代替目标服务器停服恢复演练。
- **RED → GREEN → 重构**：新增 `scripts/verify-deploy-readiness.test.ts`，RED 稳定复现 K6 对不存在的 SQLite 文件迁移失败；在演练脚本预建空目标文件后 GREEN 通过。只补与生产重建脚本一致的前置步骤，无额外重构。
- **门禁**：`pnpm typecheck`；shared 376、API 706、Web 227、Agent 30、Admin 80 项测试；`build:api`、`build:admin`、`build:web`、`verify:geo`、`verify:architecture`、`verify:docs`、`verify:deploy --drill` 全部通过。`git diff --check` 与 staged diff 检查通过。原始开发库 SHA-256 仍为 `5fd860570558fedc9fb7d1b88c0fc7281d88031a9f8a8d242b75ba7c5143e973`；测试库是独立的 `walker.test.db`。构建前后 `content.json`、`graph.json`、`public-manifest.json` 字节未变；`codegraph*.json` 因新增源文件按规则重生成。
- **结论**：部署前本地预检通过；G07 生产操作仍未执行。进入生产前须审阅精确提交差异与停服窗口，并在停服后的实际旧库上重复备份和核验。
