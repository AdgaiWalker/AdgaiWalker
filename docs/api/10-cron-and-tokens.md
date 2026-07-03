# 10 · 定时任务与 Token 鉴权端点

不在常规前端调用链里、靠 Token 或 cron 触发的端点。

> 鉴权细节见 [01-auth.md](./01-auth.md)。

## match-process — 选题批处理(cron)

### GET/POST /api/match-process — 选题批处理
- **鉴权**:**Token**(header `x-match-process-secret` 或 `Authorization: Bearer`,匹配 `MATCH_PROCESS_SECRET`/`CRON_SECRET`)
  - **密钥未配置时**:`!PROD` 放行,`PROD` 拒绝 401
- **GET 请求**:`?limit=<1-100>`(默认 50)
- **POST 请求体**:`{ limit?: number }`(默认 50,clamp 1–100)
- **响应 200**:`insightService.processPendingNeedCases(limit)` 的结果
- **状态码**:200 / 401(无权)
- **限流**:无(靠 token 门槛)
- **前端调用方**:无前端 fetch(`src/pages/admin/review.astro` 文案提及,实为 cron/手动触发)

### Vercel cron 配置
`vercel.json` 配置了每天凌晨 2 点触发:
```json
{
  "crons": [{ "path": "/api/match-process", "schedule": "0 2 * * *" }]
}
```
Vercel cron 会自动带 `CRON_SECRET`(需在 Vercel 配置),无需手动 curl。

## insights(token 双轨)

### GET/POST /api/insights — 洞察数据
> 详细契约见 [05-admin-review.md](./05-admin-review.md),这里只说 token 鉴权部分。

- **鉴权**:`isAuthorized` = **admin cookie 优先** OR **同 match-process 的 token**
- 这意味着 MCP server 或外部脚本可以用 token 调 insights,不必走 cookie 登录
- **双轨设计原因**:MCP 的 `walker_insights` 工具复用这条路径,避免 MCP 维护一套独立鉴权

## 环境变量清单(Vercel 联调前检查)

| 变量 | 用途 | 必填? | 默认/降级 |
| --- | --- | --- | --- |
| `COOKIE_SECRET` | 会话签名 | **生产必填** | dev 用硬编码兜底 |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis | 推荐 | 或 `KV_REST_API_URL`+`KV_REST_API_TOKEN`;无则降级 |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Vercel KV(Upstash 兼容) | 推荐 | 同上二选一 |
| `GITHUB_TOKEN` | 内容写回仓库 | 内容编辑需要 | 无则 503;dev 走本地文件 |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 媒体存储 | 媒体上传需要 | 无则 unavailable;dev 走本地 fs |
| `ADMIN_PASSWORD` | owner bootstrap 凭据 | 首次 setup 需要 | setup 自锁后不再使用 |
| `INVITE_CODES` | 静态邀请码(env 格式 `code:label:maxUses`) | 可选 | 也可在 admin 后台动态生成 |
| `MATCH_PROCESS_SECRET` 或 `CRON_SECRET` | cron 鉴权 | cron 需要 | !PROD 放行,PROD 401 |
| `MATCH_DAILY_LIMIT` | match 每日上限 | 可选 | 默认 20;无 Redis 降到 5 |
| `MATCH_RATE_LIMIT_SALT` | 限流主体哈希加盐 | 推荐 | 否则用 `CRON_SECRET` |
| `NORTHSTAR_ENABLED` | 经营模块门控 | 可选 | 默认 false |
| `MCP_ENABLE_PRIVATE_INSIGHTS` | MCP 私有洞察开关 | 可选 | 默认关 |
| `PUBLIC_GISCUS_*` | 评论系统 | 可选 | 无则无评论 |

## 联调验证

```bash
# cron 端点(token 鉴权)
curl -i "https://<vercel-url>/api/match-process?limit=10" \
  -H "x-match-process-secret: <secret>"
# 预期:200 + processPendingNeedCases 结果;无 secret → 401(PROD)

# insights 用 token(双轨)
curl -i "https://<vercel-url>/api/insights" \
  -H "Authorization: Bearer <secret>"
# 预期:200(admin cookie 或 token 任一即可)
```

## 已知边界

- **Vercel cron 自动带 CRON_SECRET**:不需要在 vercel.json 里显式配 header,Vercel 会注入。
- **match-process 是幂等的**:重复跑只会处理 pending 的 NeedCase,不会重复聚类。
- **token 鉴权端点在生产必须配 secret**:`!PROD` 放行只是 dev 方便,生产无 secret 直接 401。
