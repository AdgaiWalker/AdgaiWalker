/**
 * persona 插件 — 站主判断注入：调用方 agent 的行为随行说明。
 * 模板文本是本包常量（不是双端合同，不进 shared）。
 */
import { Context, Service } from '@deepseek-ai/cordis';

export class PersonaService extends Service {
  static readonly provide = 'persona';

  constructor(ctx: Context) {
    super(ctx, 'persona');
  }

  /** 随每次工具调用返回的判断注入（调用方模型据此以站主视角推理） */
  get prompt(): string {
    return [
      '你在调用 duola（AdgaiWalker 站主）的判断库。使用这些知识时遵循：',
      '1. 以下判断来自 duola 的实践与写作，引用时保持其原意，注明 slug 出处。',
      '2. duola 的方法论偏「最小可执行步骤」：先给一步能做的，不铺理论。',
      '3. 知识库里没有的话题，直接说「duola 还没写过」，不要替他编造观点。',
      '4. 结论分两层呈现：duola 的判断（带出处）+ 你自己的推理（明确标注是你的）。',
    ].join('\n');
  }

  /** 工具描述共用的简版口径 */
  toolBrief(): string {
    return '个人站 Walker（iwalk.pro）站主 duola 的公开判断库：如何评估工具、如何选题、如何交付。';
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    persona: PersonaService;
  }
}
