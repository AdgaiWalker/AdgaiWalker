import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, MessageCircle, ShieldCheck, X } from 'lucide-react';
import { publicApi } from '../../api/public-api';
import type { AssistantInteractionEvent, AssistantInteractionFeedback, PublicPlacementManifest } from '@walker/shared';
import { useAssistant } from '../../hooks/useAssistant';
import { AssistantThread } from './AssistantThread';

const PLACEMENT_KEY = 'post-detail';

function introWasDismissed(slug: string): boolean {
  try { return window.sessionStorage.getItem(`article-assistant-intro:${slug}`) === 'dismissed'; }
  catch { return false; }
}

export function ArticleAssistantPanel({ slug, title }: { slug: string; title: string }) {
  const [manifest, setManifest] = useState<PublicPlacementManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedMemberKey, setSelectedMemberKey] = useState<string | null>(null);
  const [manifestNotice, setManifestNotice] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [introVisible, setIntroVisible] = useState(() => !introWasDismissed(slug));
  const [draft, setDraft] = useState('');
  const selectedMember = manifest?.members.find((member) => member.key === selectedMemberKey)
    ?? manifest?.members.find((member) => member.key === manifest.defaultMemberKey)
    ?? manifest?.members[0]
    ?? null;
  const assistantContext = useMemo(() => ({
    placementKey: PLACEMENT_KEY,
    scopeSlug: slug,
    memberKey: manifest?.available && manifest.aiEnabled ? selectedMember?.key ?? null : null,
    deploymentGeneration: manifest?.available && manifest.aiEnabled ? manifest.generation : null,
    member: manifest?.aiEnabled && selectedMember ? { name: selectedMember.name, revision: selectedMember.revision } : null,
  }), [slug, manifest, selectedMember]);
  const { messages, loading, streaming, error, generationConflict, activeMessageId, stopPending, send, stop, reset, restoreHistory } = useAssistant(assistantContext);

  const trackInteraction = useCallback((event: AssistantInteractionEvent, extra: {
    memberKey?: string;
    messageId?: string;
    targetSlug?: string;
    feedback?: AssistantInteractionFeedback;
  } = {}) => {
    void publicApi.assistantInteraction({
      schemaVersion: 1,
      eventId: globalThis.crypto.randomUUID(),
      event,
      placementKey: PLACEMENT_KEY,
      scopeSlug: slug,
      occurredAt: new Date().toISOString(),
      ...extra,
    }).catch(() => undefined);
  }, [slug]);

  useEffect(() => {
    let current = true;
    trackInteraction('expose');
    setManifest(null);
    setManifestLoading(true);
    setHistoryLoading(true);
    setSelectedMemberKey(null);
    void Promise.allSettled([
      publicApi.assistantPlacement(PLACEMENT_KEY, slug),
      publicApi.assistantHistory(PLACEMENT_KEY, slug),
    ]).then(([manifestResult, historyResult]) => {
      if (!current) return;
      if (manifestResult.status === 'fulfilled') {
        setManifest(manifestResult.value);
        setSelectedMemberKey(manifestResult.value.defaultMemberKey ?? manifestResult.value.members[0]?.key ?? null);
      }
      if (historyResult.status === 'fulfilled') restoreHistory(historyResult.value);
      setManifestLoading(false);
      setHistoryLoading(false);
    });
    return () => { current = false; };
  }, [slug, restoreHistory, trackInteraction]);

  useEffect(() => {
    if (!generationConflict) return;
    setManifestNotice('公开助手配置已更新，已刷新成员列表。请确认当前成员后重新发送。');
    let current = true;
    void publicApi.assistantPlacement(PLACEMENT_KEY, slug).then((value) => {
      if (!current) return;
      setManifest(value);
      setSelectedMemberKey(value.defaultMemberKey ?? value.members[0]?.key ?? null);
    }).catch(() => {
      if (current) setManifestNotice('无法读取最新助手配置，请刷新本页后再试。');
    });
    return () => { current = false; };
  }, [generationConflict, slug]);

  const dismissIntro = () => {
    try { window.sessionStorage.setItem(`article-assistant-intro:${slug}`, 'dismissed'); }
    catch { /* 页面仍可继续使用助手 */ }
    setIntroVisible(false);
    trackInteraction('intro-dismiss');
  };

  const togglePanel = () => {
    const nextOpen = !panelOpen;
    setPanelOpen(nextOpen);
    trackInteraction(
      nextOpen ? 'open' : 'close',
      manifest?.available && manifest.aiEnabled && selectedMember ? { memberKey: selectedMember.key } : {},
    );
  };

  const placementStatus = manifestLoading
    ? '正在读取这个位置的助手状态。'
    : manifest?.available && selectedMember
      ? manifest.aiEnabled
        ? `当前由「${selectedMember.name} · v${selectedMember.revision}」回答。`
        : `当前公开成员是「${selectedMember.name} · v${selectedMember.revision}」；AI 当前关闭，提问会由规则回答。`
      : '这个位置还没有启用 Agent；你仍可以提问，系统会给出规则回答。';

  const submit = () => {
    const text = draft;
    if (!text.trim() || loading || manifestLoading || historyLoading) return;
    setManifestNotice(null);
    setDraft('');
    void send(text);
  };

  const askExample = (example: string) => {
    if (loading || manifestLoading || historyLoading) return;
    setManifestNotice(null);
    setDraft(example);
    void send(example);
  };

  return (
    <section className="article-assistant" aria-labelledby="article-assistant-title">
      <header className="article-assistant-head">
        <MessageCircle size={20} aria-hidden="true" />
        <div className="article-assistant-heading">
          <h2 id="article-assistant-title">围绕这篇文章问{selectedMember?.name ?? '助手'}</h2>
          <p className="meta">关于《{title}》的具体问题，可以直接问。</p>
        </div>
        {messages.length > 0 ? (
          <button type="button" className="btn-ghost article-assistant-reset" disabled={loading || stopPending} onClick={reset}>
            重新开始
          </button>
        ) : null}
        <button
          type="button"
          className="article-assistant-toggle"
          aria-label={panelOpen ? '收起助手' : '展开助手'}
          aria-expanded={panelOpen}
          aria-controls={`article-assistant-body-${slug}`}
          onClick={togglePanel}
        >
          {panelOpen ? <ChevronUp size={17} aria-hidden="true" /> : <ChevronDown size={17} aria-hidden="true" />}
          {panelOpen ? '收起' : '展开'}
        </button>
      </header>

      {panelOpen ? <div id={`article-assistant-body-${slug}`}>
      {manifest?.available && manifest.aiEnabled && manifest.members.length > 1 ? (
        <label className="article-assistant-member-picker">
          <span>选择回答成员</span>
          <select
            aria-label="选择回答成员"
            value={selectedMember?.key ?? ''}
            disabled={loading}
            onChange={(event) => {
              setSelectedMemberKey(event.target.value || null);
              setManifestNotice(null);
              if (event.target.value) trackInteraction('member-switch', { memberKey: event.target.value });
            }}
          >
            {manifest.members.map((member) => (
              <option key={member.key} value={member.key}>
                {member.name} · v{member.revision}{member.isDefault ? ' · 默认' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {manifestNotice ? <p className="article-assistant-update" role="status">{manifestNotice}</p> : null}

      {introVisible ? (
        <aside className="article-assistant-intro" aria-label="助手介绍">
          <div className="article-assistant-intro-copy">
            <p>{placementStatus}</p>
            <p className="meta">
              <ShieldCheck size={15} aria-hidden="true" />
              回答只依据当前可引用的公开内容；问题会先做必要脱敏并用于站主改进内容。
            </p>
          </div>
          <button
            type="button"
            className="article-assistant-dismiss"
            aria-label="关闭介绍"
            onClick={dismissIntro}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </aside>
      ) : (
        <p className="meta article-assistant-status">{placementStatus}</p>
      )}

      <AssistantThread
        idPrefix={`article-assistant-${slug}`}
        compact
        assistantName={manifest?.aiEnabled ? selectedMember?.name ?? '规则助手' : '规则助手'}
        disabled={manifestLoading || historyLoading}
        draft={draft}
        draftOk={draft.trim().length >= 2}
        loading={loading}
        stopPending={stopPending}
        stopAvailable={Boolean(manifest?.aiEnabled && activeMessageId)}
        streaming={streaming}
        error={error}
        messages={messages}
        onDraftChange={setDraft}
        onSubmit={submit}
        onAskExample={askExample}
        onCitationClick={(messageId, targetSlug) => trackInteraction('citation-click', { messageId, targetSlug })}
        onFeedback={(messageId, feedback) => trackInteraction('feedback', { messageId, feedback })}
        onStop={stop}
      />
      </div> : null}
    </section>
  );
}
