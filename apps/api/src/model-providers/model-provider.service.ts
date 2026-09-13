import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { CredentialCipher } from '../auth/credential-cipher';
import {
  MODEL_PROVIDER_REPOSITORY,
  type ModelProviderPublicRow,
  type ModelProviderRepositoryPort,
  type ModelProviderRow,
} from '../ports/model-provider.repository';

export class CredentialMasterKeyMissingError extends HttpException {
  constructor() {
    super(
      {
        code: 'credential-master-key-missing',
        message: 'WALKER_CREDENTIAL_MASTER_KEY 未配置；模型凭据加密不可用',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

const DEFAULT_DEEPSEEK_MODELS = [
  { id: 'deepseek-chat', tags: ['通用', '128K'] },
  { id: 'deepseek-reasoner', tags: ['思考', 'R1'] },
];

@Injectable()
export class ModelProviderService {
  constructor(
    @Inject(MODEL_PROVIDER_REPOSITORY)
    private readonly repo: ModelProviderRepositoryPort,
  ) {}

  private requireCipher(): CredentialCipher {
    const cipher = CredentialCipher.fromEnv();
    if (!cipher) throw new CredentialMasterKeyMissingError();
    return cipher;
  }

  async ensureDefaultProvider(): Promise<void> {
    const existing = await this.repo.findById('deepseek');
    if (!existing) {
      await this.repo.save({
        id: 'deepseek',
        name: 'DeepSeek 官方',
        category: 'official',
        enabled: true,
        baseUrl: 'https://api.deepseek.com/v1',
        apiFormat: 'openai-compatible',
        ciphertext: '',
        iv: '',
        authTag: '',
        last4: '',
        modelsJson: JSON.stringify(DEFAULT_DEEPSEEK_MODELS),
      });
    }
  }

  async list(): Promise<ModelProviderPublicRow[]> {
    await this.ensureDefaultProvider();
    return this.repo.list();
  }

  async findById(id: string): Promise<ModelProviderRow | null> {
    return this.repo.findById(id);
  }

  /** 获取解密后的明文 API Key (仅供内部 Runner 调用) */
  async getDecryptedApiKey(id: string): Promise<string> {
    const provider = await this.repo.findById(id);
    if (!provider || !provider.ciphertext) return '';
    const cipher = this.requireCipher();
    return cipher.decrypt({
      ciphertext: provider.ciphertext,
      iv: provider.iv,
      authTag: provider.authTag,
    });
  }

  async upsert(input: {
    id: string;
    name: string;
    category?: string;
    enabled?: boolean;
    baseUrl: string;
    apiFormat?: string;
    apiKey?: string;
    modelsJson?: string;
  }): Promise<ModelProviderPublicRow> {
    const name = input.name.trim();
    const baseUrl = input.baseUrl.trim();
    if (!name || !baseUrl) {
      throw new HttpException(
        { code: 'invalid-model-provider', message: '名称和 Base URL 不能为空' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.repo.findById(input.id);
    let ciphertext = existing?.ciphertext || '';
    let iv = existing?.iv || '';
    let authTag = existing?.authTag || '';
    let last4 = existing?.last4 || '';

    if (input.apiKey && input.apiKey.trim().length > 0) {
      const cipher = this.requireCipher();
      const encrypted = cipher.encrypt(input.apiKey.trim());
      ciphertext = encrypted.ciphertext;
      iv = encrypted.iv;
      authTag = encrypted.authTag;
      last4 = input.apiKey.trim().slice(-4);
    }

    const saved = await this.repo.save({
      id: input.id,
      name,
      category: input.category || existing?.category || 'custom',
      enabled: input.enabled ?? existing?.enabled ?? true,
      baseUrl,
      apiFormat: input.apiFormat || existing?.apiFormat || 'openai-compatible',
      ciphertext,
      iv,
      authTag,
      last4,
      modelsJson: input.modelsJson ?? existing?.modelsJson ?? JSON.stringify(DEFAULT_DEEPSEEK_MODELS),
    });

    let models = [];
    try {
      models = JSON.parse(saved.modelsJson || '[]');
    } catch {
      models = [];
    }

    return {
      id: saved.id,
      name: saved.name,
      category: saved.category,
      enabled: saved.enabled,
      baseUrl: saved.baseUrl,
      apiFormat: saved.apiFormat,
      last4: saved.last4,
      models,
      updatedAt: saved.updatedAt,
    };
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) return;
    if (existing.category === 'official') {
      throw new HttpException(
        { code: 'official-provider-protected', message: '官方预置供应商不可删除' },
        HttpStatus.FORBIDDEN,
      );
    }
    await this.repo.remove(id);
  }

  async ping(id: string): Promise<{ ok: boolean; latencyMs: number; statusText: string }> {
    const provider = await this.repo.findById(id);
    if (!provider) {
      throw new HttpException({ code: 'provider-not-found', message: '供应商不存在' }, HttpStatus.NOT_FOUND);
    }

    const start = Date.now();
    try {
      const url = provider.baseUrl.replace(/\/+$/, '') + '/models';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const apiKey = provider.ciphertext ? await this.getDecryptedApiKey(id) : '';
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      return {
        ok: res.ok,
        latencyMs,
        statusText: `${res.status} ${res.statusText}`,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        latencyMs,
        statusText: msg.includes('abort') ? '请求超时 (4s)' : msg,
      };
    }
  }
}
