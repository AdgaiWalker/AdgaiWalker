# Stage1 工程收尾说明（2026-07-22）

本文件标记：**可自动落地的工程/规范/稳固项已做完**。  
产品 Auth 真做、生产切流、Admin 内容回迁等 **需站主决策/运维** 的项不在此列。

## 已完成（代码在 main）

| 域 | 内容 |
|----|------|
| 栈 | React monorepo · Nest · PG · 无 Astro |
| 分层 | 配置/规则/门面/页/展示块 · feature-add-playbook |
| UI | 纯展示块 + hooks；ErrorBoundary |
| 安全体验 | Admin 令牌门；公开账号壳诚实化 |
| SSOT | dual-entry · WEB/ADMIN_ROUTES · SITE_LINKS · parseIsoDate · failCode kebab |
| 测试 | web RTL+hooks · admin token-policy · accept 脚本 |
| 首页 | 卡/逛仅主 CTA，次要入口不再重复卡/逛 |
| 搜索 | 默认 title+summary；防抖 |

## 站主后续（非本轮代码必做）

- [ ] 生产切流（API/反代/ENV）  
- [ ] 公开 Auth 真接（若需要）  
- [ ] Admin 内容编辑回迁  
- [ ] 14 天 A11 复盘（见 s1-go-live）  

## 入口文档

- `docs/frontend-layers.md`  
- `docs/feature-add-playbook.md`  
- `docs/naming-vocabulary.md`  
- `docs/api/README.md`  
