import { getRedis } from '@/stores/redis-client';

const memoryDrafts = new Map<string, string>();

function canvasDraftKey(contentId: string): string {
  return `dianzi:canvas:${contentId}:draft`;
}

export async function saveCanvasDraft(contentId: string, content: string): Promise<void> {
  memoryDrafts.set(contentId, content);
  const redis = getRedis();
  if (!redis) return;

  await redis.set(canvasDraftKey(contentId), content);
}

export async function getCanvasDraft(contentId: string): Promise<string | null> {
  const redis = getRedis();
  if (redis) {
    const content = await redis.get<string>(canvasDraftKey(contentId));
    return content || null;
  }
  return memoryDrafts.get(contentId) || null;
}

export function __resetMemoryCanvasDrafts(): void {
  memoryDrafts.clear();
}
