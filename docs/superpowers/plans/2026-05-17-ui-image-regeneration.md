# UI 图片重新生成实施计划

> **给智能代理：** 必须使用的子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 来逐步实施本计划。步骤使用复选框（`- [ ]`）语法进行跟踪。

**目标：** 为 Walker 博客已批准的设计规格中定义的 11 个页面类别，生成 11 张高保真 `gpt-image-2` 概念 UI 图片。

**架构：** 这是一个资源生产工作流，而非实时 UI 重构。实施过程包括：截取本地路由真实截图，将这些截图作为 `gpt-image-2` 的编辑参考，将最终展示图片保存至 `public/images/ui-generated/`，并在 `docs/ui-image-generation/` 下记录可复现的提示词和清单文件。

**技术栈：** Astro 开发服务器、PowerShell、通过 `npx` 调用的 Playwright CLI、备用 Python 图片生成 CLI（位于 `C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\image_gen.py`）、OpenAI `gpt-image-2`。

---

## 文件结构

- 创建：`docs/ui-image-generation/routes.json`
  11 个页面类别的路由清单和截图元数据。
- 创建：`docs/ui-image-generation/source-screenshots/*.png`
  作为图片编辑参考的本地源截图。
- 创建：`docs/ui-image-generation/prompts/*.txt`
  每张最终图片对应一个可直接用于 CLI 的提示词文件。
- 创建：`docs/ui-image-generation/prompts.md`
  人类可读的提示词日志，包含共享样式约定和各路由的特定意图。
- 创建：`docs/ui-image-generation/manifest.md`
  最终的路由-资源清单、生成设置和验证说明。
- 创建：`public/images/ui-generated/*.png`
  最终的 11 张展示图片。

本任务不应修改任何 `src/` 下的 UI 文件。

## 任务 1：准备生成清单

**文件：**
- 创建：`docs/ui-image-generation/routes.json`
- 创建目录：`docs/ui-image-generation/source-screenshots/`
- 创建目录：`docs/ui-image-generation/prompts/`
- 创建目录：`public/images/ui-generated/`

- [ ] **步骤 1：创建输出目录**

运行：

```powershell
New-Item -ItemType Directory -Force -Path docs\ui-image-generation\source-screenshots | Out-Null
New-Item -ItemType Directory -Force -Path docs\ui-image-generation\prompts | Out-Null
New-Item -ItemType Directory -Force -Path public\images\ui-generated | Out-Null
```

预期：命令以退出码 `0` 结束。

- [ ] **步骤 2：编写路由清单**

创建 `docs/ui-image-generation/routes.json`，内容如下：

```json
[
  {
    "slug": "home",
    "route": "/",
    "url": "http://127.0.0.1:4321/",
    "sourceScreenshot": "docs/ui-image-generation/source-screenshots/home.png",
    "promptFile": "docs/ui-image-generation/prompts/home.txt",
    "finalImage": "public/images/ui-generated/home.png",
    "purpose": "个人桌面和 Bento 入口界面"
  },
  {
    "slug": "posts",
    "route": "/posts",
    "url": "http://127.0.0.1:4321/posts",
    "sourceScreenshot": "docs/ui-image-generation/source-screenshots/posts.png",
    "promptFile": "docs/ui-image-generation/prompts/posts.txt",
    "finalImage": "public/images/ui-generated/posts.png",
    "purpose": "统一文章归档"
  },
  {
    "slug": "post-detail",
    "route": "/posts/[slug]",
    "url": "http://127.0.0.1:4321/posts/ai-design-workflow",
    "sourceScreenshot": "docs/ui-image-generation/source-screenshots/post-detail.png",
    "promptFile": "docs/ui-image-generation/prompts/post-detail.txt",
    "finalImage": "public/images/ui-generated/post-detail.png",
    "purpose": "长文阅读系统"
  },
  {
    "slug": "ai-learn",
    "route": "/ai/learn",
    "url": "http://127.0.0.1:4321/ai/learn",
    "sourceScreenshot": "docs/ui-image-generation/source-screenshots/ai-learn.png",
    "promptFile": "docs/ui-image-generation/prompts/ai-learn.txt",
    "finalImage": "public/images/ui-generated/ai-learn.png",
    "purpose": "AI 学习文章入口"
  },
  {
    "slug": "ai-sources",
    "route": "/ai/sources",
    "url": "http://127.0.0.1:4321/ai/sources",
    "sourceScreenshot": "docs/ui-image-generation/source-screenshots/ai-sources.png",
    "promptFile": "docs/ui-image-generation/prompts/ai-sources.txt",
    "finalImage": "public/images/ui-generated/ai-sources.png",
    "purpose": "信息源和社区"
  },
  {
    "slug": "ai-toolkit",
    "route": "/ai/toolkit",
    "url": "http://127.0.0.1:4321/ai/toolkit",
    "sourceScreenshot": "docs/ui-image-generation/source-screenshots/ai-toolkit.png",
    "promptFile": "docs/ui-image-generation/prompts/ai-toolkit.txt",
    "finalImage": "public/images/ui-generated/ai-toolkit.png",
    "purpose": "工具、技能、模型和工作流参考"
  },
  {
    "slug": "ai-ideas",
    "route": "/ai/ideas",
    "url": "http://127.0.0.1:4321/ai/ideas",
    "sourceScreenshot": "docs/ui-image-generation/source-screenshots/ai-ideas.png",
    "promptFile": "docs/ui-image-generation/prompts/ai-ideas.txt",
    "finalImage": "public/images/ui-generated/ai-ideas.png",
    "purpose": "AI 创意和可认领项目列表"
  },
  {
    "slug": "explore",
    "route": "/explore",
    "url": "http://127.0.0.1:4321/explore",
    "sourceScreenshot": "docs/ui-image-generation/source-screenshots/explore.png",
    "promptFile": "docs/ui-image-generation/prompts/explore.txt",
    "finalImage": "public/images/ui-generated/explore.png",
    "purpose": "AI 资源主从式库"
  },
  {
    "slug": "explore-detail",
    "route": "/explore/[slug]",
    "url": "http://127.0.0.1:4321/explore/claude-code",
    "sourceScreenshot": "docs/ui-image-generation/source-screenshots/explore-detail.png",
    "promptFile": "docs/ui-image-generation/prompts/explore-detail.txt",
    "finalImage": "public/images/ui-generated/explore-detail.png",
    "purpose": "单个资源详情页"
  },
  {
    "slug": "about",
    "route": "/about",
    "url": "http://127.0.0.1:4321/about",
    "sourceScreenshot": "docs/ui-image-generation/source-screenshots/about.png",
    "promptFile": "docs/ui-image-generation/prompts/about.txt",
    "finalImage": "public/images/ui-generated/about.png",
    "purpose": "个人介绍和站点故事"
  },
  {
    "slug": "not-found",
    "route": "/404",
    "url": "http://127.0.0.1:4321/404",
    "sourceScreenshot": "docs/ui-image-generation/source-screenshots/not-found.png",
    "promptFile": "docs/ui-image-generation/prompts/not-found.txt",
    "finalImage": "public/images/ui-generated/not-found.png",
    "purpose": "404 恢复状态"
  }
]
```

- [ ] **步骤 3：验证路由清单为有效 JSON**

运行：

```powershell
Get-Content -Raw docs\ui-image-generation\routes.json | ConvertFrom-Json | Measure-Object
```

预期：`Count` 为 `11`。

- [ ] **步骤 4：提交清单**

运行：

```powershell
git add docs/ui-image-generation/routes.json
git commit -m "docs: add ui image route inventory"
```

预期：提交成功，仅包含 `docs/ui-image-generation/routes.json`。

## 任务 2：截取源截图

**文件：**
- 创建：`docs/ui-image-generation/source-screenshots/home.png`
- 创建：`docs/ui-image-generation/source-screenshots/posts.png`
- 创建：`docs/ui-image-generation/source-screenshots/post-detail.png`
- 创建：`docs/ui-image-generation/source-screenshots/ai-learn.png`
- 创建：`docs/ui-image-generation/source-screenshots/ai-sources.png`
- 创建：`docs/ui-image-generation/source-screenshots/ai-toolkit.png`
- 创建：`docs/ui-image-generation/source-screenshots/ai-ideas.png`
- 创建：`docs/ui-image-generation/source-screenshots/explore.png`
- 创建：`docs/ui-image-generation/source-screenshots/explore-detail.png`
- 创建：`docs/ui-image-generation/source-screenshots/about.png`
- 创建：`docs/ui-image-generation/source-screenshots/not-found.png`

- [ ] **步骤 1：在固定端口启动 Astro 开发服务器**

运行：

```powershell
$log = Join-Path (Get-Location) ".tmp-dev-ui-image-generation.log"
$err = Join-Path (Get-Location) ".tmp-dev-ui-image-generation.err.log"
$p = Start-Process -FilePath npm.cmd -ArgumentList @("run","dev","--","--host","127.0.0.1","--port","4321") -WorkingDirectory (Get-Location) -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err -PassThru
Set-Content -Path ".tmp-dev-ui-image-generation.pid" -Value $p.Id
```

预期：命令以退出码 `0` 结束并写入 `.tmp-dev-ui-image-generation.pid`。

- [ ] **步骤 2：验证开发服务器响应**

运行：

```powershell
for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4321/
    if ($r.StatusCode -eq 200) { "ready"; break }
  } catch {
    Start-Sleep -Seconds 1
  }
}
```

预期：输出包含 `ready`。

- [ ] **步骤 3：安装 Playwright Chromium 用于截图**

运行：

```powershell
npx -y playwright@1.56.1 install chromium
```

预期：命令以退出码 `0` 结束。如 Chromium 已安装，Playwright 将报告无需操作或成功完成。

- [ ] **步骤 4：截取全部 11 张截图**

运行：

```powershell
$routes = Get-Content -Raw docs\ui-image-generation\routes.json | ConvertFrom-Json
foreach ($route in $routes) {
  npx -y playwright@1.56.1 screenshot --wait-for-timeout=2500 --viewport-size=1440,1080 $route.url $route.sourceScreenshot
  if ($LASTEXITCODE -ne 0) { throw "截图失败：$($route.slug)" }
}
```

预期：命令以退出码 `0` 结束，并在 `docs/ui-image-generation/source-screenshots/` 下写入 11 个 PNG 文件。

- [ ] **步骤 5：验证所有截图存在**

运行：

```powershell
$routes = Get-Content -Raw docs\ui-image-generation\routes.json | ConvertFrom-Json
$missing = $routes | Where-Object { -not (Test-Path $_.sourceScreenshot) }
if ($missing) { $missing | Format-Table slug, sourceScreenshot; exit 1 }
Get-ChildItem docs\ui-image-generation\source-screenshots\*.png | Measure-Object
```

预期：`Count` 为 `11`。

- [ ] **步骤 6：提交源截图**

运行：

```powershell
git add docs/ui-image-generation/source-screenshots
git commit -m "docs: capture ui source screenshots"
```

预期：提交成功，包含 11 个截图 PNG 文件。

## 任务 3：编写图片提示词

**文件：**
- 创建：`docs/ui-image-generation/prompts/home.txt`
- 创建：`docs/ui-image-generation/prompts/posts.txt`
- 创建：`docs/ui-image-generation/prompts/post-detail.txt`
- 创建：`docs/ui-image-generation/prompts/ai-learn.txt`
- 创建：`docs/ui-image-generation/prompts/ai-sources.txt`
- 创建：`docs/ui-image-generation/prompts/ai-toolkit.txt`
- 创建：`docs/ui-image-generation/prompts/ai-ideas.txt`
- 创建：`docs/ui-image-generation/prompts/explore.txt`
- 创建：`docs/ui-image-generation/prompts/explore-detail.txt`
- 创建：`docs/ui-image-generation/prompts/about.txt`
- 创建：`docs/ui-image-generation/prompts/not-found.txt`
- 创建：`docs/ui-image-generation/prompts.md`

- [ ] **步骤 1：创建共享提示词头部**

每个提示词文件开头使用此共享头部：

```text
用例：ui-mockup
资源类型：Walker 博客项目文档的高保真概念 UI 图片
输入图片角色：锚定真实路由布局和内容层级的源截图
主要请求：将提供的 Walker 博客页面重新生成为精致的高保真概念 UI 图片，同时保留路由特定的结构。
风格/媒介：精致的 Web 应用 UI 模型，中文优先的个人知识站点，而非营销海报
构图/取景：横向 1536x1024 文档图片，类浏览器页面裁剪，界面填满画面并保持舒适的边距
光照/氛围：平静的日间光线，柔和的玻璃材质深度，微妙的阴影，克制而精致
色彩方案：暖白色背景，薄荷绿和青色点缀，深青灰色文字，仅在必要时使用少量珊瑚色点缀
材质/纹理：半透明玻璃面板，精细边框，柔和的内部高光，清晰的 Lucide 风格线条图标
文字：仅保留简短的代表性中文标签；不编造长段文字
约束：保留源页面的布局意图、路由标识和信息层级；保持 UI 真实可读；不使用 Emoji 作为语义图标
避免：水印、虚假品牌名、无关产品、深蓝/紫色渐变主导、装饰性色块、设备模型边框、破碎的导航、随意的英文填充文字
```

- [ ] **步骤 2：编写各路由的提示词文件**

将共享头部与下方对应路由的特定内容组合，创建各 `docs/ui-image-generation/prompts/<slug>.txt` 文件：

```text
home 路由重点：
突出可拖拽的 Bento 桌面布局、Walker 个人资料卡、Dock 展示、问候/关于卡片、最近轨迹、随机推荐、导航控制台、日历小部件、音乐播放器、搜索入口和点赞计数器。保持个人数字桌面的感觉，而非落地页。
```

```text
posts 路由重点：
突出统一文章归档，包含左侧导航、页面标题、年份/日期组织、文章卡片、分类标签和标签节奏。让归档感觉足够密集适合反复阅读，但不像管理后台。
```

```text
post-detail 路由重点：
突出长文阅读系统：左侧文章导航、中间文章正文、元数据、标题、正文块、可见的资源/视频入口以及右侧目录。优先保证阅读舒适度和稳定的层级。
```

```text
ai-learn 路由重点：
突出聚焦的 AI 学习条目和文章卡片。页面应感觉像是为 AI 实践策划的学习路径，具有克制的界面和清晰的扫描性。
```

```text
ai-sources 路由重点：
突出信息源和社区发现：搜索、标签过滤、信息源卡片、分类徽章和紧凑描述。保持页面实用且以资源为导向。
```

```text
ai-toolkit 路由重点：
突出类似文档的工具箱界面，包含工具、技能、模型角色、工作流板块和可调列宽的信息密度。应感觉像实用的操作手册，而非卡片画廊。
```

```text
ai-ideas 路由重点：
突出 AI 项目的早期创意看板，包含开放/完成状态和可认领的概念槽位。如果源截图显示空状态，应有意地表现空状态，而非编造无关项目。
```

```text
explore 路由重点：
突出 AI 资源库的主从式布局、左侧资源列表、选中状态、分类分组以及空白或初始的详情区域。让选择入口和库结构清晰可见。
```

```text
explore-detail 路由重点：
突出选中的 AI 资源详情页，包含资源卡片、元数据、评分、标签、描述和外部链接操作。保留主从式 Dock 布局。
```

```text
about 路由重点：
突出沉浸式个人身份页：视频英雄区的感觉、Walker 身份、头像/简介、技能卡片、社交链接、站点故事和页面点赞计数器。保持个人化和电影感，而非通用的创作者落地页。
```

```text
not-found 路由重点：
突出 404 恢复状态，保持一致的 Walker 博客样式、Lucide 风格的图标语言、平静的空状态布局和清晰的返回首页操作。应感觉像是产品体系的一部分。
```

- [ ] **步骤 3：编写人类可读的提示词日志**

创建 `docs/ui-image-generation/prompts.md`：

```markdown
# UI 图片生成提示词

生成模型：`gpt-image-2`
输出尺寸：`1536x1024`
质量：`high`
模式：基于截图的图片编辑

`docs/ui-image-generation/prompts/` 中的所有提示词文件共享相同的视觉约定：

- 保留源截图中真实的路由布局和信息层级。
- 使用 Walker 博客的暖白色、薄荷/青色、玻璃面板视觉体系。
- 保持界面中文优先和 Lucide 风格。
- 生成用于文档的精致概念 UI 图片，而非实时 UI 替代品。
- 避免水印、虚假品牌、通用 SaaS 英雄图、装饰性色块和无关对象。

路由提示词文件：

| Slug | 提示词文件 | 源截图 | 最终图片 |
| --- | --- | --- | --- |
| `home` | `docs/ui-image-generation/prompts/home.txt` | `docs/ui-image-generation/source-screenshots/home.png` | `public/images/ui-generated/home.png` |
| `posts` | `docs/ui-image-generation/prompts/posts.txt` | `docs/ui-image-generation/source-screenshots/posts.png` | `public/images/ui-generated/posts.png` |
| `post-detail` | `docs/ui-image-generation/prompts/post-detail.txt` | `docs/ui-image-generation/source-screenshots/post-detail.png` | `public/images/ui-generated/post-detail.png` |
| `ai-learn` | `docs/ui-image-generation/prompts/ai-learn.txt` | `docs/ui-image-generation/source-screenshots/ai-learn.png` | `public/images/ui-generated/ai-learn.png` |
| `ai-sources` | `docs/ui-image-generation/prompts/ai-sources.txt` | `docs/ui-image-generation/source-screenshots/ai-sources.png` | `public/images/ui-generated/ai-sources.png` |
| `ai-toolkit` | `docs/ui-image-generation/prompts/ai-toolkit.txt` | `docs/ui-image-generation/source-screenshots/ai-toolkit.png` | `public/images/ui-generated/ai-toolkit.png` |
| `ai-ideas` | `docs/ui-image-generation/prompts/ai-ideas.txt` | `docs/ui-image-generation/source-screenshots/ai-ideas.png` | `public/images/ui-generated/ai-ideas.png` |
| `explore` | `docs/ui-image-generation/prompts/explore.txt` | `docs/ui-image-generation/source-screenshots/explore.png` | `public/images/ui-generated/explore.png` |
| `explore-detail` | `docs/ui-image-generation/prompts/explore-detail.txt` | `docs/ui-image-generation/source-screenshots/explore-detail.png` | `public/images/ui-generated/explore-detail.png` |
| `about` | `docs/ui-image-generation/prompts/about.txt` | `docs/ui-image-generation/source-screenshots/about.png` | `public/images/ui-generated/about.png` |
| `not-found` | `docs/ui-image-generation/prompts/not-found.txt` | `docs/ui-image-generation/source-screenshots/not-found.png` | `public/images/ui-generated/not-found.png` |
```

- [ ] **步骤 4：验证所有提示词文件存在**

运行：

```powershell
$routes = Get-Content -Raw docs\ui-image-generation\routes.json | ConvertFrom-Json
$missing = $routes | Where-Object { -not (Test-Path $_.promptFile) }
if ($missing) { $missing | Format-Table slug, promptFile; exit 1 }
Test-Path docs\ui-image-generation\prompts.md
```

预期：最后一行为 `True`。

- [ ] **步骤 5：提交提示词**

运行：

```powershell
git add docs/ui-image-generation/prompts docs/ui-image-generation/prompts.md
git commit -m "docs: add ui image generation prompts"
```

预期：提交成功，包含 11 个提示词文件和 `prompts.md`。

## 任务 4：生成最终 UI 图片

**文件：**
- 创建：`public/images/ui-generated/home.png`
- 创建：`public/images/ui-generated/posts.png`
- 创建：`public/images/ui-generated/post-detail.png`
- 创建：`public/images/ui-generated/ai-learn.png`
- 创建：`public/images/ui-generated/ai-sources.png`
- 创建：`public/images/ui-generated/ai-toolkit.png`
- 创建：`public/images/ui-generated/ai-ideas.png`
- 创建：`public/images/ui-generated/explore.png`
- 创建：`public/images/ui-generated/explore-detail.png`
- 创建：`public/images/ui-generated/about.png`
- 创建：`public/images/ui-generated/not-found.png`

- [ ] **步骤 1：验证 API 环境**

运行：

```powershell
if (-not $env:OPENAI_API_KEY) { throw "OPENAI_API_KEY 未设置。请在本地设置后再运行此步骤。" }
python -c "import openai; print('openai-python-ready')"
```

预期：输出包含 `openai-python-ready`。如果缺少 Python 包，运行：

```powershell
python -m pip install openai pillow
```

然后重新运行验证命令。

- [ ] **步骤 2：试运行一张图片命令**

运行：

```powershell
python "C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\image_gen.py" edit --model gpt-image-2 --quality high --size 1536x1024 --output-format png --image "docs\ui-image-generation\source-screenshots\home.png" --prompt-file "docs\ui-image-generation\prompts\home.txt" --out "public\images\ui-generated\home.png" --dry-run
```

预期：命令打印解析后的请求参数，且不创建 `public/images/ui-generated/home.png`。

- [ ] **步骤 3：生成全部 11 张最终图片**

运行：

```powershell
$routes = Get-Content -Raw docs\ui-image-generation\routes.json | ConvertFrom-Json
foreach ($route in $routes) {
  python "C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\image_gen.py" edit `
    --model gpt-image-2 `
    --quality high `
    --size 1536x1024 `
    --output-format png `
    --image $route.sourceScreenshot `
    --prompt-file $route.promptFile `
    --out $route.finalImage `
    --force
  if ($LASTEXITCODE -ne 0) { throw "图片生成失败：$($route.slug)" }
}
```

预期：命令以退出码 `0` 结束，并在 `public/images/ui-generated/` 下写入 11 个 PNG 文件。

- [ ] **步骤 4：验证所有最终图片存在且为有效 PNG**

运行：

```powershell
@'
from pathlib import Path
from PIL import Image

expected = [
    "home", "posts", "post-detail", "ai-learn", "ai-sources",
    "ai-toolkit", "ai-ideas", "explore", "explore-detail",
    "about", "not-found"
]

for slug in expected:
    path = Path("public/images/ui-generated") / f"{slug}.png"
    if not path.exists():
        raise SystemExit(f"缺失: {path}")
    with Image.open(path) as image:
        if image.format != "PNG":
            raise SystemExit(f"非 PNG 格式: {path}")
        width, height = image.size
        if width < 1024 or height < 768:
            raise SystemExit(f"尺寸过小: {path} {width}x{height}")
        print(f"{slug}: {width}x{height}")
'@ | python -
```

预期：输出列出全部 11 个 slug 及其尺寸，命令以退出码 `0` 结束。

- [ ] **步骤 5：目视检查最终图片**

打开或检查每张最终图片：

```powershell
Get-ChildItem public\images\ui-generated\*.png | Select-Object Name,Length | Format-Table -AutoSize
```

预期：列出 11 个文件。目视检查时，拒收并重新生成任何包含水印、无关品牌、明显破碎的 UI 结构、深色/紫色主导主题、主要标签不可读或路由标识不匹配的图片。

- [ ] **步骤 6：提交最终图片**

运行：

```powershell
git add public/images/ui-generated
git commit -m "assets: generate ui presentation images"
```

预期：提交成功，包含 11 个最终 PNG 文件。

## 任务 5：编写清单和最终验证

**文件：**
- 创建：`docs/ui-image-generation/manifest.md`

- [ ] **步骤 1：编写清单**

创建 `docs/ui-image-generation/manifest.md`：

```markdown
# UI 图片生成清单

日期：2026-05-17
模型：`gpt-image-2`
模式：基于截图的图片编辑
质量：`high`
输出尺寸：`1536x1024`

## 源文件与输出映射

| Slug | 路由 | 源截图 | 提示词 | 最终图片 |
| --- | --- | --- | --- | --- |
| `home` | `/` | `docs/ui-image-generation/source-screenshots/home.png` | `docs/ui-image-generation/prompts/home.txt` | `public/images/ui-generated/home.png` |
| `posts` | `/posts` | `docs/ui-image-generation/source-screenshots/posts.png` | `docs/ui-image-generation/prompts/posts.txt` | `public/images/ui-generated/posts.png` |
| `post-detail` | `/posts/ai-design-workflow` | `docs/ui-image-generation/source-screenshots/post-detail.png` | `docs/ui-image-generation/prompts/post-detail.txt` | `public/images/ui-generated/post-detail.png` |
| `ai-learn` | `/ai/learn` | `docs/ui-image-generation/source-screenshots/ai-learn.png` | `docs/ui-image-generation/prompts/ai-learn.txt` | `public/images/ui-generated/ai-learn.png` |
| `ai-sources` | `/ai/sources` | `docs/ui-image-generation/source-screenshots/ai-sources.png` | `docs/ui-image-generation/prompts/ai-sources.txt` | `public/images/ui-generated/ai-sources.png` |
| `ai-toolkit` | `/ai/toolkit` | `docs/ui-image-generation/source-screenshots/ai-toolkit.png` | `docs/ui-image-generation/prompts/ai-toolkit.txt` | `public/images/ui-generated/ai-toolkit.png` |
| `ai-ideas` | `/ai/ideas` | `docs/ui-image-generation/source-screenshots/ai-ideas.png` | `docs/ui-image-generation/prompts/ai-ideas.txt` | `public/images/ui-generated/ai-ideas.png` |
| `explore` | `/explore` | `docs/ui-image-generation/source-screenshots/explore.png` | `docs/ui-image-generation/prompts/explore.txt` | `public/images/ui-generated/explore.png` |
| `explore-detail` | `/explore/claude-code` | `docs/ui-image-generation/source-screenshots/explore-detail.png` | `docs/ui-image-generation/prompts/explore-detail.txt` | `public/images/ui-generated/explore-detail.png` |
| `about` | `/about` | `docs/ui-image-generation/source-screenshots/about.png` | `docs/ui-image-generation/prompts/about.txt` | `public/images/ui-generated/about.png` |
| `not-found` | `/404` | `docs/ui-image-generation/source-screenshots/not-found.png` | `docs/ui-image-generation/prompts/not-found.txt` | `public/images/ui-generated/not-found.png` |

## 验证清单

- 全部 11 个最终 PNG 文件存在于 `public/images/ui-generated/` 下。
- 全部 11 个源截图存在于 `docs/ui-image-generation/source-screenshots/` 下。
- 每张最终图片清晰对应其目标路由类别。
- 整套图片保持 Walker 博客的暖白色、薄荷/青色、玻璃面板视觉语言。
- 没有最终图片包含水印、无关品牌、通用设备模型或路由标识不匹配。
- 少量生成的文字仅用作代表性界面文案，不作为精确的产品声明。
```

- [ ] **步骤 2：验证最终文件数量**

运行：

```powershell
(Get-ChildItem docs\ui-image-generation\source-screenshots\*.png | Measure-Object).Count
(Get-ChildItem public\images\ui-generated\*.png | Measure-Object).Count
(Get-ChildItem docs\ui-image-generation\prompts\*.txt | Measure-Object).Count
```

预期：

```text
11
11
11
```

- [ ] **步骤 3：运行 Astro 验证命令**

运行：

```powershell
npx astro check
npm run build
```

预期：

- `npx astro check` 以退出码 `0` 结束。
- `npm run build` 以退出码 `0` 结束。

- [ ] **步骤 4：如开发服务器仍在运行则停止**

运行：

```powershell
if (Test-Path ".tmp-dev-ui-image-generation.pid") {
  $pidValue = Get-Content ".tmp-dev-ui-image-generation.pid"
  Stop-Process -Id $pidValue -ErrorAction SilentlyContinue
}
```

预期：命令以退出码 `0` 结束。

- [ ] **步骤 5：提交清单和最终文档**

运行：

```powershell
git add docs/ui-image-generation/manifest.md
git commit -m "docs: add ui image generation manifest"
```

预期：提交成功，包含 `docs/ui-image-generation/manifest.md`。

- [ ] **步骤 6：报告最终资产**

在最终回复中列出：

- `public/images/ui-generated/` 下的 11 个最终文件。
- 提示词日志 `docs/ui-image-generation/prompts.md`。
- 清单文件 `docs/ui-image-generation/manifest.md`。
- 已运行的验证命令及其是否通过。
