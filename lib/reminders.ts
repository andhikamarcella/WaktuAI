import type { Reminder } from "../types/reminder";
import { formatHourMinute, parseExactLocalTime } from "./time";

export interface ParsedReminderTime {
  date: Date;
  response: string;
  label: string;
  rolledToTomorrow: boolean;
}

export function createId(prefix = "id"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeReminderText(text: string): string {
  return text.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}

function withExactResponse(hour: number, minute: number, base: Date, rawLabel: string): ParsedReminderTime | null {
  const parsed = parseExactLocalTime(hour, minute, base);
  if (!parsed) return null;
  const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return {
    date: parsed.date,
    label: rawLabel || `Reminder jam ${hhmm}`,
    rolledToTomorrow: parsed.rolledToTomorrow,
    response: parsed.rolledToTomorrow ? `Jam ${hhmm} hari ini sudah lewat, jadi aku ingatkan besok jam ${hhmm}.` : `Siap, aku akan ingatkan jam ${hhmm}.`
  };
}

export function parseReminderInput(text: string, base = new Date()): ParsedReminderTime | null {
  const normalized = normalizeReminderText(text);
  const exact = normalized.match(/(?:^|\b)(?:ingatkan(?: aku)?(?: jam)?|reminder(?: jam)?|bangunin(?: aku)?(?: jam)?|jam)?\s*(\d{1,2})[:.](\d{2})(?:\b|$)/);
  if (exact) return withExactResponse(Number(exact[1]), Number(exact[2]), base, `Reminder: ${text.trim()}`);

  const relative = normalized.match(/(?:ingatkan|reminder|bangunin).*?(\d+)\s*(menit|jam)\s*lagi/);
  if (relative) {
    const amount = Number(relative[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const unit = relative[2];
    const date = new Date(base.getTime() + amount * (unit === "jam" ? 3_600_000 : 60_000));
    return { date, label: `Reminder: ${text.trim()}`, rolledToTomorrow: false, response: `Siap, aku akan ingatkan ${amount} ${unit} lagi.` };
  }

  const phrase = normalized.match(/(?:jam|pukul|reminder jam)\s+(\d{1,2})(?::|\.)?(\d{0,2})?\s*(pagi|siang|sore|malam)?/);
  if (!phrase) return null;
  let hour = Number(phrase[1]);
  const minute = phrase[2] ? Number(phrase[2].padEnd(2, "0")) : 0;
  const period = phrase[3];
  if (period === "pagi" && hour === 12) hour = 0;
  if ((period === "siang" || period === "sore") && hour < 12) hour += 12;
  if (period === "malam" && hour < 12) hour += 12;
  const parsed = withExactResponse(hour, minute, base, `Reminder: ${text.trim()}`);
  if (!parsed) return null;
  const spoken = period ? `${phrase[1]}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${period}` : formatHourMinute(parsed.date);
  return { ...parsed, response: parsed.rolledToTomorrow ? `Jam ${formatHourMinute(parsed.date)} hari ini sudah lewat, jadi aku ingatkan besok jam ${formatHourMinute(parsed.date)}.` : `Siap, aku akan ingatkan jam ${spoken}.` };
}

export function parseIndonesianTimePhrase(text: string, base = new Date()): Date | null {
  return parseReminderInput(text, base)?.date ?? null;
}

export function buildReminder(label: string, scheduledAt: Date, source: Reminder["source"] = "manual", prayerName?: Reminder["prayerName"]): Reminder {
  return { id: createId("rem"), label, scheduledAt: scheduledAt.toISOString(), createdAt: new Date().toISOString(), source, prayerName, completed: false, snoozedUntil: null };
}

export function prunePastReminders(reminders: Reminder[], now = new Date()): Reminder[] {
  return reminders.filter((r) => !r.completed && (r.snoozedUntil ? new Date(r.snoozedUntil) : new Date(r.scheduledAt)).getTime() > now.getTime() - 60_000);
}
