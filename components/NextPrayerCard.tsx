import type { NextPrayer } from "@/types/prayer";
import { msToCountdown } from "@/lib/time";

export default function NextPrayerCard({ nextPrayer, now }: { nextPrayer: NextPrayer | null; now: Date }) {
  const countdown = nextPrayer ? msToCountdown(nextPrayer.target.getTime() - now.getTime()) : "--:--:--";
  return <section className="card p-5" aria-labelledby="next-prayer-title">
    <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Adzan Berikutnya</p>
    <h2 id="next-prayer-title" className="mt-2 text-3xl font-bold">{nextPrayer ? nextPrayer.prayer.name : "Belum tersedia"}</h2>
    <p className="mt-1 text-slate-600 dark:text-slate-300">{nextPrayer ? `${nextPrayer.prayer.time}${nextPrayer.isTomorrow ? " besok" : " hari ini"}` : "Muat jadwal untuk melihat countdown."}</p>
    <div className="mt-4 rounded-2xl bg-emerald-500/10 p-4 font-mono text-4xl font-bold text-emerald-800 dark:text-emerald-200" aria-live="polite">{countdown}</div>
  </section>;
}
