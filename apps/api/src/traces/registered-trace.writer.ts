import type { TraceAppendInput, TraceWriterPort } from '../ports/trace.repository';
import type { LogResourceService } from '../log-resources/log-resource.service';

/** Register the logical trace before the file is created; the resource key is a run ID, never a path. */
export class RegisteredTraceWriter implements TraceWriterPort {
  constructor(
    private readonly writer: TraceWriterPort,
    private readonly resources: LogResourceService,
  ) {}

  async append(runId: string, event: TraceAppendInput): Promise<number> {
    const registered = await this.resources.registerTrace(runId);
    if (!registered) throw new Error('conversation-deletion-pending');
    return this.writer.append(runId, event);
  }
}
