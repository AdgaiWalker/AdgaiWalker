export const poolStatusLabels = {
  candidate: '候选',
  'in-pool': '已入池',
  discarded: '已丢弃',
} as const;

export const poolActions = {
  intoPool: { status: 'in-pool' as const, label: '入池' },
  discard: { status: 'discarded' as const, label: '丢弃' },
};

const sourceLabels: Record<string, string> = {
  'manual-self': '站主热记',
  'tools-visitor': '访客卡口',
  wechat: '微信',
  live: '直播',
  'other-external': '外部',
};

export function labelPool(status: string): string {
  return poolStatusLabels[status as keyof typeof poolStatusLabels] ?? status;
}

export function labelSource(source: string): string {
  return sourceLabels[source] ?? source;
}

export function labelExecutionStatus(status: string): string {
  const map: Record<string, string> = {
    doing: '进行中',
    delivered: '已交付',
    reviewed: '已检验',
  };
  return map[status] ?? status;
}

export function labelOutcome(outcome: string | null): string {
  if (!outcome) return '未检';
  const map: Record<string, string> = {
    yes: '有用',
    no: '没用',
    unclear: '不清',
  };
  return map[outcome] ?? outcome;
}
