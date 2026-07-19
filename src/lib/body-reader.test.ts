import { describe, expect, it } from 'vitest';

import { readBodyWithLimit } from './body-reader';

/** 构造分块输出指定字节数的可读流，模拟网络流（非一次性读完）。 */
function streamOf(bytes: number): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const chunkSize = 1024;
      let remaining = bytes;
      while (remaining > 0) {
        const n = Math.min(chunkSize, remaining);
        controller.enqueue(new Uint8Array(n));
        remaining -= n;
      }
      controller.close();
    },
  });
}

describe('readBodyWithLimit（请求体体积强制上限，防 Content-Length 伪造绕过）', () => {
  it('请求体超过上限时返回 tooLarge，不读完整流', async () => {
    const result = await readBodyWithLimit(streamOf(5000), 4096);
    expect(result.tooLarge).toBe(true);
    expect(result.text).toBeNull();
  });

  it('请求体在上限内返回解码文本', async () => {
    const text = '{"contentId":"x","signal":"useful"}';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
    const result = await readBodyWithLimit(stream, 4096);
    expect(result.tooLarge).toBe(false);
    expect(result.text).toBe(text);
  });

  it('恰好等于上限通过，上限 +1 拒绝', async () => {
    expect((await readBodyWithLimit(streamOf(4096), 4096)).tooLarge).toBe(false);
    expect((await readBodyWithLimit(streamOf(4097), 4096)).tooLarge).toBe(true);
  });

  it('空 body 返回 null 文本，不判为超限', async () => {
    const result = await readBodyWithLimit(null, 4096);
    expect(result).toEqual({ text: null, tooLarge: false });
  });
});
