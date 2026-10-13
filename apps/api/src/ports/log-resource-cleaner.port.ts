import type { LogResourceRecord } from './log-resource.repository';

export const LOG_RESOURCE_CLEANER = Symbol('LOG_RESOURCE_CLEANER');

export interface LogResourceCleanerPort {
  remove(resource: LogResourceRecord): Promise<void>;
}
