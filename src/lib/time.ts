export type PrayerName = "Subuh" | "Dzuhur" | "Ashar" | "Maghrib" | "Isya";

export type PrayerTime = {
  name: PrayerName;
  time: string;
};

export const PRAYER_NAMES: PrayerName[] = ["Subuh", "Dzuhur", "Ashar", "Maghrib", "Isya"];

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatHHMM(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseHHMM(value: string): { hours: number; minutes: number } | null {
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export function setLocalTime(base: Date, hours: number, minutes: number): Date {
  const next = new Date(base);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

export function addMinutes(base: Date, minutes: number): Date {
  const next = new Date(base);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

export function dateFromHHMMForToday(hhmm: string, now = new Date()): Date | null {
  const parsed = parseHHMM(hhmm);
  if (!parsed) return null;
  return setLocalTime(now, parsed.hours, parsed.minutes);
}

export function buildTodayPrayerSchedule(now = new Date()): PrayerTime[] {
  const month = now.getMonth();
  const isRamadanLikeSeason = month === 1 || month === 2;
  return [
    { name: "Subuh", time: isRamadanLikeSeason ? "04:37" : "04:42" },
    { name: "Dzuhur", time: "11:55" },
    { name: "Ashar", time: "15:16" },
    { name: "Maghrib", time: "17:47" },
    { name: "Isya", time: "18:58" }
  ];
}

export function toLocalDateTimeText(iso: string): string {
  const date = new Date(iso);
  return `${formatLocalDate(date)} ${formatHHMM(date)}`;
}
