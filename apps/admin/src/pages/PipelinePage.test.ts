import { describe, expect, it } from 'vitest';
import { PIPELINE_STAGES } from './PipelinePage';

describe('PipelinePage', () => {
  it('四段流水线口径固定：池 → 苗 → 作 → 品', () => {
    expect([...PIPELINE_STAGES]).toEqual(['池', '苗', '作', '品']);
  });
});
