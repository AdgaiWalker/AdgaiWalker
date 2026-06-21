# UX0 / UX1 验证截图说明

Status: UX0 accepted；UX1 visible first pass accepted；UX1 media body storage strategy implemented；production Redis and production-equivalent media storage verification pending.

本轮浏览器验证通过 Playwright 真实路径完成，截图与失败上下文输出位于 `test-results/` 与 Playwright 输出目录。

已验证路径：

- `/admin`：工作台首屏、常驻详情、内容反馈进入改内容、暂缓表单、详情内记录 Outcome、开发演示场景生成与清理。
- `/admin/appearance`：外观与媒体页面，默认 Apple 现代玻璃风、Walker 翡翠青、可读性遮罩、恢复默认、未授权与媒体限制。
- `/admin/assets`：资产总览、学习任务视图、证据面板、界面内补证。
- `/admin/outcomes`：Outcome 下一步候选动作创建新 Decision + Action。
- `/posts/side-hustle-blueprint`：内容反馈与 TOC/移动/减少动效。

验证命令：

```text
npx astro check: 0 errors；15 hints（既有未用/弃用提示）
npm run test: 34 files / 248 tests passed
npm run build: passed；Pagefind indexed 15 pages / 2277 words
npm run test:e2e: 43 passed
```

2026-06-21 生产等价复核：

```text
npm run check:production-readiness: failed as expected；缺 Redis URL/token 与 BLOB_READ_WRITE_TOKEN
npm run verify:production-storage: failed as expected；缺真实 Redis 凭据
npm run verify:production-media-storage: failed as expected；缺 BLOB_READ_WRITE_TOKEN
```

备注：生产等价 Redis 持久化仍需要部署环境验证；本地 dev/test 只能验证 memory-development 明确标识、API 合同和 E2E 行为。媒体文件本体已从 Data URL 改为对象存储策略；生产默认使用 Vercel Blob，当前验证覆盖开发/测试本地文件路径、Blob 端口、缺 Blob token 失败关闭、受 Admin 权限保护读取和删除后不可读 E2E，仍需在具备真实 `BLOB_READ_WRITE_TOKEN` 的部署等价环境验证 Blob 持久性、跨进程、大文件视频、删除后不可读和生产重启后读取。
