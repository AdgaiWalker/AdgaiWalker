import { describe, expect, it } from 'vitest';
import { parseCodexJsonl } from './codex-agent.runner';

describe('Codex JSONL adapter', () => {
  it('extracts the final structured output and preserves progress events', () => {
    const result = parseCodexJsonl([
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"progress"}}',
      '{"type":"final","output":{"stage":"EDIT","output":{"body":"done"}}}',
    ].join('\n'));
    expect(result.output).toEqual({ stage: 'EDIT', output: { body: 'done' } });
    expect(result.events).toHaveLength(3);
  });

  it('rejects malformed or missing final output', () => {
    expect(() => parseCodexJsonl('{"type":"turn.started"}')).toThrow('runner-output-missing');
    expect(() => parseCodexJsonl('not-json')).toThrow('runner-output-invalid-json');
  });
});
