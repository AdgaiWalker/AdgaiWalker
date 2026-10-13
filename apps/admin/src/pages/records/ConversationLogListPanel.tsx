import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import { useAgents, useConversationExport, useConversationLogs, useCreateConversationExport } from "../../api/queries";
import { REGISTERED_PLACEMENTS, type ConversationExportFormat, type ConversationExportJobView } from "@walker/shared";
import { ADMIN_ROUTES as R } from "../../shared/routes";
import { statusLabel, timeLabel } from "../../shared/labels";
import { requestBlob } from "../../api/http";

const EXPORT_FILTERS = ["keyword", "contentSlug", "placementKey", "agentId", "runState", "from", "to"] as const;
const EXPORT_STATE_LABELS: Record<ConversationExportJobView["state"], string> = {
  QUEUED: "排队中", PROCESSING: "生成中", READY: "可下载", FAILED: "生成失败", REVOKED: "已撤销", EXPIRED: "已过期",
};

const RUN_STATES = ["QUEUED", "CLAIMED", "RUNNING", "STOPPING", "SUCCEEDED", "FAILED", "CANCELLED", "UNKNOWN"];
const DELIVERY_LABELS: Record<string, string> = {
  pending: "待发送", partial: "部分发送", sent: "已发送", ack: "访客已确认收到", unknown: "送达未知",
};

export function ConversationLogListPanel() {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const query = useConversationLogs(search);
  const agents = useAgents();
  const exportId = params.get("exportId") ?? "";
  const exportQuery = useConversationExport(exportId);
  const createExport = useCreateConversationExport();
  const [exportError, setExportError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const limit = params.get("limit") === "100" ? 100 : 50;

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    next.set("tab", "visitors");
    next.set("limit", String(form.get("limit") || 50));
    for (const key of ["keyword", "contentSlug", "placementKey", "agentId", "runState", "from", "to"]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) next.set(key, value);
    }
    setParams(next);
    setExportError("");
    setDownloadError("");
  }

  function moveCursor(cursor: string | null) {
    const next = new URLSearchParams(params);
    if (cursor) next.set("cursor", cursor);
    else next.delete("cursor");
    setParams(next);
  }

  async function startExport(format: ConversationExportFormat) {
    setExportError("");
    setDownloadError("");
    const filters = Object.fromEntries(EXPORT_FILTERS.flatMap((key) => {
      const value = params.get(key);
      return value ? [[key, value]] : [];
    }));
    try {
      const job = await createExport.mutateAsync({ format, filters });
      const next = new URLSearchParams(params);
      next.delete("cursor");
      next.set("exportId", job.id);
      setParams(next);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "无法创建导出任务");
    }
  }

  async function downloadExport(job: ConversationExportJobView) {
    if (!job.downloadPath) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const blob = await requestBlob(job.downloadPath);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `walker-conversations-${job.id}.${job.format}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "下载文件失败");
      void exportQuery.refetch();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="panel">
      <form className="toolbar conversation-filters" aria-label="筛选访客对话" onSubmit={applyFilters} key={search}>
        <label>关键词
          <input name="keyword" aria-label="关键词" maxLength={200} defaultValue={params.get("keyword") ?? ""} placeholder="搜索问题或回答" />
        </label>
        <label>内容 slug
          <input name="contentSlug" aria-label="内容 slug" maxLength={128} defaultValue={params.get("contentSlug") ?? ""} placeholder="例如 post-a" />
        </label>
        <label>服务位置
          <select name="placementKey" aria-label="服务位置" defaultValue={params.get("placementKey") ?? ""}>
            <option value="">全部位置</option>
            {REGISTERED_PLACEMENTS.map((placement) => <option key={placement.key} value={placement.key}>{placement.label}</option>)}
          </select>
        </label>
        <label>Agent
          <select name="agentId" aria-label="筛选 Agent" defaultValue={params.get("agentId") ?? ""}>
            <option value="">全部 Agent</option>
            {agents.data?.data.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
        </label>
        <label>运行状态
          <select name="runState" aria-label="运行状态" defaultValue={params.get("runState") ?? ""}>
          <option value="">全部状态</option>
            <option value="NONE">无运行记录</option>
            {RUN_STATES.map((state) => <option key={state} value={state}>{statusLabel(state)}</option>)}
          </select>
        </label>
        <label>开始日期
          <input name="from" aria-label="开始日期" type="date" defaultValue={params.get("from") ?? ""} />
        </label>
        <label>结束日期
          <input name="to" aria-label="结束日期" type="date" defaultValue={params.get("to") ?? ""} />
        </label>
        <label>每页
          <select name="limit" aria-label="每页条数" defaultValue={String(limit)}>
            <option value="50">50 条</option>
            <option value="100">100 条</option>
          </select>
        </label>
        <button className="primary" type="submit"><Search size={16} aria-hidden="true" />搜索</button>
      </form>

      <p className="muted conversation-page-count">本页 {query.data ? query.data.items.length : "未知"} 条 · 仅显示仍在保留期且未删除的会话</p>
      <div className="toolbar conversation-export-actions" aria-label="导出当前筛选结果">
        <span className="muted">按当前筛选冻结快照，最多 10,000 个会话；本机文件 15 分钟后失效。</span>
        <button type="button" disabled={createExport.isPending} onClick={() => void startExport("csv")}>
          <Download size={16} aria-hidden="true" />导出 CSV 汇总
        </button>
        <button type="button" disabled={createExport.isPending} onClick={() => void startExport("json")}>
          <Download size={16} aria-hidden="true" />导出 JSON 明细
        </button>
      </div>
      {exportError && <p className="error-text" role="alert">{exportError}</p>}
      {exportId && (exportQuery.isPending ? <LoadingState /> : exportQuery.isError ? (
        <ErrorState error={exportQuery.error} retry={exportQuery.refetch} />
      ) : exportQuery.data && <ExportJobPanel
        job={exportQuery.data}
        downloading={downloading}
        downloadError={downloadError}
        onDownload={() => void downloadExport(exportQuery.data!)}
      />)}
      {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} retry={query.refetch} /> : query.data?.items.length ? (
        <div className="table-scroll">
          <table>
            <thead><tr>
              <th>最后问题</th><th>内容 / 位置</th><th>参与 Agent</th><th>轮数</th><th>状态</th><th>最近活动</th>
            </tr></thead>
            <tbody>
              {query.data.items.map((item) => {
                const search = params.toString();
                const href = { pathname: R.conversationDetail(item.conversationId), search: search ? `?${search}` : "" };
                return (
                  <tr key={item.conversationId}>
                    <td>
                      <Link to={href}>{item.latestQuestion ?? "没有问题正文记录"}</Link>
                    </td>
                    <td>{item.contentSlug}<small>{item.placementKey}</small></td>
                    <td>{item.participants.length ? item.participants.map((agent) => `${agent.agentName} · v${agent.revision}`).join("、") : "未知"}</td>
                    <td>{item.turnCount}</td>
                    <td>
                      <span className="badge">{item.latestRunState ? statusLabel(item.latestRunState) : "无运行记录"}</span>
                      {item.latestDelivery && <small>{DELIVERY_LABELS[item.latestDelivery] ?? "交付状态未知"}</small>}
                    </td>
                    <td>{timeLabel(item.lastActivityAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="暂无访客对话">可调整关键词、内容、位置、Agent、状态或日期范围后重试。</EmptyState>}

      <div className="pagination">
        <button type="button" disabled={!params.get("cursor")} onClick={() => moveCursor(null)}>
          <ChevronLeft size={16} aria-hidden="true" />回到开头
        </button>
        <button type="button" disabled={!query.data?.nextCursor} onClick={() => moveCursor(query.data?.nextCursor ?? null)}>
          下一页<ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function ExportJobPanel({
  job, downloading, downloadError, onDownload,
}: {
  job: ConversationExportJobView;
  downloading: boolean;
  downloadError: string;
  onDownload: () => void;
}) {
  const filterLabels = Object.entries(job.filters)
    .filter(([, value]) => value)
    .map(([key, value]) => `${FILTER_LABELS[key] ?? key}：${value}`);
  return (
    <section className="notice conversation-export-status" aria-live="polite" aria-label="导出任务状态">
      <strong>{job.format.toUpperCase()} 导出 · {EXPORT_STATE_LABELS[job.state]}</strong>
      <p>快照时间 {timeLabel(job.snapshotAt)} · 明细截止 {timeLabel(job.retentionCutoff)} · {job.rowCount} 个会话</p>
      <p>字段：{job.fields.join("、")}</p>
      <p>筛选：{filterLabels.length ? filterLabels.join("；") : "全部可见会话"}</p>
      <p>本机文件有效至 {timeLabel(job.expiresAt)}；已下载的外部副本无法撤回。</p>
      {job.state === "FAILED" && <p role="alert">导出生成失败，请检查筛选范围后重新创建。</p>}
      {job.state === "REVOKED" && <p role="alert">命中的会话已删除，本机导出文件已清理。</p>}
      {job.downloadPath && <button type="button" disabled={downloading} onClick={onDownload}>
        <Download size={16} aria-hidden="true" />{downloading ? "准备下载…" : "下载文件"}
      </button>}
      {downloadError && <p role="alert">{downloadError}</p>}
    </section>
  );
}

const FILTER_LABELS: Record<string, string> = {
  keyword: "关键词", contentSlug: "内容", placementKey: "服务位置", agentId: "Agent", runState: "运行状态", from: "开始日期", to: "结束日期",
};
