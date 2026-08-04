import { describe, expect, it } from 'vitest';
import { normalizePlannedDate, transitionAction } from './action.js';

describe('action contracts', () => {
  it('accepts an empty date and a calendar date', () => {
    expect(normalizePlannedDate(null)).toBeNull();
    expect(normalizePlannedDate('2026-08-04')).toBe('2026-08-04');
    expect(() => normalizePlannedDate('2026-8-4')).toThrow(
      'invalid-planned-date',
    );
  });

  it('supports reversible completion', () => {
    const done = transitionAction(
      'OPEN',
      'complete',
      new Date('2026-08-04T10:00:00Z'),
    );
    expect(done.status).toBe('DONE');
    expect(done.completedAt?.toISOString()).toBe('2026-08-04T10:00:00.000Z');
    expect(transitionAction('DONE', 'reopen', new Date())).toEqual({
      status: 'OPEN',
      completedAt: null,
    });
  });
});
