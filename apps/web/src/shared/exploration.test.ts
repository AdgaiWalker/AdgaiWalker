import { describe, expect, it } from 'vitest';
import {
  explorationHref,
  explorationKind,
  matchesExplorationView,
  parseExplorationView,
} from './exploration';

describe('exploration collections', () => {
  it('按明确类型归入点子或项目，状态不改变归属', () => {
    expect(explorationKind({ type: 'idea', status: 'validating' })).toBe(
      'idea',
    );
    expect(explorationKind({ type: 'idea', status: 'verified' })).toBe(
      'idea',
    );
    expect(explorationKind({ type: 'project', status: 'thinking' })).toBe(
      'project',
    );
  });

  it('无标准状态时兼容旧 type', () => {
    expect(explorationKind({ type: 'idea' })).toBe('idea');
    expect(explorationKind({ type: 'project' })).toBe('project');
  });

  it('解析视图并生成可分享链接', () => {
    expect(parseExplorationView('idea')).toBe('idea');
    expect(parseExplorationView('unknown')).toBe('all');
    expect(explorationHref()).toBe('/explore');
    expect(explorationHref('project')).toBe('/explore?view=project');
    expect(
      matchesExplorationView(
        { type: 'project', status: 'validating' },
        'idea',
      ),
    ).toBe(false);
  });
});
