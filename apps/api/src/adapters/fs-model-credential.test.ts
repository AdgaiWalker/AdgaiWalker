import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FsModelCredential, credentialsFilePath } from './fs-model-credential';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function home(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-cred-'));
  roots.push(dir);
  return dir;
}

describe('FsModelCredential（模型凭据存储）', () => {
  it('未配置时 has=false / read=null / remove=false（不谎报）', () => {
    const store = new FsModelCredential(home());
    expect(store.has('DEEPSEEK_API_KEY')).toBe(false);
    expect(store.read('DEEPSEEK_API_KEY')).toBeNull();
    expect(store.remove('DEEPSEEK_API_KEY')).toBe(false);
    expect(fs.existsSync(store.location())).toBe(false);
  });

  it('写入后可读；同值再写不重复落盘；可删除', () => {
    const store = new FsModelCredential(home());
    expect(store.write('DEEPSEEK_API_KEY', 'sk-test-123')).toBe(true);
    expect(store.has('DEEPSEEK_API_KEY')).toBe(true);
    expect(store.read('DEEPSEEK_API_KEY')).toBe('sk-test-123');
    // 同值不产生变更
    expect(store.write('DEEPSEEK_API_KEY', 'sk-test-123')).toBe(false);
    // 换值产生变更
    expect(store.write('DEEPSEEK_API_KEY', 'sk-other')).toBe(true);
    expect(store.read('DEEPSEEK_API_KEY')).toBe('sk-other');
    expect(store.remove('DEEPSEEK_API_KEY')).toBe(true);
    expect(store.has('DEEPSEEK_API_KEY')).toBe(false);
  });

  it('多个引用互不影响', () => {
    const store = new FsModelCredential(home());
    store.write('DEEPSEEK_API_KEY', 'a');
    store.write('OPENAI_API_KEY', 'b');
    expect(store.read('DEEPSEEK_API_KEY')).toBe('a');
    expect(store.read('OPENAI_API_KEY')).toBe('b');
    store.remove('DEEPSEEK_API_KEY');
    expect(store.read('OPENAI_API_KEY')).toBe('b');
  });

  it('保留手工加的注释与未知行（站主可自己编辑该文件）', () => {
    const dir = home();
    fs.writeFileSync(credentialsFilePath(dir), ['# 我自己的备注', 'SOME_NOTE=保持我', ''].join('\n'));
    const store = new FsModelCredential(dir);
    store.write('DEEPSEEK_API_KEY', 'sk-new');
    const text = fs.readFileSync(credentialsFilePath(dir), 'utf8');
    // 写入后仍包含原有内容（parse 会保留未知 key）
    expect(text).toContain('SOME_NOTE=保持我');
    expect(text).toContain('DEEPSEEK_API_KEY=sk-new');
  });

  it('非法引用名与空值 fail-closed', () => {
    const store = new FsModelCredential(home());
    expect(() => store.write('bad ref', 'x')).toThrow(/credential-ref-invalid/);
    expect(() => store.write('ok_REF', '   ')).toThrow(/credential-value-empty/);
  });

  it('值带引号也能正确解析（手工加固引号的情形）', () => {
    const dir = home();
    fs.writeFileSync(credentialsFilePath(dir), 'DEEPSEEK_API_KEY="sk-quoted"\n');
    expect(new FsModelCredential(dir).read('DEEPSEEK_API_KEY')).toBe('sk-quoted');
  });

  it('落盘文件权限为 0600', () => {
    const store = new FsModelCredential(home());
    store.write('DEEPSEEK_API_KEY', 'sk-perm');
    const mode = fs.statSync(store.location()).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
