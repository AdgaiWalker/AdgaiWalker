/**
 * ProfileService — persona anchor validation
 */

import { describe, expect, it } from 'vitest';

import { PersonaAnchorPiiError, validatePersonaAnchor } from '@/services/profile.service';

describe('validatePersonaAnchor', () => {
  it('trims and caps anchors to 10 chars', () => {
    expect(validatePersonaAnchor('  自由职业者正在学习AI  ')).toBe('自由职业者正在学习A');
  });

  it('rejects PII before invite admission consumes quota', () => {
    expect(() => validatePersonaAnchor('13800138000')).toThrow(PersonaAnchorPiiError);
  });
});
