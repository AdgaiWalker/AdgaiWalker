export interface AgentRunInput {
  prompt: string;
  cwd: string;
  outputSchemaPath?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  sessionId?: string;
}

export interface AgentRunResult {
  output: unknown;
  rawEvents: unknown[];
  elapsedMs: number;
  sessionId?: string;
}

export interface AgentRunnerPort {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

export const AGENT_RUNNER = Symbol('AGENT_RUNNER');
