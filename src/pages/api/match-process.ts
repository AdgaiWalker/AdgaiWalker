import type { APIRoute } from 'astro';

import { processPendingDemandEvents } from '@/agent/insight';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function isAuthorized(request: Request): boolean {
  const secrets = [
    import.meta.env.MATCH_PROCESS_SECRET,
    import.meta.env.CRON_SECRET,
  ].filter((secret): secret is string => Boolean(secret));
  if (secrets.length === 0) return !import.meta.env.PROD;

  const headerSecret = request.headers.get('x-match-process-secret');
  const bearerSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return secrets.includes(headerSecret ?? '') || secrets.includes(bearerSecret ?? '');
}

function readLimitFromUrl(request: Request): number {
  const value = new URL(request.url).searchParams.get('limit');
  const limit = value ? Number(value) : DEFAULT_LIMIT;
  return Number.isFinite(limit)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)))
    : DEFAULT_LIMIT;
}

async function readLimitFromBody(request: Request): Promise<number> {
  try {
    const body = await request.json().catch(() => ({})) as { limit?: unknown };
    if (typeof body.limit === 'number' && Number.isFinite(body.limit)) {
      return Math.max(1, Math.min(MAX_LIMIT, Math.floor(body.limit)));
    }
  } catch {
    return DEFAULT_LIMIT;
  }
  return DEFAULT_LIMIT;
}

async function runProcess(limit: number): Promise<Response> {
  const result = await processPendingDemandEvents(limit);
  return jsonResponse(result);
}

export const GET: APIRoute = async ({ request }) => {
  if (!isAuthorized(request)) {
    return jsonResponse({ error: '无权处理选题批任务，请配置 MATCH_PROCESS_SECRET 或 CRON_SECRET。' }, 401);
  }

  return runProcess(readLimitFromUrl(request));
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthorized(request)) {
    return jsonResponse({ error: '无权处理选题批任务，请配置 MATCH_PROCESS_SECRET 或 CRON_SECRET。' }, 401);
  }

  return runProcess(await readLimitFromBody(request));
};
