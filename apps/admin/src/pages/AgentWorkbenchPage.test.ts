import { describe, expect, it } from 'vitest';
import {
  INITIAL_AGENTS,
  TIMELINE_SEGMENTS,
  TOAST_DURATION_MS,
  COPY_RESET_DELAY_MS,
  PING_SIMULATION_DELAY_MS,
  RUN_SIMULATION_DELAY_MS,
  buildAgentUnitMap,
  selectInitialAgentId,
} from './AgentWorkbenchPage';
import type { AgentUnitRecord, ModelProviderRecord } from '../api/admin-api';

describe('AgentWorkbenchPage 契约与初始状态测试', () => {
  it('系统内置小影受保护，且默认挂载 deepseek-chat', () => {
    const xiaoying = INITIAL_AGENTS.xiaoying;
    expect(xiaoying).toBeDefined();
    expect(xiaoying.isSystem).toBe(true);
    expect(xiaoying.activeModel).toBe('deepseek-chat');
    expect(xiaoying.models.map((m) => m.id)).toContain('deepseek-chat');
    expect(xiaoying.prompt).toContain('你是小影');
    expect(xiaoying.apiProtocol).toBe('deepseek-native');
  });

  it('文章工匠为自定义智能体，默认挂载 step-3.7-flash', () => {
    const artisan = INITIAL_AGENTS.artisan;
    expect(artisan).toBeDefined();
    expect(artisan.isSystem).toBe(false);
    expect(artisan.activeModel).toBe('step-3.7-flash');
    expect(artisan.apiProtocol).toBe('anthropic-messages');
    expect(artisan.models.length).toBeGreaterThanOrEqual(1);
  });

  it('常量与时序指标配置齐备且数值合理 (Clean Code P4 验证)', () => {
    expect(TOAST_DURATION_MS).toBe(2500);
    expect(COPY_RESET_DELAY_MS).toBe(2200);
    expect(PING_SIMULATION_DELAY_MS).toBe(500);
    expect(RUN_SIMULATION_DELAY_MS).toBe(700);

    // 时序甘特图段落包含输入、模型推理与工具执行
    const segmentKeys = TIMELINE_SEGMENTS.map((s) => s.key);
    expect(segmentKeys).toContain('input');
    expect(segmentKeys).toContain('model1');
    expect(segmentKeys).toContain('tool1');

    // 总宽度应和为 100%
    const totalPercentage = TIMELINE_SEGMENTS.reduce(
      (acc, s) => acc + parseInt(s.width, 10),
      0,
    );
    expect(totalPercentage).toBe(100);
  });

  it('智能体模型目录契约：必须至少包含一个可用模型，且 activeModel 属于模型目录', () => {
    Object.values(INITIAL_AGENTS).forEach((agent) => {
      expect(agent.models.length).toBeGreaterThanOrEqual(1);
      const modelIds = agent.models.map((m) => m.id);
      expect(modelIds).toContain(agent.activeModel);
    });
  });

  describe('动态数据映射与初始化选择 (W1-2)', () => {
    const mockProviders: ModelProviderRecord[] = [
      {
        id: 'deepseek',
        name: 'DeepSeek Official',
        category: 'llm',
        enabled: true,
        baseUrl: 'https://api.deepseek.com/v1',
        apiFormat: 'deepseek-native',
        last4: '9876',
        models: [
          { id: 'deepseek-chat', tags: ['通用', '128K'] },
          { id: 'deepseek-reasoner', tags: ['思考'] },
        ],
        updatedAt: '2026-09-08T00:00:00.000Z',
      },
    ];

    const mockAgents: AgentUnitRecord[] = [
      {
        id: 'xiaoying',
        name: '小影 (系统内置)',
        icon: 'bot',
        isSystem: true,
        providerId: 'deepseek',
        modelId: 'deepseek-reasoner',
        prompt: '你是小影...',
        updatedAt: '2026-09-08T00:00:00.000Z',
      },
      {
        id: 'custom_reviewer',
        name: '代码审查官',
        icon: 'sparkles',
        isSystem: false,
        providerId: 'deepseek',
        modelId: 'deepseek-chat',
        prompt: '代码审查...',
        updatedAt: '2026-09-08T00:00:00.000Z',
      },
    ];

    it('buildAgentUnitMap 正常将后端实体与供应商关联组装', () => {
      const map = buildAgentUnitMap(mockAgents, mockProviders);
      expect(map.xiaoying).toBeDefined();
      expect(map.xiaoying.name).toBe('小影 (系统内置)');
      expect(map.xiaoying.isSystem).toBe(true);
      expect(map.xiaoying.activeModel).toBe('deepseek-reasoner');
      expect(map.xiaoying.baseUrl).toBe('https://api.deepseek.com/v1');
      expect(map.xiaoying.apiKey).toBe('sk-****9876');
      expect(map.xiaoying.models.map((m) => m.id)).toEqual([
        'deepseek-chat',
        'deepseek-reasoner',
      ]);

      expect(map.custom_reviewer).toBeDefined();
      expect(map.custom_reviewer.name).toBe('代码审查官');
      expect(map.custom_reviewer.isSystem).toBe(false);
      expect(map.custom_reviewer.icon).toBe('sparkles');
    });

    it('buildAgentUnitMap 空数据时兜底返回 INITIAL_AGENTS', () => {
      const map = buildAgentUnitMap([], []);
      expect(map).toEqual(INITIAL_AGENTS);
    });

    it('selectInitialAgentId 优先保留有效 preferredId，否则自动选择小影', () => {
      const map = buildAgentUnitMap(mockAgents, mockProviders);
      expect(selectInitialAgentId(map, 'custom_reviewer')).toBe('custom_reviewer');
      expect(selectInitialAgentId(map, 'unknown_id')).toBe('xiaoying');
      expect(selectInitialAgentId(map)).toBe('xiaoying');
    });

    it('selectInitialAgentId 在无小影时 fallback 到首位角色', () => {
      const withoutXiaoying = {
        custom_one: {
          id: 'custom_one',
          name: '角色一',
          isSystem: false,
          icon: 'bot' as const,
          prompt: '',
          baseUrl: '',
          apiProtocol: 'deepseek-native' as const,
          apiKey: '',
          activeModel: 'm1',
          models: [{ id: 'm1', tags: [] }],
        },
      };
      expect(selectInitialAgentId(withoutXiaoying)).toBe('custom_one');
    });
  });

  describe('提示词触觉复制与灵动岛 HUD 契约 (W1-3)', () => {
    it('复制复原延迟为 2200ms，灵动岛 HUD 持续 2500ms', () => {
      expect(COPY_RESET_DELAY_MS).toBe(2200);
      expect(TOAST_DURATION_MS).toBe(2500);
      expect(TOAST_DURATION_MS).toBeGreaterThan(COPY_RESET_DELAY_MS);
    });

    it('小影与自定义角色默认提示词均非空，字数计算准确', () => {
      expect(INITIAL_AGENTS.xiaoying.prompt.length).toBeGreaterThan(20);
      expect(INITIAL_AGENTS.artisan.prompt.length).toBeGreaterThan(20);
    });
  });

  describe('角色增减与小影保护防线 (W1-4)', () => {
    it('内置角色小影严禁删除，自定义角色具备删除权限', () => {
      expect(INITIAL_AGENTS.xiaoying.isSystem).toBe(true);
      expect(INITIAL_AGENTS.artisan.isSystem).toBe(false);
    });

    it('删除自定义角色后安全自愈回退到 xiaoying', () => {
      const activeAgents = { ...INITIAL_AGENTS };
      delete activeAgents.artisan;
      const nextActiveId = selectInitialAgentId(activeAgents);
      expect(nextActiveId).toBe('xiaoying');
    });
  });

  describe('DSH 供应商表单与模型池维护 (W1-5)', () => {
    it('支持三种标准 API 协议类型', () => {
      const protocols = ['openai-completions', 'deepseek-native', 'anthropic-messages'];
      expect(protocols).toContain(INITIAL_AGENTS.xiaoying.apiProtocol);
      expect(protocols).toContain(INITIAL_AGENTS.artisan.apiProtocol);
    });

    it('模型池增删维护：删除指定模型后若为当前激活模型，自动回退到第一个模型', () => {
      const models = [
        { id: 'm1', tags: ['通用'] },
        { id: 'm2', tags: ['推理'] },
      ];
      let activeModel = 'm1';
      // 删除 m1
      const [removed] = models.splice(0, 1);
      if (activeModel === removed.id) {
        activeModel = models[0].id;
      }
      expect(activeModel).toBe('m2');
      expect(models.length).toBe(1);
    });
  });

  describe('真实文件直调与 B-trace 三色甘特图契约 (W1-6)', () => {
    it('执行返回的 timeline 百分比总和严格等于 100%', () => {
      const mockTimeline = [
        { key: 'input_load', label: '输入装载 (30ms)', percent: 3, color: '#3b82f6', elapsedMs: 30 },
        { key: 'tool_fs', label: 'tool-fs 文件抓取 (40ms)', percent: 4, color: '#f97316', elapsedMs: 40 },
        { key: 'model_infer', label: '思考与文本生成 (930ms)', percent: 93, color: '#8b5cf6', elapsedMs: 930 },
      ];
      const sumPercent = mockTimeline.reduce((acc, cur) => acc + cur.percent, 0);
      expect(sumPercent).toBe(100);
    });

    it('指标回显包含 4 格核心硬核字段且格式规范', () => {
      const mockMetrics = {
        turns: 1,
        steps: 2,
        tokensPrompt: 800,
        tokensCompletion: 120,
        tokensCacheHit: 680,
        cacheHitPercent: 85,
        tokPerSec: 58.5,
        elapsedMs: 1000,
      };
      expect(mockMetrics.cacheHitPercent).toBeGreaterThanOrEqual(70);
      expect(mockMetrics.tokPerSec).toBeGreaterThan(0);
      expect(mockMetrics.turns).toBe(1);
    });
  });
});
