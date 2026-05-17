"use client";
export default function ThemeToggle({ theme, onToggle }: { theme: "light" | "dark"; onToggle: () => void }) {
  return <button type="button" onClick={onToggle} aria-label="Ganti tema" className="btn-secondary shrink-0">
    {theme === "dark" ? "☀️ Terang" : "🌙 Gelap"}
  </button>;
}
