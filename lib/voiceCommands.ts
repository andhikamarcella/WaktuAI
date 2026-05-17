import type { PrayerName } from "@/types/prayer";
import { CITIES } from "./prayer";
import { parseReminderInput } from "./reminders";

export type CommandType =
  | "GET_CURRENT_TIME"
  | "GET_CURRENT_DATE"
  | "GET_PRAYER_TIME"
  | "GET_ALL_PRAYER_TIMES"
  | "ENABLE_ADZAN_NOTIFICATION"
  | "DISABLE_ADZAN_NOTIFICATION"
  | "ENABLE_PRAYER_NOTIFICATIONS"
  | "DISABLE_PRAYER_NOTIFICATIONS"
  | "TEST_NOTIFICATION"
  | "TEST_AI_VOICE"
  | "ENABLE_STRONG_REMINDER"
  | "DISABLE_STRONG_REMINDER"
  | "CREATE_REMINDER"
  | "CREATE_EXACT_TIME_REMINDER"
  | "SET_LOCATION"
  | "SHOW_QIBLA"
  | "HELP"
  | "ENABLE_DND"
  | "DISABLE_DND"
  | "START_RAKAAT_DETECTION"
  | "STOP_RAKAAT_DETECTION"
  | "RESET_RAKAAT"
  | "INCREMENT_RAKAAT"
  | "DECREMENT_RAKAAT"
  | "FALLBACK_MANUAL_RAKAAT"
  | "GET_RAKAAT_COUNT"
  | "UNKNOWN";

export interface ParsedCommand {
  type: CommandType;
  raw: string;
  prayerName?: PrayerName;
  reminderAt?: Date;
  reminderLabel?: string;
  reminderResponse?: string;
  leadMinutes?: 0 | 5 | 10 | 15;
  cityName?: string;
  dndMinutes?: number;
}

export const UNKNOWN_RESPONSE = "Aku belum paham perintah itu. Coba tombol saran di bawah, atau buka Bantuan.";

const prayerAliases: Array<[PrayerName, RegExp]> = [
  ["Subuh", /\b(subuh|fajr)\b/],
  ["Dzuhur", /\b(dzuhur|zuhur|duhur|dhuhur|dhuhr)\b/],
  ["Ashar", /\b(ashar|asar|asr)\b/],
  ["Maghrib", /\b(maghrib|magrib)\b/],
  ["Isya", /\b(isya|isya'|isha)\b/]
];

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[?!,]/g, " ").replace(/\s+/g, " ").trim();
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

  if (/(aku bingung|cara pakainya gimana|ini buat apa|bisa apa aja|tolong jelasin|command apa aja|aku ga ngerti|aku nggak ngerti|bantuan|help)/.test(text)) return { type: "HELP", raw };
  if (/(tes notifikasi|kirim notifikasi tes)/.test(text)) return { type: "TEST_NOTIFICATION", raw };
  if (/(tes suara|tes suara ai)/.test(text)) return { type: "TEST_AI_VOICE", raw };
  if (/(aktifkan|nyalain|hidupkan).*(notifikasi sholat|notifikasi adzan|notif sholat)/.test(text)) return { type: "ENABLE_PRAYER_NOTIFICATIONS", raw, prayerName: detectPrayerName(text) };
  if (/(matikan|nonaktif|off).*(notifikasi sholat|notifikasi adzan|notif sholat)/.test(text)) return { type: "DISABLE_PRAYER_NOTIFICATIONS", raw, prayerName: detectPrayerName(text) };
  if (/(aktifkan pengingat kuat|pengingatnya yang sering|pengingat kuat)/.test(text)) return { type: "ENABLE_STRONG_REMINDER", raw };
  if (/(matikan pengingat berulang|pengingat berulang off)/.test(text)) return { type: "DISABLE_STRONG_REMINDER", raw };
  if (/(kamera tidak bisa|pakai hitung manual|hitung manual)/.test(text)) return { type: "FALLBACK_MANUAL_RAKAAT", raw };

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

  const reminder = parseReminderInput(text, base);
  if (reminder && (/^(\d{1,2})[:.](\d{2})$/.test(text) || /(ingatkan|reminder|bangunin|\bjam\b)/.test(text))) {
    return { type: /\d{1,2}[:.]\d{2}/.test(text) ? "CREATE_EXACT_TIME_REMINDER" : "CREATE_REMINDER", raw, reminderAt: reminder.date, reminderLabel: reminder.label, reminderResponse: reminder.response };
  }
  if (/(ingatkan|reminder|bangunin|kasih tahu)/.test(text) && prayerName) return { type: "CREATE_REMINDER", raw, prayerName, reminderLabel: `Ingatkan sholat ${prayerName}` };

  if (/(mulai|start|aktifkan).*(deteksi )?rakaat/.test(text)) return { type: "START_RAKAAT_DETECTION", raw };
  if (/(stop|berhenti|matikan).*(deteksi )?rakaat/.test(text)) return { type: "STOP_RAKAAT_DETECTION", raw };
  if (/(reset|ulang).*(rakaat)/.test(text)) return { type: "RESET_RAKAAT", raw };
  if (/(tambah|tambahkan|plus).*(rakaat)/.test(text)) return { type: "INCREMENT_RAKAAT", raw };
  if (/(kurangi|minus).*(rakaat)/.test(text)) return { type: "DECREMENT_RAKAAT", raw };
  if (/(rakaat).*(berapa|sekarang|saat ini)|berapa rakaat/.test(text)) return { type: "GET_RAKAAT_COUNT", raw };

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
