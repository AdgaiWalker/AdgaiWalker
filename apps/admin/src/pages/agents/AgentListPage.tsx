import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { READ_ONLY_PROFILE, type AgentRevisionDetail, type AgentRevisionView } from '@walker/shared';
import { useAgents, useAgentDetail } from '../../api/queries';
import { requestJson } from '../../api/http';
import { EmptyState, ErrorState, LoadingState, PageHeading } from '../../components/States';
import { ADMIN_ROUTES as R } from '../../shared/routes';
import { TrialPanel } from './TrialPanel';
import { ReleaseTests } from './ReleaseTests';
import { GrantPanel } from './GrantPanel';
import { timeLabel } from '../../shared/labels';

type Provider = { id: string; name: string; models: { id: string; name?: string }[] };
function AgentEditor({ detail, saved }: { detail?: AgentRevisionDetail; saved: (revision: AgentRevisionView) => void }) {
  const latest = detail?.revisions[0];
  const [name, setName] = useState(detail?.name ?? '');
  const [prompt, setPrompt] = useState(latest?.prompt ?? '');
  const [providerId, setProvider] = useState(latest?.providerId ?? '');
  const [modelId, setModel] = useState(latest?.modelId ?? 'deepseek-chat');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  // 不确定响应的重试复用请求键；编辑输入后才换键。
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const models = useQuery({ queryKey: ['agent-models'], queryFn: ({ signal }) => requestJson<Provider[]>('/ops/agent-models', { signal }) });
  const changed = () => { setRequestKey(crypto.randomUUID()); setError(''); };
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError('');
    try {
      const revision = await requestJson<AgentRevisionView>(detail ? `/ops/agents/${encodeURIComponent(detail.id)}/revisions` : '/ops/agents', {
        method: 'POST', body: { requestKey, baseVersion: latest?.version ?? 0, name, prompt, providerId: providerId || null, modelId, toolProfile: READ_ONLY_PROFILE },
      });
      saved(revision);
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败'); }
    finally { setPending(false); }
  }
  return <form className="panel agent-editor" onSubmit={(event) => void submit(event)}>
    <h2>{detail ? '创建新修订' : '创建 Agent'}</h2>
    <fieldset disabled={pending}>
      <label>名称<input required maxLength={100} value={name} onChange={(e) => { setName(e.target.value); changed(); }} /></label>
      <label>提示词<textarea required maxLength={50000} rows={10} value={prompt} onChange={(e) => { setPrompt(e.target.value); changed(); }} /></label>
      <label>模型供应商<select value={providerId} onChange={(e) => { const id = e.target.value; setProvider(id); setModel(models.data?.find((p) => p.id === id)?.models[0]?.id ?? 'deepseek-chat'); changed(); }}>
        <option value="">未连接供应商（仅保存草稿）</option>
        {models.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <label>模型<select value={modelId} onChange={(e) => { setModel(e.target.value); changed(); }}>
        {!providerId ? <option value="deepseek-chat">deepseek-chat</option> : models.data?.find((p) => p.id === providerId)?.models.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.id}</option>)}
      </select></label>
      <p className="muted">工具权限：只读。保存生成独立版本。部署仍未接通。</p>
      {models.isError && <p role="alert">模型目录读取失败，请刷新后重试。</p>}
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={models.isPending || models.isError}>{pending ? '正在保存…' : detail ? '保存新版本' : '创建'}</button>
    </fieldset>
  </form>;
}
export function AgentListPage() {
  const query = useAgents(), navigate = useNavigate();
  const [creating, setCreating] = useState(false), [error, setError] = useState(''), [importing, setImporting] = useState(false);
  async function importLegacy() {
    setImporting(true); setError('');
    try { await requestJson('/ops/agents/import-legacy', { method: 'POST' }); await query.refetch(); }
    catch (e) { setError(e instanceof Error ? e.message : '导入失败'); }
    finally { setImporting(false); }
  }
  return <>
    <PageHeading title="Agent" description="管理提示词、模型与配置版本。" action={<button className="primary" onClick={() => setCreating(!creating)}>{creating ? '收起创建' : '创建 Agent'}</button>} />
    {creating && <AgentEditor saved={(r) => { void query.refetch(); navigate(R.agentDetail(r.agentId)); }} />}
    {error && <p role="alert">{error}</p>}
    {query.data?.data.some((item) => item.revision === null) && <div className="notice">已有角色尚未版本化。<button disabled={importing} onClick={() => void importLegacy()}>{importing ? '正在导入…' : '将历史角色导入版本 1'}</button></div>}
    <section className="panel">{query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : !query.data?.data.length ? <EmptyState title="暂无 Agent">创建第一个 Agent，保存提示词与模型配置。</EmptyState> : <div className="agent-list">{query.data.data.map((item) => <Link className="agent-row" key={item.id} to={R.agentDetail(item.id)}><span><strong>{item.name}</strong><small>{item.modelId} · {item.isSystem ? '系统角色' : '自定义角色'}</small></span><span className="muted">{item.revision === null ? '尚未版本化' : `版本 ${item.revision}`}</span></Link>)}</div>}</section>
  </>;
}
function AgentVersions({ detail, refresh }: { detail: AgentRevisionDetail; refresh: () => unknown }) {
  const [selected, select] = useState(detail.revisions[0]?.id ?? '');
  const revision = detail.revisions.find((r) => r.id === selected) ?? detail.revisions[0];
  const previous = detail.revisions.find((r) => r.version === (revision?.version ?? 0) - 1);
  return <>
    <PageHeading title={detail.name} description={detail.archivedAt ? '已归档 · 历史版本保留' : '每次保存生成独立版本'} />
    <section className="panel agent-editor">
      <h2>版本历史</h2>
      {revision ? <><label>查看版本<select value={revision.id} onChange={(e) => select(e.target.value)}>{detail.revisions.map((r) => <option key={r.id} value={r.id}>版本 {r.version} · {timeLabel(r.createdAt)}</option>)}</select></label>
        <p>模型：{revision.modelId} · 工具权限：只读</p>
        <small className="config-hash">配置摘要：{revision.configHash}</small>
        <div className="revision-comparison">{previous && <div><h3>上一版本 {previous.version}</h3><p>模型：{previous.modelId}</p><pre>{previous.prompt}</pre></div>}<div><h3>所选版本 {revision.version}</h3><pre>{revision.prompt}</pre></div></div>
      </> : <EmptyState title="尚无修订">请从列表导入历史角色。</EmptyState>}
      <Link className="button" to={`${R.records}?agentId=${encodeURIComponent(detail.id)}`}>查看运行记录</Link>
    </section>
    {revision && <TrialPanel agentId={detail.id} revisionId={revision.id} />}
    {revision && <ReleaseTests agentId={detail.id} revisionId={revision.id} />}
    <GrantPanel agentId={detail.id} />
    {!detail.archivedAt && <AgentEditor key={detail.revisions[0]?.id ?? detail.id} detail={detail} saved={(r) => { select(r.id); refresh(); }} />}
  </>;
}
export function AgentDetailPage() {
  const { id = '' } = useParams(), query = useAgentDetail(id);
  return <><Link className="back-link" to={R.agents}>返回 Agent 列表</Link>{query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : query.data ? <AgentVersions detail={query.data.data} refresh={query.refetch} /> : null}</>;
}
