import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';

export function resolveRestoreGatePath(
  databaseUrl = process.env.DATABASE_URL,
  configuredPath = process.env.WALKER_RESTORE_GATE_FILE,
): string | null {
  if (configuredPath?.trim()) return path.resolve(configuredPath.trim());
  if (!databaseUrl?.startsWith('file:')) return null;
  const databasePath = databaseUrl.slice('file:'.length);
  if (!path.isAbsolute(databasePath)) return null;
  return path.join(path.dirname(path.dirname(databasePath)), 'control', 'restore.pending');
}

export function isRestoreGatePending(filePath: string | null): boolean {
  return filePath !== null && fs.existsSync(filePath);
}

export function restoreGateMiddleware(filePath: string | null) {
  return (_request: Request, response: Response, next: NextFunction): void => {
    if (isRestoreGatePending(filePath)) {
      response.status(503).json({ code: 'restore-reconciliation-pending' });
      return;
    }
    next();
  };
}
