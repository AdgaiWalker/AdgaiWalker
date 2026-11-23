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
const unquote = (v: string) => {
  const s = v.trim();
  return (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")) ? s.slice(1, -1).replace(/\\"/g, '"') : s;
};
const quote = (v: string) => `"${v.replace(/\r?\n/g, " ").trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const readScalar = (yaml: string, key: string) => {
  const m = yaml.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
  return m ? unquote(m[1]) : undefined;
};
const setScalar = (yaml: string, key: string, val: string) => {
  const re = new RegExp(`^${key}:.*$`, "m");
  return re.test(yaml) ? yaml.replace(re, `${key}: ${val}`) : `${yaml.trimEnd()}\n${key}: ${val}`;
};
const removeKey = (yaml: string, key: string) => yaml.split("\n").filter((l) => !new RegExp(`^${key}:`).test(l)).join("\n");

function readTags(yaml: string): string[] {
  const inline = yaml.match(/^tags:[ \t]*\[(.*)\][ \t]*$/m);
  if (inline) return inline[1].split(",").map(unquote).filter(Boolean);
  const block = yaml.match(/^tags:[ \t]*\n((?:[ \t]+-[ \t]+.+\n?)*)/m);
  return block ? block[1].split("\n").map((l) => unquote(l.replace(/^[ \t]+-[ \t]+/, ""))).filter(Boolean) : [];
}

function setTags(yaml: string, tags: string[]): string {
  const formatted = `tags: [${tags.map(quote).join(", ")}]`;
  if (/^tags:[ \t]*\[.*\]/m.test(yaml)) return yaml.replace(/^tags:[ \t]*\[.*\][ \t]*$/m, formatted);
  if (/^tags:[ \t]*\n(?:[ \t]+-[ \t]+.+\n?)*/m.test(yaml)) return yaml.replace(/^tags:[ \t]*\n(?:[ \t]+-[ \t]+.+\n?)*/m, `${formatted}\n`);
  return `${yaml.trimEnd()}\n${formatted}`;
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
  if (patch.title !== undefined) yaml = setScalar(yaml, "title", quote(patch.title));
  if (patch.summary !== undefined) yaml = setScalar(yaml, "summary", quote(patch.summary));
  if (patch.type !== undefined) yaml = setScalar(yaml, "type", patch.type.trim() || "knowledge");
  if (patch.updated !== undefined) yaml = setScalar(yaml, "updated", patch.updated);
  if (patch.tags !== undefined) yaml = setTags(yaml, patch.tags);
  if (patch.visibility !== undefined) yaml = setScalar(removeKey(yaml, "published"), "visibility", patch.visibility);
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
