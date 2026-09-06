/**
 * AI nextStep 策略 — 访客卡点 → AgentRunner 产出结构化建议。
 * 红线执行：
 * - AI_ENABLED≠true 直接走规则版（AI 可关，关 AI 时 nextStep 仍非空）
 * - runner 超时/异常/输出不合契约 → 规则兜底，aiUsedFlag=false
 * - 推荐文章只来自内容索引（readable+citable），AI 原文里的 slug 不在集合内即丢弃
 */
import { Injectable } from '@nestjs/common';
import { parseAiNextStepOutput } from '@walker/shared';
import type { AppConfigPort } from '../config/config.port';
import {
  AGENT_RUNNER,
  type AgentRunnerPort,
} from '../ports/agent-runner.port';
import {
  type NextStepResult,
  type NextStepStrategyPort,
} from '../ports/nextstep.port';
import {
  SITE_CONTENT_INDEX,
  type SiteContentIndexEntry,
  type SiteContentIndexPort,
} from '../ports/site-content-index.port';
import { RuleNextStepAdapter } from './rule-nextstep.adapter';

/** 访客同步等待，AI 链路必须在这个预算内出结果，超时降级规则 */
export const AI_NEXT_STEP_TIMEOUT_MS = 15_000;

export function buildAiNextStepPrompt(
  body: string,
  entries: readonly SiteContentIndexEntry[],
): string {
  const lines = entries.map(
    (e) =>
      `- ${e.slug}｜${e.title}${e.actionable ? '｜可整理为行动步骤' : ''}${e.summary ? `｜${e.summary}` : ''}${e.tags.length ? `｜#${e.tags.join(' #')}` : ''}`,
  );
  return [
    '你是个人站 Walker 的卡口助手。访客描述了自己的卡点，你要给出一个最小、可执行的下一步。',
    '规则：',
    '1. nextStep 是一句口语化的具体行动指令，不超过 120 字，不空泛、不列清单。',
    '2. 只有当某篇「可引用内容」确实对准卡点时，才把它的 slug 填进 suggestedSlug；至多一篇；没有就填 null，不要硬推。',
    '3. bucketId 必须是 learn-ai / writing / coding / form / productivity / default 之一。',
    '4. 只输出一个 JSON 对象，不要输出其它内容：{"bucketId":"...","nextStep":"...","suggestedSlug":null}',
    lines.length ? '可引用内容（仅限以下条目可推荐）：' : '（本站暂无可引用内容，suggestedSlug 必须为 null）',
    ...lines,
    `访客卡点：${body}`,
  ].join('\n');
}

@Injectable()
export class AiNextStepAdapter implements NextStepStrategyPort {
  constructor(
    private readonly config: AppConfigPort,
    private readonly runner: AgentRunnerPort,
    private readonly index: SiteContentIndexPort,
    private readonly fallback: NextStepStrategyPort = new RuleNextStepAdapter(),
    private readonly timeoutMs: number = AI_NEXT_STEP_TIMEOUT_MS,
  ) {}

  async generate(body: string): Promise<NextStepResult> {
    if (!this.config.isAiEnabled()) {
      return this.fallback.generate(body);
    }
    // 索引不可用时带空包继续：通用建议仍可用，slug 推荐自动失效
    let entries: SiteContentIndexEntry[] = [];
    try {
      entries = await this.index.loadCitable();
    } catch {
      entries = [];
    }
    const citableSlugs = new Set(entries.map((e) => e.slug));
    try {
      const run = await this.runner.run({
        prompt: buildAiNextStepPrompt(body, entries),
        cwd: process.cwd(),
        timeoutMs: this.timeoutMs,
      });
      const parsed = parseAiNextStepOutput(run.output, citableSlugs);
      if (!parsed) return this.fallback.generate(body);
      const suggested = entries.find((e) => e.slug === parsed.suggestedSlug);
      return {
        nextStep: parsed.nextStep,
        bucketId: parsed.bucketId,
        aiUsedFlag: true,
        suggestedSlug: parsed.suggestedSlug,
        suggestedTitle: suggested?.title ?? null,
      };
    } catch (error) {
      // 降级原因落日志（AI 可用率排查；失败如实，不假装 AI）
      console.error('[nextstep] AI 降级：', error instanceof Error ? error.message : error);
      return this.fallback.generate(body);
    }
  }
}
