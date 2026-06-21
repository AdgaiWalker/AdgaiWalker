/**
 * POST/DELETE /api/admin/demo-scenario —— 仅开发环境的完整闭环演示数据。
 *
 * 只在本机开发环境可用；写入的数据带 demo 前缀并明确标注，不进入生产。
 */
import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { createWorkbenchService } from '@/services/workbench.service';
import {
  __deleteMemoryContentFeedbackByPrefix,
  __deleteMemoryWorkItemsByTitlePrefix,
  saveContentFeedback,
} from '@/conversation/store';
import type { ContentFeedbackEvent, EvidenceRef } from '@/stores/ports';

export const prerender = false;

const DEMO_PREFIX = 'demo_ux0_';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function isLoopback(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1';
}

function guard(request: Request): Response | null {
  if (!isAdmin(request)) return json({ ok: false, error: '未授权。' }, 401);
  if (!import.meta.env.DEV || !isLoopback(request)) {
    return json({ ok: false, error: '演示场景仅本机开发环境可用。' }, 404);
  }
  return null;
}

function demoEvidence(sourceId: string, summary: string): EvidenceRef {
  const now = new Date().toISOString();
  return {
    evidenceId: `${DEMO_PREFIX}ev_${sourceId}`,
    sourceType: 'content-feedback',
    sourceId,
    occurredAt: now,
    collectedAt: now,
    environment: 'development',
    visibility: 'owner',
    freshness: 'fresh',
    qualityStatus: 'verified-source',
    summary,
  };
}

export const POST: APIRoute = async ({ request }) => {
  const blocked = guard(request);
  if (blocked) return blocked;

  const now = new Date().toISOString();
  const feedbackId = `${DEMO_PREFIX}feedback`;
  const feedback: ContentFeedbackEvent = {
    feedbackId,
    contentId: 'side-hustle-blueprint',
    contentPath: '/posts/side-hustle-blueprint',
    signal: 'needs-more',
    note: '【模拟数据】读者希望补一个从想法到第一版行动的边界案例。',
    createdAt: now,
    environment: 'development',
    consentForAnalysis: true,
  };
  await saveContentFeedback(feedback);

  const service = createWorkbenchService();
  const proposal = await service.createProposal({
    queue: 'user-demand',
    title: '【模拟数据】补充副业蓝图边界案例',
    summary: '开发演示场景：从内容反馈进入改内容、记录 Outcome，再派生下一步。',
    priorityBand: 'now',
    priorityReasons: ['模拟数据：用于 UX0 端到端演示，不进入生产统计'],
    uncertainty: ['这是开发演示，不代表真实用户证据'],
    evidenceRefs: [demoEvidence(feedbackId, feedback.note ?? '模拟内容反馈')],
    requestDecision: true,
    actor: 'demo-scenario',
  });
  if (!proposal.ok || !proposal.data) return json({ ok: false, error: proposal.message, code: proposal.code }, 400);
  const workItemId = proposal.data.workItemId;
  const accepted = await service.decide(workItemId, {
    outcome: 'accepted',
    reason: '模拟演示：接受改内容任务',
    actor: 'demo-scenario',
  });
  if (!accepted.ok) return json({ ok: false, error: accepted.message, code: accepted.code }, 400);
  const action = await service.createAction(workItemId, {
    actionType: 'update-content',
    targetType: 'content',
    targetId: 'side-hustle-blueprint',
    expectedOutcome: '模拟验证：内容补充后记录一条 partial Outcome',
    actor: 'demo-scenario',
  });
  if (!action.ok) return json({ ok: false, error: action.message, code: action.code }, 400);

  return json({ ok: true, demo: true, workItemId, feedbackId, label: '模拟数据 · 可一键清理' }, 201);
};

export const DELETE: APIRoute = async ({ request }) => {
  const blocked = guard(request);
  if (blocked) return blocked;
  const workItems = __deleteMemoryWorkItemsByTitlePrefix('【模拟数据】');
  const feedback = __deleteMemoryContentFeedbackByPrefix(DEMO_PREFIX);
  return json({ ok: true, demo: true, deleted: { workItems, feedback } });
};
