import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { AlertTriangle, ArrowLeft, RefreshCw, Terminal } from "lucide-react";
import { ApiError } from "../api/http";
import { ADMIN_ROUTES as R } from "../shared/routes";

function RecoveryLinks({ onReset }: { onReset: () => void }) {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return (
      <>
        <Link className="btn" to={R.content} onClick={onReset}><ArrowLeft size={14} aria-hidden="true" /> 返回文章</Link>
        <Link className="btn" to={`${R.settings}#diagnostics`} onClick={onReset}><Terminal size={14} aria-hidden="true" /> 查看运行日志</Link>
      </>
    );
  }
  return (
    <>
      <a className="btn" href={R.content} onClick={onReset}><ArrowLeft size={14} aria-hidden="true" /> 返回文章</a>
      <a className="btn" href={`${R.settings}#diagnostics`} onClick={onReset}><Terminal size={14} aria-hidden="true" /> 查看运行日志</a>
    </>
  );
}

/** 兜底三件套之一：默认 UI 兜底，路由级走 SPA 导航保留内存凭据，根级回退原生跳转。 */
export class AppErrorBoundary extends Component<{ children: ReactNode; scope?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[admin:${this.props.scope ?? "root"}]`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const requestId = error instanceof ApiError ? error.requestId : undefined;
    return (
      <section className="fallback-card" role="alert">
        <div className="fallback-head">
          <AlertTriangle size={20} aria-hidden="true" />
          <strong>页面出现异常，已安全兜底</strong>
        </div>
        <p className="muted">{error.message || "渲染发生未预期错误，你的文章内容未受影响。"}</p>
        {requestId ? <p className="mono muted">requestId: {requestId}</p> : null}
        <div className="action-row">
          <button type="button" className="btn btn-primary" onClick={this.reset}><RefreshCw size={14} aria-hidden="true" /> 重试</button>
          <RecoveryLinks onReset={this.reset} />
        </div>
      </section>
    );
  }
}
