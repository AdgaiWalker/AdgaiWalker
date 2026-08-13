export interface AgentRunInput {
  prompt: string;
  cwd: string;
  outputSchemaPath?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AgentRunResult {
  output: unknown;
  rawEvents: unknown[];
  elapsedMs: number;
}

export interface AgentRunnerPort {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

export const AGENT_RUNNER = Symbol('AGENT_RUNNER');
