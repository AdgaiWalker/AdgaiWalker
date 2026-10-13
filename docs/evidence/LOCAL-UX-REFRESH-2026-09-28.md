# 本地访客站与后台体验修订验收（2026-09-28）

范围：仅当前未提交工作区；生产未部署，不计入 G07/G08 上线验收。沿用原首页卡片和 `public/images/dora.jpg`，不把概念图或新图片写进站点。

## 结果

- 访客可见入口改称“提问／文章”；`/tools`、`/posts`、`/ask` 与业务接口未改。侧栏主入口为探索、文章、资源、关于；Dora 页面承接关于本站、硬件与支持。教程、札记、图谱从文章总览进入。
- 首页沿用 Walker、快捷入口、Dora、最近文章四张原有卡片及视觉形态，只更新快捷入口；桌面端 Dora 卡居中，其余卡围绕。“抽个点子”和小影保留。390px 布局下四卡纵排，实测 `scrollWidth = innerWidth = 390`。
- `/tools` 示例点击只填草稿，点击发送才提交。后台删除概览“接下来”，内容详情三组、运营记录隐藏未接通的授权记录；发布阻断路径默认折叠。
- Dora 卡保留原来的点击抽点子，同时给键盘用户独立按钮；Dora 标题为首页 `h1`。
- 台账分开显示工作区、网页确证和问答索引。最近发布尝试为 `UNKNOWN` 时仍取上一条 `PUBLISHED` 的确证版本；无确证记录写“未核验”。设置页不再把已接通的内容写入、发布、提醒标作未接入。

## 红绿证据

| 行为 | RED：缺失行为的实际失败 | GREEN：最小实现与验证 | 重构决定 |
|---|---|---|---|
| 示例只填草稿 | `ToolsPage.test.tsx`：点击后输入框为空 | 点击示例调用 `onDraftChange`；5/5 通过 | 保留原 `send` 提交链 |
| 四项主导航 | `AppShell.test.tsx`：实际出现旧九项 | 更新导航单一配置；10/10 通过 | 保留原路径与侧栏组件 |
| UNKNOWN 不覆盖确证版本 | `content-ledger.integration.test.ts`：`publication` 为 undefined | 台账批量汇合发布、快照；8/8 通过 | 保留原四阶段字段供兼容，新增独立版本事实 |
| 网页状态筛选 | `ContentListPage.test.tsx`：找不到“网页状态”控件 | 列表按确证事实筛选并分列；5/5 通过 | Git `live` 不再显示为“已上线” |
| 详情未核验提示 | `ContentDetailPage.test.tsx`：找不到“线上未核验” | 读取现有版本快照；9/9 通过 | 保存与网页确证仍是独立事实 |
| 内容工作区分组 | `ContentDetailPage.test.tsx`：找不到三组导航 | 编辑／审核与发布／更新事项三组；9/9 通过 | 两种批准动作仍分离 |
| 阻断路径收纳 | `ContentReleasePanel.test.tsx`：找不到折叠明细 | 默认收起路径并显示数量与处理建议；6/6 通过 | 不改变预检门禁 |
| 能力状态如实返回 | `operations.kernel.integration.test.ts`：仅六项 available | 已接通的写入、发布、提醒按读探针返回；5/5 通过 | 单次预检阻断不改变能力状态 |
| Dora 卡键盘入口 | `GreetingCard.test.tsx`：找不到 `h1` | 保留原卡片外观和点击抽点子，补独立按钮；2/2 通过 | 社交链接不再嵌套于按钮语义中 |

## 回归

`pnpm typecheck` 通过；`pnpm test:shared` 376/376、`pnpm test:api` 707/707、`pnpm test:web` 229/229、`pnpm test:agent` 30/30、`pnpm --filter @walker/admin test` 82/82；`pnpm build:admin`、`pnpm build:web`、`pnpm verify:geo`、`pnpm verify:docs` 均通过。API 测试使用重建的隔离 `walker.test.db`。

浏览器核对：本地首页 1280×720 原卡片围绕 Dora，后台台账、设置、内容详情与发布阻断、运营记录旧标签回退均可达。内嵌浏览器的手机截图合成比例异常，移动端以 390×844 的 DOM 尺寸、卡片顺序和无横向溢出为已验证部分；未声称完成手机视觉截图评审。
