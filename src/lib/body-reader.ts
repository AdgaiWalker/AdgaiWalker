/**
 * 请求体体积强制读取（公开端点 DoS 防护）。
 *
 * Content-Length 是客户端可控头（可省略或伪造小值），不能作为体积信任源。
 * 这里在读流过程中累计字节，超过 maxBytes 立即 cancel 流并返回 tooLarge，
 * 避免对超大请求体做完整读取与解析。
 *
 * 纯工具函数，无业务/astro 依赖，便于独立单测。
 */
export async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<{ text: string | null; tooLarge: boolean }> {
  if (body === null) return { text: null, tooLarge: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { text: null, tooLarge: true };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(merged), tooLarge: false };
}
