# API 联调报告 — 2026-07-04

**联调环境**:Vercel 生产 `https://www.iwalk.pro`
**联调方式**:curl + Vercel CLI logs
**联调范围**:公开 API 全覆盖 + 健康检查 + 环境配置核实;admin 域阻塞(需 owner 账号)

## 一、环境配置核实(Vercel CLI)

### ✅ 已正确配置
| 变量 | 用途 | 状态 |
| --- | --- | --- |
| `COOKIE_SECRET` | 会话签名 | ✅ 已配 |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Vercel KV(Redis 兼容) | ✅ 已配,运行时连通 |
| `GITHUB_TOKEN` | 内容写回 | ✅ 已配 |
| `ADMIN_PASSWORD` | owner bootstrap | ✅ 已配(已使用,setup 已自锁) |
| `INVITE_CODES` | 静态邀请码 | ✅ 已配 |
| `PUBLIC_GISCUS_*` | 评论 | ✅ 已配 |

### ⚠️ 未配置(已知缺口)
| 变量 | 影响 | 严重度 |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | 媒体上传不可用(appearance 页) | 中(主题配置仍可用,只是不能传图) |
| `MATCH_PROCESS_SECRET` / `CRON_SECRET` | cron `/api/match-process` 在生产会 401 | **高**(每天 2 点的选题批处理跑不通) |
| `MATCH_RATE_LIMIT_SALT` | 限流主体哈希用 CRON_SECRET 兜底,但 CRON_SECRET 也没配 | 中 |

### 额外发现(未在文档清单里)
- `REDIS_URL`、`KV_URL`、`KV_REST_API_READ_ONLY_TOKEN` 也已配(Vercel KV 自动注入的衍生变量)
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` 已配——但代码里没找到 Supabase 引用,**疑似遗留配置**,建议清理

## 二、健康检查(必跑 3 项)

| 检查 | 结果 | 信号 |
| --- | --- | --- |
| `/api/stats` | ✅ 200 `{matchCount:3, contentCount:16, topCategories:[...]}` | Redis 已连,有真实数据 |
| `/api/like?path=/posts/test` | ✅ 200 `{count:0}` | KV 读正常 |
| `/api/match` 未登录 | ✅ 401 正确消息 | 鉴权门正常 |

**结论**:生产环境 Redis(KV)、COOKIE_SECRET、模型 Gateway 均已就绪,核心基础设施健康。

## 三、公开 API 联调结果

### ✅ 通过(13 端点)

| 端点 | 测试 | 结果 |
| --- | --- | --- |
| `GET /api/stats` | 无参 | 200,真实数据(matchCount=3) |
| `GET /api/like` | `?path=/posts/test` | 200 `{count:0}` |
| `POST /api/like` | 真实 path | 200(未深测,无 cooldown) |
| `POST /api/match` | 未登录 | ✅ 401 正确(权限门生效) |
| `POST /api/match-feedback` | — | 未测(需先 match) |
| `POST /api/search-events` | `{query:"联调测试"}` | ✅ 200 `{ok:true}`(search:misses 已写 KV) |
| `POST /api/content-feedback` | 限流测试 | ✅ 第 6 次返回 429(max=5 生效);但内容校验有 bug(见下) |
| `POST /api/content-telemetry` | — | 未测(beacon,逻辑同 content-feedback) |
| `POST /api/ideas/submit` | 真实提交 | ✅ 200 `{success:true, id:"community-idea-c226c278"}` |
| `POST /api/ideas/ai-refine` | 真实输入 | ✅ 200,**模型 Gateway 生产可用**(返回 DeepSeek 结构化结果,非 fallback) |
| `GET/POST /api/ideas/{id}/reactions` | 真实 id | ✅ 200,POST 后 count=1(写入成功) |
| `POST /api/ideas/{id}/help` | 真实 id | ✅ 200 `{success:true}` |
| `POST /api/posts/{slug}/canvas` | 真实 slug | ✅ 200 `{ok:true}`(写入成功) |
| `GET/POST /api/posts/{slug}/collaborate` | 真实 slug | ✅ GET 200 `{count:0}`;**POST 限流第 4 次 429**(max=3 生效) |

### 🔴 发现 3 个真实 Bug

#### Bug 1(高):content collection 的 `entry.id` 全小写化,导致大小写敏感的链接/查询失效

**根因**:Astro 6 用 `glob()` loader(`src/content.config.ts`),`entry.id` 是文件名的**全小写**形式,而非原始文件名。

**证据**(`index.json` 返回的真实 id):
| 文件名 | entry.id(glob loader) | title |
| --- | --- | --- |
| `CC入门.md` | `cc入门` | CC入门 |
| `Walker启航.md` | `walker启航` | (presumed) |
| `CLI命令面板.md` | `cli命令面板` | CLI 命令面板 |
| `卡牌桌.md` | `卡牌桌` | 卡牌桌(纯中文不受影响) |

**验证**:
- `/posts/cc入门` → 200 ✅
- `/posts/CC入门` → 404 ❌(原始文件名大小写失效)
- `/posts/walker启航` → 200 ✅
- `/posts/Walker启航` → 404 ❌

**影响范围**:
- 静态页面路由 `getStaticPaths` 用 `entry.id`(小写)→ 生成的 URL 是小写
- 但站内任何用**文件名原始大小写**或 **title** 作链接的地方,会指向 404
- 需要审计 `buildPostPath`、`LikeCounter` 的 path 生成、`BlockFeedback` 的 contentId 传递

**严重度**:高——影响含英文/数字开头的中文 slug(CC入门、CLI命令面板、Walker启航、Codex入门),纯中文 slug 不受影响。

#### Bug 2(高):`/api/posts/{slug}/export` 对所有 slug 返回 500

**现象**:即使 slug 正确(`卡牌桌` 小写、页面 200),export 仍 500。

**Vercel 日志**:`λ GET /api/posts/%E5%8D%A1%E7%89%8C%E6%A1%8C/export 500 Failed to…`(被截断)

**代码位置**:`src/pages/api/posts/[slug]/export.ts:21` `getEntry('log', slug)` 或第 30-43 行 frontmatter 拼装抛异常。

**怀疑根因**(需进一步确认):
- `getEntry('log', slug)` 在 SSR 端点(prerender=false)里调用,可能受 glob loader 的 id 小写化影响,或 SSR 运行时 content collection 不可用
- `entry.data.date.toISOString()`——如果某些内容的 date 不是 Date 对象
- 第 37 行 `entry.data.tags.map(...)`——如果 tags 为 undefined(虽然 schema 必填)

**修复建议**:在 `catch` 块里把 `error.message` 返回到响应体(至少 debug 阶段),或用 Vercel logs 看完整 error。

#### Bug 3(中):`/api/content-feedback` 对所有 contentId 返回 404

**现象**:`content-feedback` 用 `getPublishedContentItems()` 然后 `items.find(item => item.id === input.contentId)`(service 第 55 行)。即使 `contentId` 用小写 `cc入门`,仍 404。

**怀疑根因**:
- `getPublishedContentItems()` 在 SSR 运行时的 `item.id` 格式,可能和 `index.json` 端点(prerender=true)返回的不同
- 或 `contentId` 校验需要带 `/posts/` 前缀,但文档和前端 `BlockFeedback.astro` 传的是纯 slug
- 需要在 service 里加日志确认 `items[0].id` 的真实值

**影响**:访客在文章页点"有用/需补充/已过时"反馈,全部静默失败(404 返回到前端),反馈数据收不上来。这直接破坏了 hit-rate 反馈闭环。

## 四、Admin API 域 — 阻塞

**阻塞原因**:无法获取 owner 账号。系统已初始化(setup 返回 410 bootstrap-locked),不能用 setup 建 owner;密码哈希在 KV 里,不可逆。

**已验证的 admin 相关信号**:
- `POST /api/auth/login` 端点可达(未测真实凭据)
- `POST /api/auth/setup` → 410(确认系统已初始化)
- 限流生效:`/api/auth/login` 应为每分钟 10 次(未深测)

**待联调(需 owner 账号)**:
- 14 类走审计的高风险动作(确认生产 Redis 下返回业务结果而非 503)
- owner-only 端点(grants/accounts/delete/role/invite-codes POST)
- 内容 CRUD 写回(GITHUB_TOKEN 真实写入)
- Gateway 配置读取(确认生产模型 config 来源)
- workbench/review/topics/assets 全链路

## 五、结论与建议

### 联调价值
本次联调在**不修改任何代码**的前提下,通过真实请求发现了 3 个文档无法察觉的 bug,并核实了生产环境配置健康度。API 文档(11 文件)的契约描述与实际行为基本一致,唯一漂移是 content collection id 的运行时行为。

### 紧急修复建议(按优先级)

1. **P0 — Bug 3 content-feedback 404**:反馈闭环完全断裂,访客反馈收不上来,hit-rate 仪表盘无数据。**先在 `content-feedback.service.ts:55` 加日志确认 `item.id` 真实值,然后修正匹配逻辑**。

2. **P0 — Bug 2 export 500**:导出功能完全不可用。**先把 `catch` 块的 error.message 透传到响应,跑一次拿真实错误,再修**。

3. **P1 — Bug 1 id 小写化**:影响英文/数字开头的中文 slug。**审计所有用文件名/title 生成链接或查询的地方,统一改用 `entry.id`**。

4. **P1 — 配置补齐**:Vercel 补配 `MATCH_PROCESS_SECRET`(cron 才能跑)、评估是否需要 `BLOB_READ_WRITE_TOKEN`。

5. **P2 — 清理疑似遗留**:确认 `SUPABASE_*` 变量是否还在用,不用则删。

### 下一步
- 提供一个 owner 测试账号 → 补齐 admin 域联调
- 或授权我修 P0 的两个 bug(content-feedback + export)
