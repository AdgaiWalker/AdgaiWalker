import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractSummaryFromRaw } from "@walker/shared";
import {
  autoSlug,
  buildContinuationDraft,
  computeNextSeriesOrder,
  parseDocFrontmatter,
  promoteDraftForPublish,
  updateDocFrontmatter,
} from "./frontmatter";

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

  it("支持读写与清空 series / seriesOrder，且仅在编辑正文时清洗 \\u2028/\\u2029", () => {
    const legacyWithLineSep = "---\ntitle: 旧文\nsummary: 摘要\n---\n\n第一行\u2028第二行\u2029第三行";
    // 读取阶段不改动原正文，避免打开历史文章误变脏
    expect(parseDocFrontmatter(legacyWithLineSep).body).toContain("\u2028");

    const updated = updateDocFrontmatter(SAMPLE, {
      series: "设计思考",
      seriesOrder: 3,
      body: "行一\u2028行二\u2029行三",
    });
    const parsed = parseDocFrontmatter(updated);
    expect(parsed.series).toBe("设计思考");
    expect(parsed.seriesOrder).toBe(3);
    expect(parsed.body).toBe("行一\n行二\n行三");

    const cleared = updateDocFrontmatter(updated, { series: "", seriesOrder: null });
    expect(cleared).not.toContain("series:");
    expect(cleared).not.toContain("seriesOrder:");
    expect(parseDocFrontmatter(cleared).series).toBe("");
    expect(parseDocFrontmatter(cleared).seriesOrder).toBeNull();
  });

  it("autoSlug 自动避重，buildContinuationDraft 继承系列与厅并在开头预埋双链（不写 related）", () => {
    const existing = new Set(["design-principles"]);
    expect(autoSlug("Design Principles", existing)).toBe("design-principles-2");
    expect(
      computeNextSeriesOrder(
        [{ slug: "a", series: "设计思考", seriesOrder: 1 }, { slug: "b", series: "设计思考", seriesOrder: 2 }],
        "设计思考",
      ),
    ).toBe(3);
    expect(
      computeNextSeriesOrder(
        [{ slug: "a", series: "设计思考", seriesOrder: 1 }, { slug: "b", series: "设计思考", seriesOrder: 2 }],
        "设计思考",
        { slug: "b" },
        true,
      ),
    ).toBe(2);
    expect(computeNextSeriesOrder([{ series: "其他", seriesOrder: 4 }], "新系列")).toBe(1);

    const withSeries = buildContinuationDraft({
      title: "设计原则 0–5",
      slug: "design-principles",
      sourceSlug: "design-for-people",
      sourceTitle: "设计为人与内容搭桥",
      type: "knowledge",
      hall: "lab",
      domain: "product",
      series: "设计思考",
      seriesOrder: 3,
      today: "2026-11-24",
    });
    expect(withSeries).toContain('series: "设计思考"');
    expect(withSeries).toContain("seriesOrder: 3");
    expect(withSeries).toContain("hall: lab");
    expect(withSeries).toContain("承接自 [[design-for-people|设计为人与内容搭桥]]。");
    expect(withSeries).not.toContain("related:");

    const withoutSeries = buildContinuationDraft({
      title: "独立续篇",
      slug: "next-note",
      sourceSlug: "old-note",
      sourceTitle: "旧笔记",
      today: "2026-11-24",
    });
    expect(withoutSeries).not.toContain("series:");
    expect(withoutSeries).not.toContain("seriesOrder:");
    expect(withoutSeries).toContain("承接自 [[old-note|旧笔记]]。");
  });
});
