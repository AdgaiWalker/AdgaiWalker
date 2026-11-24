import { useEffect, useState } from "react";
import { Gauge, RotateCcw, Save } from "lucide-react";
import { requestJson, REQUEST_TIMEOUTS } from "../../api/http";

interface QuotaData {
  quota: number; activeGuests: number; totalExhausted: number;
  jevRoi?: { fastPathHits: number; l1CacheHits: number; quotaExemptHits: number; savedTokensEstimate: number; avgLatencyMs: number };
}

const PRESETS = [5, 15, 30, 50, 100, 9999];

export function GuestQuotaPanel() {
  const [data, setData] = useState<QuotaData | null>(null);
  const [quotaInput, setQuotaInput] = useState("15");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try { const res = await requestJson<QuotaData>("/ops/guest-quota"); setData(res); setQuotaInput(String(res.quota)); }
    catch (err) { setFeedback({ ok: false, text: err instanceof Error ? err.message : "获取访客额度失败" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setFeedback(null);
    const num = Number(quotaInput);
    if (!Number.isInteger(num) || num < 1 || num > 100000) return setFeedback({ ok: false, text: "请输入 1 到 100,000 之间的整数额度" });
    setSaving(true);
    try {
      const res = await requestJson<{ ok: boolean; quota: number }>("/ops/guest-quota", { method: "PUT", body: { quota: num }, timeoutMs: REQUEST_TIMEOUTS.write });
      setData((prev) => (prev ? { ...prev, quota: res.quota } : null));
      setQuotaInput(String(res.quota));
      setFeedback({ ok: true, text: `访客额度已更新为每人 ${res.quota} 次并即时生效。` });
    } catch (err) { setFeedback({ ok: false, text: err instanceof Error ? err.message : "保存配额失败" }); } finally { setSaving(false); }
  };

  const handleReset = async () => {
    if (!window.confirm("确定要清空所有访客的已用额度记录吗？")) return;
    setResetting(true); setFeedback(null);
    try {
      await requestJson<{ ok: boolean }>("/ops/guest-quota/reset", { method: "POST", timeoutMs: REQUEST_TIMEOUTS.write });
      setFeedback({ ok: true, text: "所有访客的额度记录已清零重置。" }); await load();
    } catch (err) { setFeedback({ ok: false, text: err instanceof Error ? err.message : "重置失败" }); } finally { setResetting(false); }
  };

  const stats: Array<[string, string]> = [
    ["当前单人配额", loading ? "…" : `${data?.quota ?? 15} 次`],
    ["活跃访客标识", loading ? "…" : `${data?.activeGuests ?? 0} 人`],
    ["已用尽额度", loading ? "…" : `${data?.totalExhausted ?? 0} 人`],
    ["Fast-Path 拦截", `${data?.jevRoi?.fastPathHits ?? 0} 次`],
    ["L1 0ms 直出", `${data?.jevRoi?.l1CacheHits ?? 0} 次`],
    ["省下 Tokens", (data?.jevRoi?.savedTokensEstimate ?? 0).toLocaleString()],
    ["平均时延", `${data?.jevRoi?.avgLatencyMs ?? 0} ms`],
  ];

  return (
    <section className="panel stack">
      <div className="panel-heading">
        <h2 style={{ display: "flex", alignItems: "center", gap: 6 }}><Gauge size={16} /> 访客问答额度与边缘流控</h2>
      </div>
      <div className="metrics-grid">
        {stats.map(([label, val]) => (
          <div key={label} className="metric" style={{ cursor: "default" }}>
            <span><small className="muted">{label}</small><strong>{val}</strong></span>
          </div>
        ))}
      </div>
      {feedback ? <div className="notice" role={feedback.ok ? "status" : "alert"}>{feedback.text}</div> : null}
      <form onSubmit={(e) => void handleSave(e)} className="stack" style={{ maxWidth: 460 }}>
        <label className="field-col">
          每位访客 30 天可用额度（次）
          <input type="number" min={1} max={100000} required value={quotaInput} onChange={(e) => setQuotaInput(e.target.value)} />
        </label>
        <div className="chip-row">
          {PRESETS.map((p) => (
            <button key={p} type="button" className={`chip ${String(p) === quotaInput ? "is-active" : ""}`} onClick={() => setQuotaInput(String(p))}>
              {p === 9999 ? "不限额" : `${p} 次${p === 15 ? " (推荐)" : ""}`}
            </button>
          ))}
        </div>
        <div className="action-row">
          <button type="submit" className="btn btn-primary" disabled={saving || loading}><Save size={14} />{saving ? "保存中…" : "保存额度"}</button>
          <button type="button" className="btn btn-danger" disabled={resetting || loading} onClick={() => void handleReset()}><RotateCcw size={14} />{resetting ? "重置中…" : "清空已用记录"}</button>
        </div>
      </form>
    </section>
  );
}
