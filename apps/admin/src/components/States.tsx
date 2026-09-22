import { FileText, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError } from "../api/http";
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <FileText aria-hidden="true" />
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
export function LoadingState() {
  return (
    <div className="skeletons" role="status" aria-label="正在读取数据">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} />
      ))}
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry: () => unknown;
}) {
  const e = error instanceof ApiError ? error : null;
  return (
    <div className="error-state" role="alert">
      <strong>
        {e?.statusCode === 404 ? "找不到这项内容" : "暂时无法读取数据"}
      </strong>
      <p>{e?.message ?? "服务暂不可用，请稍后重试。"}</p>
      {e?.requestId && <small>请求编号：{e.requestId}</small>}
      <button onClick={() => void retry()}>
        <RefreshCw size={16} />
        重新读取
      </button>
    </div>
  );
}
export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
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
    <section className={`panel ${className}`}>
      <header className="panel-heading">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
