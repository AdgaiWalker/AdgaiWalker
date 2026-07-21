/**
 * ErrorBoundary — 壳层错误边界（非展示业务块）
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  title?: string;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
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

  render() {
    if (this.state.error) {
      return (
        <div
          className="surface-l2"
          style={{ padding: '2rem', maxWidth: 480, margin: '2rem auto' }}
          role="alert"
        >
          <h1 className="page-title">{this.props.title ?? '页面出了点问题'}</h1>
          <p className="meta">{this.state.error.message}</p>
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: 12 }}
            onClick={() => this.setState({ error: null })}
          >
            重试
          </button>
          <p className="meta" style={{ marginTop: 12 }}>
            <a href="/">回首页</a>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
