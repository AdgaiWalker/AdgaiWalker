/**
 * 需求信号中心 — 四源聚合（纯 SQL/内存组装），分析 Run 委托现有 harness 适配器基建。
 * 语言原则：零比喻。管理侧接口，token 防线内（不在公网白名单）。
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  countFrequency,
  findContentGaps,
  normalizeForCounting,
  parseInsightReport,
  type ContentGapItem,
  type DemandSignal,
  type FrequencyItem,
  type InsightReportData,
} from '@walker/shared';
import { newId } from '../common/ids';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { SITE_CONTENT_INDEX, type SiteContentIndexPort } from '../ports/site-content-index.port';
import { buildDefaultRuntimeFactory } from '../adapters/harness-assistant.adapter';

const MAX_SIGNALS = 500;

export interface SignalsView {
  days: number;
  signals: DemandSignal[];
  frequency: FrequencyItem[];
  gaps: ContentGapItem[];
  contentTitles: { title: string; tags: string[] }[];
}

@Injectable()
export class InsightsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(SITE_CONTENT_INDEX)
    private readonly index: SiteContentIndexPort,
  ) {}

  async signalsView(days = 30): Promise<SignalsView> {
    const client = this.prisma.getClient();
    if (!client) throw new Error('storage-unavailable');
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const [assistantRuns, clues, misses, feedbacks] = await Promise.all([
      client.assistantRun.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: MAX_SIGNALS,
        select: { id: true, question: true, createdAt: true },
      }),
      client.clue.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: MAX_SIGNALS,
        select: { id: true, body: true, createdAt: true },
      }),
      client.searchMiss.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: MAX_SIGNALS,
        select: { id: true, query: true, createdAt: true },
      }),
      client.contentFeedback.findMany({
        where: { createdAt: { gte: since }, signal: 'needs-more' },
        orderBy: { createdAt: 'desc' },
        take: MAX_SIGNALS,
        select: { id: true, contentId: true, note: true, createdAt: true },
      }),
    ]);

    const signals: DemandSignal[] = [
      ...assistantRuns.map((r) => ({
        id: r.id,
        source: 'assistant' as const,
        text: r.question,
        createdAt: r.createdAt.toISOString(),
      })),
      ...clues.map((c) => ({
        id: c.id,
        source: 'intake' as const,
        text: c.body,
        createdAt: c.createdAt.toISOString(),
      })),
      ...misses.map((m) => ({
        id: m.id,
        source: 'search-miss' as const,
        text: m.query,
        createdAt: m.createdAt.toISOString(),
      })),
      ...feedbacks.map((f) => ({
        id: f.id,
        source: 'feedback' as const,
        text: f.note?.trim() || `「${f.contentId}」被标需补充`,
        contentId: f.contentId,
        createdAt: f.createdAt.toISOString(),
      })),
    ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const frequency = countFrequency(signals);

    // miss 频次 → 对照站内内容找缺口
    const missCount = new Map<string, { query: string; count: number }>();
    for (const m of misses) {
      const key = normalizeForCounting(m.query);
      if (!key) continue;
      const cur = missCount.get(key) ?? { query: m.query, count: 0 };
      cur.count += 1;
      missCount.set(key, cur);
    }
    let contentTitles: { title: string; tags: string[] }[] = [];
    try {
      contentTitles = (await this.index.loadCitable()).map((e) => ({
        title: e.title,
        tags: e.tags,
      }));
    } catch {
      contentTitles = [];
    }
    const gaps = findContentGaps([...missCount.values()], contentTitles);

    return { days, signals, frequency, gaps, contentTitles };
  }

  /** 分析 Run：读近 7 天四源信号 → harness 归纳 → 校验落库（手动触发） */
  async generateReport(): Promise<{
    id: string;
    weekOf: string;
    report: InsightReportData;
  }> {
    const view = await this.signalsView(7);
    const factory = buildDefaultRuntimeFactory();
    const client = this.prisma.getClient();
    if (!client) throw new Error('storage-unavailable');
    if (!factory) throw new Error('insight-runtime-unavailable');

    const uncovered = view.gaps.filter((g) => !g.covered).map((g) => g.query);
    const prompt = [
      '你是个人站 Walker 的需求分析师。站长想知道：访客到底在要什么，接下来该写什么、做什么。',
      '下面是近 7 天的四类需求信号（问了小影 / 卡口提问 / 搜索没找到 / 文章反馈）和站内已有内容清单。',
      '任务：',
      '1. themes：归纳需求主题（最多 6 个，按频次排序，每主题给代表问题原文）。',
      '2. gaps：哪些搜索词在站内没有对应内容（内容缺口，只从「未覆盖搜索词」中选）。',
      '3. suggestions：给站长的行动建议，每条标 kind：write=写文章 / build=做产品 / post=自媒体选题 / business=商业信号；每条附 evidence（依据的信号原文）。最多 6 条。',
      '4. summary：一段直白总结（150 字内），不要比喻，不要空话。',
      '语言要求：全程直白（需求/问题/内容/产品/变现），禁止使用内部代号或比喻。',
      '只输出一个 JSON 对象，格式：{"themes":[{"title":"","count":0,"examples":[""]}],"gaps":[""],"suggestions":[{"kind":"write","text":"","evidence":""}],"summary":""}',
      '',
      `高频问题榜：${JSON.stringify(view.frequency.slice(0, 15))}`,
      `未覆盖搜索词：${JSON.stringify(uncovered.slice(0, 15))}`,
      `全部信号（近 7 天，最多 ${view.signals.length} 条）：`,
      ...view.signals.slice(0, 120).map(
        (s) => `- [${s.source}] ${s.text.slice(0, 80)}`,
      ),
      '',
      `站内已有内容标题：`,
      ...view.contentTitles.slice(0, 30).map((c) => `- ${c.title}`),
    ].join('\n');

    const runtime = factory();
    let report: InsightReportData | null = null;
    try {
      const result = await runtime.run(prompt, {});
      report = parseInsightReport(result.finalResponse);
    } finally {
      await runtime.close().catch(() => {});
    }
    if (!report) throw new Error('insight-report-invalid');

    const weekOf = new Date().toISOString().slice(0, 10);
    const id = newId();
    const snapshot = JSON.stringify({
      signalCount: view.signals.length,
      frequency: view.frequency.slice(0, 15),
      uncovered,
    });
    await client.insightReport.create({
      data: { id, weekOf, inputSnapshot: snapshot, report: JSON.stringify(report) },
    });
    return { id, weekOf, report };
  }

  async listReports(limit = 10) {
    const client = this.prisma.getClient();
    if (!client) return [];
    const rows = await client.insightReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });
    return rows.map((r) => ({
      id: r.id,
      weekOf: r.weekOf,
      report: JSON.parse(r.report) as InsightReportData,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
