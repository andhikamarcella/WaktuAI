import type { PrayerName, PrayerSchedule } from "@/types/prayer";

export default function PrayerScheduleCard({ schedule, loading, error, completed, onToggleComplete, onRetry, onCityChange, cities }: {
  schedule: PrayerSchedule | null;
  loading: boolean;
  error: string | null;
  completed: Record<PrayerName, boolean>;
  onToggleComplete: (name: PrayerName) => void;
  onRetry: () => void;
  onCityChange: (city: string) => void;
  cities: string[];
}) {
  const percent = schedule ? Math.round((Object.values(completed).filter(Boolean).length / 5) * 100) : 0;
  return <section className="card" aria-labelledby="prayer-title">
    <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
      <div className="min-w-0"><p className="text-sm font-semibold text-[var(--primary)]">Jadwal Sholat</p><h2 id="prayer-title" className="break-words text-2xl font-bold text-[var(--text)]">{schedule?.city ?? "Memuat lokasi"}</h2></div>
      <select aria-label="Pilih kota manual" className="input sm:w-auto" value={cities.includes(schedule?.city ?? "") ? schedule?.city : "Jakarta"} onChange={(e) => onCityChange(e.target.value)}>{cities.map((c) => <option key={c}>{c}</option>)}</select>
    </div>
    {loading && <div className="mt-4 grid gap-3">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-[var(--bg-soft)]" />)}</div>}
    {error && <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-4 text-sm text-[var(--text)]"><p className="break-words">{error}</p><button className="btn-secondary mt-3 w-full sm:w-auto" onClick={onRetry}>Coba lagi</button></div>}
    <div className="mt-4 grid gap-3">{schedule?.prayers.map((p) => <div key={p.name} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-3">
      <div className="min-w-0"><p className="font-semibold text-[var(--text)]">{p.name}</p><p className="font-mono text-lg font-bold tabular-nums text-[var(--text)]">{p.time}</p></div>
      <button className={completed[p.name] ? "btn-primary" : "btn-secondary"} aria-label={`Tandai ${p.name} selesai`} onClick={() => onToggleComplete(p.name)}>{completed[p.name] ? "Selesai" : "Tandai"}</button>
    </div>)}</div>
    <div className="mt-5"><div className="flex justify-between gap-3 text-sm text-[var(--text-soft)]"><span>Progress sholat</span><span>{percent}%</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-[var(--bg-soft)]"><div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${percent}%` }} /></div><p className="mt-2 break-words text-sm text-[var(--text-soft)]">{percent === 100 ? "MasyaAllah, lengkap hari ini." : percent >= 60 ? "Bagus, lanjutkan konsisten." : "Yuk mulai dari sholat berikutnya."}</p></div>
  </section>;
}
