import { describe, expect, it } from 'vitest';
import {
  AGENT_ACTIONS,
  canTransitionRun,
  isAgentConfigHash,
  stopOutcome,
  isRunTerminal,
  originAllowsAction,
  parseExecutionSubmit,
} from './agent-execution.js';

describe('Agent 执行共享合同', () => {
  it('终态不能复活，停止与未知状态必须等待确认', () => {
    expect(canTransitionRun('QUEUED', 'CLAIMED')).toBe(true);
    expect(canTransitionRun('RUNNING', 'STOPPING')).toBe(true);
    expect(canTransitionRun('STOPPING', 'CANCELLED')).toBe(true);
    expect(canTransitionRun('STOPPING', 'SUCCEEDED')).toBe(false);
    expect(stopOutcome('user')).toEqual({ state: 'CANCELLED', stopReason: 'user' });
    expect(stopOutcome('deadline')).toEqual({ state: 'FAILED', stopReason: 'deadline' });
    expect(canTransitionRun('UNKNOWN', 'RUNNING')).toBe(false);
    for (const state of ['SUCCEEDED', 'FAILED', 'CANCELLED'] as const) {
      expect(isRunTerminal(state)).toBe(true);
      expect(canTransitionRun(state, 'RUNNING')).toBe(false);
    }
  });

  it('公开来源只允许只读问答动作，客户端字段不能提升 origin 或授权', () => {
    for (const action of AGENT_ACTIONS) {
      expect(originAllowsAction('public', action)).toBe(
        action === 'content:read' || action === 'agent:run',
      );
    }
    const valid = {
      requestKey: 'request_123', kind: 'chat', agentRevisionId: 'revision_1', input: '你好',
    };
    expect(parseExecutionSubmit(valid)).toEqual(valid);
    expect(parseExecutionSubmit({ ...valid, origin: 'admin' })).toBeNull();
    expect(parseExecutionSubmit({ ...valid, grantId: 'other-grant' })).toBeNull();
    expect(parseExecutionSubmit({ ...valid, requestKey: '!' })).toBeNull();
    expect(parseExecutionSubmit({ ...valid, input: '' })).toBeNull();
    expect(originAllowsAction('forged' as never, 'content:apply')).toBe(false);
    expect(originAllowsAction('admin', 'forged' as never)).toBe(false);
    expect(canTransitionRun('forged' as never, 'RUNNING')).toBe(false);
  });

  it('配置 hash 必须是固定长度的小写 SHA-256 十六进制串', () => {
    expect(isAgentConfigHash('a'.repeat(64))).toBe(true);
    expect(isAgentConfigHash('A'.repeat(64))).toBe(false);
    expect(isAgentConfigHash('a'.repeat(63))).toBe(false);
  });
});
