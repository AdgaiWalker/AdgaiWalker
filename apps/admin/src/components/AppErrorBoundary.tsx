import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, RefreshCw, Terminal } from "lucide-react";
import { ApiError } from "../api/http";
import { ADMIN_ROUTES as R } from "../shared/routes";

interface Props {
  children: ReactNode;
  scope?: string;
}

interface State {
  error: Error | null;
}

/** 兜底三件套之一：默认 UI 兜底，死守白屏与死胡同，并直通运行日志。 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[admin:${this.props.scope ?? "root"}]`, error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

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
          <button type="button" className="btn btn-primary" onClick={this.reset}>
            <RefreshCw size={14} aria-hidden="true" /> 重试
          </button>
          <a className="btn" href={R.content} onClick={this.reset}>
            <ArrowLeft size={14} aria-hidden="true" /> 返回文章
          </a>
          <a className="btn" href={`${R.settings}#diagnostics`} onClick={this.reset}>
            <Terminal size={14} aria-hidden="true" /> 查看运行日志
          </a>
        </div>
      </section>
    );
  }
}
