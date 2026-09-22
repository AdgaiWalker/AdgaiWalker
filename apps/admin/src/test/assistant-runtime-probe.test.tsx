import { act, render, waitFor } from "@testing-library/react";
import {
  useLocalRuntime,
  AssistantRuntimeProvider,
  type ChatModelAdapter,
  type AssistantRuntime,
} from "@assistant-ui/react";
import { expect, it } from "vitest";
import { probeAdapter } from "./assistant-runtime-probe";
function mount(adapter: ChatModelAdapter) {
  const result = { current: null as unknown as AssistantRuntime };
  function Probe() {
    const runtime = useLocalRuntime(adapter);
    result.current = runtime;
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <span>探针</span>
      </AssistantRuntimeProvider>
    );
  }
  render(<Probe />);
  return { result };
}
function fixture() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  const encoder = new TextEncoder();
  return {
    adapter: probeAdapter(async () => stream),
    send: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  };
}
it("真实 assistant-ui Runtime 接受拆分 SSE，done 替换增量", async () => {
  const f = fixture(),
    { result } = mount(f.adapter);
  act(() => result.current.thread.append("测试提问"));
  await waitFor(() =>
    expect(result.current.thread.getState().isRunning).toBe(true),
  );
  act(() => {
    f.send('event: text\ndata: {"delta":"片段"}\n');
    f.send('\nevent: text\ndata: {"delta":"二"}\n\n');
  });
  await waitFor(() =>
    expect(result.current.thread.getState().messages.at(-1)?.content).toEqual([
      { type: "text", text: "片段二" },
    ]),
  );
  act(() => f.send('event: done\ndata: {"answer":"校验后的最终正文"}\n\n'));
  await waitFor(() =>
    expect(result.current.thread.getState().isRunning).toBe(false),
  );
  expect(result.current.thread.getState().messages.at(-1)?.content).toEqual([
    { type: "text", text: "校验后的最终正文" },
  ]);
});
it("取消终止读取，状态不是成功", async () => {
  const f = fixture(),
    { result } = mount(f.adapter);
  act(() => result.current.thread.append("取消测试"));
  await waitFor(() =>
    expect(result.current.thread.getState().isRunning).toBe(true),
  );
  act(() => result.current.thread.cancelRun());
  await waitFor(() =>
    expect(result.current.thread.getState().isRunning).toBe(false),
  );
  expect(result.current.thread.getState().messages.at(-1)).toMatchObject({
    status: { type: "incomplete", reason: "cancelled" },
  });
});
it("缺 done 的断流标为错误，不伪装完成", async () => {
  const f = fixture(),
    { result } = mount(f.adapter);
  act(() => result.current.thread.append("断流测试"));
  await waitFor(() =>
    expect(result.current.thread.getState().isRunning).toBe(true),
  );
  act(() => f.close());
  await waitFor(() =>
    expect(result.current.thread.getState().isRunning).toBe(false),
  );
  expect(result.current.thread.getState().messages.at(-1)).toMatchObject({
    status: { type: "incomplete", reason: "error" },
  });
});
