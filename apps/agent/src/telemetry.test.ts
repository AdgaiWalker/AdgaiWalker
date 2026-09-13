/**
 * telemetry 插件单测 — 事件体正确 + 端点不可达/未配 token 时绝不抛错。
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { TelemetryService } from './plugins/telemetry.js';

type CapturedRequest = {
  url: string;
  token: string | undefined;
  body: Record<string, unknown>;
};

async function startFakeAdmin(status = 201) {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      requests.push({
        url: req.url ?? '',
        token: req.headers['x-admin-token'] as string | undefined,
        body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
      });
      res.statusCode = status;
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    requests,
    endpoint: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function serviceFor(endpoint: string, token: string | undefined) {
  return new TelemetryService(new Context(), { endpoint, token });
}

/** 等上报落地（record 是 fire-and-forget） */
async function waitFor(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor 超时');
    await new Promise((r) => setTimeout(r, 20));
  }
}

const servers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (servers.length > 0) await servers.pop()!();
});

describe('telemetry 插件（MCP 工具调用观测）', () => {
  it('record 上报 attempt + success 两条，带 token 与 agent.mcp 键', async () => {
    const admin = await startFakeAdmin();
    servers.push(admin.close);

    serviceFor(admin.endpoint, 'secret-token').record({ tool: 'search_judgment', ok: true, detail: 'AI 工具' });
    await waitFor(() => admin.requests.length >= 2);

    expect(admin.requests).toHaveLength(2);
    expect(admin.requests.every((r) => r.url === '/admin/events')).toBe(true);
    expect(admin.requests.every((r) => r.token === 'secret-token')).toBe(true);
    expect(admin.requests.every((r) => r.body.featureKey === 'agent.mcp')).toBe(true);

    const attempt = admin.requests.find((r) => r.body.event === 'attempt');
    expect(attempt?.body.actorType).toBe('owner');
    expect(attempt?.body.props).toEqual({ tool: 'search_judgment', detail: 'AI 工具' });

    const success = admin.requests.find((r) => r.body.event === 'success');
    expect(success?.body.failCode).toBeNull();
  });

  it('ok=false 上报 fail 并带 failCode，不抛错', async () => {
    const admin = await startFakeAdmin();
    servers.push(admin.close);

    expect(() =>
      serviceFor(admin.endpoint, 't').record({ tool: 'read_article', ok: false, detail: 'not-readable' }),
    ).not.toThrow();
    await waitFor(() => admin.requests.length >= 2);

    const fail = admin.requests.find((r) => r.body.event === 'fail');
    expect(fail?.body.failCode).toBe('empty-result');
  });

  it('端点不可达：record 不抛错（记录不得改变业务结果）', async () => {
    const svc = serviceFor('http://127.0.0.1:9', 't');
    expect(() => svc.record({ tool: 'list_citable', ok: true })).not.toThrow();
    // 给上报留出失败窗口，确认异步路径也没有把异常抛回调用方
    await new Promise((r) => setTimeout(r, 200));
  });

  it('端点返回 500：不抛错', async () => {
    const admin = await startFakeAdmin(500);
    servers.push(admin.close);
    const svc = serviceFor(admin.endpoint, 't');
    expect(() => svc.record({ tool: 'list_methodology', ok: true })).not.toThrow();
    await waitFor(() => admin.requests.length >= 2);
  });

  it('未配置 token：只记本地日志，不发请求', async () => {
    const admin = await startFakeAdmin();
    servers.push(admin.close);
    const svc = serviceFor(admin.endpoint, undefined);
    svc.record({ tool: 'list_citable', ok: true });
    await new Promise((r) => setTimeout(r, 300));
    expect(admin.requests).toHaveLength(0);
  });
});
