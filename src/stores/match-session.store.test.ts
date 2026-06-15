import { describe, expect, it } from 'vitest';

import { createMatchSessionStore } from '@/stores/match-session.store';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('createMatchSessionStore', () => {
  const store = createMatchSessionStore();

  it('createSessionId 返回合法 UUID v4', () => {
    expect(store.createSessionId()).toMatch(UUID_V4);
  });

  it('createSessionId 每次返回新 id', () => {
    expect(store.createSessionId()).not.toBe(store.createSessionId());
  });

  it('saveMessages 接收消息列表不抛（无 Redis 时写内存）', async () => {
    await expect(
      store.saveMessages('session-test', [
        { role: 'user', content: '你好', timestamp: new Date().toISOString() },
        { role: 'assistant', content: '在的', timestamp: new Date().toISOString() },
      ]),
    ).resolves.toBeUndefined();
  });

  it('incrementStats 接收分类不抛', async () => {
    await expect(store.incrementStats(['coding', 'learn-ai'])).resolves.toBeUndefined();
  });
});
