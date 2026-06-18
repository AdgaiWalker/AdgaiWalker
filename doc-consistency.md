# 文档一致性审核报告

- **审核日期**: 2026-06-17
- **基准**: `origin/main` @ `c9d258b`（feat(content): 客户端就地编辑 + 版本历史 + 顶部 admin 工具栏 #22）
- **范围**: `CLAUDE.md` + `README.md` + `docs/**` + 合同文件（`src/content.config.ts` / `astro.config.mjs` / `.env.example` / `tsconfig.json` / `vitest.config.ts` / `package.json`）
- **方法**: 多 agent 并行（按 CLAUDE.md / README+docs / 合同 拆分），以代码为真，每条附代码证据

## 审核结论

- **结论**: ❌ **不通过**（存在 6 条 P0 + 多条 P1，按文档操作会失败或造成安全/可用性事故）
- **汇总**: P0:**6** · P1:**13** · P2:**11** · P3:**4** · 待补充:**2** = 共 **36** 条
- **修复优先级**: P0（账号认证体系 + 过时归档）→ P1（invited 时代残留 + spec 状态）→ P2/P3

**系统性根因**: 两轮功能（账号认证系统、就地编辑）已合并进 main，但文档（尤其 CLAUDE.md 的 services/路由表/cookie 模型、两个 spec 的「状态」字段、cycles/current 归档）未同步。spec/plan 的「状态」字段不随实现更新是反复出现的模式。

---

## P0（安全问题 / 严重误导，必须先修）

### 1. `COOKIE_SECRET` 环境变量未列入 CLAUDE.md 必填项
- **位置**: `CLAUDE.md:26-35`（环境变量「必填（生产）」）
- **证据**: 文档只列 `UPSTASH_*`/`ADMIN_PASSWORD`/`CRON_SECRET`；`.env.example:8-13` 明确 `COOKIE_SECRET` 是「会话 Cookie 签名密钥（生产必填），未配置时登录/注册失败、admin gate 降级」；`src/lib/account-auth.ts:21` 读取它。
- **影响**: 按文档部署会漏配，**生产登录全挂 + admin 降级**。
- **建议**: 「必填（生产）」补 `COOKIE_SECRET`（30 天 walker-session HMAC 密钥）。

### 2. CLAUDE.md 仍把 `ADMIN_PASSWORD` 当作 cookie 签名密钥（语义已退役）
- **位置**: `CLAUDE.md:30, 43, 305`
- **证据**: 文档「密钥为 ADMIN_PASSWORD」「7 天有效」；`src/lib/admin-auth.ts:1-9` 注释「签名密钥走 `COOKIE_SECRET`，旧 `ADMIN_PASSWORD` cookie 已退役，降级为 owner 一次性 bootstrap 密钥」；`.env.example:15-18` 同。
- **影响**: 安全误导——运营误信旧 7 天 cookie 仍生效，用过期密码当生产密钥。
- **建议**: 全部改为 `COOKIE_SECRET`/30 天；`ADMIN_PASSWORD` 移到「owner bootstrap」分组。

### 3. CLAUDE.md 的账号认证模型整体过时（invited 时代残留）
- **位置**: `CLAUDE.md:43`（架构）、`120/126/142`（API 表）、`290/307`（模块）
- **证据**: 文档仍写「invited 会话」「walker-admin cookie」「`InvitedSession`」「`redactNeedCasesBySession`」；代码 `src/stores/ports.ts` 定义 `AuthState = 'public'|'user'|'admin'`（无 invited）；`src/lib/account-auth.ts:15` `COOKIE_NAME = 'walker-session'`；`store.ts` 实际导出 `redactNeedCasesByUsername(username)`。
- **影响**: 按文档写鉴权会用错 cookie 名/身份模型，前后端约定混乱。
- **建议**: 「Admin 认证」整节重写为 walker-session + role 模型；API 表「invited 会话」全改「user 会话」；删 `InvitedSession`/`redactNeedCasesBySession`。

### 4. README.md 完全未提账号认证系统
- **位置**: `README.md`（「当前定位」「内容边界」「技术栈」）
- **证据**: README 访问模型仍是 `public/draft/private/admin-only`；代码已有 `/login`、`/account`、`account-auth.ts`、`account.service.ts`、`/api/auth/*`、`/admin/accounts`、`AuthChip`（commit 815096f、29598ae）。
- **影响**: 项目已从「邀请码」升级到「账号系统」，README 定位与现实严重脱节。
- **建议**: 补「访问模型」一节（public/invited/account/admin）+ 技术栈补 account-auth。

### 5. `docs/adr/` 目录不存在但多处引用
- **位置**: `docs/README.md:12,27`、`README.md:54`、`CLAUDE.md`（提 `docs/adr/ADR-0001`）
- **证据**: `git ls-tree origin/main docs/` 顶层无 `adr/`（只有 AI赋能/archive/cycles/superpowers/README）。
- **影响**: 读者按指引放 ADR 落到不存在的目录；CLAUDE.md 引用的 ADR-0001 找不到。
- **建议**: 二选一——补回 `docs/adr/`，或从 docs/README.md + CLAUDE.md 删除所有 `docs/adr/` 引用。

### 6. `docs/cycles/current/` 严重过时（admin cycle 未归档，冒充当前）
- **位置**: `docs/cycles/current/{README,implement,retro}.md`
- **证据**: 三文件标题「admin 工作台补全 cycle（2026-06-16）」；main 已到 `c9d258b`（2026-06-17，inline-editing #22），中间隔着 content-universe 重设计 + 账号认证系统；cycles/current 流程说「一轮结束归档到 archive」，但 admin cycle 没归档。
- **影响**: 「当前轮」描述的是 2 轮之前的状态，误导复盘。
- **建议**: admin cycle 三文件移到 `docs/archive/cycles/2026-06-16-admin-workbench/`；current 替换为最新轮或显式留空。

---

## P1（按文档操作会失败）

### 7. `src/services/invite-access.service.ts` 不存在
- **位置**: `CLAUDE.md:291`
- **证据**: 文档列该服务（`verifyAndAdmit`）；`git ls-tree` 无此文件，`verifyAndAdmit` 全仓零命中。邀请码校验实际在 `src/services/account.service.ts` 的 `register()`。
- **建议**: 删该条目，补 `account.service.ts`。

### 8. `src/services/account.service.ts`（账号核心服务）文档缺失
- **位置**: `CLAUDE.md:283-301`（services 整节）
- **证据**: `account.service.ts`（210+ 行，注册/登录/登出/改密/重置/封禁/owner bootstrap）+ 单测存在，被 `/api/auth/*` + `/api/admin/accounts/*` 引用；文档 0 提及。
- **建议**: services 节新增 `account.service.ts` 条目。

### 9. `/login` 路由布局标注错误（Base → FullscreenLayout）
- **位置**: `CLAUDE.md:96`
- **证据**: 文档「`/login` | Base」；`src/pages/login.astro:9` `import FullscreenLayout`，注释「用 FullscreenLayout 剥离侧栏/页脚」。
- **建议**: 布局列改 `FullscreenLayout`。

### 10. `/account` 页面未出现在路由表
- **位置**: `CLAUDE.md:65-103`
- **证据**: `src/pages/account.astro` 存在（改密/锚点/删除申请，Base 布局）；路由表无 `/account` 行。
- **建议**: 路由表补 `| /account | 我的账号 | Base |`。

### 11. CLAUDE.md 引用已删除的 `src/lib/invited-session-auth.ts`
- **位置**: `CLAUDE.md:306`
- **证据**: 文档「受邀会话认证，导出 `readInvitedSessionId()`」；`git ls-tree origin/main src/lib` 无此文件。
- **建议**: 删该条目，补 `src/lib/account-auth.ts`。

### 12. content-universe spec「状态」写「待实现」，实际已合并
- **位置**: `docs/superpowers/specs/2026-06-16-content-universe-redesign-design.md:4`
- **证据**: 文档「状态：设计定稿，待实现」；main 上 commit 7484985→3d91935 已全部落地（`/content` 重写 + ContentStreamItem + 删 ContentUniverseCard）。
- **建议**: 改「已实现（2026-06-16，commit 3d91935）」。

### 13. inline-editing spec「状态」写「待评审」，实际已合并（#22）
- **位置**: `docs/superpowers/specs/2026-06-16-inline-editing-design.md:3`
- **证据**: 文档「状态：已设计，待评审」；main HEAD `c9d258b` 就是它（#22 已 merge）。
- **建议**: 改「已实现（2026-06-17，PR #22）」。

### 14. README/docs 决策入口指向的 walker-northstar references 在产品仓库不存在
- **位置**: `README.md:48-55`、`docs/README.md:5-9,19,43`
- **证据**: 文档「决策入口 `.agents/skills/walker-northstar/references/...`」；`.gitignore` 第 2 行 `.agents/`，walker-northstar 是独立 git 仓库，不在本仓库。
- **建议**: 明确写「决策入口在独立的 walker-northstar-skill 仓库（本仓库 .gitignore 排除）」。

### 15. `MATCH_RATE_LIMIT_SALT` / `MATCH_PROCESS_SECRET` 环境变量漏列
- **位置**: `CLAUDE.md:34`（限流）、API 表 `/api/match-process`
- **证据**: `.env.example:24-25,33-36` 注释了这两个；`src/pages/api/match.ts:79` 读 `MATCH_RATE_LIMIT_SALT`；`match-process.ts:21,57,65` 读 `MATCH_PROCESS_SECRET`。
- **建议**: 限流分组补 `MATCH_RATE_LIMIT_SALT`；`/api/match-process` 认证补 `MATCH_PROCESS_SECRET`。

### 16. `MCP_ENABLE_PRIVATE_INSIGHTS` 环境变量漏列
- **位置**: `CLAUDE.md:26-35`（环境变量）、`231`（MCP 提到但未归类）
- **证据**: `src/mcp/index.ts:201` 用它 gate `walker_insights`。
- **建议**: 环境变量新增「MCP（可选）」分组。

### 17. `user-context.service.ts` 描述用退役的身份三元组
- **位置**: `CLAUDE.md:290`
- **证据**: 文档「汇总身份（admin/invited/public）」；代码 `AuthState = 'public'|'user'|'admin'`，无 invited。
- **建议**: 改「admin/user/public」。

### 18. `conversation/store.ts` 描述含两个幽灵符号
- **位置**: `CLAUDE.md:307`
- **证据**: 文档「管理 ...InvitedSession...，导出 redactNeedCasesBySession()」；代码无 `InvitedSession`，实际是 `redactNeedCasesByUsername(username)`。
- **建议**: 删 `InvitedSession`；`redactNeedCasesBySession` → `redactNeedCasesByUsername`。

### 19. cycles/current/implement.md 的 U6 指向已删组件
- **位置**: `docs/cycles/current/implement.md:25-26`
- **证据**: 文档「U6 ContentUniverseCard.astro」；该组件在 commit 7936513（同一天）已删除。
- **建议**: 加注「已被 content-universe 重设计取代为 ContentStreamItem」。

---

## P2（命名 / 示例 / 清单不一致）

### 20. `/admin/login` 被误列为预渲染
- **位置**: `CLAUDE.md:51` ｜ 代码 `admin/login.astro` 无 `prerender`，仅 `Astro.redirect('/login')` ｜ 建议：从预渲染清单删除。

### 21. 测试清单引用不存在的 `invite-access`，漏 `account`
- **位置**: `CLAUDE.md:22` ｜ 实际有 `account.service.test.ts`，无 `invite-access.test.ts` ｜ 建议：替换。

### 22. 测试文件位置描述不完整
- **位置**: `CLAUDE.md:22` ｜ 实际还分布在 `src/{agent,knowledge,lib}/*.test.ts` ｜ 建议：补全目录。

### 23. `tilt-effect.ts` 被引用的页面清单过时
- **位置**: `CLAUDE.md:223` ｜ 文档「被 Base.astro 和 about.astro 使用」；实际只有 Base.astro ｜ 建议：删 about.astro。

### 24. `FullscreenLayout` 使用范围不完整
- **位置**: `CLAUDE.md:60` ｜ 文档「用于 /about」；实际 /about + /login ｜ 建议：补 /login。

### 25. `AuthChip.astro` / `auth-chip.ts` 未列入组件与脚本清单
- **位置**: `CLAUDE.md:184-206, 209-227` ｜ 两者都存在（身份芯片 UI + 刷新逻辑）｜ 建议：补条目。

### 26. `tools-manifest.ts` 未列入 agent/ 模块
- **位置**: `CLAUDE.md:267-279` ｜ 该文件自称「六模块 Tools 清单单一真相源」+ 单测 ｜ 建议：补条目。

### 27. `admin-auth.ts` 函数清单过时（仍列 signToken/verifyToken/authCookie/clearCookie）
- **位置**: `CLAUDE.md:305` ｜ 实际仅导出 `isAdmin()`，注释「旧 signToken 等不再导出」｜ 建议：改为仅 `isAdmin()`。

### 28. `stores/ports.ts` 接口清单缺账号/会话
- **位置**: `CLAUDE.md:289` ｜ 实际还有 `UserAccount`/`AccountRepositoryPort`/`UserSession`/`SessionRepositoryPort`/`SafetyDecision` 等 ｜ 建议：补核心接口。

### 29. `content.config.ts` 的 `communities` 子字段未细化
- **位置**: `CLAUDE.md:68` ｜ schema 实际 `{ name, description, qrCode, badge, tag }` 全必填，文档只写「对象数组」｜ 建议：补子字段。

### 30. inline-editing spec 的方法名 `readAtRef` 与实现不一致
- **位置**: `specs/2026-06-16-inline-editing-design.md:140`、`plans/...inline-editing.md:31` ｜ 实际签名 `read(path, opts?: { ref? })`，无 `readAtRef` ｜ 建议：统一改为 `read(path, { ref })`。

### 31. README 技术栈遗漏 marked/js-yaml/diff
- **位置**: `README.md:18-29` ｜ package.json 已加这三个（inline-editing）｜ 建议：补一行。

### 32. inline-editing spec 漏写 AdminEditBar「顶部工具栏」角色升级
- **位置**: `specs/...inline-editing-design.md:131-138` ｜ PR #22 含「顶部 admin 工具栏」，spec 只说「改造」｜ 建议：补「升级为顶部固定工具栏」。

---

## P3（措辞 / 格式 / 链接）

### 33. archive 文件名 `phase1-4` 夸大覆盖范围
- **位置**: `docs/archive/cycles/phase1-4-*.md` ｜ 实际只完成 Phase 1，Phase 2-4 未勾选 ｜ 建议：改名 `phase1-` 或加注释。

### 34. content-universe spec 用本机 Temp 路径做 mockup
- **位置**: `specs/...content-universe-redesign-design.md:6` ｜ `C:\Users\...\Temp\...html`，他人/CI 不可达 ｜ 建议：存到 `docs/.../assets/` 或删。

### 35. archive plan/todo 的父 PRD 链接死链
- **位置**: `docs/archive/cycles/phase1-4-*.md:3` ｜ 引用 `references/working/prd.md`（walker-northstar 仓库，本仓库不可达）｜ 建议：加「父 PRD 在独立 skill 仓库」标注。

### 36. `package.json` 的 `start`/`astro` 脚本别名未提
- **位置**: `CLAUDE.md:11-18` ｜ package.json 有 `start`(=dev 别名)、`astro` ｜ 建议：补一句别名说明。

---

## 待证据补充

### 37. `.env.example` 自身引用不存在的 `/api/invite/verify`
- **位置**: `.env.example`（`INVITE_CODES` 注释）
- **证据**: 注释「被 invite-code.store.ts 读取用于 `/api/invite/verify`」；`git ls-tree` 无 `src/pages/api/invite/` 目录，该路由不存在（实际邀请码在 `/api/auth/register` 消费）。
- **影响**: CLAUDE.md 以 .env.example 为配置权威源，而它含过时路由。
- **建议**: .env.example 的 `/api/invite/verify` → `/api/auth/register`（需进一步确认 invite-code.store.ts 是否还在用）。

### 38. `services/interfaces.ts` 的 `SafetyServicePort` 与 `stores/ports.ts` 的 `SafetyPolicyPort` 边界未澄清
- **位置**: `CLAUDE.md:274, 289`
- **证据**: 两处都提安全端口，但关系（应用服务 vs 数据层策略）文档未说清。
- **建议**: 补一句职责边界说明。

---

## 模式性观察（供系统性改进）

1. **spec/plan 的「状态」字段不随实现更新**——两条 spec 都写「待实现/待评审」但已合并（#12、#13）。建议：merge 时强制更新 spec 状态。
2. **账号系统迁移后 invited 时代残留**——CLAUDE.md 多处（API 表、模块、cookie 模型）仍用 invited/walker-admin/InvitedSession（#3、#7、#11、#17、#18）。建议：一次 sweep 把 invited → user/walker-session。
3. **walker-northstar references 死链**——README/docs/cycles 反复引用本仓库不可达的 skill 仓库路径（#14、#35）。建议：统一加「独立 skill 仓库」标注。
4. **cycles 归档纪律缺失**——admin cycle 未按自己的规则归档（#6）。建议：新轮开始前强制归档上一轮。

## 附录：已验证一致的部分（正向确认）

- `content.config.ts` 的枚举值（type/form/domain/intent/valueMode/status/level/visibility/videos.platform/resources.type）与 CLAUDE.md 第 61-68 行**完全一致**。
- `astro.config.mjs` 的 16 条 301 重定向与 CLAUDE.md 第 149-160 行**逐条一致**。
- `astro.config.mjs` 的 output/adapter/prefetch/svgo/shiki/fonts 配置与 CLAUDE.md 一致。
- `tsconfig.json` 路径别名 `@/* → src/*` 一致。
- `vitest.config.ts` include `src/**/*.test.ts` 一致。
- package.json 主体依赖（astro v6、tailwind v4、gsap、mcp sdk）一致。
