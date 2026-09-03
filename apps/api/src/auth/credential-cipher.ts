import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * 凭据加解密（规则层）
 * 职责：AES-256-GCM；主密钥来自 WALKER_CREDENTIAL_MASTER_KEY（64 位 hex = 32 字节）。
 * 密钥只存服务器 .env / data 目录，绝不进 Git、绝不出现在响应里。
 */
export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export class CredentialCipher {
  private constructor(private readonly key: Buffer) {}

  /** 未配置或格式非法时返回 null（调用方映射为 503，不静默降级） */
  static fromEnv(): CredentialCipher | null {
    const hex = process.env.WALKER_CREDENTIAL_MASTER_KEY?.trim();
    if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) return null;
    return new CredentialCipher(Buffer.from(hex, 'hex'));
  }

  encrypt(plain: string): EncryptedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(box: EncryptedSecret): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(box.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(box.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(box.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
