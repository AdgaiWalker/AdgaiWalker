import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_FEEDBACK_REDIS_KEYS, WORKITEM_REDIS_KEYS } from '../conversation/store';

/**
 * S0-03 / S0-04 生产等价存储验证脚本的键名必须与 src/conversation/store.ts 中
 * 生产代码使用的键名完全一致。否则脚本会写到 app 永远不读的命名空间，
 * 即使有真实 Redis 凭据也只是"自写自读"假通过，违背验证初衷。
 *
 * 早期版本 ContentFeedback 键误用了 `match:content-feedback:*` 前缀和 `by-content:` 段，
 * 正是本测试要防回归的对象。
 */
describe('verify-production-storage 键名与生产 store.ts 一致', () => {
  const scriptPath = join(process.cwd(), 'scripts', 'verify-production-storage.mjs');
  const script = readFileSync(scriptPath, 'utf8');

  it('WorkItem 实体 / 全量 / active 索引键名一致', () => {
    const sampleId = 'wi_s0_production_check';
    // 脚本用模板字符串拼 id，这里断言它出现匹配前缀的片段。
    expect(script).toContain('`admin:workitem:${workItemId}`');
    expect(script).toContain("'admin:workitems'");
    expect(script).toContain("'admin:workitems:active'");
    // 与生产真相源逐字对账。
    expect(WORKITEM_REDIS_KEYS.workItem(sampleId)).toBe(`admin:workitem:${sampleId}`);
    expect(WORKITEM_REDIS_KEYS.list).toBe('admin:workitems');
    expect(WORKITEM_REDIS_KEYS.activeList).toBe('admin:workitems:active');
  });

  it('ContentFeedback 键名一致，且不含错误的 match: 前缀或 by-content: 段', () => {
    const sampleId = 'cf_s0_production_check';
    const sampleContentId = 's0-production-check';

    expect(script).toContain('`content-feedback:event:${feedbackId}`');
    expect(script).toContain("'content-feedback:recent'");
    expect(script).toContain('`content-feedback:content:s0-production-check`');

    // 与生产真相源逐字对账。
    expect(CONTENT_FEEDBACK_REDIS_KEYS.event(sampleId)).toBe(`content-feedback:event:${sampleId}`);
    expect(CONTENT_FEEDBACK_REDIS_KEYS.recent).toBe('content-feedback:recent');
    expect(CONTENT_FEEDBACK_REDIS_KEYS.byContent(sampleContentId)).toBe(
      `content-feedback:content:${sampleContentId}`,
    );

    // 防回归：实际的键常量赋值（const ... = '...' 或 `...`）绝不能使用
    // match:content-feedback 前缀或 by-content: 段。注释中提到这些旧形式是允许的文档，
    // 因此只扫描赋值右侧，避免误伤说明性注释。
    const keyAssignments = script.matchAll(/^\s*(?:const|let)\s+\w+\s*=\s*[`'"].*?[`'"]/gm);
    const assignedKeyLiterals = [...keyAssignments].map(m => m[0]);
    for (const literal of assignedKeyLiterals) {
      expect(literal).not.toMatch(/match:content-feedback/);
      expect(literal).not.toMatch(/by-content:/);
    }
  });

  it('跨进程探针覆盖 active 与 by-content 两个索引的读回', () => {
    // 早期版本跨进程只读回 workitems 和 recent，漏检 active 与 by-content。
    // 这里断言子进程代码同时 lrange 这两个索引并做 includes 校验。
    expect(script).toMatch(/lrange\(workItemsActiveList/);
    expect(script).toMatch(/includes\(workItemId\)/);
    expect(script).toMatch(/lrange\(contentFeedbackByContent/);
    expect(script).toMatch(/includes\(feedbackId\)/);
  });
});

describe('verify-production-storage-local（本地 Redis 等价版）键名与生产 store.ts 一致', () => {
  const scriptPath = join(process.cwd(), 'scripts', 'verify-production-storage-local.mjs');
  const script = readFileSync(scriptPath, 'utf8');

  it('从生产真相源派生键名，且 ContentFeedback 不含 match: 前缀', () => {
    // 本地等价脚本内联了键名常量，必须与 store.ts 导出的真相源逐字一致。
    const sampleId = 'wi_s0_local_check';
    const sampleContentId = 's0-local-check';
    expect(script).toContain('`admin:workitem:${id}`');
    expect(script).toContain("'admin:workitems'");
    expect(script).toContain("'admin:workitems:active'");
    expect(script).toContain("`content-feedback:event:${id}`");
    expect(script).toContain("'content-feedback:recent'");
    expect(script).toContain("`content-feedback:content:${contentId}`");

    expect(WORKITEM_REDIS_KEYS.workItem(sampleId)).toBe(`admin:workitem:${sampleId}`);
    expect(WORKITEM_REDIS_KEYS.list).toBe('admin:workitems');
    expect(WORKITEM_REDIS_KEYS.activeList).toBe('admin:workitems:active');
    expect(CONTENT_FEEDBACK_REDIS_KEYS.event(sampleId)).toBe(`content-feedback:event:${sampleId}`);
    expect(CONTENT_FEEDBACK_REDIS_KEYS.recent).toBe('content-feedback:recent');
    expect(CONTENT_FEEDBACK_REDIS_KEYS.byContent(sampleContentId)).toBe(
      `content-feedback:content:${sampleContentId}`,
    );

    // 防回归：ContentFeedback 键名绝不能带 match: 前缀。
    const keyAssignments = script.matchAll(/^\s*(?:const|let)\s+\w+\s*=\s*[`'"].*?[`'"]/gm);
    for (const literal of [...keyAssignments].map(m => m[0])) {
      expect(literal).not.toMatch(/match:content-feedback/);
    }
  });

  it('覆盖 BGSAVE 重启持久化探针（S0-04 重启不丢核心语义）', () => {
    expect(script).toMatch(/bgsave/);
    expect(script).toMatch(/lastsave/);
    expect(script).toMatch(/restartPersistence/);
  });
});
