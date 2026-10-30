/**
 * 内容历史面板 — /content/:slug 详情页的「历史」区块。
 * 闭环：列版本（不带正文）→ 看某版 → 比两版（服务端现算）→ 回退（二次确认）。
 * 回退语义：以旧版正文开草稿，发布后才成为新版本——历史本身永远只追加，不回改。
 */
import { useState } from "react";
import { GitCompare, History, RotateCcw } from "lucide-react";
import type { TextDiffSummary } from "@walker/shared";
import {
  fetchContentVersionDetail,
  fetchContentVersionDiff,
  useContentVersionHistory,
} from "../../api/queries";
import { ErrorState, LoadingState } from "../../components/States";
import { timeLabel } from "../../shared/labels";

export function ContentHistoryPanel({
  slug,
  onRestore,
}: {
  slug: string;
  /** 以某版正文开草稿：把旧版 raw 交给编辑器（由外层走未保存保护/CAS） */
  onRestore: (raw: string, fromVersion: number) => void;
}) {
  const historyQuery = useContentVersionHistory(slug);
  const [viewing, setViewing] = useState<{ version: number; body: string } | null>(null);
  const [diff, setDiff] = useState<{ a: number; b: number; result: TextDiffSummary } | null>(null);
  const [diffPick, setDiffPick] = useState<number[]>([]);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const versions = historyQuery.data?.versions ?? [];

  const handleView = async (version: number) => {
    setBusy(true);
    setError(null);
    try {
      const detail = await fetchContentVersionDetail(slug, version);
      setViewing({ version, body: detail.body });
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取版本失败");
    } finally {
      setBusy(false);
    }
  };

  const handleDiffPick = (version: number) => {
    const next = [...diffPick, version].slice(-2);
    setDiffPick(next);
    if (next.length === 2) {
      setBusy(true);
      setError(null);
      fetchContentVersionDiff(slug, next[0]!, next[1]!)
        .then((data) => setDiff({ a: next[0]!, b: next[1]!, result: data.diff }))
        .catch((err) => setError(err instanceof Error ? err.message : "diff 失败"))
        .finally(() => setBusy(false));
    }
  };

  if (historyQuery.isPending) return <LoadingState />;
  if (historyQuery.isError) {
    return <ErrorState error={historyQuery.error} retry={historyQuery.refetch} />;
  }

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <History size={18} /> 版本历史
      </h2>
      {versions.length === 0 ? (
        <p className="muted">本文还没有公开发布过版本。</p>
      ) : (
        <>
          <p className="muted">
            共 {versions.length} 个公开版本。点「对比」依次选两个版本看差异；回退 = 以旧版正文开草稿，发布后才生效。
          </p>
          {error ? <p className="error-text">{error}</p> : null}
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {versions.map((v) => (
              <li
                key={v.version}
                style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
              >
                <strong>v{v.version}</strong>
                <span className="muted">{timeLabel(v.publishedAt)}</span>
                <span>{v.note}</span>
                <span style={{ flex: 1 }} />
                <button type="button" className="button" disabled={busy} onClick={() => void handleView(v.version)}>
                  查看
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => handleDiffPick(v.version)}
                >
                  <GitCompare size={14} />
                  {diffPick.includes(v.version) ? "已选" : "对比"}
                </button>
                {confirmRestore === v.version ? (
                  <>
                    <span className="muted">以 v{v.version} 正文开草稿？</span>
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => {
                        setConfirmRestore(null);
                        void fetchContentVersionDetail(slug, v.version).then((d) => {
                          onRestore(d.body, v.version);
                        });
                      }}
                    >
                      确认回退
                    </button>
                    <button type="button" className="button" onClick={() => setConfirmRestore(null)}>
                      取消
                    </button>
                  </>
                ) : (
                  <button type="button" className="button" onClick={() => setConfirmRestore(v.version)}>
                    <RotateCcw size={14} /> 回退
                  </button>
                )}
              </li>
            ))}
          </ul>

          {viewing ? (
            <details open style={{ marginTop: 16 }}>
              <summary>v{viewing.version} 正文</summary>
              <pre style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto" }}>
                {viewing.body}
              </pre>
            </details>
          ) : null}

          {diff ? (
            <details open style={{ marginTop: 16 }}>
              <summary>
                v{diff.a} ↔ v{diff.b} 差异（+{diff.result.addedCount} / -{diff.result.removedCount}）
              </summary>
              <pre style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto", fontSize: 12 }}>
                {diff.result.lines
                  .map((l) =>
                    l.type === "added" ? `+ ${l.text}` : l.type === "removed" ? `- ${l.text}` : `  ${l.text}`,
                  )
                  .join("\n")}
              </pre>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}
