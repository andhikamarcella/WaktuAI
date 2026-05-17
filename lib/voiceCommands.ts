import type { PrayerName } from "@/types/prayer";
import { CITIES } from "./prayer";
import { parseIndonesianTimePhrase } from "./reminders";

export type CommandType =
  | "GET_CURRENT_TIME"
  | "GET_CURRENT_DATE"
  | "GET_PRAYER_TIME"
  | "GET_ALL_PRAYER_TIMES"
  | "ENABLE_ADZAN_NOTIFICATION"
  | "DISABLE_ADZAN_NOTIFICATION"
  | "CREATE_REMINDER"
  | "SET_LOCATION"
  | "SHOW_QIBLA"
  | "ENABLE_DND"
  | "DISABLE_DND"
  | "UNKNOWN";

export interface ParsedCommand {
  type: CommandType;
  raw: string;
  prayerName?: PrayerName;
  reminderAt?: Date;
  reminderLabel?: string;
  leadMinutes?: 0 | 5 | 10 | 15;
  cityName?: string;
  dndMinutes?: number;
}

export const UNKNOWN_RESPONSE = "Maaf, aku belum paham perintah itu. Coba bilang: jam berapa sekarang, jadwal sholat hari ini, atau kapan adzan Maghrib.";

const prayerAliases: Array<[PrayerName, RegExp]> = [
  ["Subuh", /\b(subuh|fajr)\b/],
  ["Dzuhur", /\b(dzuhur|zuhur|duhur|dhuhur|dhuhr)\b/],
  ["Ashar", /\b(ashar|asar|asr)\b/],
  ["Maghrib", /\b(maghrib|magrib)\b/],
  ["Isya", /\b(isya|isya'|isha)\b/]
];

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[?!.:,]/g, " ").replace(/\s+/g, " ").trim();
}

export function detectPrayerName(text: string): PrayerName | undefined {
  const normalized = normalize(text);
  return prayerAliases.find(([, regex]) => regex.test(normalized))?.[0];
}

function detectLeadMinutes(text: string): 0 | 5 | 10 | 15 | undefined {
  const match = normalize(text).match(/(0|5|10|15)\s*menit\s*sebelum/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return value === 5 || value === 10 || value === 15 ? value : 0;
}

export function parseVoiceCommand(input: string, base = new Date()): ParsedCommand {
  const raw = input.trim();
  const text = normalize(raw);
  if (!text) return { type: "UNKNOWN", raw };

  const city = CITIES.find((c) => new RegExp(`\\b${c.name.toLowerCase()}\\b`).test(text));
  if (city && /(ganti|ubah|pakai|gunakan|lokasi|kota)/.test(text)) return { type: "SET_LOCATION", raw, cityName: city.name };

  if (/(jangan ganggu|dnd|fokus)/.test(text)) {
    if (/(matikan|nonaktif|selesai|off)/.test(text)) return { type: "DISABLE_DND", raw };
    if (/(30|tiga puluh)/.test(text)) return { type: "ENABLE_DND", raw, dndMinutes: 30 };
    if (/(satu jam|1 jam|60)/.test(text)) return { type: "ENABLE_DND", raw, dndMinutes: 60 };
    if (/(besok|tomorrow)/.test(text)) return { type: "ENABLE_DND", raw, dndMinutes: minutesUntilTomorrow(base) };
    return { type: "ENABLE_DND", raw, dndMinutes: 60 };
  }

  const prayerName = detectPrayerName(text);
  const leadMinutes = detectLeadMinutes(text);

  if (/(notifikasi|notif|pengingat)/.test(text) && /(matikan|matiin|nonaktif|off)/.test(text)) return { type: "DISABLE_ADZAN_NOTIFICATION", raw, prayerName };
  if (/(notifikasi|notif|pengingat)/.test(text) && /(aktifkan|nyalain|hidupkan|on)/.test(text)) return { type: "ENABLE_ADZAN_NOTIFICATION", raw, prayerName, leadMinutes };

  if (/(ingatkan|reminder|bangunin|kasih tahu)/.test(text)) {
    if (leadMinutes !== undefined && prayerName) return { type: "ENABLE_ADZAN_NOTIFICATION", raw, prayerName, leadMinutes };
    const reminderAt = parseIndonesianTimePhrase(text, base);
    if (reminderAt) return { type: "CREATE_REMINDER", raw, reminderAt, reminderLabel: `Reminder: ${raw}` };
    if (prayerName) return { type: "CREATE_REMINDER", raw, prayerName, reminderLabel: `Ingatkan sholat ${prayerName}` };
  }

  if (/(arah kiblat|kiblat|qibla)/.test(text)) return { type: "SHOW_QIBLA", raw };
  if (/(jadwal|bacakan).*(sholat|shalat|solat|adzan|azan)|^(jadwal sholat|jadwal solat|jadwal shalat)/.test(text)) return { type: "GET_ALL_PRAYER_TIMES", raw };
  if (prayerName && /(kapan|jam berapa|adzan|azan|waktu|pas)/.test(text)) return { type: "GET_PRAYER_TIME", raw, prayerName };
  if (/(jam berapa|sekarang jam|udah jam|waktu sekarang)/.test(text)) return { type: "GET_CURRENT_TIME", raw };
  if (/(tanggal berapa|hari ini tanggal|tanggal hari ini)/.test(text)) return { type: "GET_CURRENT_DATE", raw };

  return { type: "UNKNOWN", raw };
}

function minutesUntilTomorrow(base: Date): number {
  const tomorrow = new Date(base);
  tomorrow.setDate(base.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return Math.max(1, Math.ceil((tomorrow.getTime() - base.getTime()) / 60_000));
}
