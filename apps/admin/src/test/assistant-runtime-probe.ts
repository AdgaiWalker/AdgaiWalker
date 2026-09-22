import type { ChatModelAdapter, ChatModelRunResult } from "@assistant-ui/react";
/** F17 专用受控 SSE 探针；不从产品入口导入，不连接模型。 */
export function probeAdapter(
  open: (signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>,
): ChatModelAdapter {
  return {
    async *run({ abortSignal }) {
      const reader = (await open(abortSignal)).getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        text = "";
      const cancel = () => {
        void reader.cancel();
      };
      abortSignal.addEventListener("abort", cancel, { once: true });
      try {
        if (abortSignal.aborted) throw new DOMException("已中断", "AbortError");
        while (true) {
          const part = await reader.read();
          if (abortSignal.aborted)
            throw new DOMException("已中断", "AbortError");
          if (part.done) throw new Error("连接中断，未收到完成事件");
          buffer += decoder.decode(part.value, { stream: true });
          if (buffer.length > 64_000) throw new Error("事件超过探针上限");
          let match: RegExpExecArray | null;
          while ((match = /\r?\n\r?\n/.exec(buffer))) {
            const frame = buffer.slice(0, match.index);
            buffer = buffer.slice(match.index + match[0].length);
            const lines = frame.split(/\r?\n/),
              event = lines
                .find((line) => line.startsWith("event:"))
                ?.slice(6)
                .trim();
            const raw = lines
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (!raw) continue;
            const payload = JSON.parse(raw);
            if (event === "error") throw new Error("服务返回错误");
            if (event === "text" && typeof payload.delta === "string")
              text += payload.delta;
            else if (event === "done" && typeof payload.answer === "string")
              text = payload.answer;
            else throw new Error("无法识别的流式事件");
            const update: ChatModelRunResult = {
              content: [{ type: "text", text }],
            };
            yield update;
            if (event === "done") return;
          }
        }
      } catch {
        // Runtime 接口用结构化终态承载失败；抛异常会成为 append 的未处理拒绝。
        yield {
          content: [{ type: "text", text }],
          status: {
            type: "incomplete",
            reason: abortSignal.aborted ? "cancelled" : "error",
          },
        };
      } finally {
        abortSignal.removeEventListener("abort", cancel);
        await reader.cancel();
        reader.releaseLock();
      }
    },
  };
}
