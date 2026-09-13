# 小影网页试装 · 2026-09-11

原稿：`output/xiaoying/yingyao-v3/xiaoying-yingyao-v3.blend`，影鳐 V3.1。原稿保留可编辑模型、完整微绒和八段动作，未被本次改写。

## 资产

- `xiaoying.glb`：6,705,748 bytes，31,478 个导出前网格顶点，3,782 条原始梳理中的微绒，原身体/眼睛形态键。
- `fur-color.png`、`fur-normal.png`：原程序材质的 1024 px 烘焙结果，已内嵌 GLB，单独文件保留便于维护。
- `poster.jpg`：既有主视觉缩小版，加载期间/失败时使用。
- 动作：`01_Idle`、`02_Hello`、`03_Listen`、`05_Think`、`07_Joy`、`08_Sleep`；从原时间线以 15 fps 采样，网页线性插值。首轮控件只使用待机、招呼、开心和休息。
- 承接、表达对应的道具与棚拍灯光/相机未导入网页。倾听/思考资产已备，但尚未与真实对话状态连接。

## 重建

在仓库根目录运行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background output/xiaoying/yingyao-v3/xiaoying-yingyao-v3.blend --python output/xiaoying/yingyao-v3/export_web.py
```

脚本在独立进程中读取原稿，不保存 `.blend`；只导出当前小影场景的选中角色。保持源路径时输出到本目录。统计在 `output/xiaoying/yingyao-v3/web-export.json`。

GLB 导出保留形态键；随后根据实际驱动值写入 glTF 动画通道。静态包围盒使用精确静止姿态计算，避免把所有形态的最大范围当成当前角色范围，造成缩小和悬空。

## 网站接入

- `XiaoyingHome.tsx`：原生按钮、文字状态、搜索入口、静态降级。
- `scene.ts`：延迟加载 Three.js 和 GLB、切换动画、轻微跟随鼠标、灯光、阴影与 GPU 资源生命周期。
- 首页采用自然滚动；角色画面可轻触，手机保留纵向滚动。搜索通过已有壳层接口打开，没有新增 API。
- 可见性：角色离屏、标签页在后台、手动暂停、系统开启减少动态效果时停止连续渲染；卸载组件会终止下载、取消循环、移除监听并释放网格/材质/纹理/渲染器。
- 模型失败：显示备用图，禁用动作控件，搜索保持可用；刷新可重新加载。
- 本版本无音效，不上传模型交互数据，不执行用户任务。真实回答状态联动为后续范围。

## 验证与限制

GLB 经 Khronos glTF Validator 检查为 0 errors、1 warning（法线贴图切线空间由运行时生成）；当前 Three.js 浏览器已实测材质显示。动作触发、休息闭眼、搜索打开与模型下载失败后的搜索可用已在浏览器验证。

单元测试覆盖动作按钮、暂停、模型错误降级、卸载释放。手机验证使用桌面浏览器 390 × 844 模拟视口；尚无真实低端手机性能和移动 Safari 验收。实时材质与稀疏微绒优先适配网页，近景细绒不等同于 Cycles 棚拍。

本地试装，没有发布生产。
