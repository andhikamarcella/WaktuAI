import React from "react";

type State = { hasError: boolean };

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("WaktuAI UI error", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="grid min-h-screen place-items-center bg-page p-4 text-ink">
        <section className="card max-w-md">
          <h1 className="text-xl font-black">Terjadi kesalahan tampilan.</h1>
          <p className="mt-2 text-sm leading-6 text-muted">Data kamu tetap aman di browser. Coba reload, atau aktifkan safe mode dengan membersihkan cache lokal WaktuAI.</p>
          <div className="mt-4 grid grid-cols-1 gap-2">
            <button className="btn-primary" onClick={() => window.location.reload()}>Reload app</button>
            <button
              className="btn-secondary"
              onClick={() => {
                localStorage.setItem("waktuai.safeMode", "true");
                window.location.reload();
              }}
            >
              Reset safe mode
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                Object.keys(localStorage).filter((key) => key.startsWith("waktuai.")).forEach((key) => localStorage.removeItem(key));
                window.location.reload();
              }}
            >
              Clear local app cache
            </button>
          </div>
        </section>
      </main>
    );
  }
}
