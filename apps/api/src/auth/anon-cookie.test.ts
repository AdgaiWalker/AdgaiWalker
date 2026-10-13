import { describe, expect, it } from 'vitest';
import { hashAnonId, resolveOrSetAnonId } from './anon-cookie';

function fakeRes() {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  };
}

describe('匿名 cookie（V08）', () => {
  it('签发 64 位随机 hex，带 HttpOnly/SameSite=Lax/Secure', () => {
    const res = fakeRes();
    const id = resolveOrSetAnonId(undefined, res as never);
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    const cookie = res.headers['Set-Cookie']!;
    expect(cookie).toContain(`walker-anon=${id}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
  });

  it('合法 token 原样沿用不重签；形状不符的注入值一律重签', () => {
    const good = fakeRes();
    const token = 'a'.repeat(64);
    expect(resolveOrSetAnonId(`walker-anon=${token}`, good as never)).toBe(token);
    expect(good.headers['Set-Cookie']).toBeUndefined();

    for (const injected of ['../../etc/passwd', 'aaaaaaaa-uuid-like-1111-222222222222', 'x'.repeat(63), 'z'.repeat(64)]) {
      const res = fakeRes();
      const id = resolveOrSetAnonId(`walker-anon=${encodeURIComponent(injected)}`, res as never);
      expect(id).toMatch(/^[a-f0-9]{64}$/);
      expect(id).not.toBe(injected);
      expect(res.headers['Set-Cookie']).toContain(`walker-anon=${id}`);
    }
  });

  it('hashAnonId 稳定且不同输入不同 hash', () => {
    expect(hashAnonId('a'.repeat(64))).toBe(hashAnonId('a'.repeat(64)));
    expect(hashAnonId('a'.repeat(64))).not.toBe(hashAnonId('b'.repeat(64)));
    expect(hashAnonId('x')).toMatch(/^[a-f0-9]{64}$/);
  });
});
