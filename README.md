# AdgaiWalker / iwalk.pro

Walker 的个人站，也是一个围绕「真实需求 → 站主判断 → 创作产出 → 验证命中 → 经验沉淀」闭环运转的个人工作系统。

它不是单纯博客，也不是社区平台。公开面是内容、想法、工具与真实经历；站主面是一条完整的工作链：把访客的真实需求分轨记录、逐条判断、转成选题和创作简报、写成内容、用反馈数据验证是否真的命中、再把反复有效的判断沉淀成规则、经验和 Skill。

## 当前定位

```text
AdgaiWalker = 个人系统样板节点
iwalk.pro    = 公开内容沉淀 + 真实需求入口 + 站主创作工作台
walker-northstar skill = 项目决策、文档路由和开发边界
NorthStar    = 长期社区网络方向，独立仓库，本站只通过发布接口与之桥接
```

本站当前阶段只承担个人站和发布接口验证：内容沉淀、需求匹配、创作闭环、能力资产沉淀。社区账号、信息流、协作、推荐、审核和平台商业化属于 NorthStar 社区网络本体，不塞进 iwalk.pro。

## 站主工作链（已落地）

公开访客看到的是内容；站主在 `/admin` 看到的是一条完整工作链，每一段都已真实落地（Redis 持久化 + 内存降级 + 高风险写操作审计）：

```text
真实用户需求（review/topics 分轨：用户需求 vs 站主主张）
  → 选题池与创作简报（topics/brief）
  → Markdown 编辑器与版本历史（content/workbench）
  → 反馈与命中验证（hit-rate：反馈矩阵、热门内容、双信号结果）
  → 经验沉淀（experiences：原始记录 → 复盘 → 模式识别）
  → 规则与 Skill 准入（rules/skills/assets：护栏式验收）
  → 结果回流与下一步（outcomes → 新 WorkItem）
  → 安全事件观测（incidents，只读看板）
```

身份与权限：邀请制注册（invite-codes）、分层访问 public/user/admin/owner、账号管理（accounts）、对象级授权（grants）。

> NorthStar 经营模块（offers/orders/赞赏码）已在 `/admin/northstar` 搭好完整状态机，但默认 `NORTHSTAR_ENABLED=false` 门控，属于「骨架已就绪、等社区/经营阶段激活」的预留位，当前不消耗站主注意力。

## 技术栈

- Astro 6
- TypeScript
- Tailwind CSS v4
- Astro Content Collections + MDX
- Pagefind（搜索）
- Upstash Redis
- Vercel SSR adapter
- GSAP（动画）
- astro-icon + Iconify（lucide）
- MCP server
- Vitest（单元测试）
- marked / js-yaml / diff（就地编辑）

## 访问模型与账号系统

站点采用分层访问模型：

- **public**：公开内容，任何人可见
- **user**：注册用户，可管理个人画像/改密/删号
- **admin**：管理员，可访问后台决策系统
- **owner**：站主，可指派角色/删账号/管理系统

账号认证基于 `walker-session` cookie（HMAC 签名，密钥 `COOKIE_SECRET`，30 天有效）。注册走邀请码门票 + 用户名 + scrypt 密码（零 PII）。主要页面：

- `/login` — 统一登录/注册入口（用户注册 + owner 登录同入口）
- `/account` — 用户自助（改密/画像/删号）
- `/admin/accounts` — 后台用户管理（列表/搜索/改角色/封禁/删除）
- `/admin/invite-codes` — 邀请码管理（生成/禁用/追踪）
- `/api/auth/*` — 注册/登录/登出/改密/owner bootstrap API

## 本地运行

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run build
npm run preview
npm run build:mcp
npm run test
```

## 文档入口

本仓库采用“代码仓库 + Skill 仓库”双边界：

- 代码与真实实现：本仓库
- 当前 PRD、plan、todo、architecture、current-state：`.agents/skills/walker-northstar/references/`
- 归档、ADR、额外材料：`docs/`

`.agents/` 默认不进入本仓库版本管理，它由独立的 `walker-northstar-skill` 仓库保护。

`docs/README.md` 只负责说明文档应该放哪里，不作为当前项目决策入口。
当前项目决策入口是：

```text
.agents/skills/walker-northstar/references/project-docs-index.md
```

## 内容边界

公开内容、私密内容、管理员内容必须分层：

- `public`：普通用户可见
- `draft`：未发布草稿
- `private`：站主私密内容
- admin-only 数据：只给管理员复盘，不进入公开接口

公开统计可以展示聚合结果，例如内容数量、功能使用次数、公开趋势；原始对话、用户画像、后台洞察和私密内容不应公开。

## 开源声明

本仓库代码采用 MIT 协议，授权文本见 [LICENSE](./LICENSE)。
