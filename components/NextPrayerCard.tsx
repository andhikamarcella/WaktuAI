import type { NextPrayer } from "@/types/prayer";
import { msToCountdown } from "@/lib/time";

export default function NextPrayerCard({ nextPrayer, now }: { nextPrayer: NextPrayer | null; now: Date }) {
  const countdown = nextPrayer ? msToCountdown(nextPrayer.target.getTime() - now.getTime()) : "--:--:--";
  return <section className="card" aria-labelledby="next-prayer-title">
    <p className="text-sm font-semibold text-[var(--warning)]">Adzan Berikutnya</p>
    <h2 id="next-prayer-title" className="mt-2 break-words text-2xl font-bold text-[var(--text)] sm:text-3xl">{nextPrayer ? nextPrayer.prayer.name : "Belum tersedia"}</h2>
    <p className="mt-1 break-words text-sm text-[var(--text-soft)]">{nextPrayer ? `${nextPrayer.prayer.time}${nextPrayer.isTomorrow ? " besok" : " hari ini"}` : "Muat jadwal untuk melihat countdown."}</p>
    <div className="mt-4 max-w-full rounded-2xl bg-[var(--primary-soft)] p-3 text-center font-mono text-3xl font-bold tabular-nums text-[var(--text)] sm:text-4xl" aria-live="polite">{countdown}</div>
  </section>;
}
