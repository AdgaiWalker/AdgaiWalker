import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isContentOpaqueId } from '@walker/shared';
import { FsCandidateFileRepository } from './fs-candidate-file.repository';
import { ApiError } from '../common/http-error';

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

describe('FsCandidateFileRepository (C07 独立候选文件仓储)', () => {
  let tmpDir: string;
  let repo: FsCandidateFileRepository;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-candidates-test-'));
    repo = new FsCandidateFileRepository(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('按 candidateId/hash 保存不可变候选文件，路径由服务端在受控目录下生成', async () => {
    const raw = '---\ntitle: 候选文章\n---\n候选正文内容';
    const expectedHash = sha256(raw);

    const record = await repo.save('cand-001', raw);

    expect(record.candidateId).toBe('cand-001');
    expect(record.hash).toBe(expectedHash);
    expect(record.raw).toBe(raw);
    expect(isContentOpaqueId(record.candidateRef)).toBe(true);

    // 路径由服务端生成，并在受控目录下
    expect(record.path).not.toContain('..');
    expect(record.path).not.toContain('content/log');

    const fullPath = path.join(tmpDir, record.path);
    const diskContent = await fs.readFile(fullPath, 'utf8');
    expect(diskContent).toBe(raw);
  });

  it('重复保存相同 hash 可幂等复用，返回同一记录', async () => {
    const raw = '不可变正文内容 123';
    const first = await repo.save('cand-idempotent', raw);
    const second = await repo.save('cand-idempotent', raw);

    expect(second.candidateRef).toBe(first.candidateRef);
    expect(second.hash).toBe(first.hash);
    expect(second.path).toBe(first.path);
  });

  it('同一 candidateId 尝试写入不同 hash 时拒绝，保证候选不可变', async () => {
    await repo.save('cand-immutable', '第一版内容');

    await expect(repo.save('cand-immutable', '试图篡改的第二版内容')).rejects.toThrowError(
      /candidate-conflict|不可变|conflict/i,
    );
  });

  it('读取时严格核验正文 SHA-256 hash，被篡改时抛出错误', async () => {
    const raw = '原始正常候选正文';
    const record = await repo.save('cand-verify', raw);

    // 正常读取
    const readRecord = await repo.read(record.candidateRef);
    expect(readRecord).not.toBeNull();
    expect(readRecord?.raw).toBe(raw);
    expect(readRecord?.hash).toBe(record.hash);

    // 恶意修改磁盘文件内容
    const fullPath = path.join(tmpDir, record.path);
    await fs.writeFile(fullPath, '被篡改的坏正文');

    // 再次读取：hash 核验必须失败
    await expect(repo.read(record.candidateRef)).rejects.toThrowError(
      /candidate-hash-mismatch|篡改|hash/i,
    );
  });

  it('不存在的 candidateRef 读取返回 null', async () => {
    const res = await repo.read('cand-nonexistent_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    expect(res).toBeNull();
  });

  it('严格防范路径穿越，候选无法通过路径参数访问或覆盖 content/log', async () => {
    // 非法 candidateId 尝试路径穿越
    await expect(repo.save('../content/log/malicious', 'hacked')).rejects.toThrow();
    await expect(repo.save('/etc/passwd', 'hacked')).rejects.toThrow();
    await expect(repo.save('cand/sub', 'hacked')).rejects.toThrow();
    await expect(repo.save('cand..id', 'hacked')).rejects.toThrow();

    // 非法 candidateRef 尝试读取
    await expect(repo.read('../../content/log/article.md')).rejects.toThrow();
    await expect(repo.read('/etc/shadow')).rejects.toThrow();
    await expect(repo.read('../cand_123')).rejects.toThrow();
  });
});
