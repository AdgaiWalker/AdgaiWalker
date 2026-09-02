/**
 * 问助手页 — useAssistant 编排 + ?q= 预填（来自搜索无结果升级）
 */
import { isValidAssistantBody } from '@walker/shared';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AssistantPanel } from '../components/ui/AssistantPanel';
import { useAssistant } from '../hooks/useAssistant';

const SERVICE_NOTE =
  '本页需要处理服务。本地：终端跑 AI_ENABLED=true 的 pnpm dev:api。公网目前多半只有网站、没有真·AI 写入——失败或超时会给出固定回答，不会假装成功。';

export function AskPage() {
  const [params] = useSearchParams();
  const { messages, loading, error, send, reset } = useAssistant();
  const [draft, setDraft] = useState(() => params.get('q') ?? '');

  // 搜索升级跳入只预填，不自动发送——发送即产生一次 AI 调用，让访客确认。
  // 仅当 q 真变化时同步，避免重渲染/热更时清掉访客已输入的内容。
  const q = params.get('q');
  useEffect(() => {
    if (q) setDraft(q);
  }, [q]);

  const draftOk = isValidAssistantBody(draft);

  return (
    <AssistantPanel
      title="问站内助手"
      lead="了解站主、找内容、问路径；回答只依据站内已公开且可引用的内容。"
      draft={draft}
      draftOk={draftOk}
      loading={loading}
      error={error}
      messages={messages}
      serviceNote={SERVICE_NOTE}
      onDraftChange={setDraft}
      onSubmit={() => void send(draft)}
      onReset={() => {
        reset();
        setDraft('');
      }}
    />
  );
}
