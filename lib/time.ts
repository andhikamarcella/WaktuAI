import type { PrayerTime } from "@/types/prayer";

export const INDONESIAN_LOCALE = "id-ID";

export function getDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatClock(date = new Date()): string {
  return new Intl.DateTimeFormat(INDONESIAN_LOCALE, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
}

export function formatHourMinute(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatIndonesianDate(date = new Date()): string {
  return new Intl.DateTimeFormat(INDONESIAN_LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function formatShortDateTime(date: Date): string {
  return new Intl.DateTimeFormat(INDONESIAN_LOCALE, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function getGreeting(date = new Date()): "Pagi" | "Siang" | "Sore" | "Malam" {
  const h = date.getHours();
  if (h >= 4 && h < 11) return "Pagi";
  if (h >= 11 && h < 15) return "Siang";
  if (h >= 15 && h < 18) return "Sore";
  return "Malam";
}

export function parseTimeToday(time: string, base = new Date()): Date {
  const clean = time.trim().split(" ")[0] ?? "00:00";
  const [hour = "0", minute = "0"] = clean.split(":");
  const date = new Date(base);
  date.setHours(Number(hour), Number(minute), 0, 0);
  return date;
}

export function parseExactLocalTime(hour: number, minute: number, base = new Date()): { date: Date; rolledToTomorrow: boolean } | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const date = new Date(base);
  date.setHours(hour, minute, 0, 0);
  const rolledToTomorrow = date.getTime() <= base.getTime();
  if (rolledToTomorrow) date.setDate(date.getDate() + 1);
  return { date, rolledToTomorrow };
}

export function msToCountdown(ms: number): string {
  const safe = Math.max(0, ms);
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

export function getPassedPrayerCount(prayers: PrayerTime[], now = new Date()): number {
  return prayers.filter((p) => parseTimeToday(p.time, now).getTime() <= now.getTime()).length;
}
