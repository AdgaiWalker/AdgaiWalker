export const meta = {
  name: 'p0-launch-hardening',
  description: 'P0 上线加固：批次1独立任务(5路) + 批次2 admin API gate改造(6组)',
  phases: [
    { title: '批次1-独立任务', detail: 'P0-3/4补测试 + P0-6核查表 + P0-7 vercel.json + P0-8内容脚本 + P0-9a sentry.ts' },
    { title: '批次2-admin-gate', detail: 'P0-2 gate改async + P0-5补audit + P0-9catch接sentry，6组按子目录并行' },
  ],
};

// ===== 共享改法模板（所有批次2 agent 遵循）=====
const GATE_TEMPLATE = `
## admin API gate 改造统一模板（所有文件遵循）

### 步骤1：gate 改 async（所有含 isAdmin/isOwner 的文件）
顶部 import 改为：
  import { isAdminAsync } from '@/lib/admin-auth';   // 或 isOwnerAsync，按原用法
  import { createSessionStore } from '@/stores/session.store';
模块级实例化（与其他 store/service 实例化放一起）：
  const sessionStore = createSessionStore();
gate 调用改造：
  旧: if (!isAdmin(request)) { return json(..., 401/403); }
  新: if (!await isAdminAsync(request, sessionStore)) { return json(..., 401/403); }
  旧: if (!isOwner(request)) { return json(..., 403); }
  新: if (!await isOwnerAsync(request, sessionStore)) { return json(..., 403); }

重要：保留原 import 路径别名 @/。保留原有 json() 辅助函数与状态码。只改 gate 判定，不改业务逻辑。
注意：一个文件可能有多个 handler（GET/POST/PATCH/DELETE），每个 handler 的 gate 都要改。
注意：如果文件已 import createSessionStore（如 delete.ts 传给 userContextService），复用那个实例或新建一个给 gate 用都可以，但不要把 userContextService 的 sessionStore 解耦出来——直接在模块级新建一个 const sessionStore = createSessionStore() 给 gate 判定用。
`;

const AUDIT_TEMPLATE = `
### 步骤2：补 requireHighRiskAudit（仅标"补audit"的文件）
在 gate 通过后、业务动作执行前，加 audit 调用。参考 src/pages/api/admin/accounts/delete.ts:54-62：
  import { requireHighRiskAudit } from '@/lib/admin-audit';
  import { resolveAdminActor } from '@/lib/admin-actor';
  const actor = await resolveAdminActor(request);
  const audit = await requireHighRiskAudit({
    actor,
    action: '<语义化动作名>',
    targetType: '<对象类型>',
    targetId: '<目标ID，从 url/body 取>',
    reason: '<为什么高风险>',
  });
  if (!audit.ok) return json({ ok:false, reason:audit.reason, code:audit.code }, audit.status);
注意：只对"写入/删除/状态变更"的 handler 补 audit。GET 只读不补。一个文件可能只有部分 handler 需要补。
`;

const SENTRY_TEMPLATE = `
### 步骤3：接 sentry captureException（所有有 catch 块的文件）
src/lib/sentry.ts 已在批次1建好，导出 captureException(error, context?)。
在每个 try/catch 的 catch 块里加：
  import { captureException } from '@/lib/sentry';
  catch (error) {
    captureException(error, { action: '<接口动作>' });
    return json({ ok:false, reason:'...' }, 500);
  }
如果文件没有 catch 块，跳过此步骤。不要为没有 catch 的文件强行加 try/catch。
`;

// ===== 批次1：5个独立任务并行 =====
phase('批次1-独立任务');

const batch1 = await parallel([
  // Agent A: P0-3 + P0-4 补测试
  () => agent(`你的任务是补两个测试文件，验证已有的安全守门逻辑。用中文。

## P0-3: src/pages/api/auth/setup.ts 补测试
现状：setup.ts 已实现 bootstrap-locked → 410 自锁逻辑（src/pages/api/auth/setup.ts:36-41）。
它调用 accountService.bootstrapOwner，失败时 code='bootstrap-locked' 返回 410，其它失败返回 400。

新建测试文件 src/pages/api/auth/setup.test.ts，用 vitest。参考 src/lib/admin-audit.test.ts 的风格（直接 import，构造 fake 依赖）。
测试场景：
1. 系统已有账号（bootstrapOwner 返回 { ok:false, code:'bootstrap-locked' }）→ 返回 410
2. 成功 bootstrap（返回 { ok:true, sessionId, role, username }）→ 返回 200 + Set-Cookie 头

注意：需要 mock accountService.bootstrapOwner。用 vi.mock('@/services/account.service', ...) 或在测试里注入。
由于 setup.ts 模块级实例化 accountService，最简单方式是用 vi.mock 替换 createAccountService。
signSessionToken 需要 COOKIE_SECRET，测试里设 import.meta.env.COOKIE_SECRET = 'test-secret'。

## P0-4: src/pages/api/auth/dev-preview.ts 补测试
现状：dev-preview.ts:23 已有双重守门：import.meta.env.DEV 为 false 或非 loopback → 404。
新建测试文件 src/pages/api/auth/dev-preview.test.ts。
测试场景：
1. PROD 模式（import.meta.env.DEV = false）→ 返回 404
2. DEV + loopback（127.0.0.1）→ 返回 200 + Set-Cookie
注意：用 vi.stubEnv 或直接赋值 import.meta.env.DEV 控制模式。loopback 用 new Request('http://127.0.0.1/api/auth/dev-preview', {...})。

运行验证：npx vitest run src/pages/api/auth/setup.test.ts src/pages/api/auth/dev-preview.test.ts
确保测试全绿。不要改产品代码（setup.ts / dev-preview.ts），只补测试。`, { label: 'P0-3+4 补测试' }),

  // Agent B: P0-6 产出 admin-audit 覆盖核查表
  () => agent(`你的任务是产出 admin-audit 覆盖核查表文档。用中文。这是只读分析任务，不改任何代码。

扫描 src/pages/api/admin/**/*.ts（排除 .test.ts），对每个文件的每个写入 handler（POST/PATCH/PUT/DELETE）检查：
1. 是否已调用 requireHighRiskAudit（grep 'requireHighRiskAudit'）
2. 是否改持久状态（写入/删除/状态变更）
3. 风险等级（高/中/低/无）

参考 docs/design/上线与架构落成-to-do.md 中 P0-6 章节的核查表格式：
[A] 已接 audit 的文件
[B] 本轮补 audit 的 7 个高优先级文件（assets/promote, skills, northstar/offers, northstar/orders, grants, appearance DELETE, support）
[C] P1 registry 阶段统一标注的中优先级文件
[D] 无需 audit 的文件

产出文件：docs/design/admin-audit-coverage.md
内容：每个 admin API 文件的 handler 级核查表（文件路径、handler、HTTP方法、是否已接audit、风险等级、备注）。
运行验证：确认文件已写入。`, { label: 'P0-6 核查表' }),

  // Agent C: P0-7 vercel.json
  () => agent(`你的任务是新建 vercel.json。用中文。

新建项目根目录的 vercel.json，内容：
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/match-process", "schedule": "0 * * * *" }
  ],
  "functions": {
    "api/match.ts": { "maxDuration": 60 }
  }
}

先确认 src/pages/api/match-process.ts 和 src/pages/api/match.ts 是否存在（用 Glob 或 Read）。
schedule "0 * * * *" = 每小时整点触发 /api/match-process。
验证：cat vercel.json 确认 JSON 合法。`, { label: 'P0-7 vercel.json' }),

  // Agent D: P0-8 内容字段校验脚本
  () => agent(`你的任务是新建内容字段迁移校验脚本。用中文。

新建 scripts/check-content-fields.mjs，功能：
1. 遍历 src/content/log/ 下所有 .md 文件（递归子目录）
2. 用 gray-matter 解析 frontmatter（项目已有 gray-matter 依赖）
3. 校验必需字段是否存在：form, domain, intent, valueMode, aiUsePolicy, updated, summary
4. 输出缺失字段的文件清单（只报告不修复）
5. 有缺失 → exit 1；全齐 → exit 0

然后在 package.json 的 scripts 里加："check:content-fields": "node scripts/check-content-fields.mjs"
（用 Read 读 package.json，用 Edit 加 script，不要覆盖整个文件）

先 Glob src/content/log/*.md 看看实际有哪些文件和 frontmatter 字段，据此确定校验逻辑。
运行验证：node scripts/check-content-fields.mjs（即使有缺失字段也应正常输出，不崩）`, { label: 'P0-8 内容脚本' }),

  // Agent E: P0-9-a sentry.ts
  () => agent(`你的任务是新建 src/lib/sentry.ts。用中文。

要求（来自 to-do 文档 P0-9）：
- 导出 captureException(error: unknown, context?: Record<string, unknown>): void
- SENTRY_DSN 走 import.meta.env.SENTRY_DSN
- 未配置 SENTRY_DSN 时 no-op（不阻塞开发/测试，不抛错）
- 配置时用 fetch 直接上报到 Sentry envelope 端点（轻量手封，不用 @sentry/astro SDK）
- fire-and-forget 语义（不 await，失败静默，绝不影响业务流程）

DSN 格式解析：https://<publickey>@<host>/<projectid>
envelope 端点：https://<host>/api/<projectid>/envelope/
POST body 是 Sentry envelope 格式（event 类型的 JSON）。

同时新建 src/lib/sentry.test.ts，用 vitest 测试：
1. 未配置 SENTRY_DSN → captureException 不抛错，no-op
2. 配置了 SENTRY_DSN → captureException 发起 fetch（mock global fetch 验证被调用）

不要接入任何 catch 块（那由批次2的 agent 做）。
不要改 .env.example（简化，可选）。
运行验证：npx vitest run src/lib/sentry.test.ts`, { label: 'P0-9a sentry.ts' }),
]);

log('批次1完成：' + batch1.filter(Boolean).length + '/5 成功');

// ===== 批次2：6组 admin API gate 改造并行 =====
phase('批次2-admin-gate');

const COMMON = GATE_TEMPLATE + AUDIT_TEMPLATE + SENTRY_TEMPLATE;

const batch2 = await parallel([
  // Agent 1: accounts/ + auth
  () => agent(`你的任务是改造 accounts 目录和 auth.ts 的 admin gate。用中文。
${COMMON}

## 你的文件集（7个文件）
1. src/pages/api/admin/accounts/delete.ts — gate: isOwner→isOwnerAsync。已有audit，不改audit。补sentry catch（如有）。
2. src/pages/api/admin/accounts/reset.ts — gate: isOwner→isOwnerAsync。已有audit。补sentry catch。
3. src/pages/api/admin/accounts/role.ts — gate: isOwner→isOwnerAsync。已有audit。补sentry catch。
4. src/pages/api/admin/accounts/status.ts — gate: isOwner→isOwnerAsync。已有audit。补sentry catch。
5. src/pages/api/admin/accounts/[username].ts — gate: isAdmin→isAdminAsync。补sentry catch。
6. src/pages/api/admin/accounts.ts — gate: isAdmin→isAdminAsync。补sentry catch。
7. src/pages/api/admin/auth.ts — gate: isAdmin→isAdminAsync（登出DELETE）。补sentry catch。

注意：delete/reset/role/status 用 isOwner（只有站主能操作账号），改 isOwnerAsync。
      accounts.ts / accounts/[username].ts / auth.ts 用 isAdmin，改 isAdminAsync。
每个文件先 Read 确认现状再改。保留所有已有 audit 调用，只改 gate + 补 sentry。`, { label: 'Agent1: accounts+auth' }),

  // Agent 2: workbench + decisions + actions + outcomes
  () => agent(`你的任务是改造 workbench/decisions/actions/outcomes 域的 admin gate。用中文。
${COMMON}

## 你的文件集（7个文件，均为中优先级，不补audit）
1. src/pages/api/admin/workbench.ts — gate: isAdmin→isAdminAsync。补sentry catch。
2. src/pages/api/admin/workbench/[id].ts — gate: isAdmin→isAdminAsync。补sentry catch。
3. src/pages/api/admin/decisions.ts — gate: isAdmin→isAdminAsync。补sentry catch。
4. src/pages/api/admin/decisions/[id].ts — gate: isAdmin→isAdminAsync。补sentry catch。
5. src/pages/api/admin/actions.ts — gate: isAdmin→isAdminAsync。补sentry catch。
6. src/pages/api/admin/actions/[id].ts — gate: isAdmin→isAdminAsync。补sentry catch。
7. src/pages/api/admin/outcomes.ts — gate: isAdmin→isAdminAsync。补sentry catch。

这些文件不补 audit（中优先级，归 P1 registry 统一处理）。只做 gate 改 async + sentry catch。`, { label: 'Agent2: workbench+decisions' }),

  // Agent 3: content + brief + assets
  () => agent(`你的任务是改造 content/brief/assets 域的 admin gate。用中文。
${COMMON}

## 你的文件集（6个文件）
1. src/pages/api/admin/content/[slug].ts — gate: isAdmin→isAdminAsync。已有audit。补sentry catch。
2. src/pages/api/admin/content/[slug]/history.ts — gate: isAdmin→isAdminAsync（只读GET）。补sentry catch。
3. src/pages/api/admin/content/[slug]/version.ts — gate: isAdmin→isAdminAsync（只读GET）。补sentry catch。
4. src/pages/api/admin/brief.ts — gate: isAdmin→isAdminAsync。补sentry catch。
5. src/pages/api/admin/assets/promote.ts — gate: isAdmin→isAdminAsync。【补audit】Skill准入高风险。补sentry catch。
6. src/pages/api/admin/assets/evidence.ts — gate: isAdmin→isAdminAsync。补sentry catch。

### assets/promote.ts 补 audit 参数：
  action: 'asset.promote', targetType: 'skill', targetId: 从body的skillId取,
  reason: 'Skill 准入会改资产生命周期，准入到 admitted 即对外发布能力。'
在 gate 通过后、promote 执行前加 audit 调用。`, { label: 'Agent3: content+assets' }),

  // Agent 4: experience + rules + skills + learning
  () => agent(`你的任务是改造 experience/rules/skills/learning 域的 admin gate。用中文。
${COMMON}

## 你的文件集（4个文件）
1. src/pages/api/admin/experience-events.ts — gate: isAdmin→isAdminAsync。补sentry catch。
2. src/pages/api/admin/rules.ts — gate: isAdmin→isAdminAsync。补sentry catch。
3. src/pages/api/admin/skills.ts — gate: isAdmin→isAdminAsync。【补audit】补sentry catch。
4. src/pages/api/admin/learning-requests.ts — gate: isAdmin→isAdminAsync。补sentry catch。

### skills.ts 补 audit 参数：
skills.ts 的 POST 有多个分支：?action=admission（切换准入状态，高风险）、?action=pause/resume/rollback、普通创建/更新。
只对 action=admission 分支补 audit（改准入状态是高风险）：
  action: 'skill.admission', targetType: 'skill', targetId: body.skillId,
  reason: '切换 Skill 准入状态（admitted/demoted）改变能力发布边界。'
在 admission 分支的 gate 通过后、updateSkillAdmission/updateSkillRegistration 调用前加 audit。
注意：不要对普通创建/更新分支加 audit（那是中优先级）。`, { label: 'Agent4: skills+experience' }),

  // Agent 5: gateway + grants + invite-codes + incidents + conversations + hit-rate + review + inspiration
  () => agent(`你的任务是改造 gateway/grants/invite-codes/incidents/conversations/hit-rate/review/inspiration 的 admin gate。用中文。
${COMMON}

## 你的文件集（9个文件）
1. src/pages/api/admin/gateway.ts — gate: isAdmin→isAdminAsync。已有audit。补sentry catch。
2. src/pages/api/admin/grants.ts — gate: isAdmin→isAdminAsync。【补audit】对象级授权高风险。补sentry catch。
3. src/pages/api/admin/invite-codes/index.ts — gate: isAdmin→isAdminAsync。已有audit。补sentry catch。
4. src/pages/api/admin/invite-codes/disable.ts — gate: isAdmin→isAdminAsync。补sentry catch。
5. src/pages/api/admin/incidents.ts — gate: isAdmin→isAdminAsync。补sentry catch。
6. src/pages/api/admin/conversations.ts — gate: isAdmin→isAdminAsync（只读GET）。补sentry catch。
7. src/pages/api/admin/hit-rate.ts — gate: isAdmin→isAdminAsync（只读GET）。补sentry catch。
8. src/pages/api/admin/review.ts — gate: isAdmin→isAdminAsync。补sentry catch。
9. src/pages/api/admin/inspiration.ts — gate: isAdmin→isAdminAsync。补sentry catch。

### grants.ts 补 audit 参数：
  action: 'grant.save' 或 'grant.revoke'（按 handler 区分）, targetType: 'grant',
  targetId: grantId 或 grantee, reason: '对象级授权改变权限边界，默认拒绝原则下的显式放行。'
在 POST（save）和 DELETE（revoke）的 gate 通过后、业务执行前加 audit。`, { label: 'Agent5: gateway+grants' }),

  // Agent 6: northstar + appearance + support + demo + system-map
  () => agent(`你的任务是改造 northstar/appearance/support/demo/system-map 的 admin gate。用中文。
${COMMON}

## 你的文件集（7个文件）
1. src/pages/api/admin/northstar/offers.ts — gate: isAdmin→isAdminAsync。【补audit】公开发布offer高风险。补sentry catch。
2. src/pages/api/admin/northstar/orders.ts — gate: isAdmin→isAdminAsync。【补audit】订单状态流转涉及交易。补sentry catch。
3. src/pages/api/admin/appearance.ts — gate: isAdmin→isAdminAsync。【补audit，仅DELETE分支】删媒体不可逆。补sentry catch。
4. src/pages/api/admin/appearance/media.ts — gate: isAdmin→isAdminAsync。补sentry catch。
5. src/pages/api/admin/support.ts — gate: isAdmin→isAdminAsync。【补audit】赞赏码配置涉及收款。补sentry catch。
6. src/pages/api/admin/demo-scenario.ts — gate: isAdmin→isAdminAsync。【加PROD守门】。补sentry catch。
7. src/pages/api/admin/system-map.ts — 【保留同步isAdmin，不改async】只读GET，无数据泄露风险。补sentry catch（如有catch）。

### northstar/offers.ts 补 audit 参数（POST/PATCH/DELETE）：
  action: 'offer.publish'/'offer.update'/'offer.unlist', targetType: 'offer', targetId: offerId,
  reason: '发布/修改/下架 offer 改变对外公开经营物。'
### northstar/orders.ts 补 audit 参数（POST 状态流转）：
  action: 'order.transition', targetType: 'order', targetId: orderId,
  reason: '订单状态流转涉及交易履约。'
### appearance.ts 补 audit 参数（仅 DELETE handler）：
  action: 'media.delete', targetType: 'media-asset', targetId: assetId（从url取）,
  reason: '删除媒体资产不可逆。'
### support.ts 补 audit 参数（PUT 保存配置）：
  action: 'support.config', targetType: 'support-config', targetId: 'global',
  reason: '赞赏码配置涉及收款二维码，改变对外收款入口。'
### demo-scenario.ts 加 PROD 守门：
  在文件顶部 handler 开头加：if (import.meta.env.PROD) return json({ ok:false, reason:'演示场景仅开发可用。' }, 404);
  然后再做 gate 改 async。
### system-map.ts：
  不改 gate（保留同步 isAdmin）。这是只读系统地图，无写入。只补 sentry catch（如果有 catch 块）。`, { label: 'Agent6: northstar+appearance' }),
]);

log('批次2完成：' + batch2.filter(Boolean).length + '/6 成功');
