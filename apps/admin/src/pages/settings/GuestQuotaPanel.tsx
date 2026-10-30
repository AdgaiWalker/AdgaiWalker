import { useEffect, useState } from "react";
import { Clock, Cpu, Gauge, RotateCcw, Save, ShieldCheck, Sparkles, Users, Zap } from "lucide-react";
import { requestJson, REQUEST_TIMEOUTS } from "../../api/http";

interface JevRoiData {
  fastPathHits: number;
  l1CacheHits: number;
  networkCalls: number;
  quotaExemptHits: number;
  savedTokensEstimate: number;
  avgLatencyMs: number;
}

interface QuotaData {
  quota: number;
  activeGuests: number;
  totalExhausted: number;
  jevRoi?: JevRoiData;
}

const PRESET_QUOTAS = [5, 15, 30, 50, 100, 9999];

export function GuestQuotaPanel() {
  const [data, setData] = useState<QuotaData | null>(null);
  const [quotaInput, setQuotaInput] = useState<string>("15");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchQuota = async () => {
    try {
      setLoading(true);
      const res = await requestJson<QuotaData>("/ops/guest-quota");
      setData(res);
      setQuotaInput(String(res.quota));
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "获取访客额度失败",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchQuota();
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setFeedback(null);
    const num = Number(quotaInput);
    if (!Number.isInteger(num) || num < 1 || num > 100000) {
      setFeedback({ type: "error", text: "请输入 1 到 100,000 之间的整数额度" });
      return;
    }

    setSaving(true);
    try {
      const res = await requestJson<{ ok: boolean; quota: number }>("/ops/guest-quota", {
        method: "PUT",
        body: { quota: num },
        timeoutMs: REQUEST_TIMEOUTS.write,
      });
      setData((prev) => (prev ? { ...prev, quota: res.quota } : null));
      setQuotaInput(String(res.quota));
      setFeedback({
        type: "success",
        text: `访客额度已成功更新为每人 ${res.quota} 次！修改已持久化并实时生效。`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "保存配额失败，请重试",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("确定要清空所有访客的已用额度记录吗？此操作会为所有访客重置完整的可用次数。")) {
      return;
    }
    setResetting(true);
    setFeedback(null);
    try {
      await requestJson<{ ok: boolean }>("/ops/guest-quota/reset", {
        method: "POST",
        timeoutMs: REQUEST_TIMEOUTS.write,
      });
      setFeedback({ type: "success", text: "所有访客的额度记录已成功清零重置！" });
      await fetchQuota();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "重置额度记录失败",
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <section className="panel">
      <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Gauge size={18} />
        访客问答额度与流控设置
      </h2>
      <p className="muted">
        设置每位未登录访客（包括首页小影与 Intake 动作拆解）在 30 天内允许的最大完整对话与问答次数。
        修改后即刻生效，无需重启服务，并自动同步持久化保存。
      </p>

      {/* 实时统计卡片 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ padding: "12px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldCheck size={14} color="#0e7490" />
            当前单人配额
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginTop: 4 }}>
            {loading ? "..." : `${data?.quota ?? 15} 次`}
          </div>
        </div>

        <div style={{ padding: "12px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
            <Users size={14} color="#2563eb" />
            活跃访客标识数
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginTop: 4 }}>
            {loading ? "..." : `${data?.activeGuests ?? 0} 人`}
          </div>
        </div>

        <div style={{ padding: "12px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
            <Gauge size={14} color="#d97706" />
            已用尽额度访客
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: data?.totalExhausted ? "#dc2626" : "#16a34a", marginTop: 4 }}>
            {loading ? "..." : `${data?.totalExhausted ?? 0} 人`}
          </div>
        </div>
      </div>

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

      {/* 修改表单 */}
      <form onSubmit={handleSave} style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
          每位访客可用额度（次）
          <input
            type="number"
            min={1}
            max={100000}
            required
            value={quotaInput}
            onChange={(e) => setQuotaInput(e.target.value)}
            placeholder="例如 15"
            style={{ width: "100%", padding: "8px 12px" }}
          />
        </label>

        {/* 快捷预设 */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>快捷预设：</span>
          {PRESET_QUOTAS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="button"
              style={{
                padding: "4px 10px",
                fontSize: 12,
                borderRadius: 6,
                background: String(preset) === quotaInput ? "#ecfeff" : "#fff",
                borderColor: String(preset) === quotaInput ? "#0e7490" : "#cbd5e1",
                color: String(preset) === quotaInput ? "#0e7490" : "#334155",
                fontWeight: String(preset) === quotaInput ? 600 : 400,
              }}
              onClick={() => setQuotaInput(String(preset))}
            >
              {preset === 9999 ? "不限额 (9999次)" : `${preset} 次${preset === 15 ? " (推荐)" : ""}`}
            </button>
          ))}
        </div>

        {/* 操作按钮组 */}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button type="submit" className="button primary" disabled={saving || loading}>
            <Save size={15} />
            {saving ? "正在保存..." : "保存额度设置"}
          </button>

          <button
            type="button"
            className="button"
            disabled={resetting || loading}
            onClick={handleReset}
            style={{ color: "#b91c1c", borderColor: "#fecaca" }}
          >
            <RotateCcw size={15} />
            {resetting ? "正在重置..." : "清空所有访客已用记录"}
          </button>
        </div>
      </form>

      {/* JEV System One 边缘智能与 ROI 效益看板 */}
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Zap size={16} color="#d97706" />
          JEV System One 边缘意图门控与 ROI 效益
        </h3>
        <p className="muted" style={{ marginBottom: 14 }}>
          由 TypeSafe JEV 非自回归决策引擎与 L1 零延迟缓存联合驱动：前置拦截高频打招呼、站点问答与提示词越狱，0ms 极速直出，既省下昂贵的 DeepSeek Token，更守护访客额度不被轻量探询浪费。
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <div style={{ padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 5 }}>
              <Zap size={13} color="#d97706" />
              Fast-Path 拦截总数
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginTop: 4 }}>
              {data?.jevRoi?.fastPathHits ?? 0} 次
            </div>
          </div>

          <div style={{ padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 5 }}>
              <Cpu size={13} color="#2563eb" />
              L1 本地 0ms 闪电直出
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#2563eb", marginTop: 4 }}>
              {data?.jevRoi?.l1CacheHits ?? 0} 次
            </div>
          </div>

          <div style={{ padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 5 }}>
              <ShieldCheck size={13} color="#16a34a" />
              额度豁免守护次数
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#16a34a", marginTop: 4 }}>
              {data?.jevRoi?.quotaExemptHits ?? 0} 次
            </div>
          </div>

          <div style={{ padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 5 }}>
              <Sparkles size={13} color="#9333ea" />
              节省 DeepSeek Tokens
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#9333ea", marginTop: 4 }}>
              {(data?.jevRoi?.savedTokensEstimate ?? 0).toLocaleString()}
            </div>
          </div>

          <div style={{ padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 5 }}>
              <Clock size={13} color="#0891b2" />
              平均端到端时延
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0891b2", marginTop: 4 }}>
              {data?.jevRoi?.avgLatencyMs ?? 0} ms
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
