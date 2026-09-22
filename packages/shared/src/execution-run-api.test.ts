import { describe, expect, it } from 'vitest';
import { parseEventCursor, parseExecutionRunRequest, parseRunCursor } from './execution-run-api.js';

const grantId = 'a'.repeat(64);
const body = {
  idempotencyKey: 'run-key-01', kind: 'chat', agentRevisionId: 'revision-1',
  input: '只读检查', grantId,
};

describe('后台运行请求', () => {
  it('只接受幂等键、固定修订和授权编号', () => {
    expect(parseExecutionRunRequest(body)?.submit.requestKey).toBe('run-key-01');
    expect(parseExecutionRunRequest({ ...body, origin: 'admin' })).toBeNull();
    expect(parseExecutionRunRequest({ ...body, actor: 'owner' })).toBeNull();
    expect(parseExecutionRunRequest({ ...body, requestKey: 'other-key' })).toBeNull();
    expect(parseExecutionRunRequest({ ...body, grantId: 'short' })).toBeNull();
  });

  it('游标只接受已有运行编号和事件序号', () => {
    expect(parseRunCursor(undefined)).toBeNull();
    expect(parseRunCursor('run_1')).toBe('run_1');
    expect(parseRunCursor('bad cursor')).toBe('invalid');
    expect(parseEventCursor(undefined)).toBe(0);
    expect(parseEventCursor('2')).toBe(2);
    expect(parseEventCursor('-1')).toBeNull();
  });
});
