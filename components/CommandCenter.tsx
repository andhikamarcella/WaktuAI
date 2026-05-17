import { useMemo, useState } from "react";

const CATEGORIES = [
  { name: "Waktu", commands: ["Jam berapa sekarang?", "Tanggal hari ini"] },
  { name: "Sholat", commands: ["Jadwal sholat hari ini", "Isya jam berapa"] },
  { name: "Notifikasi", commands: ["Aktifkan notifikasi sholat", "Tes notifikasi", "Matikan notifikasi sholat"] },
  { name: "Reminder", commands: ["Ingatkan aku 17:46", "Ingatkan aku 10 menit lagi", "Bangunin aku jam 04:30"] },
  { name: "Kiblat", commands: ["Arah kiblat"] },
  { name: "Rakaat", commands: ["Mulai deteksi rakaat", "Pakai hitung manual", "Tambah rakaat"] },
  { name: "Bantuan", commands: ["Aku bingung", "Command apa aja", "Cara pakainya gimana"] }
];

export const HELP_CARDS = [
  { title: "Tanya Jam", example: "Jam berapa sekarang?" },
  { title: "Jadwal Sholat", example: "Jadwal sholat hari ini" },
  { title: "Notifikasi Sholat", example: "Aktifkan notifikasi Isya" },
  { title: "Reminder", example: "Ingatkan aku 17:46" },
  { title: "Arah Kiblat", example: "Arah kiblat" },
  { title: "Deteksi Rakaat", example: "Mulai deteksi rakaat" }
];

export function HelpCards({ onRun }: { onRun: (command: string) => void }) {
  return <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {HELP_CARDS.map((card) => <button key={card.title} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-left text-[var(--text)] hover:border-[var(--primary)]" onClick={() => onRun(card.example)}>
      <span className="block font-bold">{card.title}</span>
      <span className="mt-1 block break-words text-sm text-[var(--text-soft)]">Contoh: “{card.example}”</span>
    </button>)}
  </div>;
}

export default function CommandCenter({ onRun }: { onRun: (command: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return CATEGORIES;
    return CATEGORIES.map((category) => ({ ...category, commands: category.commands.filter((command) => `${category.name} ${command}`.toLowerCase().includes(q)) })).filter((category) => category.commands.length > 0);
  }, [query]);

  return <section className="card" aria-labelledby="command-center-title">
    <p className="text-sm font-semibold text-[var(--primary)]">Bantuan Interaktif</p>
    <h2 id="command-center-title" className="text-2xl font-bold text-[var(--text)]">Command Center</h2>
    <p className="mt-2 break-words text-sm text-[var(--text-soft)]">Cari atau ketuk contoh perintah. Setiap tombol langsung menjalankan command.</p>
    <input className="input mt-4" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari command: reminder, kiblat, notifikasi..." />
    <div className="mt-4 grid gap-3">
      {filtered.map((category) => <div key={category.name} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-3">
        <h3 className="font-bold text-[var(--text)]">{category.name}</h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {category.commands.map((command) => <button key={command} className="btn-secondary justify-start text-left" onClick={() => onRun(command)}>{command}</button>)}
        </div>
      </div>)}
    </div>
  </section>;
}
