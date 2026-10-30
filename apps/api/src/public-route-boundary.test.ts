import fs from 'node:fs';
import path from 'node:path';
import { type MiddlewareConsumer } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { AdminTokenMiddleware } from './auth/admin-token.middleware';
import { compareCaddyPublicRoutes, routeSignature, type PublicRoute } from './auth/public-route-contract';
import { SameOriginMiddleware } from './auth/same-origin.middleware';

type Configuration = { middleware: Function[]; excluded: PublicRoute[]; routes: unknown[] };

const REQUIRED_PUBLIC_ROUTES = [
  'GET health',
  'GET assistant/placements/*/*',
  'GET assistant/conversations/*/*',
  'GET likes',
  'POST intake',
  'GET intake/config',
  'POST assistant',
  'POST assistant/stream',
  'POST assistant/events',
  'POST assistant/messages/*/ack',
  'POST assistant/conversations/*/*/stop',
  'POST likes',
  'POST content-feedback',
  'POST search-events',
];

function appRoutes(): { public: string[]; sameOriginGlobal: boolean; adminProtectedAllRoutes: boolean } {
  const configurations: Configuration[] = [];
  const consumer = {
    apply(...middleware: Function[]) {
      const configuration: Configuration = { middleware, excluded: [], routes: [] };
      configurations.push(configuration);
      const chain = {
        exclude(...routes: PublicRoute[]) { configuration.excluded = routes; return chain; },
        forRoutes(...routes: unknown[]) { configuration.routes = routes; return chain; },
      };
      return chain;
    },
  };
  new AppModule().configure(consumer as unknown as MiddlewareConsumer);

  const publicConfiguration = configurations.find((config) => config.middleware.includes(AdminTokenMiddleware));
  const sameOriginConfiguration = configurations.find((config) => config.middleware.includes(SameOriginMiddleware));
  return {
    public: (publicConfiguration?.excluded ?? []).map(routeSignature),
    sameOriginGlobal: sameOriginConfiguration?.routes.includes('*') ?? false,
    adminProtectedAllRoutes: publicConfiguration?.routes.includes('*') ?? false,
  };
}

function caddySource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../ops/windows/Caddyfile'), 'utf8');
}

function caddyPrivateSurface(source: string): string {
  const marker = '# Private owner surface';
  const boundary = source.indexOf(marker);
  if (boundary < 0) throw new Error('Caddy owner-surface boundary is missing');
  return source.slice(boundary);
}

describe('public HTTP boundary', () => {
  const caddy = caddySource();
  const nest = appRoutes();

  it('keeps Nest credentials and Caddy public method/path allowlists exactly aligned', () => {
    expect([...nest.public].sort()).toEqual([...REQUIRED_PUBLIC_ROUTES].sort());
    expect(compareCaddyPublicRoutes(caddy)).toEqual({ matches: true, missingFromCaddy: [], extraInCaddy: [] });
    expect(nest.adminProtectedAllRoutes).toBe(true);
    expect(caddyPrivateSurface(caddy)).toContain('bind 127.0.0.1');
    expect(caddyPrivateSurface(caddy)).toContain('basic_auth');
  });

  it('requires Origin checks for every public write and never exposes management/content-write paths', () => {
    const publicWrites = nest.public.filter((route) => !route.startsWith('GET '));
    expect(publicWrites.length).toBeGreaterThan(0);
    expect(nest.sameOriginGlobal).toBe(true);
    expect(nest.public.some((route) => /(?:^|\s)(?:admin|ops)(?:\/|\s|$)/.test(route))).toBe(false);
    expect(caddy).not.toMatch(/path\s+\/(?:admin|ops)(?:\/|\s|$)/);
    expect(caddy).not.toContain('Access-Control-Allow-Origin');
    expect(caddy).toContain('respond "Not Found" 404');
  });

  it('applies Origin validation to every mutation method, including new admin write routes', () => {
    expect(nest.sameOriginGlobal).toBe(true);
  });
});
