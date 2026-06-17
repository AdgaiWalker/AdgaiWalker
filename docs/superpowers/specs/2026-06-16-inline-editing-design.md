# 客户端就地编辑 + 版本历史

- 日期：2026-06-16
- 状态：已实现（2026-06-17，PR #22）
- 作者：Walker（秋知）
- 范围：管理员在文章详情页就地编辑正文与 frontmatter；每次保存自动留痕，可查修改日期 / 切换版本 / 看 diff / 回退

## 1. 背景与现状

现有编辑链路：

- 文章详情页 `/posts/[slug]`（预渲染）右下角浮动 `AdminEditBar`，自检 admin cookie 后显示。
- 点「编辑」→ 跳离开当前页到 `/admin/content/edit?slug=xxx`（独立后台编辑器）。
- 后台编辑器：左 textarea（raw markdown，含 frontmatter）+ 右简易正则预览。Ctrl+S 保存，sha 乐观锁，保存后约 60s Vercel 自动部署。
- API：`GET/PUT/PATCH/DELETE /api/admin/content/[slug]`，生产走 GitHub API（`GITHUB_TOKEN`）回写 = 一次 git commit；开发态走本地文件 store。
- 新建：`/admin/content/edit`（无 slug）含 brief prefill（选题 → 简报模板）。
- 现有 `version` + `previousVersion` 字段是**手动认知迭代**（独立文件 / 独立 URL），与本次「自动留痕的编辑历史」是两回事。

痛点：编辑跳页割裂；后台预览失真（简陋正则）；frontmatter 是 raw 文本易错；无历史可查 / 回退。

## 2. 目标与非目标

### 目标

- 管理员在文章页就地编辑（正文 + frontmatter），不跳离文章上下文。覆盖：A 微调、B 迭代正文、D 元数据。
- 客户端实时预览，中等保真（贴近站点渲染）。
- 每次保存自动 git commit 留痕；可查修改日期、切换版本、看 diff、回退。
- C 起草：新建文章在升级后的 `/admin/content/edit` 完成，复用同一编辑器组件（消除「后台 textarea」割裂感）。

### 非目标（v1）

- DOM 级 inline WYSIWYG（contentEditable 直接改渲染后的 DOM）。
- 高保真预览（MDX 组件客户端真实渲染）。
- 版本历史公开（读者可见）—— admin-only。
- 在 `/posts/[slug]` 之外的全新页面做纯客户端新建。
- 实时协作 / 多人编辑。

## 3. 关键架构决策

### 3.1 git 为 single source of truth

所有编辑 = 一次 git commit（延续现有 PUT）。版本历史 = git log。不引入额外版本存储。

理由：零新存储负担；diff / 作者 / 时间天然有；「回退」= 用历史版本内容做一次**新 commit**（不 git revert、不改写历史），安全且可追溯。

### 3.2 编辑 markdown 源，不做 DOM WYSIWYG

正文含 frontmatter / 代码块 / MDX 组件（BilibiliVideo / PromptBlock / DialogueBubble / ResourceCard）。DOM ↔ markdown 双向序列化有损且不可维护，客户端无法复现构建期渲染。因此编辑态编辑 **markdown 源**，靠客户端预览逼近所见即所得。

### 3.3 InlineEditor 组件复用（两种挂载模式）

核心编辑器组件，被两处复用：

- **就地模式**：文章页 `/posts/[slug]`，`AdminEditBar`「编辑」触发，原地接管正文区。编辑**已存在**的文章。
- **独立模式**：`/admin/content/edit`，用于新建 / brief prefill 起草。

两种模式共用：正文 tab + 预览 tab + 元数据 tab + 保存逻辑 + 草稿暂存。差异：就地模式有版本历史入口；独立模式无（文章尚不存在）。

### 3.4 决策记录（已拍板）

- **A 编辑态形态**：原地接管正文区（保留 `ArticleLayout` 外壳）。理由：起草 / 重写需编辑器拿满正文宽度，上下文不丢。
- **B 预览保真度**：中等（marked + 站点 prose CSS，MDX 组件占位）。理由：纯 markdown 文章近乎高保真；MDX 文章保存后 60s 见真渲染，编辑预览只是写作参考。
- **C 权限**：全部 admin / 站主专属，版本历史不公开。
- **新建边界**：v1 新建仍在 `/admin/content/edit`（升级为复用 InlineEditor）；纯客户端新建（无后台页）列为非目标。

## 4. 功能详述

### 4.1 就地编辑

#### 入口与编辑态切换

- `AdminEditBar`「编辑」按钮：从跳转 `/admin/content/edit` 改为在当前页**进入就地编辑态**（不跳 URL）。
- 进入：`GET /api/admin/content/[slug]` 拉 raw markdown + sha。
- 编辑态：`ArticleLayout` 的**正文内容容器**（prose 正文区）DOM 切换为 InlineEditor。替换范围仅限正文区；文章标题 / 封面 / 页头 / 页脚 / 侧边栏 / TOC / 导航不在替换范围，保留可见。阅读模式（pureMode）、TOC 高亮在编辑态暂停。
- 退出：「取消」（若有未保存改动则二次确认）或「保存」。退出即还原正文渲染态。

#### 编辑器三 tab

1. **正文**：markdown textarea，等宽字体，tab 缩进，沿用现后台手感。
2. **预览**：客户端实时渲染（输入 debounce 300ms），套站点 `.prose` 样式。MDX 组件（`<BilibiliVideo>` / `<PromptBlock>` / `<DialogueBubble>` / `<ResourceCard>` 等）显示占位卡片「[组件名] · 部署后可见真实渲染」。frontmatter 不进预览。
3. **元数据**：结构化表单。
   - 控件：`title` / `summary`（text）、`date`（date picker）、`tags`（tag editor）、`visibility`（select: public / draft / private）、`type` / `form` / `domain` / `intent`（select，枚举来自 `content.config.ts`）、`status`（select）、`aiUsePolicy.level`（select AI-0 ~ AI-4）。
   - **raw YAML 兜底框**：表单未覆盖的字段（`series` / `seriesOrder` / `sourceTopicId` / `related` / `version` / `previousVersion` / `cover` / `resources` / `videos` / `communities` / 学习指南专属字段等）在此编辑，保证不丢字段。
   - 同步：表单字段 ↔ raw YAML **双向同步**——改表单更新对应 YAML 键；改 raw YAML 回填表单已知字段。

#### 保存

- **显式保存**（Ctrl+S 或按钮）才写 git。不自动 commit，避免每次按键污染版本历史。
- payload 复用现有 `PUT /api/admin/content/[slug]`：`{ content, sha, message? }`。content = 重组后的 frontmatter + body。
- frontmatter 重组：表单字段 + raw YAML 兜底字段 → 序列化。客户端用 `js-yaml` 序列化 frontmatter；服务端 PUT 仍用 gray-matter 解析校验。
- 保存成功：提示「已提交，约 60s 后线上生效」+「查看本次修改」（定位版本历史最新 commit）。

#### 草稿暂存（防丢失）

- 未保存改动按 slug 存 `localStorage`，key = `walker:draft:<slug>`，值含 content + timestamp。
- 进入编辑态时若 localStorage 有草稿且与 GET 内容不同，提示「有未保存草稿：恢复 / 丢弃」。
- 保存成功后清除该 slug 草稿。

#### 冲突处理

- sha 乐观锁：保存带 GET 拿到的 sha。若服务端文件已被改动（sha 过期），PUT 返回 409，提示「内容已被改动，需重新拉取」→ 重新 GET；本地改动由用户决定合并或放弃。

### 4.2 版本历史

#### 数据源

git commits on `src/content/log/<slug>.md`。生产走 GitHub Commits API（`GET /repos/{owner}/{repo}/commits?path=src/content/log/<slug>.md`），开发态走本地 `git log`。复用 `admin-content-store` 的 GitHub / Local 双实现模式扩展。

#### 新增 API

| 路由 | 功能 | 鉴权 |
|---|---|---|
| `GET /api/admin/content/[slug]/history` | commit 列表（sha / date / message / author），分页 per_page=30 | admin |
| `GET /api/admin/content/[slug]/version?ref=<sha>` | 某历史版本完整内容 | admin |

回退**不新增 API**——复用 `PUT /api/admin/content/[slug]`，body = 历史版本 content + 当前 sha，message = `revert to <sha>`。

#### UI

- InlineEditor（就地模式）+ `AdminEditBar` 加「历史」入口 → 弹出版本时间线 modal：
  - 列表：时间 + commit message + author +「查看」。
  - 点某版本：右侧渲染该版本内容 + 与当前版本的 diff（`jsdiff`，行级增删高亮）。
  - 「回退到此版本」→ 二次确认 → PUT 回写 → 编辑器刷新内容。

#### 与现有 version 字段的关系

不动 `version` / `previousVersion` 字段语义（手动认知迭代、独立 URL）。版本历史是 git 提交级的自动留痕，两者并存、不冲突。

## 5. 权限模型

- 所有编辑 / 历史 API 沿用 `isAdmin(request)` cookie 鉴权（HMAC 签名，7 天有效，密钥 `ADMIN_PASSWORD`）。
- InlineEditor、VersionHistory 组件预渲染但隐藏，客户端 `GET /api/admin/auth` 自检 admin 后才激活（沿用 AdminEditBar 模式）。
- 读者侧完全无感，看不到任何编辑 / 历史入口。

## 6. 文件清单

### 新增组件

- `src/components/admin/InlineEditor.astro` — 编辑器容器（三 tab + 草稿 + 保存 + 历史入口）
- `src/components/admin/MetadataForm.astro` — frontmatter 结构化表单 + raw YAML 兜底
- `src/components/admin/VersionHistory.astro` — 版本时间线 + diff modal

### 新增客户端脚本

- `src/scripts/inline-editor.ts` — 编辑态切换、marked 渲染、frontmatter 序列化、草稿、保存、冲突
- `src/scripts/version-history.ts` — 历史拉取、diff、回退

### 新增 API

- `src/pages/api/admin/content/[slug]/history.ts`
- `src/pages/api/admin/content/[slug]/version.ts`

### 修改

- `src/components/admin/AdminEditBar.astro` — 「编辑」改为触发就地编辑态（不跳转）；加「历史」按钮
- `src/lib/admin-content-store.ts` — `ContentFileStore` 接口扩展 `listHistory(path, opts)` / `read(path, { ref })`（支持读历史版本），GitHub + Local 两实现
- `src/pages/posts/[slug].astro` — 注入 InlineEditor（预渲染隐藏）
- `src/pages/admin/content/edit.astro` — 替换简陋 textarea + 正则预览为 InlineEditor 组件（独立模式，复用）

### 新增依赖

- `marked`（客户端 markdown 渲染）
- `js-yaml`（frontmatter 序列化）
- `diff`（jsdiff，版本 diff）

## 7. 数据流

### 编辑保存

1. 客户端：表单 + raw YAML → 重组 frontmatter → 拼 body → content 字符串
2. `PUT /api/admin/content/[slug]` `{ content, sha }`
3. 服务端：`isAdmin` 校验 → gray-matter 解析 → sha 乐观锁校验 → GitHub API commit（生产）/ 本地写（开发）
4. 返回新 sha → 客户端更新 sha、清草稿、提示

### 版本查看

1. `GET /api/admin/content/[slug]/history` → commit 列表
2. 选某 commit → `GET /api/admin/content/[slug]/version?ref=<sha>` → 内容
3. 客户端 jsdiff 与当前内容比 → 渲染 diff

### 回退

1. 取历史版本 content → `PUT` `{ content: 历史 content, sha: 当前 sha, message: "revert to <sha>" }`
2. 产生新 commit → 编辑器刷新

## 8. 错误处理与边界

| 场景 | 处理 |
|---|---|
| admin cookie 过期 | API 返回 401；客户端提示并跳 `/admin/login` |
| sha 冲突（409） | 提示重新拉取；本地改动由用户决定合并 / 丢弃 |
| 内容超 100KB | 沿用 PUT 现有 413 校验 |
| GitHub API 限流 | history 列表分页 + 客户端缓存当次会话；限流时提示稍后重试 |
| 大文章客户端渲染卡顿 | 预览 debounce 300ms |
| localStorage 草稿损坏 | try/catch，损坏则丢弃并提示 |
| MDX 文章预览 | 组件占位卡片，标注部署后可见 |
| 删除文章后访问历史 | history 返回空 / 404 |
| 历史版本 ref 不存在 | version 路由返回 404 |

## 9. 测试策略

### Vitest 单测（纯函数）

- frontmatter 序列化 / 反序列化（表单 ↔ YAML 双向，不丢字段、枚举合法）
- 草稿存储读写（mock localStorage）
- diff 生成（jsdiff 输入输出）

### API 集成（沿用 stores / services 测试模式）

- `history` / `version` 路由：admin 鉴权、分页、ref 不存在 → 404

### 客户端 UI

手动验证（编辑 / 保存 / 历史查看 / diff / 回退全流程）。

### 验证三件套（CLAUDE.md 强制）

`npx astro check`（类型）→ `npm run test`（单测）→ `npm run build`（SSR 渲染）。改任何 `.ts` 后必先 `astro check`。

## 10. 风险与权衡

| 风险 | 处理 |
|---|---|
| 客户端预览与构建期渲染不一致 | 中等保真；MDX 占位；保存后 60s 见真 |
| 原地接管破坏 ArticleLayout（阅读模式 / TOC） | 编辑态暂停、退出还原；充分手测 |
| frontmatter 表单与 raw YAML 同步冲突 | 双向同步 + 兜底框保证不丢字段；单测覆盖 |
| 版本历史读取慢（GitHub 限流） | 分页 + 会话缓存 |
| 保存后 60s 才线上生效 | 固有（静态预渲染）；编辑态预览缓解 |

## 11. 实现顺序建议（供 writing-plans 参考）

1. `admin-content-store` 扩展 `listHistory` / `read(ref)` + 两个新 API（history / version）
2. InlineEditor 组件 + 客户端脚本（正文 / 预览 / 保存 / 草稿 / 冲突）
3. MetadataForm（表单 + raw YAML 同步）
4. 就地模式接入 `posts/[slug]` + AdminEditBar 改造
5. VersionHistory（时间线 + diff + 回退）
6. `edit.astro` 替换为 InlineEditor（独立模式）
7. 验证三件套 + 手测全流程
