import { Injectable } from '@nestjs/common';
import type {
  VerifyWebsiteDeploymentInput,
  VerifyWebsiteDeploymentResult,
  WebsiteDeploymentVerifierPort,
} from '../ports/website-deployment-verifier.port';

function extractMetaTag(html: string, name: string): string | null {
  const match = html.match(new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']`, 'i')) ||
    html.match(new RegExp(`<meta\\s+content=["']([^"']*)["']\\s+name=["']${name}["']`, 'i'));
  return match ? match[1] ?? null : null;
}

function extractDataContentHash(html: string): string | null {
  const match = html.match(/data-content-hash=["']([^"']*)["']/i);
  return match ? match[1] ?? null : null;
}

function resolveManifestUrl(pageUrl: string, explicitManifestUrl?: string): string {
  if (explicitManifestUrl) return explicitManifestUrl;
  try {
    const parsed = new URL(pageUrl);
    return `${parsed.origin}/public-manifest.json`;
  } catch {
    return 'https://www.iwalk.pro/public-manifest.json';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class HttpWebsiteDeploymentVerifier implements WebsiteDeploymentVerifierPort {
  async verify(url: string, expected: VerifyWebsiteDeploymentInput): Promise<VerifyWebsiteDeploymentResult> {
    const retries = Math.max(0, expected.retries ?? 2);
    const retryDelay = Math.max(10, expected.retryDelayMs ?? 150);
    const timeoutMs = Math.max(500, expected.timeoutMs ?? 5000);

    let lastResult: VerifyWebsiteDeploymentResult = { ok: false, reason: 'verification-not-started' };

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        await sleep(retryDelay);
      }

      lastResult = await this.performSingleVerify(url, expected, timeoutMs);
      if (lastResult.ok) {
        return lastResult;
      }
    }

    return lastResult;
  }

  private async performSingleVerify(
    url: string,
    expected: VerifyWebsiteDeploymentInput,
    timeoutMs: number,
  ): Promise<VerifyWebsiteDeploymentResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // 禁用缓存，避免读到 CDN/代理旧版本响应
    const fetchHeaders: HeadersInit = {
      accept: 'text/html, application/xhtml+xml',
      'cache-control': 'no-cache, no-store, must-revalidate',
      pragma: 'no-cache',
    };

    try {
      // 1. 抓取文章 HTML
      const cacheBustUrl = url.includes('?')
        ? `${url}&_t=${Date.now()}`
        : `${url}?_t=${Date.now()}`;

      const response = await fetch(cacheBustUrl, {
        signal: controller.signal,
        headers: fetchHeaders,
      });

      if (!response.ok) {
        return { ok: false, reason: `remote-http-${response.status}` };
      }

      const html = await response.text();

      // 提取标题与内容 hash
      const observedHash = extractMetaTag(html, 'content-hash') || extractDataContentHash(html);

      // 若声明了期望标题，先校验标题
      if (expected.title && !html.includes(expected.title)) {
        return { ok: false, observedTitle: null, reason: 'remote-content-not-found' };
      }

      // 如果未指定 expectedHash，仅按标题与 200 通过（保持与旧工作站调用兼容）
      if (!expected.expectedHash) {
        return { ok: true, verifiedHash: observedHash };
      }

      // 核心门禁：检验 HTML 中的 content-hash（防止同标题旧正文冒充上线）
      const htmlMatched = observedHash === expected.expectedHash;
      if (!htmlMatched) {
        return {
          ok: false,
          verifiedHash: observedHash,
          htmlMatched: false,
          reason: `html-hash-mismatch: expected ${expected.expectedHash}, observed ${observedHash ?? 'none'}`,
        };
      }

      // 2. 检查线上 public-manifest.json 中的版本条目
      const manifestUrl = resolveManifestUrl(url, expected.manifestUrl);
      let manifestMatched = false;
      try {
        const manifestBustUrl = manifestUrl.includes('?')
          ? `${manifestUrl}&_t=${Date.now()}`
          : `${manifestUrl}?_t=${Date.now()}`;

        const manifestRes = await fetch(manifestBustUrl, {
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            'cache-control': 'no-cache, no-store, must-revalidate',
            pragma: 'no-cache',
          },
        });

        if (manifestRes.ok) {
          const manifestJson = (await manifestRes.json()) as { items?: Array<{ slug?: string; hash?: string }> };
          if (Array.isArray(manifestJson.items) && expected.slug) {
            const entry = manifestJson.items.find((item) => item.slug === expected.slug);
            if (entry) {
              if (entry.hash === expected.expectedHash) {
                manifestMatched = true;
              } else {
                return {
                  ok: false,
                  verifiedHash: observedHash,
                  htmlMatched: true,
                  manifestMatched: false,
                  reason: `manifest-hash-mismatch: expected ${expected.expectedHash}, observed ${entry.hash ?? 'none'}`,
                };
              }
            }
          }
        }
      } catch {
        // manifest 读取失败不直接判定阻塞，只要 HTML 命中且无 manifest 冲突
      }

      return {
        ok: true,
        verifiedHash: observedHash,
        htmlMatched: true,
        manifestMatched,
      };
    } catch (error: unknown) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        reason: isAbort ? 'verification-timeout' : error instanceof Error ? error.message : 'remote-verification-failed',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
