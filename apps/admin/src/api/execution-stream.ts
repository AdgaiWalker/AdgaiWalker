/** 与现有助手 SSE 相同的 text/done/error 帧。不识别的事件直接失败，避免把未知内容当成回答。 */
export async function readExecutionStream(
  stream: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<{ answer: string } | { error: string }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  while (true) {
    const part = await reader.read();
    if (part.done) return { error: '连接中断，未收到完成事件' };
    buffer += decoder.decode(part.value, { stream: true });
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const lines = frame.split(/\r?\n/);
      const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
      const raw = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
      if (!raw) continue;
      const payload = JSON.parse(raw) as { delta?: unknown; answer?: unknown; stopReason?: unknown };
      if (event === 'text' && typeof payload.delta === 'string') {
        text += payload.delta;
        onText(text);
      } else if (event === 'done' && typeof payload.answer === 'string') {
        onText(payload.answer);
        return { answer: payload.answer };
      } else if (event === 'error') {
        return { error: typeof payload.stopReason === 'string' ? payload.stopReason : '运行没有完成' };
      } else {
        return { error: '无法识别的流式事件' };
      }
    }
  }
}
