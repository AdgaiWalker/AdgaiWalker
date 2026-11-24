import { isValidContentSlug, normalizeLf, resolveVisibility, type ContentVisibility } from "@walker/shared";

export interface ParsedDocFrontmatter {
  hasFrontmatter: boolean;
  yaml: string | null;
  body: string;
  title: string;
  summary: string;
  type: string;
  tags: string[];
  visibility: ContentVisibility;
  published: boolean | undefined;
  series: string;
  seriesOrder: number | null;
  hall: string;
  domain: string;
}

export interface FrontmatterPatch {
  title?: string;
  summary?: string;
  type?: string;
  visibility?: ContentVisibility;
  tags?: string[];
  updated?: string;
  series?: string;
  seriesOrder?: number | null;
  body?: string;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/;
const BLOCK_SCALAR_RE = /^([>|])([+-])?\d*$/;

function unquote(v: string): string {
  const s = v.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try { return JSON.parse(s) as string; } catch {
      return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

export function sanitizeInlineText(v: string): string {
  return v.replace(/[\r\n\u2028\u2029]+/g, " ");
}

export function sanitizeMarkdownBody(v: string): string {
  return normalizeLf(v).replace(/[\u2028\u2029]/g, "\n");
}

// 严禁在输入期 .trim()：受控标题/摘要/系列输入框必须完整保留尾随空格，避免输入法或英文单词敲空格被吞
const quote = (v: string) => JSON.stringify(sanitizeInlineText(v));

/** 定位顶层 key 及其全部缩进续行范围 [start, end)（单点范围查找，杜绝改写多行块标量时残留孤立缩进行）。 */
function findKeyRange(lines: string[], key: string): { start: number; end: number; header: string } | null {
  const re = new RegExp(`^${key}:[ \\t]*(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const header = m[1].trim();
    let end = i + 1;
    while (end < lines.length && (/^[ \t]+/.test(lines[end]) || lines[end].trim() === "")) {
      end++;
    }
    while (end > i + 1 && lines[end - 1].trim() === "") end--;
    return { start: i, end, header };
  }
  return null;
}

function readBlockScalar(bodyLines: string[], folded: boolean): string {
  const indents = bodyLines.filter((l) => l.trim().length > 0).map((l) => l.match(/^[ \t]*/)?.[0].length ?? 0);
  const minIndent = indents.length ? Math.min(...indents) : 0;
  const stripped = bodyLines.map((l) => (l.length >= minIndent ? l.slice(minIndent) : l.trim()));
  if (!folded) return stripped.join("\n").trim();
  const out: string[] = [];
  let para: string[] = [];
  for (const line of stripped) {
    if (line.trim() === "") {
      if (para.length) { out.push(para.join(" ")); para = []; }
    } else {
      para.push(line.trim());
    }
  }
  if (para.length) out.push(para.join(" "));
  return out.join("\n").trim();
}

function readScalar(yaml: string, key: string): string | undefined {
  const lines = yaml.split("\n");
  const range = findKeyRange(lines, key);
  if (!range) return undefined;
  const blockMatch = range.header.match(BLOCK_SCALAR_RE);
  if (blockMatch) return readBlockScalar(lines.slice(range.start + 1, range.end), blockMatch[1] === ">");
  if (!range.header && range.end > range.start + 1) {
    return readBlockScalar(lines.slice(range.start + 1, range.end), true);
  }
  return unquote(range.header);
}

function replaceKeyLines(yaml: string, key: string, replacement: string[] | null): string {
  const lines = yaml.split("\n");
  const range = findKeyRange(lines, key);
  if (range) {
    lines.splice(range.start, range.end - range.start, ...(replacement ?? []));
    return lines.join("\n");
  }
  if (!replacement) return yaml;
  return [...lines, ...replacement].join("\n");
}

function readTags(yaml: string): string[] {
  const lines = yaml.split("\n");
  const range = findKeyRange(lines, "tags");
  if (!range) return [];
  const inline = range.header.match(/^\[(.*)\]$/);
  if (inline) return inline[1].split(",").map(unquote).filter(Boolean);
  return lines
    .slice(range.start + 1, range.end)
    .map((l) => l.match(/^[ \t]+-[ \t]+(.+)$/)?.[1] ?? "")
    .map(unquote)
    .filter(Boolean);
}

export function parseDocFrontmatter(raw: string): ParsedDocFrontmatter {
  const norm = normalizeLf(raw);
  const match = norm.match(FM_RE);
  if (!match) {
    return { hasFrontmatter: false, yaml: null, body: norm, title: "", summary: "", type: "knowledge", tags: [], visibility: "public", published: undefined, series: "", seriesOrder: null, hall: "", domain: "" };
  }
  const yaml = match[1];
  const rawPub = readScalar(yaml, "published");
  const published = rawPub === "false" ? false : rawPub === "true" ? true : undefined;
  const rawOrder = readScalar(yaml, "seriesOrder");
  const orderNum = rawOrder !== undefined && rawOrder !== "" ? Number(rawOrder) : NaN;
  return {
    hasFrontmatter: true, yaml, body: match[2].replace(/^\n/, ""),
    title: readScalar(yaml, "title") ?? "", summary: readScalar(yaml, "summary") ?? "",
    type: readScalar(yaml, "type") ?? "knowledge", tags: readTags(yaml),
    visibility: resolveVisibility({ visibility: readScalar(yaml, "visibility"), published }), published,
    series: readScalar(yaml, "series") ?? "", seriesOrder: Number.isFinite(orderNum) ? orderNum : null,
    hall: readScalar(yaml, "hall") ?? "", domain: readScalar(yaml, "domain") ?? "",
  };
}

export function updateDocFrontmatter(raw: string, patch: FrontmatterPatch): string {
  const parsed = parseDocFrontmatter(raw);
  const nextBody = patch.body !== undefined ? sanitizeMarkdownBody(patch.body) : parsed.body;
  let yaml = parsed.yaml;
  const hasMeta = patch.title !== undefined || patch.summary !== undefined || patch.type !== undefined || patch.visibility !== undefined || patch.tags !== undefined || patch.updated !== undefined || patch.series !== undefined || patch.seriesOrder !== undefined;
  if (yaml === null) {
    if (!hasMeta) return nextBody;
    yaml = `title: ${quote(patch.title ?? "")}`;
  }
  if (patch.title !== undefined) yaml = replaceKeyLines(yaml, "title", [`title: ${quote(patch.title)}`]);
  if (patch.summary !== undefined) yaml = replaceKeyLines(yaml, "summary", [`summary: ${quote(patch.summary)}`]);
  if (patch.type !== undefined) yaml = replaceKeyLines(yaml, "type", [`type: ${patch.type.trim() || "knowledge"}`]);
  if (patch.updated !== undefined) yaml = replaceKeyLines(yaml, "updated", [`updated: ${patch.updated}`]);
  if (patch.tags !== undefined) yaml = replaceKeyLines(yaml, "tags", [`tags: [${patch.tags.map(quote).join(", ")}]`]);
  if (patch.series !== undefined) yaml = replaceKeyLines(yaml, "series", patch.series ? [`series: ${quote(patch.series)}`] : null);
  if (patch.seriesOrder !== undefined) yaml = replaceKeyLines(yaml, "seriesOrder", patch.seriesOrder !== null && Number.isFinite(patch.seriesOrder) ? [`seriesOrder: ${patch.seriesOrder}`] : null);
  if (patch.visibility !== undefined) yaml = replaceKeyLines(replaceKeyLines(yaml, "published", null), "visibility", [`visibility: ${patch.visibility}`]);
  return `---\n${yaml.trimEnd()}\n---\n\n${nextBody}`;
}

/** 一键发布前自动转正：将 draft（或旧 published: false）升级为 visibility: public 并补齐 updated/summary。 */
export function promoteDraftForPublish(raw: string, slug: string, today = new Date().toISOString().slice(0, 10)): { raw: string; changed: boolean } {
  const parsed = parseDocFrontmatter(raw);
  if (!parsed.hasFrontmatter || parsed.visibility === "private") return { raw, changed: false };
  const patch: FrontmatterPatch = {};
  if (parsed.visibility === "draft" || parsed.published === false) { patch.visibility = "public"; patch.updated = today; }
  if (parsed.title !== parsed.title.trim()) patch.title = parsed.title.trim();
  if (parsed.series !== parsed.series.trim()) patch.series = parsed.series.trim();
  if (!parsed.summary.trim()) patch.summary = `${parsed.title.trim() || slug} · ${slug}`;
  else if (parsed.summary !== parsed.summary.trim()) patch.summary = parsed.summary.trim();
  if (Object.keys(patch).length === 0) return { raw, changed: false };
  const next = updateDocFrontmatter(raw, patch);
  return { raw: next, changed: next !== normalizeLf(raw) };
}

/** 计算同系列下一篇顺序号（兼容无 seriesOrder 的旧文章，支持为当前篇重设系列时排除自身）。 */
export function computeNextSeriesOrder(
  items: ReadonlyArray<{ slug?: string; series?: string; seriesOrder?: number | null }>,
  seriesName: string,
  current?: { slug?: string; series?: string; seriesOrder?: number | null },
  excludeCurrentSlug = false,
): number {
  const key = seriesName.trim();
  if (!key) return 1;
  let maxOrder = !excludeCurrentSlug && current?.series?.trim() === key && current.seriesOrder != null ? current.seriesOrder : 0;
  for (const entry of items) {
    if (excludeCurrentSlug && current?.slug && entry.slug === current.slug) continue;
    if ((entry.series?.trim() ?? "") === key) maxOrder = Math.max(maxOrder, entry.seriesOrder ?? 1);
  }
  return maxOrder + 1;
}

/** 根据标题生成不与现有文章冲突的 slug（ContentListPage 与续写弹窗共用）。 */
export function autoSlug(text: string, existing?: ReadonlySet<string>): string {
  const dm = text.match(/\b(20\d{2})[-_./]?(\d{1,2})[-_./]?(\d{1,2})\b/);
  const latin = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").trim().replace(/\s+/g, "-");
  const base = isValidContentSlug(latin) ? latin : dm ? `${dm[1]}-${dm[2].padStart(2, "0")}-${dm[3].padStart(2, "0")}-note` : `post-${new Date().toISOString().slice(0, 10)}`;
  if (!existing?.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** 构造新建/续写草稿：新建为空正文，续写自动继承 series/hall/type 并在正文首行预埋 [[sourceSlug]]，不写 related。 */
export function buildContinuationDraft(input: {
  title: string; slug: string; sourceSlug?: string; sourceTitle?: string;
  type?: string; hall?: string; domain?: string; series?: string; seriesOrder?: number | null; today?: string;
}): string {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const title = sanitizeInlineText(input.title).trim();
  const series = sanitizeInlineText(input.series ?? "").trim();
  const lines = [
    "---", `title: ${quote(title)}`, `date: ${today}`, `updated: ${today}`, `type: ${input.type?.trim() || "knowledge"}`,
    "form: note", `domain: ${input.domain?.trim() || "thinking"}`, "intent: clarify", "valueMode: insight",
    ...(input.hall?.trim() ? [`hall: ${input.hall.trim()}`] : []),
    ...(series ? [`series: ${quote(series)}`, ...(input.seriesOrder != null && Number.isFinite(input.seriesOrder) ? [`seriesOrder: ${input.seriesOrder}`] : [])] : []),
    `summary: ${quote(`${title} · ${input.slug}`)}`, "visibility: draft",
    "aiUsePolicy:", "  level: AI-2", "  readable: true", "  citable: true", "  actionable: false", "---", "",
    ...(input.sourceSlug ? [`承接自 [[${input.sourceSlug}|${sanitizeInlineText(input.sourceTitle ?? "").trim() || input.sourceSlug}]]。`, ""] : []),
    "",
  ];
  return lines.join("\n");
}
