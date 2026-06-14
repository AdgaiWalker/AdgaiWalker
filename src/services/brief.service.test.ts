import { describe, expect, it } from 'vitest';

import { generateBrief } from '@/services/brief.service';
import type { TopicCandidate } from '@/stores/ports';

function createTopic(overrides: Partial<TopicCandidate> = {}): TopicCandidate {
  return {
    topicId: 'topic-brief',
    clusterKey: 'scenario-match:learning-path:learn-ai:学生',
    createdAt: new Date().toISOString(),
    title: 'AI 入门学习：新手第一步到底该做什么',
    density: 3,
    roleDistribution: [{ role: '学生', count: 2 }, { role: '职场办公', count: 1 }],
    representativeNeed: '用户不知道学习 AI 的第一步该做什么',
    relatedContentIds: [],
    priority: 'medium',
    status: 'observed',
    source: 'need-cluster',
    ...overrides,
  };
}

describe('generateBrief', () => {
  it('generates a structure-only content brief from TopicCandidate', () => {
    const brief = generateBrief(createTopic());

    expect(brief.topicId).toBe('topic-brief');
    expect(brief.density).toBe(3);
    expect(brief.targetRoles).toContain('学生×2');
    expect(brief.coreStuckPoint).toContain('第一步');
    expect(brief.suggestedAngles.length).toBeGreaterThan(0);
    expect(brief.suggestedStructure).toEqual(expect.arrayContaining([
      expect.stringContaining('引子'),
      expect.stringContaining('方法'),
    ]));
  });

  it('does not generate article body copy', () => {
    const brief = generateBrief(createTopic());
    const combined = [...brief.suggestedAngles, ...brief.suggestedStructure].join('\n');

    expect(combined).not.toContain('正文如下');
    expect(combined).not.toContain('亲爱的读者');
  });
});
