/**
 * 凭据管理用例
 * 职责：列表脱敏、按名 upsert（加密）、按 id 揭示（解密）、删除。
 * 明文只在本服务边界内存在：入库前加密，揭示时解密。
 */
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CredentialCipher } from '../auth/credential-cipher';
import {
  CREDENTIAL_REPOSITORY,
  type CredentialPublicRow,
  type CredentialRepositoryPort,
} from '../ports/credential.repository';

export class CredentialMasterKeyMissingError extends HttpException {
  constructor() {
    super(
      {
        code: 'credential-master-key-missing',
        message:
          'WALKER_CREDENTIAL_MASTER_KEY 未配置（64 位 hex，32 字节）；凭据管理不可用',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

@Injectable()
export class CredentialsService {
  constructor(
    @Inject(CREDENTIAL_REPOSITORY)
    private readonly repo: CredentialRepositoryPort,
  ) {}

  list(): Promise<CredentialPublicRow[]> {
    return this.repo.list();
  }

  async upsert(input: {
    name: string;
    provider: string;
    secret: string;
    note?: string | null;
  }): Promise<CredentialPublicRow> {
    const cipher = this.requireCipher();
    const name = input.name.trim();
    const provider = input.provider.trim();
    const secret = input.secret;
    if (!name || !provider) {
      throw new HttpException(
        { code: 'invalid-credential', message: 'name 与 provider 不能为空' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (secret.trim().length < 8) {
      throw new HttpException(
        { code: 'invalid-credential', message: '密钥长度至少 8 位' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const existing = await this.repo.findByName(name);
    const box = cipher.encrypt(secret);
    const row = await this.repo.save({
      id: existing?.id ?? randomUUID(),
      name,
      provider,
      ciphertext: box.ciphertext,
      iv: box.iv,
      authTag: box.authTag,
      last4: secret.slice(-4),
      note: input.note?.trim() ? input.note.trim() : null,
    });
    return this.toPublic(row.id, row.name, row.provider, row.last4, row.note, row.updatedAt);
  }

  async reveal(id: string): Promise<{ name: string; provider: string; secret: string }> {
    const cipher = this.requireCipher();
    const row = await this.repo.findById(id);
    if (!row) {
      throw new HttpException(
        { code: 'credential-not-found', message: '凭据不存在' },
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      name: row.name,
      provider: row.provider,
      secret: cipher.decrypt({
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.authTag,
      }),
    };
  }

  async remove(id: string): Promise<void> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new HttpException(
        { code: 'credential-not-found', message: '凭据不存在' },
        HttpStatus.NOT_FOUND,
      );
    }
    await this.repo.remove(id);
  }

  private requireCipher(): CredentialCipher {
    const cipher = CredentialCipher.fromEnv();
    if (!cipher) throw new CredentialMasterKeyMissingError();
    return cipher;
  }

  private toPublic(
    id: string,
    name: string,
    provider: string,
    last4: string,
    note: string | null,
    updatedAt: Date,
  ): CredentialPublicRow {
    return { id, name, provider, last4, note, updatedAt };
  }
}
