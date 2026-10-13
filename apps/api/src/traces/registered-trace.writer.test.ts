import { describe, expect, it, vi } from 'vitest';
import type { TraceWriterPort } from '../ports/trace.repository';
import type { LogResourceService } from '../log-resources/log-resource.service';
import { RegisteredTraceWriter } from './registered-trace.writer';

describe('RegisteredTraceWriter', () => {
  it('registers a logical run resource before the trace file can be written', async () => {
    const order: string[] = [];
    const resources = { registerTrace: vi.fn(async () => { order.push('register'); return true; }) };
    const writer = { append: vi.fn(async () => { order.push('append'); return 1; }) };
    const registered = new RegisteredTraceWriter(writer as unknown as TraceWriterPort, resources as unknown as LogResourceService);

    expect(await registered.append('run_123', { type: 'start', payload: {} } as never)).toBe(1);
    expect(order).toEqual(['register', 'append']);
  });
});
