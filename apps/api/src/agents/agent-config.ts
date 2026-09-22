import { createHash } from 'node:crypto';
import { READ_ONLY_PROFILE } from '@walker/shared';

export function revisionHash(config: { prompt: string; providerId: string | null; modelId: string }): string {
  return createHash('sha256').update(JSON.stringify({
    schemaVersion: 1, prompt: config.prompt, providerId: config.providerId, modelId: config.modelId,
    toolProfile: READ_ONLY_PROFILE,
  })).digest('hex');
}
