/**
 * Obsidian 图谱引擎常数 —— 全部取自**应用本体**的可核对源码，不取二手描述。
 *
 * ## 来源与证据链
 *
 * 应用 `Obsidian.app/Contents/Resources/obsidian.asar` → `app.js` / `app.css`。
 * 图谱相关代码已定位（设置面板 `wQ`/`PJ`/`IJ`、渲染器 `AQ`、节点 `xQ`、连线 `TQ`）。
 *
 * **最强证据**：应用渲染器直接创建 `new Worker("/sim.js", { name: "Graph Worker" })`，
 * 即 `sim-original.js` 就是**应用自用的图谱 worker**（不只是官网首页那份），
 * 因此物理常数（`0.1/1000/250`、`alphaDecay`、`×0.6`、`theta .9`、`collide 60/.5`）
 * 是应用级真值。
 *
 * ## 逐项核对出的应用-首页差异（本文件以此为准）
 *
 * | 项 | 应用（app.js） | 首页（sim-original/graph-reconstructed） |
 * |---|---|---|
 * | textFadeMultiplier | `0` | `-2` |
 * | lineSizeMultiplier | `1` | `2` |
 * | showTags | `false` | —（首页无过滤器概念） |
 * | 斥力滑块 | UI `10`，引擎 `e³ = 1000` | 引擎直接写死 `1000` |
 * | 缩放上下限 | `[1/128, 8]` | `[0.25, 1]`（首页夹窄） |
 * | 边透明度 | `fadeAlpha × 颜色自带 alpha` | `× 0.34 × max(.45, …)` 另有首页专属样式 |
 * | 配色 | 按节点类型语义化（tag 绿 / attachment 黄 / unresolved 淡 …） | 单一白/高亮紫 |
 *
 * ## 已核出的二手资料错误（早期版本据此写错，已更正）
 *   1. 帮助文档页把 Forces 默认值归纳成「中心 0.5 / 斥力 10」——应用 UI 是 `0.1 / 10`（斥力再立方）。
 *   2. `sim-readable.js` 写 `.velocityDecay(0.4)` 并注释「× (1-0.4) = × 0.6」——d3 的
 *      `velocityDecay` 是**直接相乘**，原始 worker 明确 `vx *= .6`。以实现为准。
 *   3. 帮助文档说「被引用越多节点越大」——实现取 `getRelated().length`（**无向度数**）。
 */

// ---------------------------------------------------------------- 模拟（worker）

/** alpha 起点 / 下限 / 目标（worker 变量 Q / .001 / y） */
export const ALPHA_START = 1;
export const ALPHA_MIN = 0.001;
export const ALPHA_TARGET = 0;

/** alphaDecay = 1 - 0.001^(1/300) ≈ 0.02276（worker 的 B） */
export const ALPHA_DECAY = 1 - Math.pow(ALPHA_MIN, 1 / 300);

/** 速度积分：每 tick `vx *= 0.6`（worker 的 `*.6`） */
export const VELOCITY_DECAY = 0.6;

/** tick 间隔：16.666666666666668 ms（worker 的 setTimeout 实参） */
export const TICK_INTERVAL_MS = 16.666666666666668;

/** 引擎侧力参数默认值：worker 变量默认 + 应用 UI 换算式（斥力立方） */
export const DEFAULT_CENTER_STRENGTH = 0.1;
export const DEFAULT_REPEL_STRENGTH = 1000; // = UI 10 的立方
export const DEFAULT_LINK_STRENGTH = 1;
export const DEFAULT_LINK_DISTANCE = 250;

/** 硬编码在 worker 里、面板不暴露（WASM 入口实参） */
export const MANY_BODY_DISTANCE_MIN = 30;
export const MANY_BODY_THETA = 0.9;
export const COLLIDE_RADIUS = 60;
export const COLLIDE_STRENGTH = 0.5;
export const COLLIDE_ITERATIONS = 1;

/** 拖拽/变更时把 alpha 抬到 0.3（应用 `setForces` / 数据加载的 postMessage） */
export const DRAG_ALPHA = 0.3;

// ------------------------------------------------------- 节点与渲染（app.js）

/** 节点半径：fNodeSizeMult * clamp(3*sqrt(weight+1), 8, 30)（`xQ.getSize`） */
export const NODE_SIZE_MIN = 8;
export const NODE_SIZE_MAX = 30;
export const NODE_SIZE_FACTOR = 3;

/** 应用 Display 默认值（`PJ`） */
export const NODE_SIZE_MULTIPLIER = 1;
export const LINE_SIZE_MULTIPLIER = 1;
export const TEXT_FADE_MULTIPLIER = 0;
export const SHOW_ARROW = false;

/** 高亮时非相关元素淡到 0.2（`app.js` 的 `fQ = .2`） */
export const DIM_ALPHA = 0.2;

/** 缩放：`targetScale = clamp(targetScale, 1/128, 8)`（`AQ.updateZoom`） */
export const APP_ZOOM_MIN = 1 / 128;
export const APP_ZOOM_MAX = 8;
/** 首页的缩放夹取与起始（`graph-reconstructed` 构造函数），仅作对照 */
export const HOME_ZOOM_MIN = 0.25;
export const HOME_ZOOM_MAX = 1;
export const HOME_ZOOM_START_FACTOR = 0.25;
/** 滚轮：`targetScale *= 1.5^(-delta/120)`（首页实现；应用同一手感） */
export const ZOOM_BASE = 1.5;
/** 缩放缓动比例（首页 `updateZoom` 用 .85 → 每帧靠拢 15%） */
export const ZOOM_LERP = 0.15;
/** 适配视口时留出的边距比例 */
export const FIT_PADDING_RATIO = 1.15;

/** 文字透明度：`clamp(log2(scale) + 1 - fTextShowMult, 0, 1)`（`AQ.setScale`） */
export const LABEL_ALPHA_LOG_OFFSET = 1;
/** 标签字号：`14 + size/4`（`xQ.getTextStyle`，单位世界坐标，由 PIXI 再乘 nodeScale） */
export const LABEL_FONT_BASE = 14;
export const LABEL_FONT_SIZE_DIVISOR = 4;
/** 标签纵向：`(size + 5) * nodeScale + moveText / scale`（`xQ.render`） */
export const LABEL_OFFSET_PADDING = 5;
/** 高亮时标签下移（`xQ.render` 的 `b = d ? 15 : 0`） */
export const LABEL_SELECTED_OFFSET = 15;
/** 标签换行宽度上限（`xQ.getTextStyle` 的 wordWrapWidth） */
export const LABEL_WRAP_WIDTH = 300;

/** 命中测试的额外容差（首页 `+ 3/scale`；应用为 PIXI Graphics 事件区） */
export const HIT_PADDING = 3;

/** 箭头透明度倍数：`clamp(2*(scale - 0.3), 0, 1)`（`TQ.render`） */
export const EDGE_ZOOM_FADE_SCALE = 0.3;
export const EDGE_ZOOM_FADE_RATE = 2;

/**
 * 布局随机种子。Obsidian 用 `Math.random`（每次打开布局不同）；本站取定种子，
 * 让同内容产出同布局（可测试、可刷新稳定）。
 */
export const OBSIDIAN_ENGINE_SEED = 0x0b51d1a;

/**
 * 滑块区间 —— **全部来自应用源码**（`setLimits` 实参，非推测）：
 *   Center force [0,1] · Repel force [0,20] · Link force [0,1] · Link distance [30,500] step 1
 *   Text fade [-3,3] step .1 · Node size [.1,5] · Link thickness [.1,5] · Depth [1,5] step 1
 * 斥力滑块值是**引擎值的立方根**：面板 10 → 引擎 1000（`setForces({repelStrength: e*e*e})`）。
 */
export const FORCE_RANGES = {
  centerStrength: { min: 0, max: 1, step: 0.01 },
  /** UI 区间；写入引擎时要立方 */
  repelStrength: { min: 0, max: 20, step: 0.1 },
  linkStrength: { min: 0, max: 1, step: 0.01 },
  linkDistance: { min: 30, max: 500, step: 1 },
} as const;

export const DISPLAY_RANGES = {
  textFadeMultiplier: { min: -3, max: 3, step: 0.1 },
  nodeSizeMultiplier: { min: 0.1, max: 5, step: 0.05 },
  lineSizeMultiplier: { min: 0.1, max: 5, step: 0.05 },
} as const;

export const LOCAL_DEPTH_RANGE = { min: 1, max: 5, step: 1 } as const;

/** UI 斥力值 ↔ 引擎斥力强度（应用：立方） */
export function repelUiToEngine(uiValue: number): number {
  return uiValue * uiValue * uiValue;
}
export function repelEngineToUi(engineValue: number): number {
  return Math.cbrt(Math.max(0, engineValue));
}

/**
 * 语义配色 —— 应用不是「一个节点色」，而是按节点类型取色。
 * `app.css` 的映射（`--graph-*` 变量再由主题给最终色值）：
 *   fill → --graph-node(--text-muted) · fill-focused → --graph-node-focused(--text-accent)
 *   fill-tag → --graph-node-tag(--color-green) · fill-attachment → --graph-node-attachment(--color-yellow)
 *   fill-unresolved → --graph-node-unresolved(--text-faint) · line → --graph-line(--color-base-35)
 *   line-highlight / fill-highlight → --interactive-accent · arrow/text → --text-normal
 *   circle → --graph-node-focused
 * 本站把这些映射到站点主题变量（见 styles/walker.css 的 .graph-canvas-wrap）。
 */
export const GRAPH_COLOR_KEYS = [
  'fill',
  'fillFocused',
  'fillTag',
  'fillAttachment',
  'fillUnresolved',
  'line',
  'lineHighlight',
  'fillHighlight',
  'arrow',
  'text',
  'circle',
] as const;

export type GraphColorKey = (typeof GRAPH_COLOR_KEYS)[number];

/** 分组色：应用用固定 6 个 CSS 类槽 `.graph-view.color-fill-1..6`，不是任意取色 */
export const GROUP_COLOR_SLOTS = 6;

/** 深色主题下应用首页的配色（作为 CSS 变量缺失时的兜底，仅深色底可用） */
export const FALLBACK_PALETTE: Record<GraphColorKey, string> = {
  fill: '#9ca3af',
  fillFocused: '#a88bfa',
  fillTag: '#22c55e',
  fillAttachment: '#eab308',
  fillUnresolved: '#6b7280',
  line: '#4b5563',
  lineHighlight: '#a88bfa',
  fillHighlight: '#a88bfa',
  arrow: '#e5e7eb',
  text: '#e5e7eb',
  circle: '#a88bfa',
};
