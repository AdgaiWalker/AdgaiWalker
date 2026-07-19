/**
 * ContentTelemetry Service —— 内容阅读深度遥测业务编排（P3-A）
 *
 * 职责：
 * - 验证 contentId 对应真实公开内容（不存在 → content-not-found）。
 * - 规整 eventType 与 progress（content_complete 恒为 1；content_progress 限 0–1）。
 * - sourceTopicId 从内容元数据派生，忽略客户端传入。
 * - readerToken 透传但服务端不信任客户端其他字段；readerToken 仅用于近期窗口去重。
 * - 写入事件；返回 eventId 与服务端派生的关联。
 * - 生产缺 Redis 时返回 storage-unavailable，不静默丢事件制造假持久。
 *
 * 隐私：不存储 IP / referrer / UA（不支持"改进哪篇"决策的数据不采）。
 */

import { randomUUID } from 'node:crypto';

import { getPublishedContentItems } from '@/knowledge/content';
import { getRedis } from '@/conversation/store';
import { createContentTelemetryStore } from '@/stores/content-telemetry.store';
import { resolveStorageMode } from '@/lib/storage-mode';
import type { StorageMode } from '@/lib/storage-mode';
import type {
  ContentTelemetryEvent,
  ContentTelemetryEventType,
  ContentTelemetryRepositoryPort,
} from '@/stores/ports';

import type {
  ContentTelemetryResult,
  ContentTelemetryServicePort,
  ContentTelemetrySubmitInput,
} from './interfaces';

const VALID_EVENT_TYPES: ContentTelemetryEventType[] = ['content_progress', 'content_complete'];
const COMPLETE_PROGRESS = 1;

/**
 * 显式解析 environment，补既有服务把 Vercel preview 误标 development 的缺口。
 * ContentFeedback 既有实现只二分 PROD → production/development，preview 被并进 development。
 * 这里读 VERCEL_ENV 区分 preview，使遥测事件携带准确环境（支持"预览部署数据不污染生产判断"）。
 */
function resolveTelemetryEnvironment(): 'development' | 'preview' | 'production' {
  const vercel = import.meta.env.VERCEL_ENV;
  if (vercel === 'preview') return 'preview';
  if (vercel === 'production') return 'production';
  return import.meta.env.PROD ? 'production' : 'development';
}

function resolveContentTelemetryStorageMode(): StorageMode {
  return resolveStorageMode({ hasRedis: Boolean(getRedis()) });
}

/**
 * 内容 ID + sourceTopicId 派生缓存（TTL 60s）。
 * 遥测是高频端点（每篇阅读多条 beacon），不能每条都全量扫描内容集合
 * （getPublishedContentItems 读 Astro content collection + 投影，成本不低）。
 * 缓存让验证与派生降为 O(1)；TTL 内新发布内容的遥测可能被误拒，可接受（遥测是 best-effort）。
 */
interface ContentLookupCache {
  ids: Set<string>;
  topicById: Map<string, string | undefined>;
  pathById: Map<string, string>;
  at: number;
}
const CONTENT_CACHE_TTL_MS = 60_000;
let contentLookupCache: ContentLookupCache | null = null;

async function getContentLookup(contentId: string): Promise<{ valid: boolean; sourceTopicId?: string; contentPath?: string }> {
  const now = Date.now();
  if (!contentLookupCache || now - contentLookupCache.at > CONTENT_CACHE_TTL_MS) {
    const items = await getPublishedContentItems();
    const ids = new Set<string>();
    const topicById = new Map<string, string | undefined>();
    const pathById = new Map<string, string>();
    for (const item of items) {
      ids.add(item.id);
      topicById.set(item.id, item.sourceTopicId);
      pathById.set(item.id, item.href);
    }
    contentLookupCache = { ids, topicById, pathById, at: now };
  }
  return {
    valid: contentLookupCache.ids.has(contentId),
    sourceTopicId: contentLookupCache.topicById.get(contentId),
    contentPath: contentLookupCache.pathById.get(contentId),
  };
}

/** 仅测试用：清空内容查找缓存。 */
export function __resetTelemetryContentCache(): void {
  contentLookupCache = null;
}

export class ContentTelemetryService implements ContentTelemetryServicePort {
  constructor(options?: { store?: ContentTelemetryRepositoryPort; storageMode?: StorageMode | (() => StorageMode) }) {
    this.store = options?.store ?? createContentTelemetryStore();
    const mode = options?.storageMode;
    this.resolveMode = typeof mode === 'function' ? mode : () => mode ?? resolveContentTelemetryStorageMode();
  }

  private readonly store;
  private readonly resolveMode;

  async submit(input: ContentTelemetrySubmitInput): Promise<ContentTelemetryResult> {
    if (typeof input.contentId !== 'string' || !input.contentId.trim()) {
      return { ok: false, code: 'invalid-input', message: 'contentId 不能为空。' };
    }
    if (!VALID_EVENT_TYPES.includes(input.eventType)) {
      return { ok: false, code: 'invalid-input', message: 'eventType 不合法。' };
    }
    // readerToken 必须由客户端生成且非空；服务端不重新生成（去重依赖客户端 per-page-load 一致性）
    if (typeof input.readerToken !== 'string' || !input.readerToken.trim()) {
      return { ok: false, code: 'invalid-input', message: 'readerToken 不能为空。' };
    }
    // progress 规整：complete 恒 1；progress 限 [0,1]
    const isComplete = input.eventType === 'content_complete';
    const rawProgress = Number(input.progress);
    const progress = isComplete
      ? COMPLETE_PROGRESS
      : Number.isFinite(rawProgress) ? Math.min(1, Math.max(0, rawProgress)) : 0;

    // 验证真实公开内容 + 派生 sourceTopicId（用 TTL 缓存，避免高频 beacon 全量扫描）
    const lookup = await getContentLookup(input.contentId);
    if (!lookup.valid) {
      return { ok: false, code: 'content-not-found', message: '内容不存在。' };
    }

    // 生产缺 Redis 不静默丢事件
    if (this.resolveMode() === 'unavailable') {
      return { ok: false, code: 'storage-unavailable', message: '存储不可用，事件未保存。' };
    }

    const event: ContentTelemetryEvent = {
      eventId: `ct_${randomUUID()}`,
      contentId: input.contentId,
      contentPath: lookup.contentPath ?? '',
      sourceTopicId: lookup.sourceTopicId,
      eventType: input.eventType,
      progress,
      readerToken: input.readerToken.trim(),
      createdAt: new Date().toISOString(),
      environment: resolveTelemetryEnvironment(),
      consentForAnalysis: input.consentForAnalysis === true,
      schemaVersion: 1,
    };

    await this.store.save(event);

    return {
      ok: true,
      code: 'ok',
      eventId: event.eventId,
      sourceTopicId: event.sourceTopicId,
    };
  }

  async findByContent(contentId: string, range?: { from?: string; to?: string }) {
    return this.store.findByContent(contentId, range);
  }

  async findRecent(range?: { from?: string; to?: string }, limit?: number) {
    return this.store.findRecent(range, limit);
  }
}

export function createContentTelemetryService(options?: ConstructorParameters<typeof ContentTelemetryService>[0]): ContentTelemetryServicePort {
  return new ContentTelemetryService(options);
}
