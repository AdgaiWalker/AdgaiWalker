/**
 * GET /api/admin/workbench —— 工作台今日投影 / 列表查询（P0-C02）
 *
 * 查询参数：
 *   view=today|decisions|actions|outcomes  （默认 today）
 *   queue=user-demand|walker-thesis|system-event|ai-asset
 *   status=<WorkItemStatus> 或逗号分隔多个
 *   limit=数字（1..100，默认 30）
 *
 * admin only；Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';

import { isAdminAsync } from '@/lib/admin-auth';
import { createWorkbenchService, suggestNextAction } from '@/services/workbench.service';
import { createSessionStore } from '@/stores/session.store';
import type { WorkItem, WorkItemQueue, WorkItemStatus } from '@/stores/ports';

export const prerender = false;

const sessionStore = createSessionStore();

const VALID_QUEUES: WorkItemQueue[] = ['user-demand', 'walker-thesis', 'system-event', 'ai-asset'];
const VALID_STATUSES: WorkItemStatus[] = [
  'proposal', 'pending', 'accepted', 'rejected', 'paused',
  'acting', 'awaiting-verification', 'resolved',
];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function summarizeActiveItems(items: WorkItem[]) {
  return {
    total: items.length,
    proposal: items.filter(item => item.status === 'proposal').length,
    pending: items.filter(item => item.status === 'pending').length,
    accepted: items.filter(item => item.status === 'accepted').length,
    acting: items.filter(item => item.status === 'acting').length,
    awaitingVerification: items.filter(item => item.status === 'awaiting-verification').length,
    paused: items.filter(item => item.status === 'paused').length,
  };
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);

  const view = url.searchParams.get('view') ?? 'today';
  const queueParam = url.searchParams.get('queue');
  const statusParam = url.searchParams.get('status');
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 30)));

  const queue = queueParam && VALID_QUEUES.includes(queueParam as WorkItemQueue)
    ? (queueParam as WorkItemQueue)
    : undefined;

  const statusList = statusParam
    ? statusParam.split(',').filter((s): s is WorkItemStatus => VALID_STATUSES.includes(s as WorkItemStatus))
    : undefined;
  const status = statusList && statusList.length > 0
    ? (statusList.length === 1 ? statusList[0] : statusList)
    : undefined;

  const service = createWorkbenchService();

  // view 决定默认过滤
  if (view === 'decisions') {
    const items = await service.list({
      queue,
      status: status ?? ['proposal', 'pending', 'accepted', 'rejected', 'paused'],
      limit,
    });
    return json({ view, items });
  }
  if (view === 'actions') {
    const items = await service.list({
      queue,
      status: status ?? ['accepted', 'acting', 'awaiting-verification'],
      limit,
    });
    return json({ view, items });
  }
  if (view === 'outcomes') {
    const items = await service.list({
      queue,
      status: status ?? ['resolved'],
      limit,
    });
    // P1-E02：为每个已记录结果的 WorkItem 附带下一步候选动作建议（不自动执行）
    const withSuggestions = items.map(item => {
      const latestOutcome = item.outcomes[item.outcomes.length - 1];
      const nextSuggestion = latestOutcome
        ? suggestNextAction({ result: latestOutcome.result, outcomeSummary: latestOutcome.summary })
        : null;
      return { ...item, nextSuggestion };
    });
    return json({ view, items: withSuggestions });
  }

  // 默认 today：活跃事项（非终态）。附带真实计数与前三项重点，未知时前端不应显示 0 冒充清空。
  const items = await service.getTodayProjection({ limit });
  const focusItems = items.slice(0, 3);
  return json({
    view: 'today',
    items,
    focusItems,
    backlogCount: Math.max(0, items.length - focusItems.length),
    counts: summarizeActiveItems(items),
  });
};
