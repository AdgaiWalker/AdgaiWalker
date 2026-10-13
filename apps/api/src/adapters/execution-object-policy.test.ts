import { describe, expect, it } from 'vitest';
import { PUBLIC_SITE_SCOPE } from '@walker/shared';
import { ExecutionObjectPolicy } from './execution-object-policy';
import type { SiteContentIndexPort } from '../ports/site-content-index.port';

describe('公开站内容范围', () => {
  it('已有可引用快照时允许首页小影只读执行，空快照时拒绝', async () => {
    const content = { loadCitable: async () => [{ slug: 'post-a' }] } as SiteContentIndexPort;
    const policy = new ExecutionObjectPolicy(content);
    expect(await policy.actions('content', PUBLIC_SITE_SCOPE, 'xiaoying')).toEqual(['agent:run', 'content:read']);
    content.loadCitable = async () => [];
    expect(await policy.actions('content', PUBLIC_SITE_SCOPE, 'xiaoying')).toEqual([]);
  });
});
