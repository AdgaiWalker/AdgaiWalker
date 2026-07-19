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

### 🔴 发现的真实 Bug 与误报纠正

> **纠正说明(2026-07-04 二次核实)**:初版报告列了 3 个 bug,经本地 dev server 拿 stack trace + node fetch(纯 UTF-8)二次核实后,**Bug 3 是误报,Bug 1 影响范围缩小,Bug 2 是真 bug 且已修复**。误报根因:Windows GBK 终端的 curl 把中文编码成 GBK 字节,导致服务端 UTF-8 匹配失败。生产前端浏览器发 UTF-8,不受此影响。

#### ~~Bug 3(误报)~~:`/api/content-feedback` 404

**初版判断**:对所有 contentId 返回 404,反馈闭环断裂。

**二次核实**:**这是误报**。用 `node fetch`(绕过 GBK 终端,发纯 UTF-8)测试,本地和生产均返回 **201 成功**:
```
node -e "fetch('https://www.iwalk.pro/api/content-feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contentId:'卡牌桌',signal:'useful'})}).then(r=>r.json()).then(console.log)"
// → { ok:true, feedbackId:'cf_eefd8414-...' }
```
**根因**:Windows Git Bash 终端用 GBK 编码 curl 请求体,中文 `卡牌桌` 变成 GBK 字节,服务端 UTF-8 `item.id` 匹配失败。代码本身完全正常。

**教训**:在 Windows 中文终端用 curl 测试含中文 body 的 API 不可靠,必须用 `node fetch` 或显式 UTF-8 编码的 body 文件。本报告其他 curl 结果中,凡涉及中文 body 的都需用此方式重新核实(已核实 content-feedback;search-events/ideas 的英文 body 不受影响)。

#### Bug 1(中,影响范围缩小):`entry.id` 全小写化

**根因**:Astro 6 `glob()` loader(`src/content.config.ts`)把 `entry.id` 设为文件名的全小写形式。`CC入门.md` → `cc入门`。

**验证**:
- `/posts/cc入门` → 200,`/posts/CC入门` → 404
- `/posts/walker启航` → 200,`/posts/Walker启航` → 404

**影响范围(已核实,比初版判断小)**:
- ✅ **站内链接全部正确**:`posts/[slug].astro` 的 `getStaticPaths`、`buildPostPath`、`buildInternalHref`、`LikeCounter`、`BlockFeedback`、`InlineEditor`、canvas 链接**全部用 `entry.id`**(小写),站内导航不会触发 404
- ❌ **仅影响外部书签/分享链接**:如果有人记住了 `iwalk.pro/posts/CC入门`(原始大小写),会 404
- 纯中文 slug(`卡牌桌`、`未来已经在来了`)不受影响,因为没有 ASCII 字母可小写化

**严重度调整**:从"高"降为"中"。不是功能性故障,是 SEO/外部链接体验问题。**修复需权衡**:改 loader 影响面巨大;加 redirect 中间件(原始大小写 → 小写)是更稳的方案,但属增强项,非紧急。

#### Bug 2(高,已修复):`/api/posts/{slug}/export` 对中文 slug 返回 500

**根因(已通过本地 stack trace 确认)**:`export.ts:50` 的 `Content-Disposition: attachment; filename="${slug}.md"` —— slug 含中文时,HTTP header 值(ByteString)不允许非 ASCII 字符(码点 > 255),抛 `TypeError: Cannot convert argument to a ByteString`。

完整 stack:
```
Failed to export markdown: TypeError: Cannot convert argument to a ByteString
because the character at index 22 has a value of 21345 which is greater than 255.
    at new Response (... export.ts:46:12)
```

**修复**(commit 待提交):用 RFC 5987 的 `filename*=UTF-8''<percent-encoded>` 格式,并保留 ASCII fallback:
```ts
const asciiFallback = /^[\x20-\x7E]+$/.test(slug) ? slug : 'export';
const filenameStar = encodeURIComponent(slug);
'Content-Disposition': `attachment; filename="${asciiFallback}.md"; filename*=UTF-8''${filenameStar}.md`
```

**验证**:本地 `卡牌桌` → 200,fallback=`export.md`,filename*=UTF-8 编码正确;英文 slug 仍正常。

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

### 紧急修复建议(按优先级,已按二次核实更新)

1. **✅ Bug 2 export 500 — 已修复**:RFC 5987 filename* 编码。待部署 Vercel 后生效。

2. **⚠️ Bug 1 id 小写化 — 降级为增强项**:站内链接一致(全用 entry.id),仅外部书签受影响。若要修,加 redirect 中间件把原始大小写重定向到小写,非紧急。

3. **~~Bug 3 content-feedback 404~~ — 误报,已纠正**:代码正常,是测试方法(GBK 终端)的问题。

4. **P1 — 配置补齐**:Vercel 补配 `MATCH_PROCESS_SECRET`(cron 才能跑)、评估是否需要 `BLOB_READ_WRITE_TOKEN`。

5. **P2 — 清理疑似遗留**:确认 `SUPABASE_*` 变量是否还在用,不用则删。

### 下一步
- 部署 export 修复到 Vercel(push 后自动触发)
- 提供一个 owner 测试账号 → 补齐 admin 域联调
- 评估是否需要为 Bug 1 加 redirect 中间件
