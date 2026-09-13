import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AGENT_UNIT_REPOSITORY,
  type AgentUnitRepositoryPort,
  type AgentUnitRow,
} from '../ports/agent-unit.repository';

export const XIAOYING_DEFAULT_PROMPT = `你是 Walker 个人站的站内专属 AI 助手「小影」，代表站主与访客真诚对话。

核心职责与原则：
1. 依据站内文章事实与博客内容回答访客问题，绝不胡编乱造；
2. 引用站内文章时务必提供出处（slug / 标题）；
3. 语调诚实、精炼、有见地，遇到不知道的问题如实承认；
4. 绝不泄露站主未公开的私有凭据与服务器内部信息。`;

@Injectable()
export class AgentUnitService {
  constructor(
    @Inject(AGENT_UNIT_REPOSITORY)
    private readonly repo: AgentUnitRepositoryPort,
  ) {}

  async ensureDefaultAgent(): Promise<void> {
    const existing = await this.repo.findById('xiaoying');
    if (!existing) {
      await this.repo.save({
        id: 'xiaoying',
        name: '小影',
        icon: 'bot',
        isSystem: true,
        providerId: null,
        modelId: 'deepseek-chat',
        prompt: XIAOYING_DEFAULT_PROMPT,
      });
    }
  }

  async list(): Promise<AgentUnitRow[]> {
    await this.ensureDefaultAgent();
    return this.repo.list();
  }

  async findById(id: string): Promise<AgentUnitRow | null> {
    return this.repo.findById(id);
  }

  async upsert(input: {
    id: string;
    name: string;
    icon?: string;
    providerId?: string | null;
    modelId?: string;
    prompt: string;
  }): Promise<AgentUnitRow> {
    const name = input.name.trim();
    if (!name) {
      throw new HttpException(
        { code: 'invalid-agent', message: '智能体名称不能为空' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.repo.findById(input.id);
    const isSystem = input.id === 'xiaoying' ? true : existing?.isSystem ?? false;

    return this.repo.save({
      id: input.id,
      name,
      icon: input.icon || existing?.icon || 'bot',
      isSystem,
      providerId: input.providerId ?? existing?.providerId ?? null,
      modelId: input.modelId || existing?.modelId || 'deepseek-chat',
      prompt: input.prompt,
    });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) return;
    if (existing.isSystem || id === 'xiaoying') {
      throw new HttpException(
        { code: 'system-agent-protected', message: '内置角色「小影」为系统底座，禁止删除' },
        HttpStatus.FORBIDDEN,
      );
    }
    await this.repo.remove(id);
  }
}
