import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { buildAgentModelCatalog, findProvider, parseAgentRevisionInput } from '@walker/shared';
import { ApiError, validationError } from '../common/http-error';
import { AGENT_REVISION_REPOSITORY, type AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import { MODEL_DIRECTORY, type ModelDirectoryPort } from '../ports/model-directory.port';
import { SKILL_CATALOG, type SkillCatalogPort } from '../ports/skill.port';
import { revisionHash } from './agent-config';
import { DEFAULT_AGENT_MODEL_ID } from './agent-unit.service';

@Injectable()
export class AgentCatalogService {
  constructor(
    @Inject(AGENT_REVISION_REPOSITORY) private readonly revisions: AgentRevisionRepositoryPort,
    @Inject(MODEL_DIRECTORY) private readonly directory: ModelDirectoryPort,
    @Inject(SKILL_CATALOG) private readonly skills: SkillCatalogPort,
  ) {}
  async save(agentId: string | null, raw: unknown, actor: string) {
    const config = parseAgentRevisionInput(raw);
    if (!config) throw validationError('修订字段不完整，或包含未知配置');
    if (!agentId && config.baseVersion !== 0) throw validationError('新 Agent 的初始版本必须为 0');
    if (config.providerId) {
      // 提供方以 dsh 目录为唯一真相源（settings.yaml 的接口段），不查自有数据库。
      const provider = findProvider(this.directory.snapshot(), config.providerId);
      if (!provider) throw validationError('提供方不在 dsh 目录中；请先在 dsh 设置里声明该接口');
      // 目录里已声明的模型必须命中。dsh 内置目录不对外导出，未声明时不在本地伪造完整清单：
      // 交由 dsh 在请求时校验（未知模型会得到明确错误），而不是用不完整的清单误拒合法模型。
      if (provider.models.length > 0 && !provider.models.some((item) => item.id === config.modelId)) {
        throw validationError('模型不在该提供方的 dsh 目录中');
      }
    } else if (config.modelId !== DEFAULT_AGENT_MODEL_ID && config.modelId !== this.directory.snapshot().defaultModel) {
      // 未选择提供方时模型字段只是草稿占位；运行时继承当前系统默认。
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
  /** Agent 编辑页的提供方/模型目录：直接来自 dsh 原生设置，不落自有库。 */
  async models() {
    return buildAgentModelCatalog(this.directory.snapshot());
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
