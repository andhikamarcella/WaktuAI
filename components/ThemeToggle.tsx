"use client";
export default function ThemeToggle({ theme, onToggle }: { theme: "light" | "dark"; onToggle: () => void }) {
  return <button type="button" onClick={onToggle} aria-label="Ganti tema" className="rounded-full border border-white/30 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 active:translate-y-0 dark:bg-slate-900/70 dark:text-white">
    {theme === "dark" ? "☀️ Terang" : "🌙 Gelap"}
  </button>;
}
