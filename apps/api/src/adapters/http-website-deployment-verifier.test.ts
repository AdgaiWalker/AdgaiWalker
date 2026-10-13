import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpWebsiteDeploymentVerifier } from './http-website-deployment-verifier';

const verifier = new HttpWebsiteDeploymentVerifier();
const URL_POST = 'https://www.iwalk.pro/posts/demo';
const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);

function htmlWith(hash: string | null, title = '演示文章'): string {
  const meta = hash === null ? '' : `\n  <meta name="content-hash" content="${hash}" />`;
  return `<!doctype html><html><head>${meta}\n  <title>${title}</title></head><body><h1>${title}</h1></body></html>`;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function htmlResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HttpWebsiteDeploymentVerifier（线上版本核验适配器）', () => {
  it('HTML 命中目标 content-hash 才算确证，并携带禁缓存与破缓存参数', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      if (url.includes('public-manifest.json')) {
        return jsonResponse({ items: [{ slug: 'demo', hash: HASH }] });
      }
      return htmlResponse(htmlWith(HASH));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifier.verify(URL_POST, { slug: 'demo', expectedHash: HASH, retries: 0 });

    expect(result.ok).toBe(true);
    expect(result.verifiedHash).toBe(HASH);
    expect(result.htmlMatched).toBe(true);
    expect(result.manifestMatched).toBe(true);

    // 破缓存参数与禁缓存头：避免读到 CDN 旧版本
    const firstUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(firstUrl).toContain('_t=');
    const firstInit = fetchMock.mock.calls[0]?.[1];
    expect(String((firstInit?.headers as Record<string, string>)['cache-control'])).toContain('no-store');
  });

  it('同标题旧正文（content-hash 不符）必须判为未确证', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      url.includes('public-manifest.json')
        ? jsonResponse({ items: [{ slug: 'demo', hash: OTHER_HASH }] })
        : htmlResponse(htmlWith(OTHER_HASH))
    )));

    const result = await verifier.verify(URL_POST, { slug: 'demo', expectedHash: HASH, retries: 0 });

    expect(result.ok).toBe(false);
    expect(result.htmlMatched).toBe(false);
    expect(result.reason).toContain('html-hash-mismatch');
    expect(result.verifiedHash).toBe(OTHER_HASH);
  });

  it('HTML 匹配但线上 manifest 中 hash 仍为旧版时必须判为未确证（manifest-hash-mismatch）', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      url.includes('public-manifest.json')
        ? jsonResponse({ items: [{ slug: 'demo', hash: OTHER_HASH }] })
        : htmlResponse(htmlWith(HASH))
    )));

    const result = await verifier.verify(URL_POST, { slug: 'demo', expectedHash: HASH, retries: 0 });

    expect(result.ok).toBe(false);
    expect(result.htmlMatched).toBe(true);
    expect(result.manifestMatched).toBe(false);
    expect(result.reason).toContain('manifest-hash-mismatch');
  });

  it('线上不可达（404）必须判为未确证，不能因页面可达就放行', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('not found', 404)));

    const result = await verifier.verify(URL_POST, { slug: 'demo', expectedHash: HASH, retries: 0 });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('remote-http-404');
  });

  it('页面可达但缺少 hash 证据时不得确证', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      url.includes('public-manifest.json')
        ? jsonResponse({ items: [{ slug: 'demo', hash: OTHER_HASH }] })
        : htmlResponse(htmlWith(null))
    )));

    const result = await verifier.verify(URL_POST, { slug: 'demo', expectedHash: HASH, retries: 0 });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('html-hash-mismatch');
  });

  it('未指定目标 hash 时退回标题校验（兼容旧工作站调用）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse(htmlWith(null, '演示文章'))));

    const result = await verifier.verify(URL_POST, { title: '演示文章', retries: 0 });

    expect(result.ok).toBe(true);
  });

  it('标题不匹配时判为内容未找到', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse(htmlWith(null, '别的文章'))));

    const result = await verifier.verify(URL_POST, { title: '演示文章', retries: 0 });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('remote-content-not-found');
  });

  it('超时必须如实标注为核验超时，不得当成成功', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }));

    const result = await verifier.verify(URL_POST, { slug: 'demo', expectedHash: HASH, retries: 0 });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('verification-timeout');
  });

  it('Vercel 尚未生效时按重试预算复检，最终命中即确证', async () => {
    let attempt = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('public-manifest.json')) {
        return jsonResponse({ items: [{ slug: 'demo', hash: HASH }] });
      }
      attempt += 1;
      return attempt === 1 ? htmlResponse(htmlWith(OTHER_HASH)) : htmlResponse(htmlWith(HASH));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifier.verify(URL_POST, {
      slug: 'demo',
      expectedHash: HASH,
      retries: 1,
      retryDelayMs: 10,
    });

    expect(result.ok).toBe(true);
    expect(result.verifiedHash).toBe(HASH);
    expect(attempt).toBe(2);
  });
});
