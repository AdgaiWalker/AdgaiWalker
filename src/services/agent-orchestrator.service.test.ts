import { describe, expect, it, vi } from 'vitest';

import { createAgentOrchestrator } from '@/services/agent-orchestrator.service';
import type {
  Incident,
  MatchSessionRepositoryPort,
  NeedCase,
  NeedCaseRepositoryPort,
  SafetyDecision,
  UserProfile,
} from '@/stores/ports';
import type { SafetyServicePort } from '@/services/interfaces';
import type { MatchSession } from '@/conversation/store';

vi.mock('@/agent/gateway', () => ({
  callGateway: vi.fn(async (_request: unknown, fallback: unknown) => ({ data: fallback })),
}));

vi.mock('@/agent/gateway-config', () => ({
  getGatewayConfig: vi.fn(async () => ({ provider: 'openai', model: 'test-model' })),
}));

function createProfile(sessionId: string, personaAnchor: string): UserProfile {
  const now = new Date().toISOString();
  return {
    profileId: `profile-${sessionId}`,
    sessionId,
    personaAnchor,
    consentForProfile: true,
    confidence: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function createSessionStore(): MatchSessionRepositoryPort {
  const sessions = new Map<string, MatchSession>();
  return {
    async upsert(session) { sessions.set(session.sessionId, session); },
    async get(sessionId) { return sessions.get(sessionId) ?? null; },
    async end(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return null;
      const ended = { ...session, endedAt: new Date().toISOString() };
      sessions.set(sessionId, ended);
      return ended;
    },
    async count() { return sessions.size; },
    createSessionId() { return crypto.randomUUID(); },
    async saveMessages() {},
    async incrementStats() {},
  };
}

function createNeedCaseStore(saved: NeedCase[], failSave = false): NeedCaseRepositoryPort {
  return {
    async save(needCase) {
      if (failSave) throw new Error('save failed');
      saved.push(needCase);
    },
    async findById(needCaseId) { return saved.find(item => item.needCaseId === needCaseId) ?? null; },
    async findBySessionId(sessionId) { return saved.filter(item => item.sessionId === sessionId); },
    async findPendingReview() { return saved.filter(item => item.adminReviewStatus === 'pending'); },
    async findUnprocessedForTopics() { return saved.filter(item => !item.topicProcessedAt); },
    async findRecent() { return saved; },
    async updateFeedback() {},
    async updateAdminReview() {},
    async markTopicProcessed() {},
  };
}

function createSafetyService(incidents: Incident[]): SafetyServicePort {
  return {
    assessInput(text): SafetyDecision {
      return {
        action: 'allow',
        reason: 'test',
        redactedText: text,
        piiDetected: false,
        isMinorContext: false,
      };
    },
    async recordIncident(input) {
      incidents.push({
        incidentId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        resolved: false,
        ...input,
      });
    },
  };
}

describe('AgentOrchestrator encounter slice', () => {
  it('infers per-question role from current need while keeping personaAnchor as background', async () => {
    const saved: NeedCase[] = [];
    const incidents: Incident[] = [];
    const orchestrator = createAgentOrchestrator({
      sessionStore: createSessionStore(),
      needCaseStore: createNeedCaseStore(saved),
      safetyService: createSafetyService(incidents),
    });

    await orchestrator.handleNeed({
      userContext: {
        authState: 'invited',
        sessionId: 'session-parent-slice',
        profile: createProfile('session-parent-slice', '学生'),
      },
      messages: [{ role: 'user', content: '我想给孩子做一个 AI 编程学习计划' }],
      consentForTopic: true,
      sourcePage: '/tools',
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].profileSnapshot?.personaAnchor).toBe('学生');
    expect(saved[0].profileSnapshot?.roleInContext).toBe('家长');
    expect(saved[0].profileSnapshot?.sliceInferred).toBe(true);
    expect(saved[0].sliceInferred).toBe(true);
  });

  it('falls back to personaAnchor with low confidence when current need has no role signal', async () => {
    const saved: NeedCase[] = [];
    const incidents: Incident[] = [];
    const orchestrator = createAgentOrchestrator({
      sessionStore: createSessionStore(),
      needCaseStore: createNeedCaseStore(saved),
      safetyService: createSafetyService(incidents),
    });

    await orchestrator.handleNeed({
      userContext: {
        authState: 'invited',
        sessionId: 'session-anchor-fallback',
        profile: createProfile('session-anchor-fallback', '学生'),
      },
      messages: [{ role: 'user', content: '怎么绕过验证码' }],
      consentForTopic: true,
      sourcePage: '/tools',
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].profileSnapshot?.roleInContext).toBe('学生');
    expect(saved[0].profileSnapshot?.sliceInferred).toBe(false);
    expect(saved[0].sliceInferred).toBe(false);
  });

  it('does not block user response when NeedCase persistence fails', async () => {
    const saved: NeedCase[] = [];
    const incidents: Incident[] = [];
    const orchestrator = createAgentOrchestrator({
      sessionStore: createSessionStore(),
      needCaseStore: createNeedCaseStore(saved, true),
      safetyService: createSafetyService(incidents),
    });

    const result = await orchestrator.handleNeed({
      userContext: {
        authState: 'invited',
        sessionId: 'session-save-failure',
        profile: createProfile('session-save-failure', '学生'),
      },
      messages: [{ role: 'user', content: '怎么绕过验证码注册 AI 工具' }],
      consentForTopic: true,
      sourcePage: '/tools',
    });

    expect(result.sessionId).toBeTruthy();
    expect(result.needCaseId).toBeUndefined();
    expect(incidents).toHaveLength(1);
    expect(incidents[0].scope).toBe('need-case-save');
  });
});
