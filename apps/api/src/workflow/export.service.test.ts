import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkExportService } from './export.service';

describe('WorkExportService', () => {
  it('copies a complete work directory to an independent destination', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-export-root-'));
    const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-export-dest-'));
    await fs.mkdir(path.join(root, 'work-1', 'original'), { recursive: true });
    await fs.writeFile(path.join(root, 'work-1', 'original', 'draft.md'), '# draft');
    const service = new WorkExportService(root);
    const result = await service.export('work-1', destination);
    await expect(fs.readFile(path.join(result.path, 'original', 'draft.md'), 'utf8')).resolves.toBe('# draft');
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(destination, { recursive: true, force: true });
  });

  it('rejects exporting back into the source work directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-export-safe-'));
    await fs.mkdir(path.join(root, 'work-1'), { recursive: true });
    const service = new WorkExportService(root);
    await expect(service.export('work-1', path.join(root, 'work-1', 'backup'))).rejects.toThrow('export-destination-inside-work-root');
    await fs.rm(root, { recursive: true, force: true });
  });
});
