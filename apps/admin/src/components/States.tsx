import { FileText, RefreshCw, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError } from "../api/http";
import { ADMIN_ROUTES as R } from "../shared/routes";

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <FileText size={20} aria-hidden="true" />
      <strong>{title}</strong>
      {children ? <div className="empty-body">{children}</div> : null}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="skeletons" role="status" aria-label="正在读取数据">
      <div />
      <div />
      <div />
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry: () => unknown }) {
  const e = error instanceof ApiError ? error : null;
  return (
    <div className="error-state" role="alert">
      <strong>{e?.statusCode === 404 ? "找不到这项内容" : "暂时无法读取数据"}</strong>
      <p>{e?.message ?? "服务暂不可用，请稍后重试。"}</p>
      {e?.requestId ? <small className="mono">请求编号：{e.requestId}</small> : null}
      <div className="action-row">
        <button type="button" className="btn" onClick={() => void retry()}>
          <RefreshCw size={14} aria-hidden="true" />
          重试
        </button>
        <a className="btn btn-ghost" href={`${R.settings}#diagnostics`}>
          <Terminal size={14} aria-hidden="true" />
          运行日志
        </a>
      </div>
    </div>
  );
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      {action ? <div className="page-heading-action">{action}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel-heading">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
