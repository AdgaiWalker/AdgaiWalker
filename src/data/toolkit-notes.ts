export const aiModelNotes: [string, string][] = [
  ['ChatGPT / GPT', '适合代码实现、需求拆解、文档整理和复杂问答。'],
  ['Claude', '适合长上下文架构讨论、代码审查、Demo 串联和重构方案。'],
  ['Gemini', '适合多模态理解、设计参考分析、视觉稿和长材料消化。'],
];

export const workflowNotes: [string, string][] = [
  ['调研', '先用搜索和信息源建立事实，再让模型总结差异与风险。'],
  ['设计', '把 PRD、参考站和约束放在同一上下文里，先定信息架构再做视觉。'],
  ['编码', '把任务拆成小步，每步构建验证，减少一次性大改带来的回退成本。'],
];

export const savingNotes: [string, string][] = [
  ['复用上下文', '稳定项目背景写进 PRD 或 README，避免每次重新解释。'],
  ['分层提问', '先问方案和边界，再给具体文件实现，减少无效生成。'],
  ['保留中间产物', '把可复用 prompt、检查清单和脚本沉淀成 Skill 或文档。'],
];
