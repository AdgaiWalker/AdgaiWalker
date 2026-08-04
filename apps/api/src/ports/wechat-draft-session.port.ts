import type { WechatPublicationPackage } from './publication-package.repository';

export interface WechatDraftSessionPort {
  saveDraft(value: WechatPublicationPackage): Promise<{ saved: boolean; draftId?: string; reason?: string }>;
}

export const WECHAT_DRAFT_SESSION = Symbol('WECHAT_DRAFT_SESSION');
