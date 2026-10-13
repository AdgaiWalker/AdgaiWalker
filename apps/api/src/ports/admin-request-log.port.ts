export const ADMIN_REQUEST_LOG = Symbol('ADMIN_REQUEST_LOG');

export type AdminRequestLogRow = {
  id: string;
  actor: string;
  method: string;
  path: string;
  statusCode: number | null;
  durationMs: number | null;
  createdAt: Date;
};

export interface AdminRequestLogPort {
  begin(input: Pick<AdminRequestLogRow, 'id' | 'actor' | 'method' | 'path'>): Promise<void>;
  finish(id: string, path: string, statusCode: number, durationMs: number): Promise<void>;
  list(input: { limit: number; before?: string; method?: string }): Promise<AdminRequestLogRow[]>;
}
