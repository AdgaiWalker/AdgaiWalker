import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { restoreGateMiddleware } from './restore-gate';

let root = '';

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = '';
});

describe('restoreGateMiddleware', () => {
  it('returns not-ready while restore reconciliation is pending', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-restore-gate-'));
    const marker = path.join(root, 'restore.pending');
    await fs.writeFile(marker, 'pending');
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    restoreGateMiddleware(marker)({} as never, response as never, next);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({ code: 'restore-reconciliation-pending' });
    expect(next).not.toHaveBeenCalled();
  });

  it('passes requests when the marker has been cleared', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-restore-gate-'));
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    restoreGateMiddleware(path.join(root, 'restore.pending'))({} as never, response as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });
});
