# 加功能工作法（功能驱动 · 顺手补洞）

> **不要**停功能空转搭脚手架。  
> **要**每加一个能力，按分层走完，顺手补挡住你的洞。

## 每步四问

1. **配置？** 新 path/文案/导航 → `dual-entry` / `nav`  
2. **规则？** 校验、错误码、纯计算 → `packages/shared` 或 `shared/*`  
3. **门面？** 新 HTTP → `public-api` / `admin-api` + `docs/api`  
4. **页 + 块？** 页/hook 编排；**ui 块只 props + onXxx**；能测则补一条测  

## 样板（已有）

| 能力 | 规则 | 门面 | hook | 展示块 |
|------|------|------|------|--------|
| 点赞 | — | publicApi.like | useLike | ui/LikeButton |
| 内容反馈 | content-feedback 信号 | contentFeedback | useContentFeedback | ui/ContentFeedback |
| 搜索 | search-content | searchMiss | useContentSearch | ui/SearchModal |
| 卡口 intake | shared 校验 | intake | useIntake | ui/IntakePanel |
| Admin 进页 | token-policy | token-store | RequireAdminToken | Login 页 |

## 完成定义

- [ ] 行为可点通（手测或 accept）  
- [ ] 未在 ui 块里 fetch / document 监听  
- [ ] 新规则有测或挂现有测  
- [ ] 需要的话更新 `docs/api` 一行  

详见 `docs/frontend-layers.md`。
