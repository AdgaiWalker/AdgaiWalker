# 文章版本历史（公开演进史）本地验收 — 2026-10-13

## 范围

对象只定**文章**（content/log 的 md/mdx 正本）。Agent 修订、设置、候选等暂不纳入。
放弃 Git 作为历史层：Git 只保留发布通道角色，历史由独立版本库承担。

## 核心语义

- **发布即版本**：只有发布链确证 PUBLISHED 那一刻才固化一条版本；草稿（content/log）可反复重写，不留痕。
- **两段历史物理独立**：草稿区 = content/log（可改，现有 C05/C06 一字不动）；公开区 = content/versions（只追加、进 Git、适配器无删除路径）。
- **只追加**：版本永不改写、永不删除；回退 = 以旧版开草稿再发布成新版本（版本号照样递增）。
- **内容寻址**：正文 blob 按 sha256 存于 content/versions/blobs/<hash>.md，相同内容（含跨文章、回退）只存一份。
- **「为什么」必填**：变更说明为空即拒（HTTP 层 400 version-note-required；shared requireVersionNote 兜底）。
- **相同内容不建版本**：重复确证同一内容不产生新版本。

## 公开纪律（skill 五条全满足）

1. 只公开已发布版本 —— 版本唯一写入口是发布确证。
2. 每版一个稳定 URL —— /posts/:slug/v/:n。
3. 版本页 canonical 指向当前版 —— 预渲染 metaTags 加 canonicalPath 覆盖；React 页 useEffect 补 canonical。
4. 公开的是构建期静态页 —— content:gen 把 content/versions 投影为 article-versions.json，prerender 生成静态 HTML；无公开 API 查询端点。
5. 公开区无删除路径 —— fs-article-version-store.ts 无任何 rm/unlink；blob 用 'wx' 只写一次。

## 准出逐条

| # | 判据 | 证据 |
|---|------|------|
| 1 | 只追加未被破坏 | 适配器无删除路径；回退=新增版本（shared 单测「回退 = 新增一条内容同旧版的新版本」） |
| 2 | 内容寻址成立 | blob 按 sha256 命名；EEXIST 时校验内容一致防碰撞；verifyArticleVersionIndex 不变量逐篇校验 |
| 3 | 每次写入可解释 | version + note（必填）+ publishedAt + releaseId；prepare 链路 HTTP 必填 |
| 4 | 冲突可控 | 编辑侧沿用既有 expectedHash CAS（C03/C06），历史侧只读无冲突面 |
| 5 | 清理安全 | 第一期不做 prune；测试「清理安全线：blob 与索引落盘后只能再读到」 |
| 6 | 界面闭环 | admin /content/:slug「历史」tab：列表→查看→对比（服务端现算 diff）→回退（二次确认、以旧版开草稿） |
| 7 | 可复现 | 见下方验证链 |
| 8 | 承诺写在页面上 | ARTICLE_VERSION_PERMANENCE_NOTE 单点定义，版本页 footer 展示 |
| 9 | 读者先知情 | 文章页 meta 行显示「本文公开过 N 个版本 · 首版 X · 最新 Y」并链接历史页 |

## 改动清单

- shared：packages/shared/src/article-version.ts（契约+纯函数+文案单点）+ 测试 12 断言；content-change.ts ContentRelease 加 versionNote 可选字段。
- API：
  - 迁移 20261013230000_article_version_note：ContentRelease 加 versionNote 列（第 27 条迁移）。
  - ports/article-version-store.port.ts + adapters/fs-article-version-store.ts（content/versions 只追加存储）+ adapters/article-versions-dir.ts + 存储单测 4 件。
  - content-release.service.ts：prepareRelease 收 versionNote（默认「发布新版本」兜底），verify() PUBLISHED 确证后写版本库（fail-open：版本写入失败不拖垮已确证发布）。
  - content-release.controller.ts：POST prepare 必填 versionNote。
  - content-admin：GET /admin/content/:slug/history（列表不带正文）、/history/:version（详情）、/diff/:a/:b（现算 diff）。
- web：article-versions.ts 门面；PostHistoryPage（/posts/:slug/history）、PostVersionPage（/posts/:slug/v/:n）；PostDetailPage meta 行注入版本摘要；样式。
- 构建：scripts/lib/article-versions-projection.ts（content/versions → generated/article-versions.json，索引损坏即构建失败）；prerender-web.ts 版本页+历史页静态化（canonical → 当前版）；metaTags 加 canonicalPath。
- admin：ContentHistoryPanel（历史 tab）；ContentReleasePanel 变更说明必填输入；queries 三个 hooks。
- 补票：scripts/backfill-article-versions.ts（pnpm content:backfill-versions）——29 篇既有文章全部生成 v1「初始版本入库」。

## 验证链（本地，全绿）

- pnpm typecheck：0 error
- pnpm test:shared：420 passed
- pnpm test:api：769 passed（含新增 FsArticleVersionStore 4 件 + 端到端「发布确证 → 版本落库 → 列表/详情/diff 闭环」1 件）
- pnpm test:web：237 passed
- pnpm test:admin：105 passed（工作区 tab 断言更新为四组：编辑/审核与发布/更新事项/历史）
- pnpm build:web + verify:geo：27 pages 全过；版本页静态 HTML canonical 指向当前版、含永久保留承诺文案
- pnpm content:backfill-versions：29 篇 v1 入库；pnpm content:gen 投影 29 articles

## 已知边界 / 未做

- prune 未实现（第一期不做，存储量级极小）。
- 下架语义未实现（承诺文案预留「如日后下架会在此说明」）。
- 版本页 diff 对读者不开放（只后台）；访客只见列表+旧版全文。
- 版本库写入 fail-open：发布确证优先，版本缺失可 content:backfill-versions 补票（但补票只会补「无历史」的文章，单版缺失需手工）。
- 生产未部署；content/versions 随 Git 进仓库，发布链推送后 Vercel 构建自动产出版本页。

---

## 审理修复（2026-10-14 二审）

自审挑出并修复的刺：

| # | 刺 | 修 |
|---|----|----|
| 1 | **正文对账红线**：verify() 原先记「此刻的文件」——若批准到确证之间文件又被改，会把没上线的新草稿写进公开历史（伪造发布内容）。 | verify 写入前对账 `change.appliedHash === 当前文件 hash`，不等即如实报错拒绝写入（fail-open 语义不变：发布确证优先，版本缺失可补）。新增端到端红线测试「正文漂移拒绝写入」。 |
| 2 | **canonical 双写**：React 版本页 useEffect 无条件再插一条 canonical，静态壳已带一条 → 水合后双 canonical。 | 插前查重（`querySelector('link[rel="canonical"]')` 存在即跳过）。 |
| 3 | **frontmatter 剥离三处各自为正则**：发布预检 / 预渲染 / 版本页同一正则抄三遍。 | shared `stripFrontmatterBlock` 单点，三处归一。 |
| 4 | **补票脚本直写 fs**：blob/index 写盘是适配器之外的第二份逻辑。 | 补票改用 `FsArticleVersionStore.appendVersion`（写盘语义唯一）；修 top-level await（包 main）。 |
| 5 | **解析器漏 CONTENT_LOG_DIR 线**：测试把内容目录改道临时目录时版本库回落仓库真实数据（事故复发过一次）。 | 解析优先级 ARTICLE_VERSIONS_DIR > CONTENT_LOG_DIR 姊妹目录 > cwd 探测；新增解析纪律回归测试 2 件。 |
| 6 | **草稿文章被补票**：backfill 未查可见性，`on-people-and-skill`（draft）被建了公开版本历史。 | backfill 加 `resolveVisibility === 'public'` 闸门；误建数据已清。 |
| 7 | **测试夹具不真实**：直改 `state=APPLIED` 缺批准快照，被仓储 view 校验拒（暴露对账走 findById 的隐患）。 | 夹具改走 recordApproval → beginApply → finishApply 真实链路（C09 语义）。 |

修复后验证链（全绿）：typecheck 0 error；shared 420 / web 237 / admin 105 / api 772（149 文件，含新增解析纪律 2 件 + 正文漂移红线 1 件）；build:web + GEO 27 页；产物复核：版本页 canonical 单条、版本库 28 篇 / 28 blob 零污染。

---

## 三审：文案收敛（2026-10-15，站主反馈「太宽了，明明就是一点信息」）

**问题**：文章页 meta 行显示 `本文公开过 1 个版本 · 首版 2026-10-13 · 最新 2026-10-13`——
三个数字说同一件事，而单版本文章根本没有「以前的文章」可看，纯粹噪音，还把 meta 行撑宽溢出。
附带两处小毛病：同一行两种日期格式（本地化 `2026年8月11日` 与 ISO `2026-10-13` 并排）；
门槛错为 `>= 1`。

**改法**：
- 新增 shared `articleHistoryLabel(versionCount)`：**versionCount < 2 返回 null**（文章页整段不显示）；≥ 2 只返回极短标签 `已更新 N 次`（N = 版本数 − 1），**不含日期**（日期留给历史页，消除同行双格式）。
- `articleHistorySummary`（历史页用）去重：首末同日时只说一次（`首末同为 X`），不再重复念两个相同日期。
- 历史页单版本改说人话：`本文只有一个公开版本——首版就是当前版，没有更早的内容可看。`
- **顺带收掉第二份文案副本**：prerender 的静态历史页原先自己拼 `本文公开过 N 个版本 · 首版…`（SSOT 违规），现改用 shared 函数；静态文章页也接上同一 `articleHistoryLabel`（单版本静态页同样不出声，与 SPA 行为一致）。

**实测核验**（真实产物 grep）：
| 场景 | 结果 |
|---|---|
| 单版本文章页 | 版本字样 **0 处**（消失） |
| 单版本历史页 | `本文只有一个公开版本——首版就是当前版，没有更早的内容可看。` |
| 临时造 v2 后文章页 | `… · <a href="/posts/lobster-core-value/history">已更新 1 次</a>` |
| 临时造 v2 后历史页 | `本文公开过 2 个版本 · 首版 2026-10-13 · 最新 2026-10-20`（首末不同才列两端） |
| 还原后 | 版本库 28 篇 / 28 blob，文章页版本字样 0 处 |

验证链：shared 421 / api 回归 / web 237 / admin 105 / build:web + GEO 27 页 全绿。

## 四审：入口常驻（2026-10-15，站主定案）

**背景**：三审把单版本文章的版本行隐去后，站主在文章页找不到任何历史入口（「没有看到有版本入口」）。
站主拍板：**入口常驻**——读者任何时候都能找到「版本历史」这个面。

**改法**（只动 shared 一个函数，前后端与静态页自动同源）：

| 版本数 | 文章页标签 |
|---|---|
| 0（无公开版本） | null（无历史可看，不出链接） |
| 1 | `版本`（首版即当前版，**不谎称「已更新」**） |
| ≥2 | `已更新 N 次`（N = 版本数 − 1） |

日期仍一律留给历史页，文章页不出现两种日期格式。

**实测**（活体浏览器 + 生产静态产物）：
| 场景 | 结果 |
|---|---|
| 单版本文章页（SPA） | `2026年8月11日 · 约 3 分钟 · 版本`，链到 /posts/lobster-core-value/history |
| 临时造 v2 后（SPA） | `… · 已更新 1 次` |
| 临时造 v2 后历史页 | `本文公开过 2 个版本 · 首版 2026-10-13 · 最新 2026-10-20` |
| 静态文章页产物 | `…发布 2026-08-11</time> · <a href="/posts/lobster-core-value/history">版本</a></p>` |
| 还原后 | 版本库 28 篇 / 28 blob，演示数据零残留 |

验证链：shared 421 / web 237 / admin 105 / typecheck 0 error / build:web + GEO 27 页全绿。
