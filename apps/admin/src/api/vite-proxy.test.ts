// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { loadConfigFromFile } from 'vite';
import { describe, expect, it } from 'vitest';

describe('Admin Vite API proxy origin', () => {
  it('preserves the browser Host so Nest same-origin validation accepts local Admin writes', async () => {
    const configFile = fileURLToPath(new URL('../../vite.config.ts', import.meta.url));
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, configFile);
    const proxy = loaded?.config.server?.proxy as Record<string, { changeOrigin?: boolean }> | undefined;

    expect(proxy?.['/api']?.changeOrigin).toBe(false);
  });
});
