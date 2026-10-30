import { RequestMethod } from '@nestjs/common';

export type PublicRoute = { path: string; method: RequestMethod };
const METHOD_NAMES = new Map<RequestMethod, string>([
  [RequestMethod.GET, 'GET'], [RequestMethod.POST, 'POST'], [RequestMethod.PUT, 'PUT'],
  [RequestMethod.PATCH, 'PATCH'], [RequestMethod.DELETE, 'DELETE'], [RequestMethod.OPTIONS, 'OPTIONS'],
  [RequestMethod.HEAD, 'HEAD'], [RequestMethod.ALL, 'ALL'],
]);

/** 唯一的 Nest 公共方法/路径列表；Caddyfile 和 readiness 都与它对照。 */
export const PUBLIC_ROUTE_EXCLUSIONS: PublicRoute[] = [
  { path: 'health', method: RequestMethod.GET },
  { path: 'assistant/placements/:placementKey/:scopeSlug', method: RequestMethod.GET },
  { path: 'assistant/conversations/:placementKey/:scopeSlug', method: RequestMethod.GET },
  { path: 'assistant/conversations/:placementKey/:scopeSlug/stop', method: RequestMethod.POST },
  { path: 'intake', method: RequestMethod.POST },
  { path: 'intake/config', method: RequestMethod.GET },
  { path: 'assistant', method: RequestMethod.POST },
  { path: 'assistant/stream', method: RequestMethod.POST },
  { path: 'assistant/messages/:messageId/ack', method: RequestMethod.POST },
  { path: 'assistant/events', method: RequestMethod.POST },
  { path: 'likes', method: RequestMethod.GET },
  { path: 'likes', method: RequestMethod.POST },
  { path: 'content-feedback', method: RequestMethod.POST },
  { path: 'search-events', method: RequestMethod.POST },
];

export type PublicRouteParity = { matches: boolean; missingFromCaddy: string[]; extraInCaddy: string[] };

export function compareCaddyPublicRoutes(source: string): PublicRouteParity {
  const marker = '# Private owner surface';
  const boundary = source.indexOf(marker);
  if (boundary < 0) throw new Error('caddy-private-surface-boundary-missing');
  const section = source.slice(0, boundary);
  const actual = new Set<string>();
  for (const [, , block] of section.matchAll(/@([a-zA-Z0-9_]+)\s*\{([^}]*)\}/g)) {
    const methods = block.match(/^\s*method\s+(.+)$/m)?.[1]?.trim().split(/\s+/) ?? [];
    const paths = block.match(/^\s*path\s+(.+)$/m)?.[1]?.trim().split(/\s+/) ?? [];
    if (!methods.length || !paths.length) continue;
    for (const method of methods) for (const routePath of paths) actual.add(`${method} ${normalizePath(routePath)}`);
  }
  const expected = new Set(PUBLIC_ROUTE_EXCLUSIONS.map(routeSignature));
  const missingFromCaddy = [...expected].filter((route) => !actual.has(route)).sort();
  const extraInCaddy = [...actual].filter((route) => !expected.has(route)).sort();
  return { matches: missingFromCaddy.length === 0 && extraInCaddy.length === 0, missingFromCaddy, extraInCaddy };
}

export function routeSignature(route: PublicRoute): string {
  const method = METHOD_NAMES.get(route.method);
  if (!method) throw new Error('public-route-method-unsupported');
  return `${method} ${normalizePath(route.path)}`;
}

function normalizePath(value: string): string {
  return value.replace(/^\/+|\/+$/g, '').split('/').map((segment) =>
    segment.startsWith(':') || segment === '*' ? '*' : segment,
  ).join('/');
}
