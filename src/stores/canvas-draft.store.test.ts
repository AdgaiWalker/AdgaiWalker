import { describe, expect, it, beforeEach } from 'vitest';
import {
  saveCanvasDraft,
  getCanvasDraft,
  __resetMemoryCanvasDrafts
} from './canvas-draft.store';

describe('canvas-draft.store (无 Redis 环境走内存降级)', () => {
  beforeEach(() => {
    __resetMemoryCanvasDrafts();
  });

  it('未保存草稿时返回 null', async () => {
    expect(await getCanvasDraft('post-001')).toBeNull();
  });

  it('能够成功保存和获取草稿', async () => {
    const contentId = 'post-001';
    const draftText = '协作共创的草稿内容。';
    await saveCanvasDraft(contentId, draftText);
    expect(await getCanvasDraft(contentId)).toBe(draftText);
  });

  it('能够更新已有草稿', async () => {
    const contentId = 'post-002';
    await saveCanvasDraft(contentId, '版本 1');
    await saveCanvasDraft(contentId, '版本 2');
    expect(await getCanvasDraft(contentId)).toBe('版本 2');
  });
});
