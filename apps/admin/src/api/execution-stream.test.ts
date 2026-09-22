import { expect, it } from "vitest";
import { readExecutionStream } from "./execution-stream";

function stream(text: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

it("只拼接实际文本，未知事件不会变成回答", async () => {
  const seen: string[] = [];
  const result = await readExecutionStream(stream("event: text\ndata: {\"delta\":\"实际回答\"}\n\nevent: done\ndata: {\"answer\":\"实际回答\"}\n\n"), (text) => seen.push(text));
  expect(result).toEqual({ answer: "实际回答" });
  expect(seen).toEqual(["实际回答", "实际回答"]);
  await expect(readExecutionStream(stream("event: thought\ndata: {\"delta\":\"内部思考\"}\n\n"), () => undefined)).resolves.toEqual({ error: "无法识别的流式事件" });
});
