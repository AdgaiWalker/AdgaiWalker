# Walker 上线与架构落成 — 可执行 to-do(P0 + 后续)

> **日期**:2026-06-22
> **状态**:已批准,进入 reality 实施
> **来源**:`docs/design/上线与架构落成方案.md`(单一权威路线)
> **本次执行范围**:P0 全量 + P1-P2 预登记(后续 Wave)
> **目标**:个人网站以最小护栏上线,不动 API 路径
> **自主决策边界**:除 Human Gate 标注项外,AI 可自行实施;遇到问题自行决定

---

## 0. 优先级与 Wave 划分

按"风险消除优先、依赖关系、可并行性"切分:

```text
Wave 1 安全信任链(P0-1,P0-2)         ── 最高优先级,唯一标红安全问题
  必须先做,所有其他 Wave 的安全测试依赖它

Wave 2 代码层核查与加固(P0-3..P0-6)   ── 第二优先级
  并行可做,互不依赖
  部分已通过核查发现是"核查通过 + 补测试",修改面比预期小

Wave 3 工程化补全(P0-7,P0-8,P0-9)    ── 第三优先级
  独立工具/脚本/观测,互不依赖
  生产触发类任务(实际 cron 触发、Sentry 实发事件)归到 Wave 5

Wave 4 端到端验证(P0-10)              ── 第四优先级
  依赖 Wave 1-3 完成

Wave 5 部署与云端加固(Human Gate)     ── 最后,Walker 操作
  依赖 Wave 1-4 全部通过
```

执行顺序图:

```text
Wave 1 ──┐
         ├─→ Wave 4 ──→ Wave 5(部署)
Wave 2 ──┤
         │
Wave 3 ──┘
```

---

## Wave 1:安全信任链修复(最高优先级)

### P0-1 isAdmin 信任链修复(方案 A:isValid 校验)

**问题**:`src/lib/admin-auth.ts` 的 `isAdmin()` 纯 cookie 判定,封号/改密后旧 cookie 的 `role=admin` 在 30 天内仍通过。

**核查发现**:
- `src/stores/session.store.ts:54` 的 `isValid()` 已实现 ✓
- 当前 `isAdmin()` 是同步函数 `boolean`,所有 admin API 调用方是同步用法

**修改面**:

```text
src/lib/admin-auth.ts
  - isAdmin(request): boolean 保留(只给 UI 同步降级显示用)
  - 新增 isAdminAsync(request, sessionStore): Promise<boolean>
    流程:readSessionPayload → 校验签名 → sessionStore.isValid(sid)
  - isOwner/isOwnerAsync 同样处理

src/stores/session.store.ts
  - 已有 isValid(),无需改 ✓

src/lib/admin-auth.test.ts(新增或扩展)
  - 有效 session + 正确 role → true
  - 正确 role 但 session 已被 killAllByUsername → false
  - 无 cookie / 签名错误 → false
  - PROD 模式下,sessionStore.isValid=false 时 → false
```

**依赖**:无(独立先行)

**验收**:

```bash
npx vitest run src/lib/admin-auth.test.ts
npx astro check
```

**自主决策**:✓ 可实施。不改 cookie 结构,不改 SessionRepositoryPort 接口。

---

### P0-2 所有 admin API gate 改为 await isAdminAsync

**问题**:30+ 个 admin API 使用同步 `isAdmin(request)`,必须改为 `await isAdminAsync(request, sessionStore)`。

**修改面**:

```text
src/pages/api/admin/**/*.ts 中所有:
  if (!isAdmin(request)) ...
改为:
  const sessionStore = createSessionStore();  // 模块顶部一次性实例化
  if (!await isAdminAsync(request, sessionStore)) ...

特殊情况:
  - isOwner(request) → await isOwnerAsync(request, sessionStore)
  - 只读 GET 接口可选(若不校验也无数据泄露风险,可保留同步版)
    决策:GET 也改为 await,保持一致性 + 防御纵深

影响文件清单(按 src/pages/api/admin/**/*.ts 扫描):
  accounts/ delete|reset|role|status
  actions/ [id]|index
  appearance/ index(PATCH/POST/DELETE)|media
  assets/ promote|evidence
  auth
  brief
  content/ [slug]
  decisions/ [id]|index
  experience-events
  gateway
  grants
  hit-rate
  incidents
  inspiration
  invite-codes/ disable|index
  learning-requests
  northstar/ offers|orders
  outcomes
  review
  rules
  skills
  support
  system-map(只读,可保留同步)
  topics(GET,可选)
  workbench / [id]
```

**依赖**:P0-1 完成

**验收**:

```bash
npx astro check
npm test
# 至少 0 类型错误,所有现有 admin 测试不回归
```

**自主决策**:✓ 可实施。改动机械,但要全覆盖。建议写一个核查清单逐个勾选。

---

## Wave 2:代码层核查与加固(可并行)

### P0-3 setup.ts owner bootstrap 顺序核查 ✓

**核查结果**:**已通过**。

- `src/pages/api/auth/setup.ts:23-41` 已通过 `accountService.bootstrapOwner` 内部逻辑实现 exists() gate。
- `result.code === 'bootstrap-locked'` 时返回 410(自锁),其它失败返回 400。
- 依赖 `adminPassword`(ADMIN_PASSWORD 环境变量),不是"任何人可建 owner"。

**剩余**:补一条测试加固。

**修改面**:

```text
src/pages/api/auth/setup.ts.test.ts(新增,或扩展现有)
  - mock createAccountService,让 bootstrapOwner 返回 { ok:false, code:'bootstrap-locked' }
  - 断言:返回 410
  - mock 成功路径:返回 200 + Set-Cookie
```

**自主决策**:✓ 只补测试,不改产品代码。

---

### P0-4 dev-preview 生产关闭核查 ✓

**核查结果**:**已通过**。

- `src/pages/api/auth/dev-preview.ts:23` 已有 `if (!import.meta.env.DEV || !isLoopback(request))` 双重守门。
- 生产环境 `import.meta.env.DEV` 为 false,直接返回 404。

**剩余**:补一条测试加固(可选,若已有测试可跳过)。

**修改面**:

```text
src/pages/api/auth/dev-preview.test.ts(核查,若存在则确认已覆盖 PROD 返回 404)
若不存在:新增最小测试
  - mock import.meta.env.PROD / DEV
  - 断言 PROD 返回 404
```

**自主决策**:✓ 只补测试。

---

### P0-5 admin-audit 覆盖核查 + 补漏

**核查结果**(基于 grep):

**已接 `requireHighRiskAudit` 的 7 个文件** ✓:

```text
1. src/pages/api/admin/accounts/delete.ts     (delete)
2. src/pages/api/admin/accounts/reset.ts      (reset)
3. src/pages/api/admin/accounts/role.ts       (role)
4. src/pages/api/admin/accounts/status.ts     (status)
5. src/pages/api/admin/invite-codes/index.ts  (生成/禁用)
6. src/pages/api/admin/gateway.ts             (AI Gateway 配置)
7. src/pages/api/admin/content/[slug].ts      (内容删除分支)
```

**未接 audit 但改持久状态的写入接口**(需逐个评估):

```text
高优先级补 audit(改事实/隐私/外部调用):
  - assets/promote.ts (POST)        Skill 准入 — 改资产生命周期,高风险
  - skills.ts (POST)                 Skill admission/pause/resume/rollback — 同上
  - northstar/offers.ts (POST/PATCH/DELETE)  发布/修改/下架 offer — 公开发布
  - northstar/orders.ts (POST)       订单状态流转 — 涉及交易
  - grants.ts (POST/DELETE)          对象级授权 — 改权限边界
  - appearance.ts (DELETE)           删媒体 — 不可逆
  - support.ts (PUT)                 赞赏码配置 — 涉及收款二维码

中优先级评估(写业务对象,但非不可逆):
  - decisions.ts (POST)              创建 Decision — WorkItem 生命周期
  - decisions/[id].ts (PATCH)        更新 Decision
  - actions.ts (POST)                创建 Action
  - actions/[id].ts (PATCH)          更新 Action
  - outcomes.ts (POST)               记录 Outcome
  - experience-events.ts (POST)      创建经验事件
  - rules.ts (POST)                  创建规则候选
  - learning-requests.ts (POST/PATCH) 创建/更新学习任务
  - brief.ts (POST)                  生成简报
  - inspiration.ts (POST)            Walker 主张
  - review.ts (POST)                 后台复盘动作

低优先级(内部辅助/演示):
  - demo-scenario.ts (POST/DELETE)   演示场景,生产建议直接删除文件
  - auth.ts (DELETE)                 登出,改会话非业务事实
```

**决策**:

```text
高优先级 7 个接口:补 requireHighRiskAudit(本轮必须做)
中优先级:暂不强制,作为 P1 registry 阶段统一标注 audit 等级
低优先级:demo-scenario 建议生产构建删除(核查 import.meta.env.PROD 守门)
```

**修改面**:

```text
7 个高优先级文件,每个在动作执行前加:
  const audit = await requireHighRiskAudit({
    actor: await resolveAdminActor(request),
    action: '<语义化动作名>',
    targetType: '<对象类型>',
    targetId: '<目标ID,可从 url/params/body 取>',
    reason: '<为什么这是高风险>',
  });
  if (!audit.ok) return json({ ok:false, reason:audit.reason, code:audit.code }, audit.status);

参考已有实现:src/pages/api/admin/accounts/delete.ts:54-62
```

**依赖**:P0-2 完成(因为补的 audit 调用要在 isAdminAsync gate 之后)

**验收**:

```bash
npx vitest run src/lib/admin-audit.test.ts
npm test
```

**自主决策**:✓ 高优先级 7 个补完。中/低优先级标注进 P1 registry 处理。

---

### P0-6 高危 admin API audit 覆盖核查表

**核查表生成**(作为本轮交付物):

```text
[A] 已接 audit(7):
  accounts/delete, accounts/reset, accounts/role, accounts/status,
  invite-codes/index, gateway, content/[slug]

[B] 本轮补 audit(7):
  assets/promote, skills, northstar/offers, northstar/orders,
  grants, appearance(DELETE), support

[C] P1 registry 阶段统一标注(14):
  decisions, decisions/[id], actions, actions/[id], outcomes,
  experience-events, rules, learning-requests, brief, inspiration,
  review, invite-codes/disable, content/[slug](PUT/PATCH), appearance(PATCH)

[D] 无需 audit:
  auth(DELETE 登出), demo-scenario(建议生产删除)
```

**自主决策**:✓ 输出核查表 + 完成 [B] 类。

---

## Wave 3:工程化补全(独立可并行)

### P0-7 vercel.json(crons + maxDuration)

**修改面**:

```text
新建 vercel.json(项目根目录):
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/match-process", "schedule": "0 * * * *" }
  ],
  "functions": {
    "api/match.ts": { "maxDuration": 60 }
  }
}

核查:
- src/pages/api/match-process.ts 已存在
- 它接受 CRON_SECRET 或 MATCH_PROCESS_SECRET 头
- schedule "0 * * * *" = 每小时整点
```

**验收**:vercel.json 存在且 JSON 合法;实际 cron 触发归 Wave 5。

**自主决策**:✓ 可创建。**实际部署验证属 Walker**(Wave 5)。

---

### P0-8 内容字段迁移校验脚本

**修改面**:

```text
新建 scripts/check-content-fields.mjs:
  - 遍历 src/content/log/*.md(支持子目录递归)
  - 用 gray-matter 解析 frontmatter
  - 校验必需字段: form / domain / intent / valueMode / aiUsePolicy / updated / summary
  - 输出缺失列表(只报告,不修复)
  - exit 1 若有缺失,exit 0 若全齐

package.json 新增:
  "check:content-fields": "node scripts/check-content-fields.mjs"
```

**验收**:

```bash
npm run check:content-fields
# 输出缺失字段的内容清单
```

**自主决策**:✓ 可建脚本。**补内容字段属 Walker**(内容意图判断)。

---

### P0-9 Sentry 接入

**修改面**:

```text
1. Walker 在 sentry.io 建项目,拿 DSN(Human Gate)
2. 新增 src/lib/sentry.ts:
   - captureException(error, context?)
   - SENTRY_DSN 走 import.meta.env.SENTRY_DSN
   - 未配置时 no-op(不阻塞开发/测试)
   - 用 Sentry Node SDK 或 fetch 直接上报(轻量)
3. 关键 catch 块接入:
   - src/pages/api/match.ts 的 catch
   - src/pages/api/admin/**/*..ts 的 catch(至少 [A][B] 类接口)
4. .env.example 新增 SENTRY_DSN 说明
5. 可选:astro.config.mjs 接 build-time source map 上传(非必须)
```

**决策**:用轻量手封而非 `@sentry/astro`,减少依赖。签名用 `import.meta.env.SENTRY_DSN`。

**验收**:

```bash
# 配置 SENTRY_DSN 后,手动触发一个 500,看 Sentry dashboard 收到
# 未配置时 npm run build 应正常通过
npx astro check
```

**自主决策**:✓ 实施 sentry.ts + 关键 catch。**注册账号 + 拿 DSN 属 Walker**(Wave 5)。

---

## Wave 4:端到端验证(依赖 Wave 1-3)

### P0-10 主路径烟测清单 + E2E

**修改面**:

```text
新建 tests/e2e/launch-smoke.spec.ts(或合并进现有 spec):

[公开路径]
1. 访客访问 / → 200
2. 访客访问 /content → 200,卡片渲染
3. 访客访问 /tools(邀请码 gate) → 200
4. 访客点赞 /api/like → 成功计数

[邀请到反馈]
5. 邀请码注册 → 登录 → cookie 签发
6. 登录后 /api/match 提问 → 收到推荐
7. /api/match-feedback 提交反馈 → 成功

[后台主路径]
8. owner 登录 → /admin → 200
9. /admin/review → 看到上一步 NeedCase
10. /admin/topics → 看到 TopicCandidate(若 cron 已跑)
11. /admin/hit-rate → 命中率渲染
12. /admin/appearance → 上传图片 → 刷新 → 图片还在
13. /admin/content/[slug] 编辑 → 保存成功(若 GITHUB_TOKEN 配置)

[安全验证]
14. 封号后:旧 cookie 访问 /api/admin/* → 401/403(P0-1/P0-2 修复后)
15. /api/auth/dev-preview 在 PROD 返回 404(P0-4 加固)
16. /api/auth/setup 在已有账号时返回 410(P0-3 加固)
17. /api/admin/accounts/delete 等 [A] 类接口拒绝无 audit 的调用
```

**依赖**:Wave 1 + Wave 2 + Wave 3 全部完成

**验收**:

```bash
npx playwright test tests/e2e/launch-smoke.spec.ts
```

**自主决策**:✓ 可写 E2E 并在本地等价环境跑。**生产烟测属 Walker**(Wave 5)。

---

## Wave 5:部署与云端加固(Human Gate,Walker 操作)

### P0-11 真实凭据配置

**Walker 操作清单**:

```text
1. Vercel Dashboard → Storage → Upstash for Redis → Connect to Project
   自动注入:UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN

2. Vercel Dashboard → Storage → Blob → Connect to Project
   自动注入:BLOB_READ_WRITE_TOKEN

3. Vercel Project Settings → Environment Variables:
   COOKIE_SECRET=<随机长字符串,与 ADMIN_PASSWORD 不同>
   CRON_SECRET=<随机长字符串>
   SENTRY_DSN=<从 sentry.io 复制>
   GITHUB_TOKEN=<限 scope 的 token>(可选)

4. 部署后第一件事:
   - 访问 /api/auth/setup 建 owner
   - 设强密码
   - ADMIN_PASSWORD 退役(可删除环境变量)
```

**自主决策**:✗ 全部 Walker 操作。

### P0-12 云端加固验证

```bash
npm run verify:production-storage
npm run verify:production-media-storage
npm run check:production-readiness
```

**云端加固 vs 本地等价的边界**:

```text
本地等价验证(第十三轮已完成)证明:
  - 代码层契约正确(键名、序列化、索引)
  - storage-unavailable 503 门闩生效
  - 跨进程读回、持久化、大文件、路径逃逸防护

云端加固验证(待 Wave 5 跑)额外证明:
  - Upstash REST 网关多区域复制
  - Vercel Blob CDN / 私有 URL / 真实 multipart
  - 生产部署重启后数据真的还在
```

**自主决策**:✗ Walker 操作凭据后,我可代为跑脚本并解读结果。

---

## P0 整体验收标准

```text
1. ✓ isAdmin 信任链修复(方案 A)+ 所有 admin gate 改 async
2. ✓ setup.ts / dev-preview 测试加固
3. ✓ admin-audit 覆盖 [A]+[B] 共 14 个接口
4. ✓ vercel.json(crons + maxDuration)
5. ✓ 内容字段迁移校验脚本就绪
6. ✓ Sentry 封装 + 关键路径接入
7. ✓ 主路径烟测 E2E 全绿(本地等价)
8. ⚠️ 三条 verify:* 脚本在真凭据下绿(Wave 5,Human Gate)
9. ⚠️ owner bootstrap 完成(Wave 5,Human Gate)
```

**本地可完成的阻断(1-7)**:AI 全量实施。
**依赖外部凭据的阻断(8-9)**:Walker Human Gate。

---

## 多 agent 并行策略

### 并行可行性逐任务分析

| 任务 | 改的文件 | 依赖 | 文件冲突 | 可并行? |
|---|---|---|---|---|
| P0-1 | `admin-auth.ts`(改) + test(新) | 无 | 无(独占) | **串行锚点** |
| P0-2 | 30+ admin API files | P0-1 | 与 P0-5/P0-9-catch 重叠 | 内部按子目录并行 |
| P0-3 | `auth/setup.ts` 补测试 | 无 | 无 | ✓ 独立并行 |
| P0-4 | `auth/dev-preview.ts` 补测试 | 无 | 无 | ✓ 独立并行 |
| P0-5 | 7 个 admin API files 补 audit | P0-1 | **与 P0-2 同文件** | 合并进 P0-2 |
| P0-6 | 只读分析,产出核查表文档 | 无 | 无 | ✓ 独立并行 |
| P0-7 | `vercel.json`(新建) | 无 | 无 | ✓ 独立并行 |
| P0-8 | `scripts/check-content-fields.mjs`(新建) | 无 | 无 | ✓ 独立并行 |
| P0-9 | `sentry.ts`(新建) + catch 块(改) | sentry.ts 独立;catch 与 P0-2 冲突 | 拆分:sentry.ts 并行,catch 合并进 P0-2 | ✓ 部分 |
| P0-10 | `tests/e2e/launch-smoke.spec.ts`(新建) | Wave 1-3 | 无(独占) | 串行最后 |

**关键洞察**:

```text
P0-2 / P0-5 / P0-9-catch 三者改同一批 admin API 文件,不能分给不同 agent。
解决:P0-2 + P0-5 + P0-9-catch 合并为一次遍历,按子目录拆分给多个 agent,
每个 agent 在自己的文件集内完成 gate 改 async + 补 audit + 接 sentry catch。
```

---

### 并行批次设计

#### 批次 0:串行锚点(1 个 agent,必须最先)

**P0-1 实现 `isAdminAsync` / `isOwnerAsync`,固定 API 契约。**

后续所有 agent 依赖这个签名,必须先完成并测试通过。

**API 契约(写死,所有 agent 遵循)**:

```ts
// src/lib/admin-auth.ts 新增

import type { SessionRepositoryPort } from '@/stores/ports';

export async function isAdminAsync(
  request: Request,
  sessionStore: SessionRepositoryPort,
): Promise<boolean> {
  const payload = readSessionPayload(request);
  if (!payload) return false;
  if (payload.role !== 'admin' && payload.role !== 'owner') return false;
  return sessionStore.isValid(payload.sid);
}

export async function isOwnerAsync(
  request: Request,
  sessionStore: SessionRepositoryPort,
): Promise<boolean> {
  const payload = readSessionPayload(request);
  if (!payload || payload.role !== 'owner') return false;
  return sessionStore.isValid(payload.sid);
}
```

**每个 admin API 文件的统一改法模板**(批次 2 所有 agent 遵循):

```ts
// 顶部新增 import(若尚未引入)
import { isAdminAsync } from '@/lib/admin-auth';   // 或 isOwnerAsync
import { createSessionStore } from '@/stores/session.store';

// 模块级实例化(与其他 store 实例化放一起)
const sessionStore = createSessionStore();

// gate 调用:
//   旧: if (!isAdmin(request)) { return json(..., 403); }
//   新: if (!await isAdminAsync(request, sessionStore)) { return json(..., 403); }
```

**用时**:~1h

---

#### 批次 1:独立文件并行(5 个 agent 同时,无文件冲突)

P0-1 完成后立即启动。这 5 个任务改完全不同的文件:

| Agent | 任务 | 改的文件 | 用时 |
|---|---|---|---|
| A | P0-3 + P0-4 | `auth/setup.ts` test + `auth/dev-preview.ts` test | ~1h |
| B | P0-6 | 产出 `admin-audit-coverage.md` 核查表(只读分析) | ~0.5h |
| C | P0-7 | 新建 `vercel.json` | ~0.3h |
| D | P0-8 | 新建 `scripts/check-content-fields.mjs` + `package.json` script | ~1h |
| E | P0-9-a | 新建 `src/lib/sentry.ts`(只建封装,不接 catch) | ~1h |

**并行约束**:5 个 agent 的文件集完全不重叠 ✓

**用时**:~1h(5 路并行,取最慢的)

---

#### 批次 2:admin API gate 改造(6 个 agent 按子目录并行)

**合并任务**:P0-2(gate 改 async) + P0-5(补 audit) + P0-9-catch(接 sentry)

按子目录拆分,每个 agent 拿独立文件集:

| Agent | 文件集 | 含 P0-5 audit | 文件数 |
|---|---|---|---|
| 1 | `accounts/`(delete, reset, role, status) + `auth.ts`(登出) | — | 5 |
| 2 | `workbench/` + `decisions/` + `actions/` + `outcomes/` | — | 8 |
| 3 | `content/[slug]` + `brief` + `assets/`(promote, evidence) | ✓ promote | 5 |
| 4 | `experience-events` + `rules` + `skills` + `learning-requests` | ✓ skills | 4 |
| 5 | `gateway` + `grants` + `invite-codes/`(index, disable) + `incidents` | ✓ grants | 6 |
| 6 | `northstar/`(offers, orders) + `appearance` + `support` + `demo-scenario` + `system-map` | ✓ offers, orders, appearance, support | 7 |

**每个 agent 的三步职责**:

```text
步骤 1(所有文件):gate 改 async
  isAdmin(request)  → await isAdminAsync(request, sessionStore)
  isOwner(request)  → await isOwnerAsync(request, sessionStore)
  顶部加 import + 模块级 sessionStore 实例化

步骤 2(标 ✓ 的文件):补 requireHighRiskAudit
  在 gate 通过后、动作执行前,加 audit 调用
  参考模板:src/pages/api/admin/accounts/delete.ts:54-62

步骤 3(所有有 catch 的文件):接 sentry captureException
  在 catch 块里加 captureException(error, { action: 'xxx' })
  sentry.ts 已在批次 1 由 Agent E 建好
```

**并行约束**:

```text
✓ 6 个 agent 的文件集互不重叠
✓ 每个agent遵循批次 0 的统一改法模板
✓ sessionStore 实例化模式一致,不跨文件共享状态
⚠ demo-scenario.ts:Agent 6 额外加 PROD 守门(if PROD return 404)
⚠ system-map.ts(只读 GET):Agent 6 可保留同步 isAdmin,不强制改 async
```

**P0-5 的 7 个高优先级文件分配验证**:

```text
assets/promote   → Agent 3 ✓
skills           → Agent 4 ✓
grants           → Agent 5 ✓
northstar/offers → Agent 6 ✓
northstar/orders → Agent 6 ✓
appearance       → Agent 6 ✓(只 DELETE 分支)
support          → Agent 6 ✓
全部覆盖,无遗漏
```

**用时**:~2h(6 路并行,每路约 5 个文件 × ~20min)

---

#### 批次 3:合并验证 + E2E(串行)

```text
1. 合并所有 agent 产出后,跑全量验证:
   npx astro check        (0 errors)
   npm test               (0 回归)
   npm run build          (通过)

2. P0-10 主路径 E2E 烟测:
   npx playwright test tests/e2e/launch-smoke.spec.ts

3. 修复合并引入的回归(若有)
```

**用时**:~1-2h

---

#### 批次 4:Walker Human Gate

Wave 5(P0-11 凭据 + P0-12 云端加固),Walker 操作。

---

### 并行优化后的时间估计

```text
串行(原方案)          并行(本方案)
─────────────         ──────────────
Day 1  ~4h   Wave 1    批次 0  ~1h   (1 agent)
Day 2  ~3h   Wave 2    批次 1  ~1h   (5 agents 并行)
Day 3  ~2h   Wave 3    批次 2  ~2h   (6 agents 并行)
Day 4  ~3h   Wave 4    批次 3  ~1.5h (串行验证)
─────────────         ──────────────
总计  ~12h             总计    ~5.5h  提速 ~55%
```

---

### 并行实施注意事项

```text
1. 批次 0 必须先完成并跑通测试,否则批次 2 的 agent 拿不到正确的 API 契约。

2. 批次 1 和批次 2 之间可以有重叠:
   批次 1 的 5 个 agent 不改 admin API 文件,可以和批次 0 同时启动
   (它们只依赖批次 0 的"签名确定",不依赖"测试通过")。
   但为了安全,建议批次 0 测试绿了再启动批次 2。

3. 批次 2 内 6 个 agent 必须严格在各自文件集内操作。
   跨文件集的改动(如改 admin-auth.ts)只允许批次 0 做。

4. sentry.ts(批次 1 Agent E)必须在批次 2 之前完成,
   因为批次 2 的 agent 要 import captureException。

5. 批次 3 合并验证是关键关卡:多 agent 并行最容易在合并时
   出现 import 风格不一致或类型冲突,必须跑全量测试兜底。

6. 如果用 git worktree 并行(项目有 using-git-worktrees skill),
   每个 agent 在独立 worktree 工作,最后合并;
   如果在同一工作区并行,必须确保文件集不重叠(本方案已保证)。
```

---

## 执行顺序(并行优化版)

```text
批次 0  P0-1 isAdminAsync 实现(串行锚点)                    ~1h
   │
   ├─→ 批次 1  5 agents 并行(P0-3/4/6/7/8/9-a)              ~1h
   │
   ├─→ 批次 2  6 agents 并行(P0-2+P0-5+P0-9-catch 合并)     ~2h
   │
   └─→ 批次 3  合并验证 + P0-10 E2E(串行)                   ~1.5h
         │
         └─→ 批次 4  Wave 5 Human Gate(Walker)              Walker 节奏

总用时:~5.5h(对比串行 ~12h)
```

---

## P1-P5 后续 Wave(预登记,本轮不实施)

按主方案 `docs/design/上线与架构落成方案.md` 的 P1-P5 章节,这里只登记入口,待 P0 完成后启动:

```text
P1 API 治理底座(上线后 1-2 天)
  - api-registry + 测试移出 + system-map 读 registry
  - 补 internal/* 域
  - registry 测试接 check:production-readiness

P2 workbench/needs 归位(上线后 2-4 周)
  - workbench 域路径迁移
  - needs 域路径迁移
  - schema 版本化补齐

P3 平台期延伸域(接 NorthStar 时)
  - creation/assets/system/northstar 四域迁移
  - AI proposal 挂各域
  - 统一响应格式
  - 高风险 preview/confirm

P4 public + v1(NorthStar 上线时)
  - public API 迁移
  - 引入 /api/v1

P5 NorthStar 拆站(NorthStar 成熟时)
  - 个人站保留作品集 + 自留地
  - Publish Interface 选择性发布
```

---

## 不做(本轮冻结)

```text
- 不动任何 API 路径(P2 才做)
- 不重构 service 层(六模块已完成)
- 不改前端组件结构
- 不迁 public API(P4)
- 不拆 /api/match(保持单接口)
- 不引入 /api/v1(P4)
- 不做完整社区账号/信息流/推荐/审核(P5 都不做)
```

---

## 完成证据模板

每个任务完成后填写:

```text
## P0-XX 完成证据
日期:
修改文件:
验证命令:
验证结果:
自主决策 / Human Gate:
commit: pending
```

---

## 遇到问题自行决定的范围

已获 Walker 授权"遇到问题自行决定"。在以下范围内可直接决策,无需停下确认:

```text
可直接决策:
  - 测试框架选择(vitest / playwright 现有用法)
  - 工具脚本实现细节(如 check-content-fields.mjs 的输出格式)
  - audit reason / action / targetType 的语义化命名
  - 中/低优先级 audit 是否本轮补(默认不补,登记到 P1)
  - Sentry 用轻量手封 vs SDK(默认轻量手封)
  - demo-scenario.ts 的处理(默认加 PROD 守门,不删文件)

需停下确认(超出"上线阻断"范围):
  - 发现安全漏洞比预想严重,需要改 cookie 结构或 SessionRepositoryPort 接口
  - 发现某 admin API 的设计语义本身有问题(不只是缺 audit)
  - Wave 5 凭据相关(Walker 私有)
```
