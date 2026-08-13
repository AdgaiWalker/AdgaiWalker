import { describe, expect, it } from 'vitest';
import { WorkstationController } from './workstation.controller';

describe('WorkstationController scaffold', () => {
  const controller = new WorkstationController();

  it('exposes a healthy scaffold without claiming the workflow is ready', () => {
    expect(controller.health()).toEqual({
      ok: true,
      stage: 'SCAFFOLD',
      slice: 'SLICE_1',
    });
  });

  it('reports implemented and deferred capabilities explicitly', () => {
    expect(controller.capabilities()).toEqual({
      capabilities: [
        { key: 'topic-contracts', status: 'READY' },
        { key: 'action-contracts', status: 'READY' },
        { key: 'work-contracts', status: 'READY' },
        { key: 'persistence', status: 'NOT_IMPLEMENTED' },
        { key: 'ai-production', status: 'NOT_IMPLEMENTED' },
        { key: 'publishing', status: 'NOT_IMPLEMENTED' },
      ],
    });
  });
});
