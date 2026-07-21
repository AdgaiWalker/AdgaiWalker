/**
 * ErrorBoundary — 管理端错误边界
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

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
        msg: 'admin_react_error_boundary',
        error: error.message,
        componentStack: info.componentStack?.slice(0, 500),
      }),
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel" style={{ margin: 24 }} role="alert">
          <h1>管理端出错</h1>
          <p className="error">{this.state.error.message}</p>
          <button type="button" onClick={() => this.setState({ error: null })}>
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
