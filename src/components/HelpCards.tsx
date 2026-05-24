const HELP_CARDS = [
  { title: "Tanya Jam", example: "Jam berapa sekarang?" },
  { title: "Jadwal Sholat", example: "Jadwal sholat hari ini" },
  { title: "Notifikasi Sholat", example: "Aktifkan notifikasi Isya" },
  { title: "Reminder", example: "Ingatkan aku 17:46" },
  { title: "Arah Kiblat", example: "Arah kiblat" },
  { title: "Deteksi Rakaat", example: "Mulai deteksi rakaat" }
];

export function HelpCards({ onRunCommand }: { onRunCommand: (command: string) => void }) {
  return (
    <div className="help-grid">
      {HELP_CARDS.map((card) => (
        <button key={card.title} className="help-card" onClick={() => onRunCommand(card.example)}>
          <strong>{card.title}</strong>
          <span>{card.example}</span>
        </button>
      ))}
    </div>
  );
}
