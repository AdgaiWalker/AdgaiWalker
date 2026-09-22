import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { CredentialCipher } from '../auth/credential-cipher';
import { credentialPool } from '../runtime/credential-pool';
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
        credentialRevision: 0,
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
  async credentialForRevision(id: string, revision: number): Promise<string> {
    const provider = await this.repo.findById(id);
    if (!provider) {
      throw new HttpException({ code: 'provider-not-found', message: '供应商不存在' }, HttpStatus.NOT_FOUND);
    }
    if (provider.credentialRevision !== revision) {
      throw new HttpException({ code: 'credential-revision-retired', message: '凭据已轮换，旧实例不能再发起调用' }, HttpStatus.CONFLICT);
    }
    credentialPool.claim(id, revision);
    return this.getDecryptedApiKey(id);
  }

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
    let credentialRevision = existing?.credentialRevision ?? 0;
    const previousRevision = credentialRevision;
    let rotated = false;

    if (input.apiKey && input.apiKey.trim().length > 0) {
      let encrypted: { ciphertext: string; iv: string; authTag: string };
      try {
        encrypted = this.requireCipher().encrypt(input.apiKey.trim());
      } catch (error) {
        throw new HttpException({
          code: 'credential-rotation-failed',
          message: error instanceof Error ? error.message : '凭据轮换失败，仍使用上一份已保存凭据',
        }, HttpStatus.BAD_GATEWAY);
      }
      ciphertext = encrypted.ciphertext;
      iv = encrypted.iv;
      authTag = encrypted.authTag;
      last4 = input.apiKey.trim().slice(-4);
      credentialRevision += 1;
      rotated = true;
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
      credentialRevision,
      modelsJson: input.modelsJson ?? existing?.modelsJson ?? JSON.stringify(DEFAULT_DEEPSEEK_MODELS),
    });

    let models = [];
    try {
      models = JSON.parse(saved.modelsJson || '[]');
    } catch {
      models = [];
    }

    if (rotated) {
      credentialPool.retire(saved.id, previousRevision);
      credentialPool.publish(saved.id, saved.credentialRevision);
    }
    return {
      id: saved.id,
      name: saved.name,
      category: saved.category,
      enabled: saved.enabled,
      baseUrl: saved.baseUrl,
      apiFormat: saved.apiFormat,
      last4: saved.last4,
      credentialRevision: saved.credentialRevision,
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

  /**
   * 拉取供应商广告的模型清单（OpenAI 兼容 `GET /models`）。
   * 中转网关（one-api/new-api）与官方端点都支持 —— 「模型目录」不再靠手填。
   */
  async remoteModels(id: string): Promise<{ ids: string[]; source: string }> {
    const provider = await this.repo.findById(id);
    if (!provider) {
      throw new HttpException({ code: 'provider-not-found', message: '供应商不存在' }, HttpStatus.NOT_FOUND);
    }
    const apiKey = provider.ciphertext ? await this.getDecryptedApiKey(id) : '';
    const res = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new HttpException(
        { code: 'remote-models-failed', message: `拉取模型列表失败（${res.status} ${res.statusText}）` },
        HttpStatus.BAD_GATEWAY,
      );
    }
    const payload = (await res.json().catch(() => null)) as
      | { data?: Array<{ id?: unknown }> }
      | null;
    const ids = (payload?.data ?? [])
      .map((item) => item?.id)
      .filter((value): value is string => typeof value === 'string')
      .sort();
    return { ids, source: provider.baseUrl };
  }

  /**
   * 三档验证（照 IDE 的 Verify 按钮）：连通 → 鉴权 → 能力。
   * 用一条真实的 `max_tokens` 受限 chat 同时判定后两档；失败按 LlmError 的
   * 分类语义映射（没配 Key / 401 归鉴权，其余归能力不可用）。
   */
  async verify(
    id: string,
    modelId?: string,
  ): Promise<{
    connectivity: boolean;
    auth: boolean | null;
    capability: boolean | null;
    latencyMs: number;
    detail: string;
  }> {
    const provider = await this.repo.findById(id);
    if (!provider) {
      throw new HttpException({ code: 'provider-not-found', message: '供应商不存在' }, HttpStatus.NOT_FOUND);
    }
    const connectivity = await this.ping(id);
    if (!connectivity.ok) {
      return { connectivity: false, auth: null, capability: null, latencyMs: connectivity.latencyMs, detail: `连通失败：${connectivity.statusText}` };
    }

    let target = modelId?.trim() ?? '';
    if (!target) {
      const models = JSON.parse(provider.modelsJson || '[]') as Array<{ id?: string }>;
      target = models[0]?.id ?? '';
    }
    if (!target) {
      return { connectivity: true, auth: null, capability: null, latencyMs: connectivity.latencyMs, detail: '未指定模型：连通已通过，鉴权与能力需填模型后验证' };
    }

    const apiKey = provider.ciphertext ? await this.getDecryptedApiKey(id) : '';
    if (!apiKey) {
      return { connectivity: true, auth: false, capability: null, latencyMs: connectivity.latencyMs, detail: '未配置 API Key：请在后台填入' };
    }

    const started = Date.now();
    try {
      const res = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: target, messages: [{ role: 'user', content: 'ping' }], max_tokens: 16, stream: false }),
        signal: AbortSignal.timeout(30_000),
      });
      const latencyMs = Date.now() - started;
      if (res.status === 401 || res.status === 403) {
        return { connectivity: true, auth: false, capability: false, latencyMs, detail: `鉴权失败（${res.status}）：Key 无效或过期` };
      }
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 200);
        return { connectivity: true, auth: true, capability: false, latencyMs, detail: `模型 ${target} 拒绝（${res.status}）：${detail}` };
      }
      const payload = (await res.json().catch(() => null)) as
        | { choices?: Array<{ message?: { content?: string } }> }
        | null;
      const text = payload?.choices?.[0]?.message?.content ?? '';
      return {
        connectivity: true,
        auth: true,
        capability: text.trim().length > 0,
        latencyMs,
        detail: `模型 ${target} 应答 ${text.length} 字`,
      };
    } catch (error) {
      return {
        connectivity: true,
        auth: true,
        capability: false,
        latencyMs: Date.now() - started,
        detail: `能力验证失败：${error instanceof Error ? error.message : String(error)}`,
      };
    }
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
