> **历史文档**：本文描述的是已退役的 Astro 单应用时代方案/记录。  
> **当前运行栈**见 `README.md`、`docs/architecture-modules.md`（React monorepo）。  
> 请勿按本文路径（`src/pages/*.astro`、`npx astro check`）施工。

# 02 · 公开 API

无需登录即可访问的端点(部分有 IP 限流)。涵盖需求匹配、点赞、统计、内容反馈、点子互动、文章共创。

> 鉴权细节见 [01-auth.md](./01-auth.md);降级与限流总表见 [09-degradation.md](./09-degradation.md)。

## 需求匹配链路(match)

### POST /api/match — 用户需求匹配主入口
- **鉴权**:**user+**(读 `walker-session` → `userContextService.resolve`;`authState === 'public'` → 401)
- **请求体**:
  ```jsonc
  {
    "sessionId": "uuid?",              // 可选,复用会话
    "messages": [                      // 1–16 条,单条 ≤500 字,总 ≤4800 字
      { "role": "user", "content": "..." }
    ],
    "audienceGroup": "string?",        // 枚举校验
    "aiStage": "string?",              // 枚举校验
    "consentForTopic": true?,
    "sourcePage": "/tools"             // 枚举校验
  }
  ```
  body ≤8192 字节(预筛 + 真读)
- **响应 200**:`{ needCaseId?, sessionId, remaining, ...responsePayload }`
  - `responsePayload` 由 `agentOrchestrator.handleNeed` 产出,含 `bridge`/`toolDirection`/`responseMode('recommendation'|'dialogue')` 等
- **状态码**:200 / 413(超长) / 400(格式) / 401(未登录) / 429(限流,带 `remaining`)
- **限流**:`rateLimiter.checkAndIncrement` 三桶:每主体 daily + per-minute(5) + 全局 daily(默认 1000)
  - 主体 = SHA-256 哈希(`MATCH_RATE_LIMIT_SALT`/`CRON_SECRET` 加盐)的 `user:<sid>` 或 `admin:<ip>`
  - **降级**:`UPSTASH_REDIS_REST_URL` 未配 → daily 上限从 `MATCH_DAILY_LIMIT`(默认 20)降到 **5**
- **降级**:无模型时编排器内 fallback(本地规则匹配)
- **前端调用方**:`src/scripts/tool-match-chat.ts:383`、`src/agent/tools-manifest.ts`

### POST /api/match-end — 结束匹配会话
- **鉴权**:**无**(仅校验 sessionId 格式;任何人持合法 UUID 可结束会话)
- **请求体**:`{ sessionId: "uuid" }`(≤512 字节)
- **响应 200**:`{ ok: boolean, endedAt?: "iso" }`(`ok=false` 表示会话不存在)
- **状态码**:200 / 413 / 400(格式/缺 sessionId)
- **限流**:无
- **前端调用方**:`src/scripts/tool-match-chat.ts:458`

### POST /api/match-feedback — 匹配反馈
- **鉴权**:**无显式鉴权**(靠 sessionId/needCaseId 关联)
- **请求体**:
  ```jsonc
  {
    "sessionId": "uuid",
    "needCaseId": "uuid?",
    "feedbackType": "resolved|stuck|not-fit|want-tutorial|first-draft|next-step-clear|wrong-direction|need-tutorial",
    "feedbackText": "string?(≤240)"
  }
  ```
- **响应 200**:`{ ok: true, feedbackId, needCaseId }`(回写 NeedCase `feedbackStatus`)
- **状态码**:200 / 400(格式/校验)
- **限流**:无
- **前端调用方**:`src/scripts/tool-match-chat.ts:248`

### GET /api/match-history — 会话历史
- **鉴权**:**admin only**(`isAdmin` 同步 cookie)。**非 admin 直接返回 `{ conversations: [] }`**(静默空,不报错)
- **请求**:`?sessionIds=<uuid>,<uuid>,...`(逗号分隔,最多 10 个,过滤合法 UUID)
- **响应 200**:`{ conversations: [{ sessionId, messages, audienceGroup?, aiStage?, startedAt? }] }`
- **前端调用方**:`src/scripts/tool-match-chat.ts:188`

## 公开统计

### GET /api/like — 文章点赞
- **鉴权**:**公开**
- **GET 请求**:`?path=<string>`(必须以 `/posts/`、`/ideas/`、`/projects/`、`/tools/`、`/about` 开头)
  - 响应:`{ count: number }`,`Cache-Control: s-maxage=10`
- **POST 请求体**:`{ path: string }`
  - 响应:`{ count: number }` 或 `{ count, cooldown: true }`(冷却命中)
- **状态码**:200 / 400(invalid path / invalid json)
- **限流/降级**(全在 `like.store.ts`):有 Upstash/KV → Redis 原子 incr;否则/Redis 异常 → **内存降级**(重启丢失)。每路径每 IP 60s 冷却,单页 999999 上限
- **前端调用方**:`src/components/LikeCounter.astro:77`(GET)、`:88`(POST)

### GET /api/stats — 公开站点统计
- **鉴权**:**公开**
- **请求**:无参数
- **响应 200**:`{ matchCount: number, contentCount: number, topCategories: [{id,label,count}] }`,`Cache-Control: public, max-age=300`
- **降级**:**无 Redis → `matchCount=0`、`topCategories=[]`**;`contentCount` 始终从 content collection 算
- **前端调用方**:`src/agent/tools-manifest.ts`(observability 白名单);首页组件未见直接 fetch

## 内容反馈(被动采集)

### POST /api/content-feedback — 公开内容反馈
- **鉴权**:**公开**
- **请求体**:`{ contentId: string, signal: "useful"|"needs-more"|"outdated", note?: string(≤240), consentForAnalysis?: boolean }`(≤4KB)
- **响应**:`201 { ok:true, feedbackId, sourceTopicId }`(`sourceTopicId` 服务端从 contentId 派生)
- **状态码**:201 / 413(超体) / 429(限流带 `Retry-After`) / 400(校验) / 404(content-not-found/not-public) / 503(storage-unavailable)
- **限流**:`consumeRateLimit` "content-feedback" 命名空间,**IP SHA-256 哈希 + 60s 滚动窗口 max 5**;**生产严格 max=5;开发/测试放宽 50 倍**
- **降级**:无 Redis → 进程内 Map 计数器
- **前端调用方**:`src/components/blocks/BlockFeedback.astro`、`src/scripts/workbench-shell.ts`

### POST /api/content-telemetry — 阅读深度遥测
- **鉴权**:**公开**(被动采集)
- **请求体**:`{ contentId: string, eventType: "content_progress"|"content_complete", progress: 0–1, readerToken: string, consentForAnalysis?: boolean }`(≤2KB)
- **响应**:`201 { ok:true, eventId, sourceTopicId }`
- **限流**:`content-telemetry` 命名空间,**60s max 20**(beacon 高频,客户端按 25% 步进节流)
- **前端调用方**:`src/scripts/content-telemetry.ts`、`src/layouts/ContentShell.astro`

### POST /api/search-events — 搜索无结果记录
- **鉴权**:**公开**(不记 PII)
- **请求体**:`{ query: string }`(trim 后 slice 0–50)
- **响应**:`200 { ok: true }`(空 query 也返回 ok;失败 400 invalid json)
- **降级**:**无 Redis 或 Redis 异常 → 静默 fire-and-forget**(仍返回 `{ok:true}`,不影响搜索体验)。Redis 写 `search:misses` 列表(lpush + ltrim 保留 1000 条)
- **前端调用方**:`src/components/SearchModal.astro:433`
- **联调价值**:这些数据被 `/admin/hit-rate?view=gaps` 消费(本轮 U7 改动)

## 点子互动(ideas)

### POST /api/ideas/submit — 提交社区点子
- **鉴权**:**公开**
- **请求体**:`{ title, summary, rawInput, sourceType, tags?: string[], aiStructure?: {...} }`(前四项必填)
- **响应**:`200 { success:true, id }`;失败 400(Missing required fields / Bad request)
- **限流**:**无**(注意:与其他公开端点不同,未接 rate-limiter)
- **前端调用方**:`src/pages/ideas/new.astro`

### POST /api/ideas/ai-refine — AI 结构化整理点子
- **鉴权**:**公开**
- **请求体**:`{ rawInput: string(≥5 字), sourceType?: string }`
- **响应 200**:`{ title, summary, sourceScene, problem, targetUsers, solutions[], validationSteps[], risks[], tags[] }`
- **状态码**:200 / 400(rawInput 太短) / 500
- **降级**(关键):**`callGateway` 带 fallback** — 模型不可用/解析失败/网关异常 → 返回硬编码 fallback(基于 rawInput 截断 + 默认结构),**始终 200**
- **前端调用方**:`src/pages/ideas/new.astro`

### GET/POST /api/ideas/{id}/reactions — 点子反应
- **鉴权**:**公开**
- **GET**:`{ reactions }`(含 `need`/`thought_before`/`favorite` 计数);缺 id → 400
- **POST 请求体**:`{ type: "need"|"thought_before"|"favorite" }` → `{ count }`
- **前端调用方**:`src/scripts/ideas-page.ts:420`

### POST /api/ideas/{id}/help — 点子求助申请
- **鉴权**:**公开**
- **请求体**:`{ name, email, helpType, note }`(四项必填)
- **响应**:`200 { success:true }`;失败 400
- **前端调用方**:`src/scripts/ideas-page.ts:466`

## 文章共创与导出(posts)

### POST /api/posts/{slug}/canvas — 保存共创画布草稿
- **鉴权**:**公开**(无 cookie,仅 IP 限流)
- **请求体**:`{ content: string }`(markdown,≤200KB)
- **响应**:`200 { ok:true }`
- **状态码**:200 / 413(超体) / 429(限流带 Retry-After) / 400(缺 slug / 格式错 / content 空) / 404(点子不存在) / 500
- **限流**:`canvas-save` 命名空间,**60s max 15**;dev 放宽 ×50
- **前端调用方**:`src/pages/posts/[slug]/canvas.astro:501`

### GET/POST /api/posts/{slug}/collaborate — 同频者靠近
- **鉴权**:**公开**(GET 无鉴权;POST 仅 IP 限流)
- **GET**:返回 `{ count, collaborators: [{role, suggestion, createdAt}] }`(**脱敏**:去除 IP 等字段)
- **POST 请求体**:`{ role: string(≤80), suggestion: string(≤400) }`(≤8KB)。服务端附 id/contentId/createdAt/ip(存原 IP,返回时脱敏)
- **POST 响应**:`200 { ok:true }`
- **限流**:`collaborate` 命名空间,**60s max 3**(更严,防刷)
- **前端调用方**:`src/pages/posts/[slug].astro:1333`(GET)、`:1385`(POST)

### GET /api/posts/{slug}/export — 导出 Markdown
- **鉴权**:**公开**(内容是生产资料,允许自由带走)
- **请求**:无 body,path param `slug`
- **响应 200**:**非 JSON** — `text/markdown; charset=utf-8`,`Content-Disposition: attachment; filename="<slug>.md"`,`Cache-Control: no-store`
  - 内容 = YAML frontmatter(title/date/type/form/domain/intent/status/tags)+ 正文
- **状态码**:200 / 400(Slug parameters missing,**纯文本错误**) / 404(Article not found,**纯文本**) / 500
- **前端调用方**:`src/pages/posts/[slug].astro:444`(`<a href>` 链接,非 fetch — 浏览器直接下载)

## 联调验证(Vercel 生产)

```bash
# 公开统计(最简单,无需登录)
curl https://<vercel-url>/api/stats
# 预期:{ matchCount, contentCount, topCategories }

# 点赞(公开)
curl -X POST https://<vercel-url>/api/like \
  -H "Content-Type: application/json" \
  -d '{"path":"/posts/某篇"}'
# 预期:{ count: N }

# 内容反馈(验证限流)
curl -X POST https://<vercel-url>/api/content-feedback \
  -H "Content-Type: application/json" \
  -d '{"contentId":"某篇","signal":"useful"}'
# 预期:201;连续 6 次后 429 + Retry-After

# match(需先登录拿 cookie)
curl -X POST https://<vercel-url>/api/match \
  -b "walker-session=<cookie>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"我想学 AI"}],"sourcePage":"/tools"}'
# 预期:200 + needCaseId + responsePayload

# 导出(浏览器直接访问)
curl -OJ https://<vercel-url>/api/posts/某篇/export
# 预期:下载 <slug>.md 文件
```
