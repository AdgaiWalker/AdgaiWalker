import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  findPlacement,
  HOME_XIAOYING_PLACEMENT,
  PUBLIC_SITE_SCOPE,
  REGISTERED_PLACEMENTS,
  type AgentRevisionDetail,
  type DeploymentView,
  type OpsAgent,
} from '@walker/shared';
import { useAgents, useAgentDetail, usePublicDeploymentReadiness } from '../../api/queries';
import { requestJson } from '../../api/http';
import { EmptyState, ErrorState, LoadingState, PageHeading } from '../../components/States';
import { ADMIN_ROUTES as R } from '../../shared/routes';
import { timeLabel } from '../../shared/labels';
import { PublicReadinessPanel, readinessAllowsEnable } from './PublicReadinessPanel';

type MemberForm = { key: string; agentId: string; agentRevisionId: string; isDefault: boolean };
export type DeploymentFormState = {
  placementKey: string;
  scopeSlug: string;
  members: MemberForm[];
  /** 新建部署的幂等键：不确定响应的重试复用它，编辑输入后换键 */
  deploymentId: string;
};

export function emptyForm(): DeploymentFormState {
  return {
    placementKey: REGISTERED_PLACEMENTS[0].key,
    scopeSlug: '',
    members: [{ key: crypto.randomUUID(), agentId: '', agentRevisionId: '', isDefault: true }],
    deploymentId: `dep-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
  };
}

/** 编辑既有部署时把当前成员装回表单。 */
export function formFromDeployment(deployment: DeploymentView, previousId: string): DeploymentFormState {
  return {
    placementKey: deployment.placementKey,
    scopeSlug: deployment.scopeSlug,
    members: deployment.members.map((member) => ({
      key: crypto.randomUUID(),
      agentId: member.agentId,
      agentRevisionId: member.agentRevisionId,
      isDefault: member.isDefault,
    })),
    deploymentId: previousId,
  };
}

/** 构造保存请求体：新建带幂等 deploymentId；编辑只带 generation CAS，不带旧 deploymentId（避免幂等冲突误报）。 */
export function buildSaveBody(form: DeploymentFormState, editing: DeploymentView | null) {
  return {
    placementKey: form.placementKey,
    scopeSlug: form.scopeSlug.trim(),
    members: form.members.map((member) => ({ agentRevisionId: member.agentRevisionId, isDefault: member.isDefault })),
    expectedGeneration: editing ? editing.generation : null,
    ...(editing ? {} : { deploymentId: form.deploymentId }),
  };
}

export function saveProblem(form: DeploymentFormState): string | null {
  if (!findPlacement(form.placementKey)) return '位置未在服务端登记';
  if (form.placementKey === HOME_XIAOYING_PLACEMENT && form.scopeSlug.trim() !== PUBLIC_SITE_SCOPE) return '首页小影只能使用全站公开范围';
  if (!form.scopeSlug.trim()) return '请填写对象（文章 slug）';
  if (form.members.length === 0) return '至少需要一个成员';
  if (form.members.some((member) => !member.agentRevisionId)) return '每个成员都要选定 Agent 与版本';
  if (form.members.filter((member) => member.isDefault).length !== 1) return '必须恰有一个默认成员';
  return null;
}

function RevisionSelect({ agentId, value, onChange, disabled }: { agentId: string; value: string; onChange: (revisionId: string) => void; disabled?: boolean }) {
  const detail = useAgentDetail(agentId);
  if (!agentId) return <select disabled><option>先选 Agent</option></select>;
  if (detail.isPending) return <select disabled><option>读取版本…</option></select>;
  if (detail.isError || !detail.data?.data) return <select disabled><option>版本读取失败</option></select>;
  const revisions = (detail.data.data as AgentRevisionDetail).revisions;
  return (
    <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">选择版本</option>
      {revisions.map((revision) => (
        <option key={revision.id} value={revision.id}>版本 {revision.version} · {revision.modelId}</option>
      ))}
    </select>
  );
}

function DeploymentForm({ editing, agents, saved, cancel }: { editing: DeploymentView | null; agents: OpsAgent[]; saved: () => void; cancel: () => void }) {
  const [form, setForm] = useState<DeploymentFormState>(() => (editing ? formFromDeployment(editing, `dep-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`) : emptyForm()));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const problem = saveProblem(form);
  const updateDraftAndRotateId = (next: Partial<DeploymentFormState>) => {
    setForm((current) => ({ ...current, ...next, deploymentId: `dep-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}` }));
    setError('');
  };
  const patchMember = (key: string, next: Partial<MemberForm>) =>
    updateDraftAndRotateId({ members: form.members.map((member) => (member.key === key ? { ...member, ...next } : member)) });

  async function submit() {
    setPending(true);
    setError('');
    try {
      await requestJson('/ops/deployments', { method: 'POST', body: buildSaveBody(form, editing) });
      saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel agent-editor">
      <h2>{editing ? '编辑位置绑定' : '新建位置绑定'}</h2>
      <fieldset disabled={pending}>
        <label>位置
          <select value={form.placementKey} disabled={Boolean(editing)} onChange={(event) => updateDraftAndRotateId({
            placementKey: event.target.value,
            scopeSlug: event.target.value === HOME_XIAOYING_PLACEMENT ? PUBLIC_SITE_SCOPE : '',
          })}>
            {REGISTERED_PLACEMENTS.map((placement) => <option key={placement.key} value={placement.key}>{placement.label}</option>)}
          </select>
        </label>
        <label>{form.placementKey === HOME_XIAOYING_PLACEMENT ? '服务范围（全站公开内容）' : '对象（文章 slug）'}
          <input required maxLength={200} value={form.scopeSlug} disabled={Boolean(editing) || form.placementKey === HOME_XIAOYING_PLACEMENT} onChange={(event) => updateDraftAndRotateId({ scopeSlug: event.target.value })} placeholder="例如 ai-low-cost-access" />
        </label>
        <h3>成员（恰一个默认项）</h3>
        {form.members.map((member) => (
          <div className="member-row" key={member.key}>
            <select value={member.agentId} onChange={(event) => patchMember(member.key, { agentId: event.target.value, agentRevisionId: '' })}>
              <option value="">选择 Agent</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
            <RevisionSelect agentId={member.agentId} value={member.agentRevisionId} onChange={(revisionId) => patchMember(member.key, { agentRevisionId: revisionId })} />
            <label className="inline">
              <input type="radio" name="default-member" checked={member.isDefault} onChange={() => updateDraftAndRotateId({ members: form.members.map((item) => ({ ...item, isDefault: item.key === member.key })) })} />
              默认
            </label>
            {form.members.length > 1 && <button type="button" onClick={() => updateDraftAndRotateId({ members: form.members.filter((item) => item.key !== member.key) })}>移除</button>}
          </div>
        ))}
        <button type="button" onClick={() => updateDraftAndRotateId({ members: [...form.members, { key: crypto.randomUUID(), agentId: '', agentRevisionId: '', isDefault: false }] })}>添加成员</button>
        {problem && <p className="muted">{problem}</p>}
        {error && <p role="alert">{error}</p>}
        <div className="button-row">
          <button className="primary" disabled={Boolean(problem) || pending} onClick={() => void submit()}>{pending ? '正在保存…' : editing ? '保存修改' : '保存绑定'}</button>
          <button type="button" onClick={cancel}>取消</button>
        </div>
      </fieldset>
    </section>
  );
}

/** 静态介绍预览：位置 + 对象 + 成员介绍，显式点击切换预览的成员。 */
function PreviewPanel({ deployment, agents }: { deployment: DeploymentView; agents: OpsAgent[] }) {
  const [selected, setSelected] = useState(deployment.members.find((member) => member.isDefault)?.id ?? deployment.members[0]?.id ?? '');
  const member = deployment.members.find((item) => item.id === selected) ?? deployment.members[0];
  const placement = findPlacement(deployment.placementKey);
  const agentName = (id: string) => agents.find((agent) => agent.id === id)?.name ?? id;
  if (!member) return null;
  return (
    <section className="panel">
      <h2>前台介绍预览（静态）</h2>
      <p className="muted">{placement?.label ?? deployment.placementKey} · {deployment.placementKey === HOME_XIAOYING_PLACEMENT ? '全站公开内容' : `文章 ${deployment.scopeSlug}`} · {deployment.enabled ? '启用中' : '未启用'}</p>
      <div className="tabs" role="tablist">
        {deployment.members.map((item) => (
          <button key={item.id} role="tab" aria-pressed={item.id === member.id} onClick={() => setSelected(item.id)}>
            {agentName(item.agentId)} v{item.revision}{item.isDefault ? '（默认）' : ''}
          </button>
        ))}
      </div>
      <div className="notice">
        <strong>{agentName(member.agentId)}</strong>
        <p>版本 {member.revision} · {member.isDefault ? '默认回答这篇文章的问题' : '访客可显式切换到这个成员'}</p>
      </div>
      <p className="muted">预览只展示成员介绍与切换形态，不调用模型。</p>
    </section>
  );
}

function DeploymentRow({ deployment, agents, edit, refresh }: { deployment: DeploymentView; agents: OpsAgent[]; edit: () => void; refresh: () => void }) {
  const [pending, setPending] = useState('');
  const [message, setMessage] = useState('');
  const [rollbackTo, setRollbackTo] = useState('');
  const readiness = usePublicDeploymentReadiness(deployment.id);
  const canEnable = readinessAllowsEnable(readiness.data, readiness.isPending, readiness.isError);
  const agentName = (id: string) => agents.find((agent) => agent.id === id)?.name ?? id;
  async function act(label: string, run: () => Promise<unknown>) {
    setPending(label);
    setMessage('');
    try {
      await run();
      refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '操作失败');
    } finally {
      setPending('');
    }
  }
  const others = deployment.members.filter((member) => !member.isDefault);
  return (
    <li className="deployment-row">
      <div>
        <strong>{findPlacement(deployment.placementKey)?.label ?? deployment.placementKey} · {deployment.scopeSlug}</strong>
        <span className={deployment.enabled ? 'badge green' : 'badge'}>{deployment.enabled ? '启用中' : '未启用'}</span>
        <small className="muted"> 第 {deployment.generation} 代 · 更新于 {timeLabel(deployment.updatedAt)}</small>
      </div>
      <ul>
        {deployment.members.map((member) => (
          <li key={member.id}>{agentName(member.agentId)} v{member.revision}{member.isDefault ? '（默认）' : ''}</li>
        ))}
      </ul>
      <PublicReadinessPanel
        report={readiness.data}
        isPending={readiness.isPending}
        isError={readiness.isError}
        onRetry={() => { void readiness.refetch(); }}
      />
      <div className="button-row">
        <button onClick={edit} disabled={Boolean(pending)}>编辑成员</button>
        {deployment.enabled
          ? <button disabled={Boolean(pending)} onClick={() => void act('禁用中…', () => requestJson(`/ops/deployments/${deployment.id}/disable`, { method: 'POST', body: { expectedGeneration: deployment.generation } }))}>{pending || '禁用'}</button>
          : <button className="primary" disabled={Boolean(pending) || !canEnable} onClick={() => void act('启用中…', () => requestJson(`/ops/deployments/${deployment.id}/enable`, { method: 'POST', body: { expectedGeneration: deployment.generation } }))}>{pending || '启用'}</button>}
        {others.length > 0 && (
          <>
            <select value={rollbackTo} onChange={(event) => setRollbackTo(event.target.value)}>
              <option value="">回退到…</option>
              {others.map((member) => <option key={member.id} value={member.agentRevisionId}>{agentName(member.agentId)} v{member.revision}</option>)}
            </select>
            <button disabled={!rollbackTo || Boolean(pending)} onClick={() => void act('回退中…', () => requestJson(`/ops/deployments/${deployment.id}/rollback`, { method: 'POST', body: { agentRevisionId: rollbackTo, expectedGeneration: deployment.generation } }))}>{pending || '回退'}</button>
          </>
        )}
      </div>
      {message && <p role="alert">{message}</p>}
    </li>
  );
}

export function DeploymentsPage() {
  const list = useQuery({ queryKey: ['deployments'], queryFn: ({ signal }) => requestJson<DeploymentView[]>('/ops/deployments', { signal }) });
  const agentsQuery = useAgents();
  const [editing, setEditing] = useState<DeploymentView | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewId, setPreviewId] = useState('');
  const agents = agentsQuery.data?.data ?? [];
  const refresh = () => { setEditing(null); setCreating(false); void list.refetch(); };
  const preview = list.data?.find((item) => item.id === previewId) ?? list.data?.[0];

  return (
    <>
      <PageHeading title="位置绑定" description="把 Agent 的已测试版本绑定到文章详情位置；启用前必须通过公开快照、权限、运行隔离、日志删除和路由检查。" action={<button className="primary" onClick={() => { setCreating(!creating); setEditing(null); }}>{creating ? '收起' : '新建绑定'}</button>} />
      <p><Link className="back-link" to={R.agents}>返回 Agent 列表</Link></p>
      {(creating || editing) && <DeploymentForm editing={editing} agents={agents} saved={refresh} cancel={() => { setCreating(false); setEditing(null); }} />}
      <section className="panel">
        <h2>已配置的位置</h2>
        {list.isPending ? <LoadingState /> : list.isError ? <ErrorState error={list.error} retry={list.refetch} /> : !list.data?.length ? (
          <EmptyState title="暂无位置绑定">首期支持文章详情位置。保存绑定后默认未启用，须通过全部就绪检查才能启用。</EmptyState>
        ) : (
          <ul className="deployment-list">
            {list.data.map((deployment) => (
              <div key={deployment.id} onClick={() => setPreviewId(deployment.id)}>
                <DeploymentRow deployment={deployment} agents={agents} edit={() => setEditing(deployment)} refresh={refresh} />
              </div>
            ))}
          </ul>
        )}
      </section>
      {preview && <PreviewPanel deployment={preview} agents={agents} />}
    </>
  );
}
