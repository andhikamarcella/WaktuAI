import type { Reminder } from "@/types/reminder";

export function createId(prefix = "id"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseIndonesianTimePhrase(text: string, base = new Date()): Date | null {
  const normalized = text.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const match = normalized.match(/(?:jam|pukul|reminder jam)\s+(\d{1,2})(?::|\.)?(\d{0,2})?\s*(pagi|siang|sore|malam)?/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2].padEnd(2, "0")) : 0;
  const period = match[3];
  if (hour > 23 || minute > 59) return null;
  if (period === "pagi" && hour === 12) hour = 0;
  if ((period === "siang" || period === "sore") && hour < 12) hour += 12;
  if (period === "malam" && hour < 12) hour += 12;
  const date = new Date(base);
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() <= base.getTime()) date.setDate(date.getDate() + 1);
  return date;
}

export function buildReminder(label: string, scheduledAt: Date, source: Reminder["source"] = "manual"): Reminder {
  return { id: createId("rem"), label, scheduledAt: scheduledAt.toISOString(), createdAt: new Date().toISOString(), source };
}

export function prunePastReminders(reminders: Reminder[], now = new Date()): Reminder[] {
  return reminders.filter((r) => new Date(r.scheduledAt).getTime() > now.getTime());
}
