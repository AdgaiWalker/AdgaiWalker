import { useState } from "react";
import { KeyRound } from "lucide-react";
import { getAdminUsername, requestJson, REQUEST_TIMEOUTS, setAdminToken } from "../../api/http";
import { useCapabilities } from "../../app/AdminShell";
import { ErrorState, LoadingState, PageHeading } from "../../components/States";
import { capabilityLabels, timeLabel } from "../../shared/labels";
import { ModelConfigPanel } from "./ModelConfigPanel";

function AdminPasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const username = getAdminUsername();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!currentPassword.trim()) {
      setFeedback({ type: "error", text: "请输入当前密码" });
      return;
    }
    if (newPassword.trim().length < 6) {
      setFeedback({ type: "error", text: "新密码长度至少为 6 位" });
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      setFeedback({ type: "error", text: "两次输入的新密码不一致" });
      return;
    }
    setSaving(true);
    try {
      await requestJson<{ ok: boolean; username: string }>("/ops/admin-password", {
        method: "PUT",
        body: {
          currentPassword: currentPassword.trim(),
          newPassword: newPassword.trim(),
        },
        timeoutMs: REQUEST_TIMEOUTS.write,
      });
      setAdminToken(newPassword.trim(), username);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFeedback({ type: "success", text: "密码修改成功！新密码已立即生效并持久化保存。" });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "密码修改失败，请重试",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <KeyRound size={18} />
        站主账号与密码
      </h2>
      <p className="muted">
        当前站主登录账号：<strong>{username}</strong>。修改密码后立即生效，并自动同步保存到后端配置。
      </p>

      {feedback && (
        <div
          className="notice"
          style={{
            background: feedback.type === "success" ? "#edfcf2" : "#fef2f2",
            color: feedback.type === "success" ? "#166534" : "#991b1b",
            border: feedback.type === "success" ? "1px solid #bbf7d0" : "1px solid #fecaca",
            marginBottom: 14,
          }}
        >
          {feedback.text}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ maxWidth: 420, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
          站主账号
          <input type="text" value={username} disabled style={{ background: "#f8fafc", color: "#64748b" }} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
          当前密码 *
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="输入当前正在使用的密码"
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
          新密码 *
          <input
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="输入新密码（至少 6 位）"
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
          确认新密码 *
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次输入新密码"
          />
        </label>

        <div style={{ marginTop: 4 }}>
          <button type="submit" className="button primary" disabled={saving}>
            {saving ? "正在保存..." : "保存新密码"}
          </button>
        </div>
      </form>
    </section>
  );
}

export function SettingsPage() {
  const query = useCapabilities();
  return (
    <>
      <PageHeading title="设置" description="管理站主登录密码、配置模型连接，查看当前可用能力。" />
      <AdminPasswordSection />
      <section className="panel">
        <h2>模型连接</h2>
        <p className="muted">
          提供方、API 网址、API Key 与模型都在这里配置；这是「配好供应商 → 建 Agent → 试跑 →
          看记录 → 部署」闭环的第一环。配置写入本系统自己的 Harness 目录，与站主个人环境无关。
        </p>
        <ModelConfigPanel />
      </section>
      <section className="panel">
        <h2>授权</h2>
        <p>授权在 Agent 详情里管理。新授权默认一次，修改和发布分开。持续内容全权入口已禁用。前台没有临时提权入口。</p>
      </section>
      <section className="panel">
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : (
          query.data && (
            <>
              <div className="detail-fields">
                <p>数据库：SQLite · 检查于 {timeLabel(query.data.checkedAt)}</p>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>能力</th>
                      <th>状态</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.items.map((item) => (
                      <tr key={item.key}>
                        <td>{capabilityLabels[item.key]}</td>
                        <td>
                          <span
                            className={`badge ${item.state === "available" ? "green" : ""}`}
                          >
                            {
                              {
                                available: "可用",
                                unavailable: "暂不可用",
                                "not-connected": "未接入",
                              }[item.state]
                            }
                          </span>
                        </td>
                        <td>{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </section>
    </>
  );
}
