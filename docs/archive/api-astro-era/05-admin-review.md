> **历史文档**：本文描述的是已退役的 Astro 单应用时代方案/记录。  
> **当前运行栈**见 `README.md`、`docs/architecture-modules.md`（React monorepo）。  
> 请勿按本文路径（`src/pages/*.astro`、`npx astro check`）施工。

# 05 · 需求复盘与选题(admin)

把真实用户需求转成可执行选题的创作决策中枢。全部需要 admin+ 权限。

> 鉴权细节见 [01-auth.md](./01-auth.md)。

## 需求复盘与洞察

### GET/POST /api/admin/review — NeedCase 复盘
- **鉴权**:**isAdminAsync**
- **GET**:
  - `?status=pending|all&view=clusters&limit=1..200`
  - `view=clusters` → `{ view:"clusters", topics:[], count }`
  - `status=all` → `{ items, count }`
  - 默认(pending)→ `{ items, count }`
- **POST**:体 `{ needCaseId(必填), status("pending"|"accepted"|"deferred"|"ignored"), note? }` → `{ ok, needCaseId, status }`
- **不走审计**;无 storage-unavailable 分支
- **前端调用方**:`src/pages/admin/review.astro:225`

### GET/POST /api/insights — 洞察数据(双轨鉴权)
> 注意:路径是 `/api/insights`,**不是** `/api/admin/insights`
- **鉴权**:`isAuthorized` = **admin cookie 优先** OR **同 match-process 的 token**(双轨)
- **GET**:
  - `?type=topics&status=<accepted|deferred|ignored|produced>&limit=<n>` → `{ topics: TopicCandidate[], count }`
  - 默认:`?days=<n>`(默认 30)→ `getNeedCaseStats` 统计对象
- **POST**:体 `{ topicId, status("accepted"|"deferred"|"ignored"|"produced"), producedContentSlug? }` → `{ ok, topicId, status, topic }`
- **状态码**:200 / 401(未授权) / 400(缺 topicId / 非法 status / producedContentSlug 类型)
- **前端调用方**:`src/pages/admin/insights.astro`、`topics.astro`、`grants.astro`、`review.astro`、`ai-gateway.astro`、`posts/[slug].astro`、`src/mcp/index.ts`

### POST /api/admin/inspiration — 站主灵感入口(B4)
- **鉴权**:**isAdminAsync**
- **请求体**:`{ text: string }`(必填,≤200 字)
- **响应**:`{ ok:true, topicId }`(写入 TopicCandidate, clusterKey=inspiration)
- **前端调用方**:`src/pages/admin/topics.astro:484`

## 命中率与反馈

### GET /api/admin/hit-rate — 命中率与三信号分组
- **鉴权**:**isAdminAsync**
- **请求**:无 body / 无 query
- **响应**:`{ hitRates:[], count, outcomeSummaries }`
  - `outcomeSummaries` 含 matchOutcome/contentOutcome/readingOutcome 三信号并列
- **不走审计**;无 storage-unavailable 分支
- **前端调用方**:`src/pages/admin/hit-rate.astro:135-138`(注意:本轮 U7 改动后,该页有 4 个视图,但 API 响应结构不变——gaps 视图用的是 `/api/search-events` 写入的 `search:misses` 数据,经 `getSearchMisses` 读取,不走本 API)
- **关联**:`src/pages/admin/insights.astro:31`、agent manifest

## 联调验证

```bash
# 复盘列表(待处理)
curl -b cookies.txt "https://<vercel-url>/api/admin/review?status=pending"

# 需求簇视图
curl -b cookies.txt "https://<vercel-url>/api/admin/review?status=all&view=clusters"

# 洞察统计(默认 30 天)
curl -b cookies.txt "https://<vercel-url>/api/insights"

# 选题列表
curl -b cookies.txt "https://<vercel-url>/api/insights?type=topics&status=accepted"

# 命中率
curl -b cookies.txt "https://<vercel-url>/api/admin/hit-rate"

# 录入站主灵感
curl -b cookies.txt -X POST https://<vercel-url>/api/admin/inspiration \
  -H "Content-Type: application/json" \
  -d '{"text":"联调测试灵感"}'

# 复盘一条 NeedCase(需真实 needCaseId)
curl -b cookies.txt -X POST https://<vercel-url>/api/admin/review \
  -H "Content-Type: application/json" \
  -d '{"needCaseId":"<id>","status":"accepted","note":"值得写"}'
```

## 已知边界

- **`/api/insights` 路径不带 `/admin/`**:这是历史命名,鉴权仍是 admin。联调时不要写成 `/api/admin/insights`(404)。
- **`hit-rate` API 不含搜索缺口数据**:gaps 视图的数据来自 `search:misses` Redis key(由 `/api/search-events` 写入),不经本 API 返回。要验证 gaps 视图有数据,需先触发几次搜索无结果。
