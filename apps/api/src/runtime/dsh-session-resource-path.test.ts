import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { dshSessionDirectory, encodeSessionId } from './dsh-session-resource-path';

describe('dsh session resource path (0.1.5-rc.3)', () => {
  it('matches the pinned session-owned directory layout under the configured home', () => {
    expect(dshSessionDirectory('/srv/walker/agents/a1', path.join('/srv/walker/agents/a1', 'materials'), 'session-123'))
      .toBe(path.join('/srv/walker/agents/a1', 'sessions', '--srv-walker-agents-a1-materials--', 'session-123'));
  });

  it('encodes traversal characters into one safe path component', () => {
    expect(encodeSessionId('../outside')).toBe('..~002Foutside');
    const target = dshSessionDirectory('/srv/walker/a', path.join('/srv/walker/a', 'materials'), '../outside');
    const root = path.join('/srv/walker/a', 'sessions');
    expect(target).toBe(path.join(root, '--srv-walker-a-materials--', '..~002Foutside'));
    expect(path.relative(root, target).startsWith('..')).toBe(false);
  });
});
