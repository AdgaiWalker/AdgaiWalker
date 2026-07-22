/**
 * 赞赏配置用例
 * 职责：读配置；合并写（未传字段保留），避免空 body 清盘。
 *
 * 依赖：SupportConfigRepositoryPort
 * 调用：SupportController
 * 触发：GET/PUT /support
 * 实现：repo.get + 字段合并 + repo.save
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  SUPPORT_CONFIG_REPOSITORY,
  type SupportConfig,
  type SupportConfigRepositoryPort,
} from '../ports/support-config.repository';

@Injectable()
export class SupportService {
  constructor(
    @Inject(SUPPORT_CONFIG_REPOSITORY)
    private readonly repo: SupportConfigRepositoryPort,
  ) {}

  get() {
    return this.repo.get();
  }

  async save(partial: Partial<SupportConfig>) {
    const current = await this.repo.get();
    const next: SupportConfig = {
      title: partial.title !== undefined ? partial.title : current.title,
      body: partial.body !== undefined ? partial.body : current.body,
      wechatQrUrl:
        partial.wechatQrUrl !== undefined
          ? partial.wechatQrUrl
          : current.wechatQrUrl,
      alipayQrUrl:
        partial.alipayQrUrl !== undefined
          ? partial.alipayQrUrl
          : current.alipayQrUrl,
      externalLinks:
        partial.externalLinks !== undefined
          ? partial.externalLinks
          : current.externalLinks,
    };
    return this.repo.save(next);
  }
}
