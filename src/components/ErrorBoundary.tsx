import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: ""
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Aplikasi berhenti karena error yang tidak dikenal."
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("WaktuAI render error", error, info.componentStack);
  }

  clearCacheAndReload = async (): Promise<void> => {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } finally {
      window.location.reload();
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="app">
        <section className="panel error-panel">
          <p className="eyebrow">WaktuAI</p>
          <h1>Aplikasi perlu dimuat ulang</h1>
          <p className="notice warning">
            Ada cache lama atau error browser yang membuat WaktuAI gagal tampil. Tekan tombol di bawah untuk membersihkan cache aplikasi dan memuat versi terbaru.
          </p>
          <p className="muted">{this.state.message}</p>
          <div className="button-row">
            <button onClick={() => { void this.clearCacheAndReload(); }}>Bersihkan Cache & Reload</button>
            <button className="secondary" onClick={() => window.location.reload()}>Reload Biasa</button>
          </div>
        </section>
      </main>
    );
  }
}
