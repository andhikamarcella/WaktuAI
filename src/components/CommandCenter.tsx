import { useMemo, useState } from "react";

type Command = {
  category: string;
  title: string;
  example: string;
};

const COMMANDS: Command[] = [
  { category: "Waktu", title: "Tanya Jam", example: "Jam berapa sekarang?" },
  { category: "Sholat", title: "Jadwal Sholat", example: "Jadwal sholat hari ini" },
  { category: "Notifikasi", title: "Aktifkan Notifikasi", example: "Aktifkan notifikasi sholat" },
  { category: "Notifikasi", title: "Tes Notifikasi", example: "Tes notifikasi" },
  { category: "Reminder", title: "Reminder Tepat", example: "Ingatkan aku 17:46" },
  { category: "Reminder", title: "Alarm", example: "Alarm 04:30" },
  { category: "Kiblat", title: "Arah Kiblat", example: "Arah kiblat" },
  { category: "Rakaat", title: "Deteksi Rakaat", example: "Mulai deteksi rakaat" },
  { category: "Rakaat", title: "Hitung Manual", example: "Pakai hitung manual" },
  { category: "Bantuan", title: "Buka Bantuan", example: "Aku bingung" }
];

export function CommandCenter({ onRunCommand }: { onRunCommand: (command: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return COMMANDS;
    return COMMANDS.filter((command) =>
      `${command.category} ${command.title} ${command.example}`.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <section className="panel" id="commands">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Command Center</p>
          <h2>Perintah cepat yang bisa diklik</h2>
        </div>
      </div>
      <input
        className="command-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Cari command..."
        aria-label="Cari command"
      />
      <div className="command-grid">
        {filtered.map((command) => (
          <button key={`${command.category}-${command.title}`} className="command-card" onClick={() => onRunCommand(command.example)}>
            <span>{command.category}</span>
            <strong>{command.title}</strong>
            <small>{command.example}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
