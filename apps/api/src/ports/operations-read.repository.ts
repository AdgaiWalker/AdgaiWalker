import type { OpsList, OpsRun, OpsRunDetail } from "@walker/shared";
export const OPERATIONS_READ = Symbol("OPERATIONS_READ");
export interface OperationsReadPort {
  runs(input: {
    page: number;
    pageSize: number;
    agentId?: string;
  }): Promise<OpsList<OpsRun>>;
  run(id: string): Promise<OpsRunDetail | null>;
}
