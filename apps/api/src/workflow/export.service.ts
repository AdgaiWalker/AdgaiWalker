import fs from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { validationError } from '../common/http-error';

@Injectable()
export class WorkExportService {
  constructor(private readonly root: string) {}

  async export(workId: string, destination: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(workId)) throw validationError('invalid-work-id');
    if (!destination.trim()) throw validationError('export-destination-required');
    const source = path.resolve(this.root, workId);
    const destRoot = path.resolve(destination);
    const target = path.join(destRoot, workId);
    const relative = path.relative(source, target);
    if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
      throw validationError('export-destination-inside-work-root');
    }
    try { await fs.access(source); } catch { throw validationError('work-not-found'); }
    await fs.mkdir(destRoot, { recursive: true });
    await fs.cp(source, target, { recursive: true, force: false, errorOnExist: false });
    return { path: target, workId };
  }
}

export const WORK_EXPORT_SERVICE = Symbol('WORK_EXPORT_SERVICE');
