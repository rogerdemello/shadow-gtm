"use client";

import { Component, type ReactNode } from "react";

// Class error boundary so a single failing panel (a bad render, a thrown hook)
// degrades to an inline message instead of blanking the whole dashboard.
export default class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("UI error boundary caught", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-signal-high/40 bg-signal-high/10 p-4 text-sm text-signal-high">
          <p className="mb-2">
            Something went wrong in {this.props.label ?? "this panel"}.
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded border border-signal-high/50 px-2 py-1 font-mono text-[11px] uppercase tracking-wider transition hover:bg-signal-high/10"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
