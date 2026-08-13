import { Injectable } from '@nestjs/common';
import type { WechatDraftSessionPort } from '../ports/wechat-draft-session.port';

@Injectable()
export class UnavailableWechatDraftSession implements WechatDraftSessionPort {
  async saveDraft() {
    return { saved: false, reason: 'wechat-session-unavailable' };
  }
}
