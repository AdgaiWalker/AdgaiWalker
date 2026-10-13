/**
 * Agent 级模型与凭据配置（站主 2026-09-23：「每个 agent 可单独配置 token/apikey」）。
 *
 * 语义（站主定稿）：
 * - **独立配置，可选全局**：Agent 填了自己的 Key 就用自己的；没填则回落共享层（全局）那把。
 *   这样既能隔离，又不会因为某个 Agent 没配而整个跑不动。
 * - **模型 ID 必填、名称选填**：ID 是真正发给上游的标识；名称只用于界面显示，留空回落 ID。
 *
 * 落点（每个 Agent 一个独立 home，R26）：
 *   <home>/agents/<agentId>/settings.yaml      该 Agent 的模型与凭据引用
 *   <home>/agents/<agentId>/credentials.env    该 Agent 自己的 Key（明文 0600，不进 Git）
 *
 * **绝不返回值**：视图只回「有没有」与「来自哪一层」。
 */
import { Inject, Injectable } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import {
  agentHomeDir,
  KNOWN_PROVIDER_INTERFACES,
  type AgentModelConfigInput,
  type AgentModelConfigView,
  type CredentialScope,
} from '@walker/shared';
import { ApiError, validationError } from '../common/http-error';
import { AGENT_REVISION_REPOSITORY, type AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import { MODEL_DIRECTORY, type ModelDirectoryPort } from '../ports/model-directory.port';
import { readAllCredentials } from '../runtime/dsh-credentials-file';
import {
  mergeSettingsProviderRoute,
  mergeSettingsSection,
  readSettingsObject,
  removeSettingsField,
  removeSettingsSection,
} from '../runtime/dsh-settings-file';

/** 凭据引用名必须是可作环境变量名的形态，避免把任意字符串写进子进程环境。 */
const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 模型 id 的形态约束：非空、无首尾空白、长度上限。 */
function validModelId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return null;
  return trimmed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

@Injectable()
export class AgentModelConfigService {
  constructor(
    @Inject(MODEL_DIRECTORY) private readonly directory: ModelDirectoryPort,
    @Inject(AGENT_REVISION_REPOSITORY) private readonly revisions: AgentRevisionRepositoryPort,
  ) {}

  /** 该 Agent 的 home 目录（非法 id fail-closed）。 */
  #home(agentId: string): string {
    return agentHomeDir(this.directory.homeDir(), agentId);
  }

  /** Agent 必须真实存在，避免给任意字符串建目录。 */
  async #assertExists(agentId: string): Promise<void> {
    const detail = await this.revisions.detail(agentId);
    if (!detail) throw new ApiError('agent-not-found', 404, '找不到 Agent');
  }

  /** 读取该 Agent 的模型与凭据配置（合并共享层，标注来源）。 */
  async read(agentId: string): Promise<AgentModelConfigView> {
    await this.#assertExists(agentId);
    const home = this.#home(agentId);
    const ownDoc = readSettingsObject(path.join(home, 'settings.yaml'));
    const snapshot = this.directory.snapshot();
    const sharedRefs = new Set(readAllCredentials(this.directory.homeDir()).keys());
    const ownRefs = readAllCredentials(home);

    const ownDefault = asRecord(ownDoc['agent-default-model']) ?? {};

    const sharedView = this.directory.agentHome(agentId);
    const providerId = asString(ownDefault.provider) ?? sharedView.defaultProvider;
    const ownSection = providerId
      ? (this.directory.snapshot().providers.find((item) => item.id === providerId)?.interfaceName === 'llm-pi-ai'
        ? asRecord(asRecord(asRecord(ownDoc['llm-pi-ai'])?.providers)?.[providerId])
        : asRecord(ownDoc['llm-deepseek'])) ?? {}
      : {};
    const modelId = asString(ownDefault.model) ?? sharedView.defaultModel;
    const effectiveProvider = snapshot.providers.find((item) => item.id === providerId);
    const apiKeyRef = asString(ownSection.apiKeyEnv)
      ?? snapshot.providers.find((item) => item.id === providerId)?.apiKeyRef
      ?? sharedView.apiKeyRef;

    // 凭据来源：Agent 自己那份里有值 → agent；否则共享层里有值 → shared；都没有 → none。
    const hasOwnCredential = apiKeyRef !== null && ownRefs.has(apiKeyRef);
    const hasSharedCredential = apiKeyRef !== null && sharedRefs.has(apiKeyRef);
    const credentialScope: CredentialScope = hasOwnCredential
      ? 'agent'
      : hasSharedCredential
        ? 'shared'
        : 'none';

    return {
      agentId,
      homeDir: home,
      providerId,
      modelId,
      // 显示名未设时回落 modelId（ID 必填、名称选填）。
      modelName: asString(ownDefault.modelName) ?? modelId,
      baseURL: effectiveProvider?.baseURL ?? null,
      protocol: effectiveProvider?.protocol ?? null,
      providerFromAgent: asString(ownDefault.provider) !== null,
      modelFromAgent: asString(ownDefault.model) !== null,
      apiKeyRef,
      credentialScope,
      hasCredential: hasOwnCredential || hasSharedCredential,
      hasOwnCredential,
      knownProviders: KNOWN_PROVIDER_INTERFACES.map((item) => item.route),
    };
  }

  /**
   * 保存该 Agent 的模型与凭据配置。PATCH 语义：字段不传表示不改动。
   * 只写该 Agent 自己的覆盖层，**绝不触碰共享层**——这是隔离的底线。
   */
  async save(agentId: string, input: AgentModelConfigInput): Promise<AgentModelConfigView> {
    await this.#assertExists(agentId);
    const home = this.#home(agentId);
    const settingsPath = path.join(home, 'settings.yaml');

    const current = await this.read(agentId);

    // --- 提供方：显式 null 清空；给了就校验存在于目录 ---
    let providerId = current.providerId;
    const inheritDefault = input.providerId === null || input.providerId === '';
    if (input.providerId !== undefined) {
      if (input.providerId === null || input.providerId === '') {
        providerId = null;
      } else {
        const provider = snapshotProvider(this.directory, input.providerId);
        if (!provider) throw validationError('提供方不在目录中；请先在设置里登记该接口');
        providerId = provider.id;
      }
    }

    // --- 模型：ID 必填（给了就要合法），名称选填 ---
    let modelId = current.modelId;
    if (input.modelId !== undefined && !inheritDefault) {
      const parsed = validModelId(input.modelId);
      if (!parsed) throw validationError('模型 ID 不能为空，且不超过 200 个字符');
      modelId = parsed;
    }
    // 名称选填：null = 清掉自定义名（此后回落 ID）；字符串 = 非空才写入。
    // 注意不能用空串表示「清空」——YAML 里空串和「没有该字段」在合并后无法区分。
    const modelName = input.modelName === undefined ? undefined : (input.modelName.trim() || null);

    if (!modelId) throw validationError('请先填写模型 ID');

    // --- 凭据引用名：显式给了就用它，否则**跟随提供方** ---
    //
    // 关键：引用名必须跟着提供方走。曾经这里直接沿用 current.apiKeyRef，
    // 于是把提供方换成 Anthropic 后，引用名还停在 DEEPSEEK_API_KEY——
    // 配置看起来对、实际会拿 DeepSeek 的 Key 去打 Anthropic。
    const provider = providerId ? snapshotProvider(this.directory, providerId) : null;
    const providerDefaultRef = provider?.apiKeyRef ?? null;

    let apiKeyRef: string;
    if (input.apiKeyRef !== undefined && input.apiKeyRef.trim()) {
      const ref = input.apiKeyRef.trim();
      if (!REF_PATTERN.test(ref)) throw validationError('凭据引用名只能包含字母、数字与下划线，且不能以数字开头');
      apiKeyRef = ref;
    } else if (providerId === null) {
      // 清空专用提供方表示回落共享默认；独立 Key 仍可覆盖同一引用名。
      const sharedDefault = this.directory.snapshot().defaultProvider;
      apiKeyRef = (sharedDefault && snapshotProvider(this.directory, sharedDefault)?.apiKeyRef)
        ?? `AGENT_${agentId.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}_API_KEY`;
    } else if (current.providerId === providerId && current.apiKeyRef) {
      // 提供方没变：沿用当前引用名（站主可能手工改过）。
      apiKeyRef = current.apiKeyRef;
    } else {
      // 提供方变了（或首次配置）：用该提供方自己的默认引用名。
      apiKeyRef = providerDefaultRef ?? `AGENT_${agentId.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}_API_KEY`;
    }

    // --- 写 Agent 覆盖层的 settings.yaml（保留式合并，不碰共享层） ---
    if (inheritDefault) {
      removeSettingsField(settingsPath, 'agent-default-model', 'provider');
      removeSettingsField(settingsPath, 'agent-default-model', 'model');
      removeSettingsField(settingsPath, 'agent-default-model', 'modelName');
    } else {
      const defaultSection: Record<string, unknown> = {};
      if (input.providerId !== undefined && providerId) defaultSection.provider = providerId;
      if (input.modelId !== undefined) defaultSection.model = modelId;
      if (Object.keys(defaultSection).length) mergeSettingsSection(settingsPath, 'agent-default-model', defaultSection);
      // 名称用删字段表达清空，否则界面会继续显示旧名。
      if (modelName) mergeSettingsSection(settingsPath, 'agent-default-model', { modelName });
      else if (input.modelName !== undefined) removeSettingsField(settingsPath, 'agent-default-model', 'modelName');
    }

    // 凭据引用名写进该 Agent 使用的适配器段；**换提供方时清掉旧段**，
    // 否则旧适配器段残留，运行时可能按旧段的引用名去取 Key。
    const nextInterface = provider?.interfaceName ?? 'llm-deepseek';
    for (const known of KNOWN_PROVIDER_INTERFACES) {
      if (providerId === null || known.settingsSection !== nextInterface) {
        removeSettingsSection(settingsPath, known.settingsSection);
      }
    }
    if (providerId === null) {
      // Inherit the shared route; no local adapter section should shadow it.
    } else if (nextInterface === 'llm-pi-ai') {
      mergeSettingsProviderRoute(settingsPath, providerId, { apiKeyEnv: apiKeyRef });
    } else {
      mergeSettingsSection(settingsPath, nextInterface, { apiKeyEnv: apiKeyRef });
    }

    // --- 凭据值：只写该 Agent 自己的文件 ---
    const apiKey = input.apiKey;
    if (typeof apiKey === 'string' && apiKey.trim()) {
      writeAgentCredential(home, apiKeyRef, apiKey.trim());
    } else if (apiKey === null) {
      removeAgentCredential(home, apiKeyRef);
    }

    return this.read(agentId);
  }
}

/** 按路由找提供方（找不到返回 null，由调用方 fail-closed）。 */
function snapshotProvider(directory: ModelDirectoryPort, route: string) {
  return directory.snapshot().providers.find((item) => item.id === route) ?? null;
}

/**
 * 写该 Agent 自己的凭据文件。
 * 复用共享层的解析/写入语义，但目录是 Agent 的 home，绝不写到共享层。
 */
function writeAgentCredential(home: string, ref: string, value: string): void {
  const file = path.join(home, 'credentials.env');
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const kept = existing
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return true;
      const eq = trimmed.indexOf('=');
      return eq <= 0 || trimmed.slice(0, eq).trim() !== ref;
    })
    .join('\n')
    .replace(/\n*$/, '\n');
  const body = `${kept}${ref}=${value}\n`;
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, body, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** 删除该 Agent 自己的某个引用。 */
function removeAgentCredential(home: string, ref: string): void {
  const file = path.join(home, 'credentials.env');
  if (!fs.existsSync(file)) return;
  const kept = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return true;
      const eq = trimmed.indexOf('=');
      return eq <= 0 || trimmed.slice(0, eq).trim() !== ref;
    })
    .join('\n');
  fs.writeFileSync(file, kept.replace(/\n*$/, '\n'), { encoding: 'utf8', mode: 0o600 });
}
