# 前端分层约定（配置 · 规则 · 门面 · 页 · 块）

> **结论先行**：React 的 Component **不等于**「只有 UI/UX」。  
> 组件是实现形态；架构按**责任**分层。UI/UX 主要落在「块」和「页的呈现」。

## 1. 五层名称

| 层 | 一句话 | 做什么 | 不做什么 |
|----|--------|--------|----------|
| **配置** | 产品语义 SSOT | 路径、文案、导航项、feature_key | 不写 DOM、不 fetch |
| **规则** | 纯计算 / 纯校验 | 长度、状态机、错误码、限流数字、消毒 | 不 import React、不 IO |
| **门面** | 对内统一 IO | HTTP、token、请求拼装 | 不写 className / 布局 |
| **页** | 一条用户任务 | 组块、调门面、本页 loading/err | 不复制第二套规则、不散落 path 业务 |
| **块** | 可复用界面零件 | 列表、按钮组、壳条、反馈区 | 不直连 URL 业务语义、不藏领域规则 |
| **壳** | 多页布局（块的特例） | 侧栏/顶栏/Outlet | 不办 intake/主选等业务 |

### 依赖方向（强制）

```text
配置
  ↑ 依赖
规则 ←── 门面（可依赖规则做映射，不反向）
  ↑
 页 ──调用──→ 门面
  │
  └──组合──→ 块 / 壳
```

- **依赖**：上层依赖下层抽象/常量，不反向。  
- **调用**：页/交互块 → 门面。  
- **禁止**：块 → 门面路径字符串业务；页 → 复制 shared 规则；规则 → React。

### 与 UI / UX

| | 落点 |
|--|------|
| UI（长什么样） | 主要在**块**、页内 JSX |
| UX（用起来怎样） | 块的反馈 + 页的主路径编排 |
| 能力 / 安全 / 配额 | **规则 + 门面 + 配置**，不是「又一个大组件」 |

### 展示块硬约束（UI 组件）

路径：`apps/web/src/components/ui/*`（及同等纯展示块）

| 允许 | 禁止 |
|------|------|
| 接收 props（数据） | 读/写全局状态（store、context 业务） |
| 渲染 UI | 直接 `fetch` / 调门面 / `publicApi` |
| 通过 `onXxx` 抛出事件 | `document`/`window` 命令式 DOM API（监听请放 hook） |
| 本地纯 UI 状态（如 hover 展开） | 藏领域规则、拼 API path 业务 |

编排（门面 + 状态）放在 **hooks/** 或 **页**；块只接线 props。
---

## 2. 评审口令（五条）

1. 块不写卡/逛 path 业务语义（只读配置）。  
2. 页不写第二套校验/配额规则。  
3. 门面不出现 className。  
4. 规则不 import React。  
5. 壳只组合，不办闭环业务。

违反时说：**越层了**（例如「块写了规则」「页绕过了门面」）。

---

## 3. 目录对照

| 层 | 路径 |
|----|------|
| 配置 | `apps/web/src/shared/dual-entry.ts`、`nav.ts`；`apps/admin/src/shared/nav.ts`；`packages/shared` feature-keys / rate-limits |
| 规则 | `packages/shared/src/*`；`apps/web/src/lib/sanitize-html.ts`；`apps/web/src/shared/rules-ui.ts`（展示映射） |
| 门面 | `apps/web/src/api/*`；`apps/admin/src/api/*`；`apps/admin/src/auth/token-store.ts` |
| 页 | `apps/web/src/pages/*`；`apps/admin/src/pages/*` |
| 块 / 壳 | `apps/web/src/components/*`；`components/shell/*` |
| 内容只读 | `apps/web/src/content.ts` + generated JSON（构建期，非门面） |

---

## 4. 全量归层表（现行代码）

### 4.1 Web · 配置 / 规则 / 门面

| 文件 | 归层 | 备注 |
|------|------|------|
| `shared/dual-entry.ts` | **配置** | 卡/逛路径与文案 |
| `shared/nav.ts` | **配置** | 侧栏分组 |
| `shared/constants.ts` / `format.ts` / `reading.ts` | **规则**（展示辅助） | 纯函数 |
| `shared/rules-ui.ts` | **规则→展示映射** | 依赖 shared 限流数字 |
| `lib/sanitize-html.ts` | **规则**（安全） | 详情页用 |
| `lib/theme.ts` / `solar-terms.ts` | **配置/规则**（主题） | 非业务闭环 |
| `api/http.ts` / `public-api.ts` | **门面** | 公开 IO |
| `content.ts` | **只读模型** | 构建产物查询，勿当写门面 |

### 4.2 Web · 壳 / 块

| 文件 | 归层 | 备注 |
|------|------|------|
| `AppShell.tsx` | **壳** | 组合 + 搜索开关 |
| `shell/HomeChrome` / `MobileBar` / `AppSidebar` | **块**（壳零件） | 展示为主 |
| `ItemList.tsx` | **展示块** | 标杆 |
| `ui/LikeButton.tsx` | **展示块** | props + onLike |
| `ui/ContentFeedback.tsx` | **展示块** | props + 事件 |
| `ui/SearchModal.tsx` | **展示块** | props + onQueryChange |
| `hooks/useLike` 等 | **页辅助（非 UI）** | 门面编排 |
| `shared/search-content.ts` | **规则** | 纯搜索 |
| `GreetingCard.tsx` | **交互块** | 本地抽点子（无 API） |

### 4.3 Web · 页

| 文件 | 归层 | 备注 |
|------|------|------|
| `ToolsPage` | **页** | 卡 · intake 编排 |
| `PostDetailPage` | **页** | 详情；marked+消毒属页内编排 |
| `HomePage` | **页** | 首页编排，偏厚 |
| `PostsPage` / `Ideas` / `Projects` / `Learn` / `Content` | **页**（薄） | 列表 |
| `ToolsResourcesPage` | **页** | 静态资源数据 |
| `AboutPage` / `SupportPage` | **页** | 静态+CTA |
| `LoginPage`（web） | **页（壳）** | Auth 未接；与 admin 登录不同义 |

### 4.4 Admin

| 文件 | 归层 | 备注 |
|------|------|------|
| `shared/nav.ts` | **配置** | |
| `api/*` / `auth/token-store` | **门面** | |
| `hooks/useAdminAction` | **页辅助** | 错误与异步，非 UI 块 |
| `App.tsx` | **壳 + 路由** | 缺鉴权门（能力缺口） |
| `LoginPage` | **页** | Bearer 令牌 |
| `CluesPage` / `Seeds` / `Executions` | **页** | 过程编排 |
| `MetricsPage` | **页** | 只读指标 |
| `ContentPage` / `AiGatewayPage` | **页（占位）** | 未迁说明 |

---

## 5. 已知越层 / 改进方向（不自动开工，供后续）

| 点 | 现状 | 目标层 |
|----|------|--------|
| SearchModal 全文过滤 | 交互块内扫 body | 抽「搜索」纯函数（规则）+ 可选 debounce |
| PostDetail marked | 页内每 render 解析 | 页内 useMemo 即可，仍属页 |
| Admin 无 token 门 | 壳未挡 | 壳/路由：**门面鉴权结果**决定是否进页 |
| 双 Login 同名 | 两页 | 命名区分：公开登录壳 vs 管理令牌页 |
| 侧栏「逛」硬编码 | 块内 | 并入**配置** nav |

---

## 6. 说话与 PR 用语

| 少说 | 多说 |
|------|------|
| 加个组件 | 加**展示块** / **交互块** / **页** |
| 改一下文案 | 改**配置** dual-entry |
| 这里调接口 | 走**门面** publicApi |
| 校验写在页面里 | **规则**进 shared |

新增代码默认自问：落在哪一层？能否下沉到规则/配置？
