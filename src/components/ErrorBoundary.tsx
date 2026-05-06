import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Catches render-phase errors anywhere in the tree below it. Falls back to
 * a recoverable error screen instead of a blank window.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Nullpath] Render error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex items-center justify-center px-6">
          <div className="max-w-xl w-full np-pixel rounded-lg p-6 border-[var(--color-rose)]">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-[var(--color-rose)]" />
              <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-rose)]">
                NULLPATH HALTED
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-[var(--color-fg-0)]">
              Something blew up.
            </div>
            <div className="text-[var(--color-fg-2)] text-[13px] mt-2 leading-relaxed">
              The view crashed mid-render. Your data is safe — nothing got written through this
              path. Try resetting the view; if it crashes again, restart the app.
            </div>
            <pre className="mt-4 np-mono text-[11px] text-[var(--color-rose)] bg-[var(--color-bg-2)] border border-[var(--color-border-default)] rounded p-3 max-h-48 overflow-auto">
{this.state.error?.toString()}
{this.state.errorInfo?.componentStack ?? ""}
            </pre>
            <div className="flex gap-2 mt-4">
              <button
                onClick={this.reset}
                className="np-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2 rounded bg-[var(--color-cyan-dim)] text-[var(--color-bg-0)] hover:bg-[var(--color-cyan)]"
              >
                <RotateCcw size={12} className="inline mr-2" />
                Reset view
              </button>
              <button
                onClick={() => location.reload()}
                className="np-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2 rounded border border-[var(--color-border-default)] text-[var(--color-fg-1)] hover:text-[var(--color-fg-0)]"
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
