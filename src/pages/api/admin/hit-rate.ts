import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { getRecentNeedCases, getTopicCandidates, findRecentContentFeedback } from '@/conversation/store';
import { getPublishedContentItems } from '@/knowledge/content';
import { buildContentOutcomeSummaries, calculateContentHitRates } from '@/services/hit-rate.service';
import type { ContentFeedbackEvent } from '@/stores/ports';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) return json({ error: '未授权。' }, 401);

  const [contents, topics, needCases, contentFeedback] = await Promise.all([
    getPublishedContentItems(),
    getTopicCandidates({ limit: 500 }),
    getRecentNeedCases(2000),
    findRecentContentFeedback(undefined, 2000),
  ]);

  // P1-C02：按内容 ID 预聚合内容反馈（独立于匹配反馈，不合并分母）
  const contentFeedbackByContent = new Map<string, ContentFeedbackEvent[]>();
  for (const fb of contentFeedback) {
    const list = contentFeedbackByContent.get(fb.contentId) ?? [];
    list.push(fb);
    contentFeedbackByContent.set(fb.contentId, list);
  }

  // 兼容旧命中率视图 + 新双信号结果分组（并列解释，不合并）
  const hitRates = calculateContentHitRates({ contents, topics, needCases });
  const outcomeSummaries = buildContentOutcomeSummaries({
    contents,
    topics,
    needCases,
    contentFeedbackByContent,
  });

  return json({
    hitRates,
    count: hitRates.length,
    // 新双信号分组：matchOutcome（需求匹配结果）与 contentOutcome（内容阅读结果）分开
    outcomeSummaries,
  });
};
