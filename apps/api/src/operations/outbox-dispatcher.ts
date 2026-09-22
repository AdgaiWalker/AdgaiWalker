import { Inject, Injectable } from '@nestjs/common';
import {
  OPERATIONS_JOURNAL, OUTBOX_HANDLERS,
  type OperationsJournalPort, type OutboxHandlers,
} from '../ports/operations-journal.port';

/** 一次至多处理 20 条；副作用与 deliveredAt 在同一数据库事务内。 */
@Injectable()
export class OutboxDispatcher {
  constructor(
    @Inject(OPERATIONS_JOURNAL) private readonly journal: OperationsJournalPort,
    @Inject(OUTBOX_HANDLERS) private readonly handlers: OutboxHandlers,
  ) {}

  async dispatch(now = new Date()): Promise<{ delivered: number; failed: number }> {
    const events = await this.journal.pending(now, 20);
    const counts = { delivered: 0, failed: 0 };
    for (const event of events) {
      try {
        const delivered = await this.journal.transaction(async (tx) => {
          const claimed = await tx.claimOutbox(event.id, event.attempt, now);
          if (!claimed) return false;
          const handler = Object.hasOwn(this.handlers, event.topic) ? this.handlers[event.topic] : undefined;
          if (!handler) throw new Error('outbox-handler-unavailable');
          await handler(claimed, tx);
          await tx.deliverOutbox(claimed.id, claimed.attempt, now);
          return true;
        });
        if (delivered) counts.delivered += 1;
      } catch {
        // 异常正文可能包含秘密；持久记录只保存稳定错误码。
        await this.journal.fail(event, now, 'outbox-delivery-failed');
        counts.failed += 1;
      }
    }
    return counts;
  }
}
