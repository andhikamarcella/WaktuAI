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
  return <section className="card p-5" aria-labelledby="prayer-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Jadwal Sholat</p><h2 id="prayer-title" className="text-2xl font-bold">{schedule?.city ?? "Memuat lokasi"}</h2></div>
      <select aria-label="Pilih kota manual" className="input w-auto" value={schedule?.city ?? "Jakarta"} onChange={(e) => onCityChange(e.target.value)}>{cities.map((c) => <option key={c}>{c}</option>)}</select>
    </div>
    {loading && <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Mengambil jadwal sholat...</p>}
    {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100"><p>{error}</p><button className="btn-secondary mt-3" onClick={onRetry}>Coba lagi</button></div>}
    <div className="mt-4 grid gap-3">{schedule?.prayers.map((p) => <div key={p.name} className="flex items-center justify-between rounded-2xl bg-white/60 p-3 dark:bg-white/5">
      <div><p className="font-semibold">{p.name}</p><p className="font-mono text-lg">{p.time}</p></div>
      <button className={completed[p.name] ? "btn-primary" : "btn-secondary"} aria-label={`Tandai ${p.name} selesai`} onClick={() => onToggleComplete(p.name)}>{completed[p.name] ? "Selesai" : "Tandai"}</button>
    </div>)}</div>
    <div className="mt-5"><div className="flex justify-between text-sm"><span>Progress sholat</span><span>{percent}%</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{percent === 100 ? "MasyaAllah, lengkap hari ini." : percent >= 60 ? "Bagus, lanjutkan konsisten." : "Yuk mulai dari sholat berikutnya."}</p></div>
  </section>;
}
