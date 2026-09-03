import { afterEach, describe, expect, it } from 'vitest';
import { CredentialCipher } from './credential-cipher';

const KEY = 'a'.repeat(64);

afterEach(() => {
  delete process.env.WALKER_CREDENTIAL_MASTER_KEY;
});

describe('CredentialCipher', () => {
  it('未配置主密钥时 fromEnv 返回 null', () => {
    expect(CredentialCipher.fromEnv()).toBeNull();
  });

  it('非法格式主密钥返回 null', () => {
    process.env.WALKER_CREDENTIAL_MASTER_KEY = 'zz'; // 非 hex
    expect(CredentialCipher.fromEnv()).toBeNull();
  });

  it('加解密往返一致，密文不含明文', () => {
    process.env.WALKER_CREDENTIAL_MASTER_KEY = KEY;
    const cipher = CredentialCipher.fromEnv()!;
    const secret = 'sk-test-1234567890abcdef';
    const box = cipher.encrypt(secret);
    expect(box.ciphertext).not.toContain('sk-test');
    expect(cipher.decrypt(box)).toBe(secret);
  });

  it('每次加密 IV 随机（同明文密文不同）', () => {
    process.env.WALKER_CREDENTIAL_MASTER_KEY = KEY;
    const cipher = CredentialCipher.fromEnv()!;
    const a = cipher.encrypt('same-secret-value');
    const b = cipher.encrypt('same-secret-value');
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(cipher.decrypt(a)).toBe('same-secret-value');
    expect(cipher.decrypt(b)).toBe('same-secret-value');
  });

  it('密文被篡改时解密失败（GCM 认证）', () => {
    process.env.WALKER_CREDENTIAL_MASTER_KEY = KEY;
    const cipher = CredentialCipher.fromEnv()!;
    const box = cipher.encrypt('authentic-secret');
    const tampered = Buffer.from(box.ciphertext, 'base64');
    tampered[0] ^= 0xff;
    expect(() =>
      cipher.decrypt({ ...box, ciphertext: tampered.toString('base64') }),
    ).toThrow();
  });
});
