# AI 自媒体工作站 MVP 验收记录

更新时间：2026-08-04

这份记录只保留当前可重复检查的证据。正式网站已完成部署并经远程标题/正文验证；正常登录公众号会话仍属于外部验收。

## 代码与自动化验证

- 最新工作站提交：`2ef71a9`（Publication 查询与验收审计）；内容发布提交 `0cd96d3`。
- API：19 个测试文件，47 个测试通过。
- Admin：2 个测试文件，4 个测试通过。
- API、Admin、Web、Shared 的 typecheck/build 均通过。
- `pnpm accept:ai-workstation:mvp` 已运行：三篇本地证据全部通过；网站已通过，公众号草稿仍待登录会话。
- SQLite schema 已通过 `prisma db push`；PostgreSQL schema 与迁移同步维护。

## P0 覆盖

| P0 | 当前证据 |
|---|---|
| TOP-01 / TOP-02 | Seed 四状态、作者主选、Execution brief 与唯一无日期 Action；SeedService 与集成测试 |
| ACT-01 | Action 日期可空/设置/清除、完成/恢复、VIDEO 过滤；ActionService 测试 |
| WORK-01 | multipart 初稿、图片/音频/视频附件与来源链接、幂等键；原始 manifest |
| WORK-02 | 核心观点、禁止改变项、只读 original、SHA-256；FsArtifactRepository 测试 |
| PROD-01 | 固定八阶段 Recipe、结构化 Artifact、质量风险阻断 |
| PROD-02 | currentStage、stageStartedAt、lastOutputAt、waitingReason 持久化；停止操作保留历史 Artifact |
| PROD-03 | 每阶段原子 Artifact、失败阶段恢复、最多两次重试、人工 Artifact 接管 |
| VIS-01 | 独立 2100×900 横版与 900×1200 竖版封面；尺寸校验与模板兜底 |
| VIS-02 | Markdown、HTML、资源字段、390px 安全预览；脚本与事件属性剥离 |
| REV-01 | `GET /works/:id/review` 返回原稿、候选、修改、风险、封面、双平台产物与 Artifact 历史；Admin 单页展示 |
| REV-02 | 批准哈希、退回、恢复、取消；发布器拒绝未批准/哈希不一致 |
| PUB-01 | Website Publication 远程内容验证器；WeChat 草稿包与正常会话 Adapter 接口 |
| SYS-01 | 独立目录导出包含 manifest、original、stages、publish |
| FB-01 | 反馈保留原文/source；人工确认后幂等转 Seed 或 Action |

## 三篇真实作品

真实初稿来自 `content/log`，通过实际 HTTP 作品记录、Artifact 上传、审批、公众号草稿包与导出流程。

| 作品 | Work ID | 最新 REVIEW_READY hash |
|---|---|---|
| Codex 入门与第一次成功 | `mseqzt41e9491880d10a715a70cd` | `cd77e35ae24b03336dd88397bbc415ff9cd70f4de70eb7660d3eec5efcf41300` |
| 低成本 AI 社群的真实问题 | `mser029w12ab4255716bb820dc86` | `8ebef653536057f9d6117afcdbad2d95726e20c7878f872ddc9443fadfd6baea` |
| 把害怕开始变成可执行动作 | `mser02ab28b6ad42841f63419a2f` | `32038437e82055fafe882aabab18713dc8e143de3cb6425d49a4a9267931f4af` |

三篇均包含一次故障恢复证据；“低成本 AI 社群的真实问题”在 QUALITY_CHECK 先提交了故意无效 Artifact，HTTP 返回 500，随后使用前一阶段 hash 提交有效 Artifact。

独立导出目录：`D:\walker-exports-v3\<workId>`。每份导出均包含原稿、八阶段结果、双封面、390px 预览和 `publish/wechat.json`。

## 当前外部验收状态

1. Website：三个正式 URL 已由 GitHub/Vercel 部署并验证通过：
   - `https://iwalk.pro/posts/419a2f`
   - `https://iwalk.pro/posts/ai-20dc86`
   - `https://iwalk.pro/posts/codex-5a70cd`
   三个页面均返回 HTTP 200 且标题与正文可见；数据库中的三条 Website Publication 已重试为 `PUBLISHED`。
2. WeChat：草稿包已生成，Publication 停在 `WAITING_USER`；当前运行态 Adapter 返回 `wechat-session-unavailable`，尚未连接正常登录会话保存草稿。
3. Codex CLI：已用 `gpt-5.6-sol` 完成一次只读结构化调用（约 116 秒，期间发生重连）；三篇真实作品仍使用当前会话人工兜底 Artifact，因此不能宣称三篇已完成外部 Codex 正常路径。

公众号草稿与三篇真实作品的正常 Codex Artifact 仍是当前未完成的两项证据；在它们补齐并由作者确认内容质量、观点保护和主动操作时间前，不能把 Goal 标记为 complete。
