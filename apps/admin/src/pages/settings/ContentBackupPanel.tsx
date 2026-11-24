import { useState } from "react";
import { Download, Upload } from "lucide-react";
import type { ContentBundle, ContentImportConflictPolicy, ContentImportRequest, ContentImportResult } from "@walker/shared";
import { downloadTextFile, exportAdminContent, useImportContent } from "../../api/queries";

export function ContentBackupPanel() {
  const importMut = useImportContent();
  const [policy, setPolicy] = useState<ContentImportConflictPolicy>("skip");
  const [payload, setPayload] = useState<ContentImportRequest | ContentBundle | null>(null);
  const [preview, setPreview] = useState<ContentImportResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const exportBundle = async () => {
    setErr(null); setMsg(null);
    try {
      const res = await exportAdminContent();
      downloadTextFile(`walker-content-bundle-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(res, null, 2), "application/json");
      if ("count" in res) setMsg(`已导出 ${res.count} 篇文章内容包`);
    } catch (e) { setErr(e instanceof Error ? e.message : "导出失败"); }
  };

  const handleFiles = async (files: File[]) => {
    if (!files.length) return;
    setErr(null); setMsg(null); setPreview(null);
    try {
      let next: ContentImportRequest | ContentBundle;
      if (files.length === 1 && files[0]!.name.endsWith(".json")) {
        next = JSON.parse(await files[0]!.text()) as ContentBundle;
      } else {
        const items = await Promise.all(files.map(async (f) => ({ slug: f.name.replace(/\.(md|mdx)$/i, "").toLowerCase(), raw: await f.text() })));
        next = { items };
      }
      setPayload(next);
      setPreview(await importMut.mutateAsync({ ...next, conflictPolicy: policy, dryRun: true }));
    } catch (e) { setErr(e instanceof Error ? e.message : "读取或预检失败"); }
  };

  const confirmImport = async () => {
    if (!payload) return;
    setErr(null); setMsg(null);
    try {
      const res = await importMut.mutateAsync({ ...payload, conflictPolicy: policy, dryRun: false });
      setPreview(null); setPayload(null);
      setMsg(`导入完成：新增 ${res.created} · 更新 ${res.updated} · 跳过 ${res.skipped} · 失败 ${res.failed}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "导入失败"); }
  };

  return (
    <div className="stack">
      <div className="action-row">
        <button type="button" className="btn" onClick={() => void exportBundle()}><Download size={14} /> 导出全站文章包 (.json)</button>
        <select aria-label="同 slug 冲突策略" value={policy} onChange={(e) => { const p = e.target.value as ContentImportConflictPolicy; setPolicy(p); if (payload) void importMut.mutateAsync({ ...payload, conflictPolicy: p, dryRun: true }).then(setPreview).catch(() => undefined); }}>
          <option value="skip">同名跳过 (skip)</option>
          <option value="overwrite">同名覆盖 (overwrite)</option>
        </select>
        <label className="btn"><Upload size={14} /> 选择 .json / .md 导入
          <input type="file" hidden multiple accept=".json,.md,.mdx" onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.currentTarget.value = ""; void handleFiles(picked); }} />
        </label>
      </div>
      {msg ? <p role="status" style={{ margin: 0 }}>{msg}</p> : null}
      {err ? <p className="error-text" role="alert" style={{ margin: 0 }}>{err}</p> : null}
      {preview ? (
        <div className="notice">
          <span>预检共 {preview.total} 篇：新增 {preview.created} · 更新 {preview.updated} · 一致 {preview.unchanged} · 跳过 {preview.skipped} · 错误 {preview.failed}</span>
          <button type="button" className="btn btn-primary" disabled={importMut.isPending || (preview.created === 0 && preview.updated === 0)} onClick={() => void confirmImport()}>确认导入</button>
        </div>
      ) : null}
    </div>
  );
}
