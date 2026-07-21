# feature_key 字典（Stage 1）

| feature_key | 成功定义 |
|-------------|---------|
| `nav.home` | 首页主壳渲染 |
| `post.list` / `post.read` | 列表 / 详情 |
| `search.query` | 搜索提交；无结果记 SearchMiss |
| `match.intake` | intake 返回 nextStep |
| `tools.resource_click` | 资源外链点击（可后置） |
| `like.click` | 点赞 API 成功 |
| `auth.login` | 登录成功（Auth 后置） |
| `clue.create_manual` | admin 手动建线索 |
| `seed.promote` | 主选成功 |
| `execution.review` | 检验写入 |
| `content.feedback` | 内容反馈提交 |

新增功能必须先登记再上线埋点。源码常量：`packages/shared/src/feature-keys.ts`。
