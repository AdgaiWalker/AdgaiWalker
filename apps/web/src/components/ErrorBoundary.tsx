/**
 * ErrorBoundary — 双层兜底界面（死守白屏与死胡同，支持重试 / 回首页 / 复制诊断现场）。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { formatDiagnosticsReport, trackWebEvent } from '../lib/web-telemetry';

type Props = {
  children: ReactNode;
  title?: string;
};

type State = {
  error: Error | null;
  copied: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    trackWebEvent('web.runtime_error_caught', {
      kind: 'boundary',
      message: error.message.slice(0, 140),
    });
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'react_error_boundary',
        error: error.message,
        componentStack: info.componentStack?.slice(0, 500),
      }),
    );
  }

  private copyDiagnostics = async () => {
    const report = formatDiagnosticsReport(this.state.error);
    try {
      await navigator.clipboard.writeText(report);
      this.setState({ copied: true });
    } catch {
      /* 剪贴板不可用时静默 */
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div className="fallback-card surface-l1" role="alert">
          <h1 className="page-title">{this.props.title ?? '页面出了点问题'}</h1>
          <p className="meta">{this.state.error.message || '发生了意外错误'}</p>
          <div className="fallback-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => this.setState({ error: null, copied: false })}
            >
              重试
            </button>
            <a href="/" className="btn-ghost">
              回首页
            </a>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void this.copyDiagnostics()}
            >
              {this.state.copied ? '已复制诊断' : '复制诊断信息'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
