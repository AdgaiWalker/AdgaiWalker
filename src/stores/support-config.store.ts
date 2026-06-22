/**
 * Support Config Store — 实现 SupportConfigRepositoryPort
 *
 * 赞赏/支持配置存储（单条，个人收款码模型）的真正实现（Redis + 内存降级）。
 * 存储逻辑从 conversation/store.ts 迁移至此，成为 SupportConfig 域的权威存储入口。
 *
 * Key 约定：
 *   northstar:support-config   单条配置（singleton）
 */
import { getRedis } from '@/stores/redis-client';

import type { SupportConfig, SupportConfigRepositoryPort } from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memorySupportConfig = new Map<string, SupportConfig>();

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

const SUPPORT_CONFIG_KEY = 'northstar:support-config';

// ---------------------------------------------------------------------------
// SupportConfig CRUD
// ---------------------------------------------------------------------------

export async function getSupportConfig(): Promise<SupportConfig | null> {
  const redis = getRedis();
  const fromMemory = memorySupportConfig.get('singleton') ?? null;
  if (!redis) return fromMemory;
  try {
    return (await redis.get<SupportConfig>(SUPPORT_CONFIG_KEY)) ?? fromMemory;
  } catch { return fromMemory; }
}

export async function saveSupportConfig(config: SupportConfig): Promise<void> {
  memorySupportConfig.set('singleton', config);
  const redis = getRedis();
  if (!redis) return;
  await redis.set(SUPPORT_CONFIG_KEY, config);
}

/** 仅测试用：清空内存 SupportConfig。 */
export function __resetMemorySupportConfig(): void {
  memorySupportConfig.clear();
}

// ---------------------------------------------------------------------------
// Port 工厂 —— 上层依赖 SupportConfigRepositoryPort 接口，不依赖具体函数
// ---------------------------------------------------------------------------

export function createSupportConfigStore(): SupportConfigRepositoryPort {
  return {
    async get(): Promise<SupportConfig | null> {
      return getSupportConfig();
    },

    async save(config: SupportConfig): Promise<void> {
      await saveSupportConfig(config);
    },
  };
}
