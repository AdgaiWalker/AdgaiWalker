import type { Prisma } from '@prisma/client';
import type { LogResourceInput } from '../ports/log-resource.repository';

type LogResourceWriter = Pick<Prisma.TransactionClient, 'conversationLogResource' | 'deletionTombstone'>;

/** 在创建正文副本的同一事务登记资源；只接收逻辑 key，不接收文件路径。 */
export async function registerLogResource(
  tx: LogResourceWriter,
  input: LogResourceInput,
  options: { allowActiveRunDrain?: boolean; allowResourceDuringDeletion?: boolean } = {},
): Promise<boolean> {
  if (input.conversationId) {
    const tombstone = await tx.deletionTombstone.findUnique({
      where: { conversationId: input.conversationId },
      select: { id: true, state: true },
    });
    if (tombstone) {
      if (options.allowActiveRunDrain && tombstone.state !== 'completed') return false;
      if (!(options.allowResourceDuringDeletion && tombstone.state !== 'completed')) {
        throw new Error('conversation-deletion-pending');
      }
    }
  }
  const where = { resourceType_resourceKey: { resourceType: input.resourceType, resourceKey: input.resourceKey } };
  const existing = await tx.conversationLogResource.findUnique({ where });
  if (existing && input.conversationId && existing.conversationId && existing.conversationId !== input.conversationId) {
    throw new Error('log-resource-owner-conflict');
  }
  if (existing) {
    if ((!existing.conversationId && input.conversationId) || (!existing.parentKey && input.parentKey) || (!existing.agentRevisionId && input.agentRevisionId)) {
      await tx.conversationLogResource.update({
        where: { id: existing.id },
        data: {
          ...(!existing.conversationId && input.conversationId ? { conversationId: input.conversationId } : {}),
          ...(!existing.parentKey && input.parentKey ? { parentKey: input.parentKey } : {}),
          ...(!existing.agentRevisionId && input.agentRevisionId ? { agentRevisionId: input.agentRevisionId } : {}),
        },
      });
    }
    return true;
  }
  await tx.conversationLogResource.create({
    data: {
      conversationId: input.conversationId,
      resourceType: input.resourceType,
      resourceKey: input.resourceKey,
      agentRevisionId: input.agentRevisionId ?? null,
      parentKey: input.parentKey ?? null,
      ...(input.resourceCreatedAt ? { resourceCreatedAt: input.resourceCreatedAt } : {}),
    },
  });
  return true;
}
