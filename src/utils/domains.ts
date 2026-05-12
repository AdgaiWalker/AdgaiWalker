export const CATEGORY_LABELS: Record<string, string> = {
  ai: 'AI 探索',
  life: '生活',
};

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  ai: '从生活中提炼的 AI 思考、实践和探索',
  life: '日常中的生活记录、灵感来源与反思',
};

// Legacy alias — some components may still import DOMAIN_LABELS
export const DOMAIN_LABELS = CATEGORY_LABELS;
