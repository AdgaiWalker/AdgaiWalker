import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { parseAgentRevisionInput } from '@walker/shared';
import { ApiError, validationError } from '../common/http-error';
import { AGENT_REVISION_REPOSITORY, type AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import { MODEL_PROVIDER_REPOSITORY, type ModelProviderRepositoryPort } from '../ports/model-provider.repository';
import { SKILL_CATALOG, type SkillCatalogPort } from '../ports/skill.port';
import { revisionHash } from './agent-config';

@Injectable()
export class AgentCatalogService {
  constructor(
    @Inject(AGENT_REVISION_REPOSITORY) private readonly revisions: AgentRevisionRepositoryPort,
    @Inject(MODEL_PROVIDER_REPOSITORY) private readonly providers: ModelProviderRepositoryPort,
    @Inject(SKILL_CATALOG) private readonly skills: SkillCatalogPort,
  ) {}
  async save(agentId: string | null, raw: unknown, actor: string) {
    const config = parseAgentRevisionInput(raw);
    if (!config) throw validationError('修订字段不完整，或包含未知配置');
    if (!agentId && config.baseVersion !== 0) throw validationError('新 Agent 的初始版本必须为 0');
    if (config.providerId) {
      const provider = await this.providers.findById(config.providerId);
      if (!provider?.enabled) throw validationError('供应商不存在或已停用');
      let models: unknown;
      try { models = JSON.parse(provider.modelsJson); } catch { throw validationError('供应商模型目录无效'); }
      if (!Array.isArray(models) || !models.some((item) => item?.id === config.modelId)) throw validationError('模型不在该供应商目录中');
    } else if (config.modelId !== 'deepseek-chat') {
      throw validationError('未连接供应商的草稿只能保留默认模型');
    }
    const id = agentId ?? `agent-${createHash('sha256').update(`${actor}\0${config.requestKey}`).digest('hex').slice(0, 32)}`;
    const revisionId = createHash('sha256').update(`${id}\0${config.requestKey}`).digest('hex');
    return this.revisions.save({ agentId: id, revisionId, configHash: revisionHash(config), config, create: !agentId, actor });
  }
  async detail(agentId: string) {
    const detail = await this.revisions.detail(agentId);
    if (!detail) throw new ApiError('agent-not-found', 404, '找不到 Agent');
    return detail;
  }
  archive(agentId: string, actor: string) { return this.revisions.archive(agentId, actor); }
  importLegacy(actor: string) { return this.revisions.importLegacy(actor); }
  async models() {
    return (await this.providers.list()).filter((provider) => provider.enabled)
      .map(({ id, name, models }) => ({ id, name, models }));
  }
  async importSkill(agentId: string, skillId: string, raw: unknown, actor: string) {
    const config = parseAgentRevisionInput(raw);
    if (!config) throw validationError('导入配置无效');
    const lookup = await this.skills.find(skillId);
    if (!lookup.ok) throw validationError('无法读取指定技能');
    return this.save(agentId, { ...config, prompt: lookup.skill.systemPrompt }, actor);
  }
  async exportRevision(agentId: string, revisionId: string) {
    const detail = await this.detail(agentId);
    const revision = detail.revisions.find((item) => item.id === revisionId);
    if (!revision) throw new ApiError('revision-not-found', 404, '找不到该修订');
    return { filename: 'SKILL.md', markdown: `---\nname: ${JSON.stringify(detail.name)}\nversion: ${revision.version}\nconfigHash: ${revision.configHash}\n---\n\n${revision.prompt}\n` };
  }
}
