import { formatClock, formatIndonesianDate, getGreeting } from "@/lib/time";

export default function ClockCard({ now }: { now: Date }) {
  return <section className="card" aria-labelledby="clock-title">
    <p className="text-sm font-semibold text-[var(--primary)]">Selamat {getGreeting(now)}</p>
    <h2 id="clock-title" className="mt-2 max-w-full font-mono text-4xl font-bold tracking-tight tabular-nums text-[var(--text)] sm:text-5xl md:text-6xl">{formatClock(now)}</h2>
    <p className="mt-2 break-words text-sm text-[var(--text-soft)]">{formatIndonesianDate(now)}</p>
  </section>;
}
