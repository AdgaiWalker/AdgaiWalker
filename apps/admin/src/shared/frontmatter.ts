import { resolveVisibility, type ContentVisibility } from "@walker/shared";

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
}

export interface FrontmatterPatch {
  title?: string;
  summary?: string;
  type?: string;
  visibility?: ContentVisibility;
  tags?: string[];
  updated?: string;
  body?: string;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/;
const BLOCK_SCALAR_RE = /^([>|])([+-])?\d*$/;

function unquote(v: string): string {
  const s = v.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

const quote = (v: string) => `"${v.replace(/\r?\n/g, " ").trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

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
  const norm = raw.replace(/\r\n/g, "\n");
  const match = norm.match(FM_RE);
  if (!match) return { hasFrontmatter: false, yaml: null, body: norm, title: "", summary: "", type: "knowledge", tags: [], visibility: "public", published: undefined };
  const yaml = match[1];
  const rawPub = readScalar(yaml, "published");
  const published = rawPub === "false" ? false : rawPub === "true" ? true : undefined;
  return {
    hasFrontmatter: true,
    yaml,
    body: match[2].replace(/^\n/, ""),
    title: readScalar(yaml, "title") ?? "",
    summary: readScalar(yaml, "summary") ?? "",
    type: readScalar(yaml, "type") ?? "knowledge",
    tags: readTags(yaml),
    visibility: resolveVisibility({ visibility: readScalar(yaml, "visibility"), published }),
    published,
  };
}

export function updateDocFrontmatter(raw: string, patch: FrontmatterPatch): string {
  const parsed = parseDocFrontmatter(raw);
  const nextBody = patch.body !== undefined ? patch.body.replace(/\r\n/g, "\n") : parsed.body;
  let yaml = parsed.yaml;
  const hasMeta = patch.title !== undefined || patch.summary !== undefined || patch.type !== undefined || patch.visibility !== undefined || patch.tags !== undefined || patch.updated !== undefined;
  if (yaml === null) {
    if (!hasMeta) return nextBody;
    yaml = `title: ${quote(patch.title ?? "")}`;
  }
  if (patch.title !== undefined) yaml = replaceKeyLines(yaml, "title", [`title: ${quote(patch.title)}`]);
  if (patch.summary !== undefined) yaml = replaceKeyLines(yaml, "summary", [`summary: ${quote(patch.summary)}`]);
  if (patch.type !== undefined) yaml = replaceKeyLines(yaml, "type", [`type: ${patch.type.trim() || "knowledge"}`]);
  if (patch.updated !== undefined) yaml = replaceKeyLines(yaml, "updated", [`updated: ${patch.updated}`]);
  if (patch.tags !== undefined) yaml = replaceKeyLines(yaml, "tags", [`tags: [${patch.tags.map(quote).join(", ")}]`]);
  if (patch.visibility !== undefined) {
    yaml = replaceKeyLines(replaceKeyLines(yaml, "published", null), "visibility", [`visibility: ${patch.visibility}`]);
  }
  return `---\n${yaml.trimEnd()}\n---\n\n${nextBody}`;
}

/** 一键发布前自动转正：将 draft（或旧 published: false）升级为 visibility: public 并补齐 updated/summary。 */
export function promoteDraftForPublish(raw: string, slug: string, today = new Date().toISOString().slice(0, 10)): { raw: string; changed: boolean } {
  const parsed = parseDocFrontmatter(raw);
  if (!parsed.hasFrontmatter) return { raw, changed: false };
  const patch: FrontmatterPatch = {};
  if (parsed.visibility === "draft" || parsed.published === false) { patch.visibility = "public"; patch.updated = today; }
  if (!parsed.summary.trim()) patch.summary = `${parsed.title || slug} · ${slug}`;
  if (Object.keys(patch).length === 0) return { raw, changed: false };
  const next = updateDocFrontmatter(raw, patch);
  return { raw: next, changed: next !== raw.replace(/\r\n/g, "\n") };
}
