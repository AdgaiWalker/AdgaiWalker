/**
 * Admin 系统健康事实合同（P0-A02）
 *
 * 状态只来自真实数据：Gateway 调用统计、未解决系统事件、Gateway 配置是否就绪。
 * 没有真实数据时一律落到 `unknown`，绝不硬编码"系统可用"。
 *
 * 状态语义（与 todo P0-A02 对齐）：
 * - healthy      有真实成功调用，且当前无未解决降级事件
 * - degraded     有真实降级（fallback / blocked 调用）或 Gateway 相关未解决事件
 * - unavailable  缺 Gateway 配置或最近探测 API 失败
 * - unknown      没有任何可验证数据
 */

export type AdminSystemHealth = 'healthy' | 'degraded' | 'unavailable' | 'unknown';

export interface AdminSystemStatusPresentation {
  label: string;
  tone: AdminSystemHealth;
  /** 最后一次健康检查时间（ISO 字符串）；unknown/unavailable 也应记录，便于判断"多久没确认" */
  lastCheckedAt?: string;
}

const STATUS_PRESENTATION: Record<AdminSystemHealth, Omit<AdminSystemStatusPresentation, 'lastCheckedAt'>> = {
  healthy: { label: '系统可用', tone: 'healthy' },
  degraded: { label: '系统降级', tone: 'degraded' },
  unavailable: { label: '系统未就绪', tone: 'unavailable' },
  unknown: { label: '状态未知', tone: 'unknown' },
};

export function getAdminSystemStatus(
  health: AdminSystemHealth = 'unknown',
  lastCheckedAt?: string,
): AdminSystemStatusPresentation {
  const base = STATUS_PRESENTATION[health];
  return lastCheckedAt ? { ...base, lastCheckedAt } : base;
}

/**
 * 从真实证据推导后台系统健康状态。
 *
 * 判定顺序（从严到宽）：
 *  1. 无 Gateway 配置（apiKey 为空 / provider 缺失）或最近探测失败 → unavailable
 *  2. 有未解决 Gateway 相关事件 或 最近有 fallback/blocked 调用 → degraded
 *  3. 有成功 AI 调用 → healthy
 *  4. 否则 → unknown
 *
 * 所有输入都是真实事实，调用方负责采集。任一输入缺失按"无证据"处理。
 */
export function deriveAdminSystemHealth(input: {
  /** Gateway 是否已配置（apiKey + provider 齐全）；缺则视为未就绪 */
  configured?: boolean;
  /** 最近一次 Gateway 探测结果；false 表示 API 失败 */
  lastProbeOk?: boolean;
  /** 真实调用统计（来自 getGatewayStats） */
  stats?: {
    totalCalls?: number;
    aiCalls?: number;
    fallbackCalls?: number;
    blockedCalls?: number;
  };
  /** 是否存在未解决的 Gateway 相关系统事件 */
  hasGatewayIncident?: boolean;
}): AdminSystemHealth {
  const { configured, lastProbeOk, stats, hasGatewayIncident } = input;

  // 探测失败优先于其它信号 —— 连接口都打不通时，其余统计已不可信
  if (lastProbeOk === false) return 'unavailable';

  // 缺配置：Gateway 从未接入或被清空
  if (configured === false) return 'unavailable';

  const totalCalls = stats?.totalCalls ?? 0;
  const fallbackCalls = stats?.fallbackCalls ?? 0;
  const blockedCalls = stats?.blockedCalls ?? 0;
  const aiCalls = stats?.aiCalls ?? 0;

  // 真实降级：有过 fallback/blocked，或有未解决 Gateway 事件
  if (fallbackCalls > 0 || blockedCalls > 0 || hasGatewayIncident) return 'degraded';

  // 有成功调用才算 healthy；零调用一律 unknown，不假装 100% 可用
  if (totalCalls > 0 && aiCalls > 0) return 'healthy';

  return 'unknown';
}
