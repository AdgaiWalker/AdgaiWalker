/**
 * 模型目录预设 —— 「添加供应商」时的起点，不是权威清单。
 *
 * 为什么放 shared：admin 的添加表单与 api 的校验要看到同一份目录
 * （预设 id / baseUrl / 模型起点），各写一遍迟早漂移。
 *
 * 纪律：预设只填「官方 openai-compatible 端点 + 常见模型起点」，
 * 目录本身以 `ModelProvider.modelsJson` 为准（用户可增删，中转模型名必然手工填）。
 */

export type ModelProviderCategory = 'official' | 'relay' | 'custom';

export type ModelProviderPreset = {
  /** 落库 id；同 id 重复添加视为更新 */
  id: string;
  name: string;
  category: ModelProviderCategory;
  baseUrl: string;
  /** 常见模型起点（展示用 id，用户可自由增删） */
  models: string[];
  /** 官方控制台/文档地址，提示用户去哪拿 Key */
  keyHint?: string;
};

export const MODEL_PROVIDER_PRESETS: readonly ModelProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek 官方',
    category: 'official',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyHint: 'https://platform.deepseek.com',
  },
  {
    id: 'openai',
    name: 'OpenAI 官方',
    category: 'official',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4.1', 'o4-mini'],
    keyHint: 'https://platform.openai.com',
  },
  {
    id: 'anthropic',
    name: 'Anthropic 官方（OpenAI 兼容端点）',
    category: 'official',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
    keyHint: 'https://console.anthropic.com',
  },
  {
    id: 'gemini',
    name: 'Google Gemini（OpenAI 兼容端点）',
    category: 'official',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    keyHint: 'https://aistudio.google.com',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    category: 'official',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.6', 'glm-4.5-air'],
    keyHint: 'https://open.bigmodel.cn',
  },
  {
    id: 'moonshot',
    name: '月之暗面 Kimi',
    category: 'official',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2-0905-preview', 'moonshot-v1-8k'],
    keyHint: 'https://platform.moonshot.cn',
  },
  {
    id: 'dashscope',
    name: '阿里通义百炼',
    category: 'official',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    keyHint: 'https://bailian.console.aliyun.com',
  },
  {
    id: 'siliconflow',
    name: '硅基流动（聚合）',
    category: 'relay',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3.1', 'Qwen/Qwen3-235B-A22B'],
    keyHint: 'https://cloud.siliconflow.cn',
  },
  {
    id: 'relay-custom',
    name: '自建/第三方中转（one-api / new-api）',
    category: 'relay',
    baseUrl: '',
    models: [],
    keyHint: '填中转地址与令牌后，用「拉取模型列表」自动填充目录',
  },
];

export function findModelProviderPreset(id: string): ModelProviderPreset | undefined {
  return MODEL_PROVIDER_PRESETS.find((preset) => preset.id === id);
}
