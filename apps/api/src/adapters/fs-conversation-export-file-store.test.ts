import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FsConversationExportFileStore } from './fs-conversation-export-file-store';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('FsConversationExportFileStore', () => {
  it('writes privately, opens only the opaque job artifact, and removes it idempotently', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-export-store-'));
    roots.push(root);
    const files = new FsConversationExportFileStore(root);
    await files.write('opaque-job-id', 'json', chunks(['{"items":[', ']}']));
    const opened = await files.open('opaque-job-id', 'json');
    let body = '';
    for await (const chunk of opened.stream) body += chunk.toString();

    expect(body).toBe('{"items":[]}');
    expect(opened.byteLength).toBe(Buffer.byteLength(body));
    expect((await fs.stat(path.join(root, 'opaque-job-id.json'))).mode & 0o777).toBe(0o600);
    await files.remove('opaque-job-id');
    await expect(fs.access(path.join(root, 'opaque-job-id.json'))).rejects.toThrow();
    await files.remove('opaque-job-id');
  });
});

async function* chunks(values: string[]): AsyncGenerator<string> {
  yield* values;
}
