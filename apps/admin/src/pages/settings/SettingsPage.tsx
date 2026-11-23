import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { getAdminUsername, requestJson, REQUEST_TIMEOUTS, setAdminToken } from "../../api/http";
import { getAdminUiEvents, subscribeAdminUiEvents } from "../../api/telemetry";
import { useAgents, useCapabilities } from "../../api/queries";
import { LoadingState } from "../../components/States";

const ModelConfigPanel = lazy(() => import("./ModelConfigPanel").then((m) => ({ default: m.ModelConfigPanel })));
const GuestQuotaPanel = lazy(() => import("./GuestQuotaPanel").then((m) => ({ default: m.GuestQuotaPanel })));
const AgentListPage = lazy(() => import("../agents/AgentListPage").then((m) => ({ default: m.AgentListPage })));
const RuntimeMonitorPanel = lazy(() => import("../records/RuntimeMonitorPanel").then((m) => ({ default: m.RuntimeMonitorPanel })));

function LazyAccordionItem({ id, title, summaryMeta, defaultOpen = false, children }: {
  id: string; title: string; summaryMeta?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { if (defaultOpen) setOpen(true); }, [defaultOpen]);
  return (
    <details id={id} open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span>{title}</span>
        {summaryMeta ? <span className="sys-summary-meta">{summaryMeta}</span> : null}
      </summary>
      {open ? <div className="sys-details-body"><Suspense fallback={<LoadingState />}>{children}</Suspense></div> : null}
    </details>
  );
}

function AdminPasswordForm() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const username = getAdminUsername();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (next.trim().length < 6) return setFeedback({ ok: false, text: "新密码至少 6 位" });
    if (next.trim() !== confirm.trim()) return setFeedback({ ok: false, text: "两次输入的新密码不一致" });
    setSaving(true);
    try {
      await requestJson<{ ok: boolean }>("/ops/admin-password", {
        method: "PUT",
        body: { currentPassword: cur.trim(), newPassword: next.trim() },
        timeoutMs: REQUEST_TIMEOUTS.write,
      });
      setAdminToken(next.trim(), username);
      setCur(""); setNext(""); setConfirm("");
      setFeedback({ ok: true, text: "密码已更新并立即生效" });
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : "修改失败" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="stack" style={{ maxWidth: 360 }}>
      <p className="muted" style={{ margin: 0 }}>当前账号：<strong>{username}</strong></p>
      {feedback ? <p className={feedback.ok ? "" : "error-text"} role="status" style={{ margin: 0 }}>{feedback.text}</p> : null}
      <input type="password" required autoComplete="current-password" placeholder="当前密码" value={cur} onChange={(e) => setCur(e.target.value)} />
      <input type="password" required autoComplete="new-password" placeholder="新密码（至少 6 位）" value={next} onChange={(e) => setNext(e.target.value)} />
      <input type="password" required autoComplete="new-password" placeholder="确认新密码" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <div>
        <button type="submit" className="btn btn-primary" disabled={saving}><KeyRound size={14} aria-hidden="true" />{saving ? "保存中…" : "更新密码"}</button>
      </div>
    </form>
  );
}

function ClientTelemetryPreview() {
  const [, bump] = useState(0);
  useEffect(() => subscribeAdminUiEvents(() => bump((n) => n + 1)), []);
  const events = getAdminUiEvents().slice(-15).reverse();
  if (events.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <p className="muted" style={{ fontSize: 12, margin: "0 0 6px" }}>本次会话交互埋点（已同步上报服务端运行日志，见 docs/admin-telemetry-events.md）</p>
      <div className="table-scroll">
        <table>
          <thead><tr><th>时间</th><th>事件</th><th>参数</th></tr></thead>
          <tbody>
            {events.map((ev, i) => (
              <tr key={`${ev.at}-${i}`}>
                <td className="mono">{ev.at.slice(11, 19)}</td>
                <td className="mono">{ev.event}</td>
                <td className="mono muted">{ev.props ? JSON.stringify(ev.props) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const hash = useLocation().hash.replace(/^#/, "");
  const agents = useAgents();
  const caps = useCapabilities();
  const okCount = caps.data?.items.filter((i) => i.state === "available").length ?? 0;
  const totalCount = caps.data?.items.length ?? 0;

  return (
    <section className="sys-accordion" aria-label="系统与低频配置">
      <LazyAccordionItem id="agents" title="小影与 Agent 管理" summaryMeta={agents.data ? `${agents.data.total} 个 Agent` : undefined} defaultOpen={hash === "agents"}>
        <AgentListPage />
      </LazyAccordionItem>
      <LazyAccordionItem id="model" title="模型连接" summaryMeta="API 与默认模型" defaultOpen={hash === "model"}>
        <ModelConfigPanel />
      </LazyAccordionItem>
      <LazyAccordionItem id="quota" title="访客额度" summaryMeta="每日问答限额" defaultOpen={hash === "quota"}>
        <GuestQuotaPanel />
      </LazyAccordionItem>
      <LazyAccordionItem id="password" title="站主账号与密码" defaultOpen={hash === "password"}>
        <AdminPasswordForm />
      </LazyAccordionItem>
      <LazyAccordionItem id="diagnostics" title="运行诊断与系统日志" summaryMeta={totalCount > 0 ? `${okCount}/${totalCount} 能力就绪` : "进程内日志"} defaultOpen={hash === "diagnostics"}>
        <RuntimeMonitorPanel />
        <ClientTelemetryPreview />
      </LazyAccordionItem>
    </section>
  );
}
