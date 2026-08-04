import { Injectable } from '@nestjs/common';
import type { WebsiteDeploymentVerifierPort } from '../ports/website-deployment-verifier.port';

@Injectable()
export class HttpWebsiteDeploymentVerifier implements WebsiteDeploymentVerifierPort {
  async verify(url: string, expected: { title: string }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { accept: 'text/html' } });
      if (!response.ok) return { ok: false, reason: `remote-http-${response.status}` };
      const body = await response.text();
      if (!body.includes(expected.title)) return { ok: false, reason: 'remote-content-not-found' };
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : 'remote-verification-failed' };
    } finally {
      clearTimeout(timer);
    }
  }
}
