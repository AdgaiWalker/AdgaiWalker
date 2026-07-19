# AdgaiWalker / iwalk.pro API 文档

本目录是 **67 个 API 端点的权威契约文档**,基于 2026-07-04 逐文件代码核实生成,不是凭记忆或旧文档抄写。文档与代码零漂移是硬性要求——每次代码改动后,对应章节必须同步。

## 文档结构

| 文件 | 覆盖范围 | 端点数 |
| --- | --- | --- |
| [01-auth.md](./01-auth.md) | 认证机制、鉴权模型、Cookie/Token 体系(全局共享) | — |
| [02-public.md](./02-public.md) | 公开 API:需求匹配、点赞、统计、反馈、点子、文章互动 | 19 |
| [03-account.md](./03-account.md) | 账号:登录、注册、登出、画像、改密、本机预览 | 7 |
| [04-admin-content.md](./04-admin-content.md) | 内容创作闭环:内容 CRUD、工作台、决定、行动、结果、简报 | 11 |
| [05-admin-review.md](./05-admin-review.md) | 需求复盘 + 选题:review、insights、inspiration、hit-rate | 5 |
| [06-admin-assets.md](./06-admin-assets.md) | 能力资产:经验、规则、Skill、资产晋升、学习请求 | 7 |
| [07-admin-system.md](./07-admin-system.md) | 系统管理:账号、邀请码、授权、Gateway、外观、赞赏、事件、架构图 | 14 |
| [08-admin-northstar.md](./08-admin-northstar.md) | 经营模块:offers/orders(标注 scaffolded 门控) | 2 |
| [09-degradation.md](./09-degradation.md) | 降级与限流总表(生产 vs dev 差异,联调必读) | — |
| [10-cron-and-tokens.md](./10-cron-and-tokens.md) | 定时任务 + Token 鉴权端点 | 2 |

## 全局约定(所有端点共享)

### Content-Type
- 除 `/api/posts/{slug}/export`(`text/markdown`)和 `/api/admin/appearance/media`(二进制流)外,**全部 JSON**(`application/json`)
- 请求体解析失败统一返回 `400 { error: 'invalid json' }`(部分端点带更具体原因)

### Cache-Control
- 写操作和鉴权相关:`Cache-Control: no-store`(统一)
- 公开统计读:`/api/stats` 用 `public, max-age=300`;`/api/like` GET 用 `s-maxage=10`
- 个别 admin 读端点(`conversations`/`rules`/`experience-events`/`system-map`)**无 Cache-Control 头**(已知不一致,联调时标注)

### 鉴权方式(详见 01-auth.md)
| 方式 | 适用端点 | 机制 |
| --- | --- | --- |
| Cookie `walker-session` | user/admin/owner 端点 | HMAC-SHA256 签名,装 `{sid, role, iat}` |
| Token header | cron/match-process/insights(双轨) | `x-match-process-secret` 或 `Authorization: Bearer` |
| 无鉴权 | 公开端点 | — |
| 环境门控 | dev-preview/demo-scenario | `import.meta.env.DEV` + loopback 主机 |

### 角色与权限
```
public  访客,未通过邀请码
user    已登录普通用户(邀请码注册)
admin   管理员
owner   站主(唯一,可指派角色/删账号/管理授权)
```

### 降级模型(详见 09-degradation.md)
- **生产 fail-closed**:走 `requireHighRiskAudit` 的 14 类高风险动作,生产无 Redis → **503 storage-unavailable**(拒绝执行)
- **dev fail-open**:DEV 模式无 Redis 时,admin gate 通过 `devFallback()` 放行;Redis 相关 store 走内存 Map
- **生产 COOKIE_SECRET 必填**:未配 → 登录/注册/setup 抛 500;dev 用硬编码兜底

## 契约卡格式(每个端点)

```
### METHOD /api/path — 一句话职责
- 鉴权:public | user | admin | owner(标注 isAdminAsync/isOwnerAsync/cookie/token)
- 请求:body 字段表 或 query 参数
- 响应:成功 JSON 结构 + 关键状态码
- 降级:无 Redis/模型/token 时的行为
- 限流:命名空间 + 窗口 + 上限
- 审计:是否走 requireHighRiskAudit(action 名)
- 前端调用方:哪个 .astro / scripts/*.ts 调用
- 联调验证:curl 示例(Vercel 生产)
```

## 文档维护规则

1. **代码改动后同步**:改了任何 `src/pages/api/**/*.ts`,必须同步更新对应章节
2. **不抄旧文档**:这份文档的权威性来自代码核实,不是从 prd.md 或旧设计文档抄写
3. **联调报告分离**:实际响应记录在 `docs/api/verify/report.md`,不污染契约文档
4. **状态码诚实**:如果代码里有不一致(如某些端点缺 Cache-Control),文档如实标注,不粉饰

## 与其他文档的关系

- 本目录是 **API 契约**(What:路径/方法/字段/状态码)
- `references/working/prd.md`(skill 仓库)是 **产品需求**(Why:为什么做这些)
- `docs/design/admin-decision-system-spec.md` 是 **目标态架构**(目标形态)
- AI 可读接口(`/llms.txt`、`/graph.json`、`/walker-style.md`)是代码生成,不在本目录维护
