import { useState } from "react";
import { GitCompare, History, RotateCcw } from "lucide-react";
import type { TextDiffSummary } from "@walker/shared";
import { stripFrontmatterBlock } from "@walker/shared";
import { fetchContentVersionDetail, fetchContentVersionDiff, useContentVersionHistory } from "../../api/queries";
import { MarkdownPreview } from "../../components/MarkdownPreview";
import { ErrorState, LoadingState } from "../../components/States";
import { timeLabel } from "../../shared/labels";

export function ContentHistoryPanel({ slug, onRestore }: { slug: string; onRestore: (raw: string, fromVersion: number) => void }) {
  const historyQuery = useContentVersionHistory(slug);
  const [viewing, setViewing] = useState<{ version: number; body: string } | null>(null);
  const [diff, setDiff] = useState<{ a: number; b: number; result: TextDiffSummary } | null>(null);
  const [diffPick, setDiffPick] = useState<number[]>([]);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (historyQuery.isPending) return <LoadingState />;
  if (historyQuery.isError) return <ErrorState error={historyQuery.error} retry={historyQuery.refetch} />;
  const versions = historyQuery.data?.versions ?? [];

  const handleView = async (version: number) => {
    setBusy(true); setError(null);
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
      setBusy(true); setError(null);
      fetchContentVersionDiff(slug, next[0]!, next[1]!)
        .then((d) => setDiff({ a: next[0]!, b: next[1]!, result: d.diff }))
        .catch((err) => setError(err instanceof Error ? err.message : "diff 失败"))
        .finally(() => setBusy(false));
    }
  };

  return (
    <section className="stack">
      <div className="action-row"><History size={16} /><strong>版本历史</strong></div>
      {versions.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>本文还没有公开发布过版本。</p>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>共 {versions.length} 个公开版本；回退将以旧版正文开草稿，发布后成为新版本。</p>
          {error ? <p className="error-text">{error}</p> : null}
          <ul className="agent-list">
            {versions.map((v) => (
              <li key={v.version} className="agent-row" style={{ flexWrap: "wrap", gap: 8 }}>
                <span><strong>v{v.version}</strong> <span className="muted">{timeLabel(v.publishedAt)}</span> · {v.note}</span>
                <span className="action-row">
                  <button type="button" className="btn" disabled={busy} onClick={() => void handleView(v.version)}>查看</button>
                  <button type="button" className="btn" disabled={busy} onClick={() => handleDiffPick(v.version)}>
                    <GitCompare size={13} />{diffPick.includes(v.version) ? "已选" : "对比"}
                  </button>
                  {confirmRestore === v.version ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          setConfirmRestore(null);
                          void fetchContentVersionDetail(slug, v.version).then((d) => onRestore(d.body, v.version));
                        }}
                      >
                        确认回退
                      </button>
                      <button type="button" className="btn" onClick={() => setConfirmRestore(null)}>取消</button>
                    </>
                  ) : (
                    <button type="button" className="btn" onClick={() => setConfirmRestore(v.version)}><RotateCcw size={13} />回退</button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {viewing ? (
            <details open className="panel">
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>v{viewing.version} 正文预览</summary>
              <div style={{ maxHeight: 380, overflowY: "auto", marginTop: 10 }}>
                <MarkdownPreview raw={stripFrontmatterBlock(viewing.body)} />
              </div>
            </details>
          ) : null}

          {diff ? (
            <details open className="panel">
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                v{diff.a} ↔ v{diff.b} 差异（+{diff.result.addedCount} / -{diff.result.removedCount}）
              </summary>
              <div className="diff-view" style={{ marginTop: 10 }}>
                <table className="diff-table">
                  <tbody>
                    {diff.result.lines.map((l, idx) => (
                      <tr key={idx} className={l.type === "added" ? "diff-added" : l.type === "removed" ? "diff-removed" : "diff-unchanged"}>
                        <td className="diff-line-no">{l.oldLineNumber ?? ""}</td>
                        <td className="diff-line-no">{l.newLineNumber ?? ""}</td>
                        <td>{l.type === "added" ? "+ " : l.type === "removed" ? "- " : "  "}{l.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}
