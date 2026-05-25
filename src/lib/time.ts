export type TimeFormat = "24h" | "12h";

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function displayDate(date = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function parseClockTime(value: string): { hour: number; minute: number } | null {
  const match = value.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function dateAtLocalTime(base: Date, hour: number, minute: number): Date {
  const next = new Date(base);
  next.setHours(hour, minute, 0, 0);
  return next;
}

export function formatClock(dateOrTime: Date | string, format: TimeFormat): string {
  if (typeof dateOrTime === "string") {
    const parsed = parseClockTime(dateOrTime);
    if (!parsed) return dateOrTime;
    return formatClock(dateAtLocalTime(new Date(), parsed.hour, parsed.minute), format);
  }

  if (format === "12h") {
    return new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(dateOrTime);
  }

  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dateOrTime);
}

export function formatDateTime(iso: string, format: TimeFormat): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Waktu tidak valid";
  return `${displayDate(date)}, ${formatClock(date, format)}`;
}

export function durationText(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function minutesFromClock(time: string): number | null {
  const parsed = parseClockTime(time);
  if (!parsed) return null;
  return parsed.hour * 60 + parsed.minute;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
