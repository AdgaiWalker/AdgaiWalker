import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDraft, saveDraft, clearDraft } from '@/lib/content-draft';

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeStorage());
});

describe('content-draft', () => {
  it('save/load 往返', () => {
    saveDraft('my-slug', '草稿内容');
    const d = loadDraft('my-slug');
    expect(d).not.toBeNull();
    expect(d?.content).toBe('草稿内容');
    expect(d?.ts).toBeGreaterThan(0);
  });

  it('load 不存在返回 null', () => {
    expect(loadDraft('none')).toBeNull();
  });

  it('clear 后 load 返回 null', () => {
    saveDraft('s', 'x');
    clearDraft('s');
    expect(loadDraft('s')).toBeNull();
  });

  it('损坏数据降级为 null，不抛错', () => {
    localStorage.setItem('walker:draft:bad', '{not json');
    expect(loadDraft('bad')).toBeNull();
  });

  it('localStorage 不可用时 save/load 不抛错', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    });
    expect(() => saveDraft('s', 'x')).not.toThrow();
    expect(loadDraft('s')).toBeNull();
  });
});
