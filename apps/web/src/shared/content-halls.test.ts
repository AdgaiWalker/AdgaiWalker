import { describe, expect, it } from 'vitest';
import { inferContentHall, isContentHallId } from './content-halls';

describe('inferContentHall', () => {
  it('respects explicit hall', () => {
    expect(inferContentHall({ hall: 'condition', type: 'idea' })).toBe(
      'condition',
    );
  });

  it('maps type idea/project to showcase', () => {
    expect(inferContentHall({ type: 'idea' })).toBe('showcase');
    expect(inferContentHall({ type: 'project' })).toBe('showcase');
  });

  it('maps learn/tool to kit', () => {
    expect(inferContentHall({ type: 'learn' })).toBe('kit');
    expect(inferContentHall({ type: 'tool' })).toBe('kit');
  });

  it('maps tutorial form to condition', () => {
    expect(inferContentHall({ type: 'knowledge', form: 'tutorial' })).toBe(
      'condition',
    );
  });

  it('maps trilogy series to lab', () => {
    expect(
      inferContentHall({ type: 'knowledge', series: '前进三部曲' }),
    ).toBe('lab');
  });

  it('isContentHallId', () => {
    expect(isContentHallId('lab')).toBe(true);
    expect(isContentHallId('nope')).toBe(false);
  });
});
