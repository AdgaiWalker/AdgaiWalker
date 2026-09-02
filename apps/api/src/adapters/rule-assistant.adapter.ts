/**
 * 规则兜底适配器 — AI 关闭 / 降级时的非空回答（PRD 非协商第 1 条）。
 * 无状态：热门推荐取内容索引前三条，出口引导卡口与邮箱。
 */
import { Inject, Injectable } from '@nestjs/common';
import type { AssistantRunResult } from '@walker/shared';
import type {
  AssistantAskInput,
  AssistantRunnerPort,
} from '../ports/assistant-runner.port';
import {
  SITE_CONTENT_INDEX,
  type SiteContentIndexPort,
} from '../ports/site-content-index.port';

@Injectable()
export class RuleAssistantAdapter implements AssistantRunnerPort {
  constructor(
    @Inject(SITE_CONTENT_INDEX) private readonly index: SiteContentIndexPort,
  ) {}

  async ask(input: AssistantAskInput): Promise<AssistantRunResult> {
    let entries: Awaited<ReturnType<SiteContentIndexPort['loadCitable']>> = [];
    try {
      entries = await this.index.loadCitable();
    } catch {
      entries = [];
    }
    const top = entries.slice(0, 3);
    const lines = [
      '（规则模式）站内助手当前未启用 AI，这段是固定回答。',
      '站主 duola：艺术生，在用 AI 解决真实问题；这个站是「知识库 → 工作站 → 回灌」的公开样板。',
    ];
    if (top.length) {
      lines.push(
        '可以先读：' +
          top.map((e) => `《${e.title}》/posts/${e.slug}`).join('；') +
          '。',
      );
    }
    lines.push('想拿具体下一步，去 /tools 描述卡点；联系站主：praxiswalker@gmail.com');
    return {
      answer: lines.join('\n'),
      citations: top.map((e) => ({ slug: e.slug })),
      sessionId:
        input.sessionId ?? `rule-${input.visitorKey}-${Date.now().toString(36)}`,
      aiUsedFlag: false,
      elapsedMs: 0,
    };
  }
}
