/**
 * ContentFeedback Service —— 内容阅读反馈业务编排（P1-A）
 *
 * 职责：
 * - 验证 contentId 对应真实公开内容（不存在 → content-not-found；非公开 → content-not-public）。
 * - sourceTopicId 从内容元数据派生，忽略客户端传入。
 * - note 走 redactSensitiveText + compactText 限长脱敏；含 PII 仍保存但已脱敏。
 * - 写入事件；返回 feedbackId 与服务端派生的关联。
 * - 生产缺 Redis 时返回 storage-unavailable，不静默丢反馈制造假持久。
 */

import { randomUUID } from 'node:crypto';

import { getPublishedContentItems } from '@/knowledge/content';
import { compactText, redactSensitiveText } from '@/agent/privacy';
import { getRedis } from '@/conversation/store';
import { createContentFeedbackStore } from '@/stores/content-feedback.store';
import { resolveStorageMode } from '@/lib/storage-mode';
import type { StorageMode } from '@/lib/storage-mode';
import type { ContentFeedbackEvent, ContentFeedbackRepositoryPort, ContentFeedbackSignal } from '@/stores/ports';

import type {
  ContentFeedbackResult,
  ContentFeedbackServicePort,
  ContentFeedbackSubmitInput,
} from './interfaces';

const VALID_SIGNALS: ContentFeedbackSignal[] = ['useful', 'needs-more', 'outdated'];
const MAX_NOTE_LENGTH = 240;

function resolveContentFeedbackStorageMode(): StorageMode {
  return resolveStorageMode({ hasRedis: Boolean(getRedis()) });
}

export class ContentFeedbackService implements ContentFeedbackServicePort {
  constructor(options?: { store?: ContentFeedbackRepositoryPort; storageMode?: StorageMode | (() => StorageMode) }) {
    this.store = options?.store ?? createContentFeedbackStore();
    const mode = options?.storageMode;
    this.resolveMode = typeof mode === 'function' ? mode : () => mode ?? resolveContentFeedbackStorageMode();
  }

  private readonly store;
  private readonly resolveMode;

  async submit(input: ContentFeedbackSubmitInput): Promise<ContentFeedbackResult> {
    if (typeof input.contentId !== 'string' || !input.contentId.trim()) {
      return { ok: false, code: 'invalid-input', message: 'contentId 不能为空。' };
    }
    if (!VALID_SIGNALS.includes(input.signal)) {
      return { ok: false, code: 'invalid-input', message: 'signal 不合法。' };
    }

    // 验证真实公开内容 + 派生 sourceTopicId
    const items = await getPublishedContentItems();
    const content = items.find(item => item.id === input.contentId);
    if (!content) {
      return { ok: false, code: 'content-not-found', message: '内容不存在。' };
    }
    // getPublishedContentItems 已只返回公开内容；这里不重复判可见性

    // note 脱敏 + 限长（允许空）
    let sanitizedNote: string | undefined;
    if (typeof input.note === 'string' && input.note.trim()) {
      const redacted = redactSensitiveText(input.note);
      sanitizedNote = compactText(redacted.text, MAX_NOTE_LENGTH);
    }

    // 生产缺 Redis 不静默丢反馈
    if (this.resolveMode() === 'unavailable') {
      return { ok: false, code: 'storage-unavailable', message: '存储不可用，反馈未保存。' };
    }

    const event: ContentFeedbackEvent = {
      feedbackId: `cf_${randomUUID()}`,
      contentId: content.id,
      contentPath: content.href,
      sourceTopicId: content.sourceTopicId,
      signal: input.signal,
      note: sanitizedNote,
      createdAt: new Date().toISOString(),
      environment: import.meta.env.PROD ? 'production' : 'development',
      consentForAnalysis: input.consentForAnalysis === true,
    };

    await this.store.save(event);

    return {
      ok: true,
      code: 'ok',
      feedbackId: event.feedbackId,
      sourceTopicId: event.sourceTopicId,
    };
  }

  async findByContent(contentId: string, range?: { from?: string; to?: string }) {
    return this.store.findByContent(contentId, range);
  }

  async findByTopic(topicId: string, range?: { from?: string; to?: string }) {
    return this.store.findByTopic(topicId, range);
  }

  async findRecent(range?: { from?: string; to?: string }, limit?: number) {
    return this.store.findRecent(range, limit);
  }
}

export function createContentFeedbackService(options?: ConstructorParameters<typeof ContentFeedbackService>[0]): ContentFeedbackServicePort {
  return new ContentFeedbackService(options);
}
