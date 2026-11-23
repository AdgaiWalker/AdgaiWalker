import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractSummaryFromRaw } from "@walker/shared";
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

const MULTILINE_SAMPLE = [
  "---",
  "title: 龙虾的核心价值",
  "summary: >-",
  "  第一行摘要内容，",
  "  第二行继续展开。",
  "related:",
  "  - foo",
  "visibility: public",
  "---",
  "",
  "正文段落",
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

  it("多行块标量（summary: >-）正确读出正文摘要，改写时不残留孤立缩进行", () => {
    const doc = parseDocFrontmatter(MULTILINE_SAMPLE);
    expect(doc.summary).toBe("第一行摘要内容， 第二行继续展开。");
    expect(extractSummaryFromRaw(MULTILINE_SAMPLE)).toBe("第一行摘要内容， 第二行继续展开。");

    const updated = updateDocFrontmatter(MULTILINE_SAMPLE, { summary: "更新后的一句话摘要" });
    expect(updated).toContain('summary: "更新后的一句话摘要"');
    expect(updated).not.toContain("第一行摘要内容");
    expect(updated).not.toContain("第二行继续展开");
    expect(updated).toContain("related:\n  - foo");
    expect(parseDocFrontmatter(updated).summary).toBe("更新后的一句话摘要");
  });

  it("真实全仓回归：content/log/*.md 全部文章均可无损解析且改写摘要不破坏 YAML", () => {
    const dir = path.resolve(process.cwd(), "../../content/log");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const parsed = parseDocFrontmatter(raw);
      expect(parsed.hasFrontmatter, file).toBe(true);
      expect(parsed.summary, file).not.toBe(">-");
      expect(parsed.summary, file).not.toBe("|");
      expect(extractSummaryFromRaw(raw), file).not.toBe(">-");
      const edited = updateDocFrontmatter(raw, { title: parsed.title, summary: parsed.summary, tags: parsed.tags });
      const reparsed = parseDocFrontmatter(edited);
      expect(reparsed.title, file).toBe(parsed.title);
      expect(reparsed.summary, file).toBe(parsed.summary);
      expect(reparsed.tags, file).toEqual(parsed.tags);
    }
  });

  it("更新标题与正文时完整保留未知 YAML 字段（aiUsePolicy/form/domain）", () => {
    const next = updateDocFrontmatter(SAMPLE, { title: "新标题", body: "新正文" });
    expect(next).toContain('title: "新标题"');
    expect(next).toContain("form: note");
    expect(next).toContain("  level: AI-2");
    expect(next.endsWith("\n\n新正文")).toBe(true);
  });

  it("输入标题与摘要时绝不吞掉尾随空格，并在发布时自动修剪首尾多余空白", () => {
    const typingTitle = updateDocFrontmatter(SAMPLE, { title: "AI " });
    expect(parseDocFrontmatter(typingTitle).title).toBe("AI ");
    const fullTitle = updateDocFrontmatter(typingTitle, { title: 'AI "极简" 时代 ' });
    expect(parseDocFrontmatter(fullTitle).title).toBe('AI "极简" 时代 ');

    const typingSummary = updateDocFrontmatter(fullTitle, { summary: "一句话 " });
    expect(parseDocFrontmatter(typingSummary).summary).toBe("一句话 ");

    const promoted = promoteDraftForPublish(typingSummary, "demo-slug", "2026-11-24");
    expect(parseDocFrontmatter(promoted.raw).title).toBe('AI "极简" 时代');
    expect(parseDocFrontmatter(promoted.raw).summary).toBe("一句话");
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

    const priv = "---\ntitle: 私密 \nsummary: \nvisibility: private\n---\n\n私密正文";
    expect(promoteDraftForPublish(priv, "priv-post", "2026-11-24").changed).toBe(false);
  });
});
