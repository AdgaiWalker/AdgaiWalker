import { describe, expect, it } from "vitest";
import { parseDocFrontmatter, promoteDraftForPublish, updateDocFrontmatter } from "./frontmatter";

const SAMPLE = [
  "---",
  'title: "旧标题"',
  "date: 2026-11-23",
  "updated: 2026-11-23",
  "type: knowledge",
  "form: note",
  "domain: thinking",
  "intent: clarify",
  "valueMode: insight",
  'summary: "旧摘要"',
  "tags:",
  "  - 设计",
  "  - 极简",
  "visibility: draft",
  "aiUsePolicy:",
  "  level: AI-2",
  "  readable: true",
  "---",
  "",
  "# 正文第一段",
  "",
  "内容",
].join("\n");

describe("frontmatter 剥离与无损回写", () => {
  it("正确拆分标题、摘要、标签、可见性与正文，且不含原始 YAML 墙", () => {
    const doc = parseDocFrontmatter(SAMPLE);
    expect(doc.hasFrontmatter).toBe(true);
    expect(doc.title).toBe("旧标题");
    expect(doc.summary).toBe("旧摘要");
    expect(doc.tags).toEqual(["设计", "极简"]);
    expect(doc.visibility).toBe("draft");
    expect(doc.body).toBe("# 正文第一段\n\n内容");
  });

  it("更新标题与正文时完整保留未知 YAML 字段（aiUsePolicy/form/domain）", () => {
    const next = updateDocFrontmatter(SAMPLE, { title: "新标题", body: "新正文" });
    expect(next).toContain('title: "新标题"');
    expect(next).toContain("form: note");
    expect(next).toContain("  level: AI-2");
    expect(next.endsWith("\n\n新正文")).toBe(true);
  });

  it("一键发布自动转正 draft / 旧 published: false 为 visibility: public，且不碰 private", () => {
    const promoted = promoteDraftForPublish(SAMPLE, "demo-slug", "2026-11-24");
    expect(promoted.changed).toBe(true);
    expect(promoted.raw).toContain("visibility: public");
    expect(promoted.raw).toContain("updated: 2026-11-24");
    expect(promoted.raw).not.toContain("published:");

    const legacy = "---\ntitle: 旧文\nsummary: 已有摘要\nvisibility: public\npublished: false\n---\n\n正文";
    const legacyFixed = promoteDraftForPublish(legacy, "old-post", "2026-11-24");
    expect(legacyFixed.changed).toBe(true);
    expect(legacyFixed.raw).not.toContain("published: false");

    const priv = "---\ntitle: 私密\nsummary: 隐私\nvisibility: private\n---\n\n私密正文";
    expect(promoteDraftForPublish(priv, "priv-post", "2026-11-24").changed).toBe(false);
  });
});
