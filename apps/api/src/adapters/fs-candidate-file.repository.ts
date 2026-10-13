/**
 * 文件系统独立候选仓储 — 保存与读取不可变候选正文。
 * 路径由服务端在受控目录下生成，严格隔离 content/log。
 */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpStatus } from '@nestjs/common';
import { ApiError, validationError } from '../common/http-error';
import { isContentOpaqueId } from '@walker/shared';
import type {
  CandidateFileRecord,
  CandidateFileRepositoryPort,
} from '../ports/candidate-file.repository';

export function resolveCandidatesDir(): string {
  const fromEnv = process.env.WALKER_CANDIDATES_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const cwd = process.cwd();
  if (cwd.endsWith('/apps/api') || cwd.endsWith('\\apps\\api') || cwd.endsWith('apps/api') || cwd.endsWith('apps\\api')) {
    return path.resolve(cwd, 'data/candidates');
  }
  return path.resolve(cwd, 'apps/api/data/candidates');
}

export class FsCandidateFileRepository implements CandidateFileRepositoryPort {
  private readonly root: string;

  constructor(rootDir?: string) {
    this.root = path.resolve(rootDir ?? resolveCandidatesDir());
  }

  async save(candidateId: string, raw: string): Promise<CandidateFileRecord> {
    this.assertCandidateId(candidateId);
    if (typeof raw !== 'string') {
      throw validationError('候选正文必须为字符串');
    }

    const hash = createHash('sha256').update(raw, 'utf8').digest('hex');
    const candidateRef = `${candidateId}_${hash}`;
    this.assertCandidateRef(candidateRef);

    await fs.mkdir(this.root, { recursive: true });

    // 检查是否存在同一 candidateId 的已有文件（不可变性检查）
    let existingFiles: string[] = [];
    try {
      existingFiles = await fs.readdir(this.root);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    const targetFileName = `${candidateRef}.candidate`;
    const targetPath = this.resolveSafePath(targetFileName);

    const forThisCandidate = existingFiles.filter(
      (f) => f.startsWith(`${candidateId}_`) && f.endsWith('.candidate'),
    );

    if (forThisCandidate.length > 0) {
      if (forThisCandidate.includes(targetFileName)) {
        // 相同 hash 重复保存：幂等复用
        const stat = await fs.stat(targetPath);
        return {
          candidateId,
          candidateRef,
          hash,
          path: path.relative(this.root, targetPath),
          raw,
          createdAt: stat.mtime.toISOString(),
        };
      }
      // 不同 hash：拒绝覆盖
      throw new ApiError(
        'candidate-conflict',
        HttpStatus.CONFLICT,
        `候选 ${candidateId} 已存在且不可变，不可写入不同版本`,
      );
    }

    // 临时文件写入 + rename 原子替换
    const tempFileName = `${targetFileName}.${randomUUID()}.tmp`;
    const tempPath = this.resolveSafePath(tempFileName);
    const body = Buffer.from(raw, 'utf8');

    await fs.writeFile(tempPath, body);
    await fs.rename(tempPath, targetPath);

    const stat = await fs.stat(targetPath);
    return {
      candidateId,
      candidateRef,
      hash,
      path: path.relative(this.root, targetPath),
      raw,
      createdAt: stat.mtime.toISOString(),
    };
  }

  async read(candidateRef: string): Promise<CandidateFileRecord | null> {
    this.assertCandidateRef(candidateRef);

    const idx = candidateRef.lastIndexOf('_');
    const expectedHash = idx > 0 ? candidateRef.slice(idx + 1) : null;
    const candidateId = idx > 0 ? candidateRef.slice(0, idx) : candidateRef;

    const targetFileName = `${candidateRef}.candidate`;
    const targetPath = this.resolveSafePath(targetFileName);

    let raw: string;
    let stat;
    try {
      raw = await fs.readFile(targetPath, 'utf8');
      stat = await fs.stat(targetPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }

    const actualHash = createHash('sha256').update(raw, 'utf8').digest('hex');

    // 读取严格核验 hash
    if (expectedHash && actualHash !== expectedHash) {
      throw new ApiError(
        'candidate-hash-mismatch',
        HttpStatus.INTERNAL_SERVER_ERROR,
        `候选正文 hash 核验不匹配，内容已被篡改或损坏（期望 ${expectedHash}，实际 ${actualHash}）`,
      );
    }

    return {
      candidateId,
      candidateRef,
      hash: actualHash,
      path: path.relative(this.root, targetPath),
      raw,
      createdAt: stat.mtime.toISOString(),
    };
  }

  private assertCandidateId(id: string): void {
    if (!id || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
      throw validationError('candidateId 必须为安全不透明标识符（仅字母、数字、短横线与下划线）');
    }
  }

  private assertCandidateRef(ref: string): void {
    if (!ref || typeof ref !== 'string' || !isContentOpaqueId(ref)) {
      throw validationError('candidateRef 必须为安全不透明标识符');
    }
  }

  private resolveSafePath(fileName: string): string {
    const rootPath = path.resolve(this.root);
    const full = path.resolve(rootPath, fileName);
    const prefix = rootPath.endsWith(path.sep) ? rootPath : rootPath + path.sep;
    if (!full.startsWith(prefix)) {
      throw validationError('非法候选文件路径');
    }
    return full;
  }
}
