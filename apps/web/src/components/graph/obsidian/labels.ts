/**
 * 图谱面板文案 —— **逐字取自 Obsidian 官方中文词条**，不自行翻译。
 *
 * 来源：`Obsidian.app/Contents/Resources/obsidian.asar` → `i18n/zh.txt`（简体，69022 字节）。
 * 每个条目后的行号为该文件中的原始行号，便于复核。
 *
 * 为什么照抄官方译名而不是自己起名：站主指令是「直接给我抄」，而面板文案属于
 * 可验收的对照面——「图谱向心力」写对了，说明对照的是真身而不是我的措辞。
 */

/** 面板与页面标题（zh.txt:1226 / 1227 / 1261 / 542 / 1229 / 1231） */
export const GRAPH_ZH_TITLE = '关系图谱';
export const GRAPH_ZH_SUMMARY = '总览笔记间的联系。';
export const GRAPH_ZH_OPEN_SETTINGS = '打开图谱设置';
export const GRAPH_ZH_RESTORE = '恢复默认设置';
export const GRAPH_ZH_OPEN_LOCAL = '打开局部关系图';
export const GRAPH_ZH_LOCAL_TITLE = (displayText: string) => `${displayText} 的关系图`;

/** 筛选（zh.txt:1232 起） */
export const GRAPH_ZH_FILTERS = {
  /** zh.txt:1232 */
  section: '筛选',
  /** zh.txt:1233 */
  search: '搜索文件…',
  /** zh.txt:1243 */
  tags: '标签',
  tagsTooltip: '在图谱中显示标签以及与之相关的链接',
  /** zh.txt:1245 */
  attachments: '附件',
  attachmentsTooltip: '在图谱中显示附件以及与之相关的链接',
  /** zh.txt:1246 */
  existingFilesOnly: '仅显示已创建的笔记',
  existingFilesOnlyTooltip: '开启后，图谱中不显示未被创建的笔记以及与之相关的链接。',
  /** zh.txt:1248 */
  orphans: '孤立文件',
  orphansTooltip: '开启后，在图谱中显示未链接到任何其他文件的笔记',
} as const;

/** 局部关系图（zh.txt:1234 起）—— 只在局部图面板出现 */
export const GRAPH_ZH_LOCAL = {
  /** zh.txt:1234 */
  depth: '深度',
  /** zh.txt:1235 */
  depthTooltip: '显示从当前节点出发经 n 段链接可到达的节点，n 为设置值。',
  /** zh.txt:1236 */
  interlinks: '其他节点间的链接',
  /** zh.txt:1237 */
  interlinksTooltip: '显示其他节点之间的链接',
  /** zh.txt:1240 */
  forelinks: '正向链接',
  /** zh.txt:1241 */
  forelinksTooltip: '显示图中每个节点的正向链接。',
  /** zh.txt:1239 */
  backlinks: '反向链接',
  /** zh.txt:1242 */
  backlinksTooltip: '显示图中每个节点的反向链接。',
} as const;

/** 外观（zh.txt:1250 起） */
export const GRAPH_ZH_DISPLAY = {
  /** zh.txt:1250 */
  section: '外观',
  /** zh.txt:1251 */
  arrows: '箭头',
  /** zh.txt:1252 —— 官方说明确认箭头只在放大后出现，与 arrowAlpha 曲线一致 */
  arrowsTooltip: '放大后，显示链接的箭头',
  /** zh.txt:1253 */
  textFade: '文本透明度',
  /** zh.txt:1254 */
  nodeSize: '节点大小',
  /** zh.txt:1255 */
  linkThickness: '连线粗细',
} as const;

/** 力度（zh.txt:1256 起）—— 注意是「力度」不是「力量」 */
export const GRAPH_ZH_FORCES = {
  /** zh.txt:1256 */
  section: '力度',
  /** zh.txt:1257 */
  centerForce: '图谱向心力',
  /** zh.txt:1258 */
  linkForce: '相连节点间的吸引力',
  /** zh.txt:1259 */
  linkDistance: '连线长度',
  /** zh.txt:1260 */
  repelForce: '节点间的排斥力',
} as const;

/** 颜色组（zh.txt:1262 起）—— 官方是「点击改色 + 拖动排序」，不是固定色槽 */
export const GRAPH_ZH_GROUPS = {
  /** zh.txt:1262 */
  section: '颜色组',
  /** zh.txt:1264 */
  searchPlaceholder: '请输入检索式…',
  /** zh.txt:1265 */
  delete: '删除组',
  /** zh.txt:1266 */
  create: '新建颜色组',
  /** zh.txt:1267 */
  hint: '点击可更改颜色\n拖动可对颜色组排序',
} as const;

/** 生长动画（zh.txt:1268 / 1270） */
export const GRAPH_ZH_ANIMATE = {
  play: '播放关系图谱生长动画',
  button: '播放动画',
} as const;

/** 其他（zh.txt:1219 / 1230） */
export const GRAPH_ZH_MISC = {
  showAllFileTypes: '显示所有类型文件',
  copyScreenshot: '复制截图',
  screenshotCopied: '屏幕截图已复制到剪贴板。',
} as const;

/** 面板小节顺序与标题，照官方布局：筛选 → 颜色组 → 外观 → 力度 */
export const GRAPH_ZH_SECTION_ORDER = [
  GRAPH_ZH_FILTERS.section,
  GRAPH_ZH_GROUPS.section,
  GRAPH_ZH_DISPLAY.section,
  GRAPH_ZH_FORCES.section,
] as const;
