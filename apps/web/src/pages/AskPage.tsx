/**
 * 小影页 — useAssistant 编排 + ?q= 预填（来自搜索无结果升级）
 */
import { isValidAssistantBody } from '@walker/shared';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AssistantPanel } from '../components/ui/AssistantPanel';
import { useAssistant } from '../hooks/useAssistant';

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
      title="小影"
      lead="duola 的管家。关于站主、站内内容或学习路径，直接问；答不上会老实说不知道。"
      draft={draft}
      draftOk={draftOk}
      loading={loading}
      error={error}
      messages={messages}
      onDraftChange={setDraft}
      onSubmit={() => void send(draft)}
      onReset={() => {
        reset();
        setDraft('');
      }}
    />
  );
}
