import { beforeEach, describe, expect, it } from 'vitest';
import { clearStoredToken, getStoredToken, setStoredToken } from './auth-token';

describe('auth-token', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('能正确存储、读取与清理 token', () => {
    expect(getStoredToken()).toBeNull();
    setStoredToken('test-jwt');
    expect(getStoredToken()).toBe('test-jwt');
    clearStoredToken();
    expect(getStoredToken()).toBeNull();
  });
});
