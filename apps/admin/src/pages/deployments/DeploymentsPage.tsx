import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  findPlacement,
  HOME_XIAOYING_PLACEMENT,
  PUBLIC_SITE_SCOPE,
  REGISTERED_PLACEMENTS,
  type AgentRevisionDetail,
  type DeploymentView,
  type OpsAgent,
} from "@walker/shared";
import { useAgents, useAgentDetail, usePublicDeploymentReadiness } from "../../api/queries";
import { requestJson } from "../../api/http";
import { EmptyState, ErrorState, LoadingState, PageHeading } from "../../components/States";
import { ADMIN_ROUTES as R } from "../../shared/routes";
import { timeLabel } from "../../shared/labels";
import { PublicReadinessPanel, readinessAllowsEnable } from "./PublicReadinessPanel";

type MemberForm = { key: string; agentId: string; agentRevisionId: string; isDefault: boolean };
export type DeploymentFormState = { placementKey: string; scopeSlug: string; members: MemberForm[]; deploymentId: string };
const newDepId = () => `dep-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

export function emptyForm(): DeploymentFormState {
  return {
    placementKey: REGISTERED_PLACEMENTS[0].key,
    scopeSlug: "",
    members: [{ key: crypto.randomUUID(), agentId: "", agentRevisionId: "", isDefault: true }],
    deploymentId: newDepId(),
  };
}

export function formFromDeployment(deployment: DeploymentView, previousId: string): DeploymentFormState {
  return {
    placementKey: deployment.placementKey,
    scopeSlug: deployment.scopeSlug,
    members: deployment.members.map((m) => ({ key: crypto.randomUUID(), agentId: m.agentId, agentRevisionId: m.agentRevisionId, isDefault: m.isDefault })),
    deploymentId: previousId,
  };
}

export function buildSaveBody(form: DeploymentFormState, editing: DeploymentView | null) {
  return {
    placementKey: form.placementKey,
    scopeSlug: form.scopeSlug.trim(),
    members: form.members.map((m) => ({ agentRevisionId: m.agentRevisionId, isDefault: m.isDefault })),
    expectedGeneration: editing ? editing.generation : null,
    ...(editing ? {} : { deploymentId: form.deploymentId }),
  };
}

export function saveProblem(form: DeploymentFormState): string | null {
  if (!findPlacement(form.placementKey)) return "位置未在服务端登记";
  if (form.placementKey === HOME_XIAOYING_PLACEMENT && form.scopeSlug.trim() !== PUBLIC_SITE_SCOPE) return "首页小影只能使用全站公开范围";
  if (!form.scopeSlug.trim()) return "请填写对象（文章 slug）";
  if (form.members.length === 0) return "至少需要一个成员";
  if (form.members.some((m) => !m.agentRevisionId)) return "每个成员都要选定 Agent 与版本";
  if (form.members.filter((m) => m.isDefault).length !== 1) return "必须恰有一个默认成员";
  return null;
}

function RevisionSelect({ agentId, value, onChange, disabled }: { agentId: string; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const detail = useAgentDetail(agentId);
  if (!agentId) return <select disabled><option>先选 Agent</option></select>;
  if (detail.isPending) return <select disabled><option>读取版本…</option></select>;
  if (detail.isError || !detail.data?.data) return <select disabled><option>版本读取失败</option></select>;
  const revisions = (detail.data.data as AgentRevisionDetail).revisions;
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">选择版本</option>
      {revisions.map((r) => <option key={r.id} value={r.id}>版本 {r.version} · {r.modelId}</option>)}
    </select>
  );
}

function DeploymentForm({ editing, agents, saved, cancel }: { editing: DeploymentView | null; agents: OpsAgent[]; saved: () => void; cancel: () => void }) {
  const [form, setForm] = useState<DeploymentFormState>(() => (editing ? formFromDeployment(editing, newDepId()) : emptyForm()));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const problem = saveProblem(form);
  const patch = (next: Partial<DeploymentFormState>) => { setForm((c) => ({ ...c, ...next, deploymentId: newDepId() })); setError(""); };
  const patchMember = (key: string, next: Partial<MemberForm>) => patch({ members: form.members.map((m) => (m.key === key ? { ...m, ...next } : m)) });

  async function submit() {
    setPending(true); setError("");
    try { await requestJson("/ops/deployments", { method: "POST", body: buildSaveBody(form, editing) }); saved(); }
    catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    finally { setPending(false); }
  }

  return (
    <section className="panel agent-editor">
      <h2>{editing ? "编辑位置绑定" : "新建位置绑定"}</h2>
      <fieldset disabled={pending}>
        <label>位置
          <select value={form.placementKey} disabled={Boolean(editing)} onChange={(e) => patch({ placementKey: e.target.value, scopeSlug: e.target.value === HOME_XIAOYING_PLACEMENT ? PUBLIC_SITE_SCOPE : "" })}>
            {REGISTERED_PLACEMENTS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <label>{form.placementKey === HOME_XIAOYING_PLACEMENT ? "服务范围（全站公开内容）" : "对象（文章 slug）"}
          <input required maxLength={200} value={form.scopeSlug} disabled={Boolean(editing) || form.placementKey === HOME_XIAOYING_PLACEMENT} onChange={(e) => patch({ scopeSlug: e.target.value })} placeholder="例如 ai-low-cost-access" />
        </label>
        {form.members.map((m) => (
          <div className="member-row" key={m.key}>
            <select value={m.agentId} onChange={(e) => patchMember(m.key, { agentId: e.target.value, agentRevisionId: "" })}>
              <option value="">选择 Agent</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <RevisionSelect agentId={m.agentId} value={m.agentRevisionId} onChange={(id) => patchMember(m.key, { agentRevisionId: id })} />
            <label className="inline">
              <input type="radio" name="default-member" checked={m.isDefault} onChange={() => patch({ members: form.members.map((i) => ({ ...i, isDefault: i.key === m.key })) })} />默认
            </label>
            {form.members.length > 1 ? <button type="button" className="btn" onClick={() => patch({ members: form.members.filter((i) => i.key !== m.key) })}>移除</button> : null}
          </div>
        ))}
        <div className="button-row">
          <button type="button" onClick={() => patch({ members: [...form.members, { key: crypto.randomUUID(), agentId: "", agentRevisionId: "", isDefault: false }] })}>添加成员</button>
          <button className="primary" disabled={Boolean(problem) || pending} onClick={() => void submit()}>{pending ? "正在保存…" : editing ? "保存修改" : "保存绑定"}</button>
          <button type="button" onClick={cancel}>取消</button>
        </div>
        {problem ? <p className="muted" style={{ margin: 0 }}>{problem}</p> : null}
        {error ? <p className="error-text" role="alert" style={{ margin: 0 }}>{error}</p> : null}
      </fieldset>
    </section>
  );
}

function DeploymentRow({ deployment, agents, edit, refresh }: { deployment: DeploymentView; agents: OpsAgent[]; edit: () => void; refresh: () => void }) {
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [rollbackTo, setRollbackTo] = useState("");
  const readiness = usePublicDeploymentReadiness(deployment.id);
  const canEnable = readinessAllowsEnable(readiness.data, readiness.isPending, readiness.isError);
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setPending(label); setMessage("");
    try { await fn(); refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : "操作失败"); } finally { setPending(""); }
  };
  const others = deployment.members.filter((m) => !m.isDefault);
  return (
    <li className="deployment-row">
      <div className="action-row">
        <strong>{findPlacement(deployment.placementKey)?.label ?? deployment.placementKey} · {deployment.scopeSlug}</strong>
        <span className={deployment.enabled ? "badge green" : "badge"}>{deployment.enabled ? "启用中" : "未启用"}</span>
        <small className="muted">第 {deployment.generation} 代 · {timeLabel(deployment.updatedAt)}</small>
      </div>
      <div className="action-row">
        {deployment.members.map((m) => <span key={m.id} className="badge">{agentName(m.agentId)} v{m.revision}{m.isDefault ? "（默认）" : ""}</span>)}
      </div>
      <PublicReadinessPanel report={readiness.data} isPending={readiness.isPending} isError={readiness.isError} onRetry={() => void readiness.refetch()} />
      <div className="button-row">
        <button onClick={edit} disabled={Boolean(pending)}>编辑成员</button>
        {deployment.enabled
          ? <button disabled={Boolean(pending)} onClick={() => void act("禁用中…", () => requestJson(`/ops/deployments/${deployment.id}/disable`, { method: "POST", body: { expectedGeneration: deployment.generation } }))}>{pending || "禁用"}</button>
          : <button className="primary" disabled={Boolean(pending) || !canEnable} onClick={() => void act("启用中…", () => requestJson(`/ops/deployments/${deployment.id}/enable`, { method: "POST", body: { expectedGeneration: deployment.generation } }))}>{pending || "启用"}</button>}
        {others.length > 0 ? (
          <>
            <select value={rollbackTo} onChange={(e) => setRollbackTo(e.target.value)}>
              <option value="">回退到…</option>
              {others.map((m) => <option key={m.id} value={m.agentRevisionId}>{agentName(m.agentId)} v{m.revision}</option>)}
            </select>
            <button disabled={!rollbackTo || Boolean(pending)} onClick={() => void act("回退中…", () => requestJson(`/ops/deployments/${deployment.id}/rollback`, { method: "POST", body: { agentRevisionId: rollbackTo, expectedGeneration: deployment.generation } }))}>{pending || "回退"}</button>
          </>
        ) : null}
      </div>
      {message ? <p className="error-text" role="alert">{message}</p> : null}
    </li>
  );
}

export function DeploymentsPage() {
  const list = useQuery({ queryKey: ["deployments"], queryFn: ({ signal }) => requestJson<DeploymentView[]>("/ops/deployments", { signal }) });
  const agents = useAgents().data?.data ?? [];
  const [editing, setEditing] = useState<DeploymentView | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewId, setPreviewId] = useState("");
  const refresh = () => { setEditing(null); setCreating(false); void list.refetch(); };
  const preview = list.data?.find((i) => i.id === previewId) ?? list.data?.[0];
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const previewMember = preview?.members.find((m) => m.id === selectedMemberId) ?? preview?.members.find((m) => m.isDefault) ?? preview?.members[0];
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;

  return (
    <>
      <PageHeading title="位置绑定" description="将已测试的 Agent 版本绑定到公开位置；启用前须通过全部就绪检查。" action={<button className="primary" onClick={() => { setCreating(!creating); setEditing(null); }}>{creating ? "收起" : "新建绑定"}</button>} />
      <p><Link className="back-link" to={R.agents}>返回 Agent 列表</Link></p>
      {creating || editing ? <DeploymentForm editing={editing} agents={agents} saved={refresh} cancel={() => { setCreating(false); setEditing(null); }} /> : null}
      <section className="panel">
        <h2>已配置的位置</h2>
        {list.isPending ? <LoadingState /> : list.isError ? <ErrorState error={list.error} retry={list.refetch} /> : !list.data?.length ? (
          <EmptyState title="暂无位置绑定">保存绑定后默认未启用，须通过全部就绪检查才能启用。</EmptyState>
        ) : (
          <ul className="deployment-list">
            {list.data.map((d) => (
              <div key={d.id} onClick={() => setPreviewId(d.id)}>
                <DeploymentRow deployment={d} agents={agents} edit={() => setEditing(d)} refresh={refresh} />
              </div>
            ))}
          </ul>
        )}
      </section>
      {preview && previewMember ? (
        <section className="panel">
          <h2>前台介绍预览（静态）</h2>
          <div className="tabs" role="tablist">
            {preview.members.map((m) => (
              <button key={m.id} role="tab" aria-pressed={m.id === previewMember.id} onClick={() => setSelectedMemberId(m.id)}>
                {agentName(m.agentId)} v{m.revision}{m.isDefault ? "（默认）" : ""}
              </button>
            ))}
          </div>
          <div className="notice" style={{ marginBottom: 0 }}>
            <strong>{agentName(previewMember.agentId)}</strong>
            <span>版本 {previewMember.revision} · {previewMember.isDefault ? "默认回答该位置的问题" : "访客可显式切换"}</span>
          </div>
        </section>
      ) : null}
    </>
  );
}
