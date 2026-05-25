import { dateAtLocalTime, formatClock, parseClockTime, TimeFormat } from "./time";

export type ReminderStatus = "scheduled" | "fired" | "cancelled" | "missed" | "done";
export type RepeatRule = "once" | "daily" | "weekdays" | "weekend" | "weekly";

export interface Reminder {
  id: string;
  title: string;
  dateTime: string;
  status: ReminderStatus;
  createdAt: string;
  repeat: RepeatRule;
  firedKeys: string[];
  snoozeCount: number;
  history: string[];
  done?: boolean;
  repeatCount?: number;
  alarmMode?: boolean;
}

export interface ParsedReminder {
  ok: true;
  reminder: Reminder;
  response: string;
}

export type ParseReminderOptions = {
  now?: Date;
  prayerTimes?: Partial<Record<string, string>>;
  format?: TimeFormat;
};

export type ParseReminderResult = ParsedReminder | { ok: false; response: string };

const prayerAliases: Record<string, string> = {
  subuh: "Subuh",
  dzuhur: "Dzuhur",
  zuhur: "Dzuhur",
  ashar: "Ashar",
  asr: "Ashar",
  maghrib: "Maghrib",
  isya: "Isya",
  isha: "Isya",
};

function normalizeRepeat(input: string): RepeatRule {
  if (/setiap\s+hari|tiap\s+hari|harian/.test(input)) return "daily";
  if (/weekday|hari\s+kerja|senin.*jumat/.test(input)) return "weekdays";
  if (/weekend|sabtu.*minggu|akhir\s+pekan/.test(input)) return "weekend";
  if (/tiap\s+(senin|selasa|rabu|kamis|jumat|sabtu|minggu)|setiap\s+(senin|selasa|rabu|kamis|jumat|sabtu|minggu)/.test(input)) {
    return "weekly";
  }
  return "once";
}

function createReminder(title: string, date: Date, repeat: RepeatRule, alarmMode = false): Reminder {
  const now = new Date();
  return {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    dateTime: date.toISOString(),
    status: "scheduled",
    createdAt: now.toISOString(),
    repeat,
    firedKeys: [],
    snoozeCount: 0,
    done: false,
    repeatCount: 0,
    alarmMode,
    history: [`Dijadwalkan ${now.toISOString()}`],
  };
}

export function nextRepeatDate(from: Date, repeat: RepeatRule): Date | null {
  if (repeat === "once") return null;
  const next = new Date(from);
  if (repeat === "daily") {
    next.setDate(next.getDate() + 1);
    return next;
  }
  if (repeat === "weekly") {
    next.setDate(next.getDate() + 7);
    return next;
  }
  do {
    next.setDate(next.getDate() + 1);
  } while (repeat === "weekdays" ? [0, 6].includes(next.getDay()) : ![0, 6].includes(next.getDay()));
  return next;
}

function parseReminderCore(
  rawInput: string,
  now: Date,
  prayerTimes: Partial<Record<string, string>>,
  format: TimeFormat,
): ParsedReminder | null {
  const input = rawInput.trim().toLowerCase();
  if (!input) return null;
  const repeat = normalizeRepeat(input);
  const alarmMode = /\b(alarm|bangunin|bangunkan)\b/.test(input);

  const duration = input.match(/\b(\d+)\s*(menit|mnt|minute|jam|hour)\s*(lagi)?\b/);
  if (duration) {
    const amount = Number(duration[1]);
    const unit = duration[2];
    const minutes = unit.startsWith("jam") || unit === "hour" ? amount * 60 : amount;
    const date = new Date(now.getTime() + minutes * 60_000);
    return {
      ok: true,
      reminder: createReminder(`Pengingat ${amount} ${unit}`, date, repeat, alarmMode),
      response: `Siap, aku akan ingatkan ${amount} ${unit} lagi.`,
    };
  }

  const exact = parseClockTime(input);
  if (exact) {
    let date = dateAtLocalTime(now, exact.hour, exact.minute);
    const clock = `${String(exact.hour).padStart(2, "0")}:${String(exact.minute).padStart(2, "0")}`;
    if (date.getTime() <= now.getTime()) {
      date.setDate(date.getDate() + 1);
      return {
        ok: true,
        reminder: createReminder(`Pengingat jam ${clock}`, date, repeat, alarmMode),
        response: `Jam ${clock} hari ini sudah lewat, jadi aku ingatkan besok jam ${clock}.`,
      };
    }
    return {
      ok: true,
      reminder: createReminder(`Pengingat jam ${clock}`, date, repeat, alarmMode),
      response: `Siap, aku akan ingatkan jam ${clock}.`,
    };
  }

  const colloquial = input.match(/\bjam\s+(\d{1,2})(?:\s*(pagi|siang|sore|malam))?\b/);
  if (colloquial) {
    let hour = Number(colloquial[1]);
    const period = colloquial[2];
    if (period === "sore" || period === "malam") hour = hour < 12 ? hour + 12 : hour;
    if (period === "pagi" && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23) {
      let date = dateAtLocalTime(now, hour, 0);
      if (date.getTime() <= now.getTime()) date.setDate(date.getDate() + 1);
      return {
        ok: true,
        reminder: createReminder(`Pengingat jam ${formatClock(date, format)}`, date, repeat, alarmMode),
        response: `Siap, aku akan ingatkan jam ${formatClock(date, format)}.`,
      };
    }
  }

  const prayer = Object.keys(prayerAliases).find((key) => input.includes(key));
  if (prayer) {
    const prayerName = prayerAliases[prayer];
    const time = prayerTimes[prayerName];
    const parsed = time ? parseClockTime(time) : null;
    if (!parsed) return null;
    let date = dateAtLocalTime(now, parsed.hour, parsed.minute);
    if (date.getTime() <= now.getTime()) date.setDate(date.getDate() + 1);
    return {
      ok: true,
      reminder: createReminder(`Pengingat sholat ${prayerName}`, date, repeat, alarmMode),
      response: `Siap, aku akan ingatkan waktu ${prayerName}.`,
    };
  }

  return null;
}

export function parseReminderInput(rawInput: string, options: ParseReminderOptions): ParseReminderResult;
export function parseReminderInput(
  rawInput: string,
  now?: Date,
  prayerTimes?: Partial<Record<string, string>>,
  format?: TimeFormat,
): ParsedReminder | null;
export function parseReminderInput(
  rawInput: string,
  nowOrOptions: Date | ParseReminderOptions = new Date(),
  prayerTimes: Partial<Record<string, string>> = {},
  format: TimeFormat = "24h",
): ParsedReminder | ParseReminderResult | null {
  const options = nowOrOptions instanceof Date ? { now: nowOrOptions, prayerTimes, format } : nowOrOptions;
  const result = parseReminderCore(
    rawInput,
    options.now ?? new Date(),
    options.prayerTimes ?? {},
    options.format ?? "24h",
  );

  if (nowOrOptions instanceof Date) return result;
  return result ?? { ok: false, response: "Aku belum paham waktu reminder itu." };
}
