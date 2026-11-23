import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, KeyRound } from "lucide-react";
import { getAdminUsername, requestJson, REQUEST_TIMEOUTS, setAdminToken } from "../../api/http";
import { getAdminUiEvents, subscribeAdminUiEvents } from "../../api/telemetry";
import { useAgents, useCapabilities } from "../../api/queries";
import { LoadingState } from "../../components/States";
import { ADMIN_ROUTES as R } from "../../shared/routes";

const ModelConfigPanel = lazy(() =>
  import("./ModelConfigPanel").then((m) => ({ default: m.ModelConfigPanel })),
);
const GuestQuotaPanel = lazy(() =>
  import("./GuestQuotaPanel").then((m) => ({ default: m.GuestQuotaPanel })),
);
const AgentListPage = lazy(() =>
  import("../agents/AgentListPage").then((m) => ({ default: m.AgentListPage })),
);
const RuntimeMonitorPanel = lazy(() =>
  import("../records/RuntimeMonitorPanel").then((m) => ({ default: m.RuntimeMonitorPanel })),
);

function LazyAccordionItem({
  id,
  title,
  summaryMeta,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  summaryMeta?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  return (
    <details
      id={id}
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      {/* modern-web-guidance accordion: 不在 summary 内放 h2/h3，保持纯文本可访问语义 */}
      <summary>
        <span>{title}</span>
        {summaryMeta ? <span className="sys-summary-meta">{summaryMeta}</span> : null}
      </summary>
      {open ? (
        <div className="sys-details-body">
          <Suspense fallback={<LoadingState />}>{children}</Suspense>
        </div>
      ) : null}
    </details>
  );
}

function AdminPasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const username = getAdminUsername();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (newPassword.trim().length < 6) {
      setFeedback({ ok: false, text: "新密码至少 6 位" });
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      setFeedback({ ok: false, text: "两次输入的新密码不一致" });
      return;
    }
    setSaving(true);
    try {
      await requestJson<{ ok: boolean }>("/ops/admin-password", {
        method: "PUT",
        body: { currentPassword: currentPassword.trim(), newPassword: newPassword.trim() },
        timeoutMs: REQUEST_TIMEOUTS.write,
      });
      setAdminToken(newPassword.trim(), username);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFeedback({ ok: true, text: "密码已更新并立即生效" });
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : "修改失败" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={{ maxWidth: 360, display: "grid", gap: 10 }}>
      <p className="muted" style={{ margin: 0 }}>
        当前账号：<strong>{username}</strong>
      </p>
      {feedback ? (
        <p className={feedback.ok ? "" : "error-text"} role="status" style={{ margin: 0 }}>
          {feedback.text}
        </p>
      ) : null}
      <input
        type="password"
        required
        autoComplete="current-password"
        placeholder="当前密码"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
      />
      <input
        type="password"
        required
        autoComplete="new-password"
        placeholder="新密码（至少 6 位）"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      <input
        type="password"
        required
        autoComplete="new-password"
        placeholder="确认新密码"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />
      <div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <KeyRound size={14} aria-hidden="true" />
          {saving ? "保存中…" : "更新密码"}
        </button>
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
      <p className="muted" style={{ fontSize: 12, margin: "0 0 6px" }}>
        本次会话交互埋点（最近 {events.length} 条，见 docs/admin-telemetry-events.md）
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>事件</th>
              <th>参数</th>
            </tr>
          </thead>
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
  const location = useLocation();
  const hash = location.hash.replace(/^#/, "");
  const agents = useAgents();
  const capabilities = useCapabilities();
  const availableCount = capabilities.data?.items.filter((i) => i.state === "available").length ?? 0;
  const totalCount = capabilities.data?.items.length ?? 0;

  return (
    <section className="sys-accordion" aria-label="系统与低频配置">
      <LazyAccordionItem
        id="agents"
        title="小影与 Agent 管理"
        summaryMeta={agents.data ? `${agents.data.total} 个 Agent` : undefined}
        defaultOpen={hash === "agents"}
      >
        <div className="action-row" style={{ marginBottom: 12 }}>
          <Link to={R.deployments} className="btn">
            公开部署管理 <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
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

      <LazyAccordionItem
        id="diagnostics"
        title="运行诊断与系统日志"
        summaryMeta={totalCount > 0 ? `${availableCount}/${totalCount} 能力就绪` : "进程内日志"}
        defaultOpen={hash === "diagnostics"}
      >
        <RuntimeMonitorPanel />
        <ClientTelemetryPreview />
      </LazyAccordionItem>
    </section>
  );
}
