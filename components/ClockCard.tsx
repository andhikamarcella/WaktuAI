import { formatClock, formatIndonesianDate, getGreeting } from "@/lib/time";

export default function ClockCard({ now }: { now: Date }) {
  return <section className="card p-5" aria-labelledby="clock-title">
    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Selamat {getGreeting(now)}</p>
    <h2 id="clock-title" className="mt-2 font-mono text-5xl font-bold tracking-tight sm:text-6xl">{formatClock(now)}</h2>
    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{formatIndonesianDate(now)}</p>
  </section>;
}
