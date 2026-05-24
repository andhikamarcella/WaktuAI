import { addMinutes, dateFromHHMMForToday, formatHHMM, PrayerName, PRAYER_NAMES, setLocalTime } from "./time";

export type Reminder = {
  id: string;
  title: string;
  dateTime: string;
  createdAt: string;
  alarmMode: boolean;
  repeatCount: number;
  done: boolean;
};

export type ReminderParseResult = {
  ok: true;
  reminder: Reminder;
  response: string;
} | {
  ok: false;
  response: string;
};

export type ReminderParseOptions = {
  now?: Date;
  prayerTimes?: Partial<Record<PrayerName, string>>;
};

function makeId(date = new Date()): string {
  return `rem-${date.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function createReminder(title: string, date: Date, alarmMode: boolean): Reminder {
  const now = new Date();
  return {
    id: makeId(now),
    title,
    dateTime: date.toISOString(),
    createdAt: now.toISOString(),
    alarmMode,
    repeatCount: 0,
    done: false
  };
}

function resolveTodayOrTomorrow(hours: number, minutes: number, now: Date): { date: Date; rolled: boolean } {
  const target = setLocalTime(now, hours, minutes);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
    return { date: target, rolled: true };
  }
  return { date: target, rolled: false };
}

function parsePartOfDay(hour: number, part: string): number {
  if (part === "pagi") return hour === 12 ? 0 : hour;
  if (part === "siang") return hour >= 11 ? hour : hour + 12;
  if (part === "sore" || part === "malam") return hour === 12 ? 12 : hour + 12;
  return hour;
}

export function parseReminderInput(input: string, options: ReminderParseOptions = {}): ReminderParseResult {
  const now = options.now ?? new Date();
  const text = normalize(input);
  const alarmMode = /\b(alarm|bangunin|bangunkan)\b/.test(text);

  const exact = text.match(/(?:^|\b)([01]?\d|2[0-3]):([0-5]\d)(?:\b|$)/);
  if (exact) {
    const hours = Number(exact[1]);
    const minutes = Number(exact[2]);
    const { date, rolled } = resolveTodayOrTomorrow(hours, minutes, now);
    const hhmm = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const reminder = createReminder(alarmMode ? `Alarm ${hhmm}` : `Reminder ${hhmm}`, date, alarmMode);
    return {
      ok: true,
      reminder,
      response: rolled
        ? `Jam ${hhmm} hari ini sudah lewat, jadi aku ingatkan besok jam ${hhmm}.`
        : `Siap, aku akan ingatkan jam ${hhmm}.`
    };
  }

  const partOfDay = text.match(/\bjam\s+(\d{1,2})(?::([0-5]\d))?\s*(pagi|siang|sore|malam)\b/);
  if (partOfDay) {
    const rawHour = Number(partOfDay[1]);
    if (rawHour < 1 || rawHour > 12) {
      return { ok: false, response: "Format jam belum valid. Coba tulis seperti 17:46 atau jam 7 malam." };
    }
    const minutes = Number(partOfDay[2] ?? "0");
    const hours = parsePartOfDay(rawHour, partOfDay[3]);
    const { date, rolled } = resolveTodayOrTomorrow(hours, minutes, now);
    const hhmm = formatHHMM(date);
    const reminder = createReminder(alarmMode ? `Alarm ${hhmm}` : `Reminder ${hhmm}`, date, alarmMode);
    return {
      ok: true,
      reminder,
      response: rolled
        ? `Jam ${hhmm} hari ini sudah lewat, jadi aku ingatkan besok jam ${hhmm}.`
        : `Siap, aku akan ingatkan jam ${hhmm}.`
    };
  }

  const relative = text.match(/\b(\d+)\s*(menit|minute|jam|hour)\s+lagi\b/);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const minutes = unit === "jam" || unit === "hour" ? amount * 60 : amount;
    const target = addMinutes(now, minutes);
    const reminder = createReminder(alarmMode ? `Alarm ${formatHHMM(target)}` : `Reminder ${formatHHMM(target)}`, target, alarmMode);
    return {
      ok: true,
      reminder,
      response: unit === "jam" || unit === "hour"
        ? `Siap, aku akan ingatkan ${amount} jam lagi.`
        : `Siap, aku akan ingatkan ${amount} menit lagi.`
    };
  }

  const prayer = PRAYER_NAMES.find((name) => text.includes(name.toLowerCase()));
  if (prayer) {
    const hhmm = options.prayerTimes?.[prayer];
    const target = hhmm ? dateFromHHMMForToday(hhmm, now) : null;
    if (!target) {
      return { ok: false, response: `Aku belum menemukan jadwal ${prayer}. Atur jadwal sholat dulu ya.` };
    }
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return {
      ok: true,
      reminder: createReminder(`Reminder sholat ${prayer}`, target, alarmMode),
      response: `Siap, aku akan ingatkan sholat ${prayer} jam ${formatHHMM(target)}.`
    };
  }

  return {
    ok: false,
    response: "Aku belum paham waktu reminder-nya. Coba tulis: ingatkan aku 17:46, alarm 04:30, atau ingatkan aku 10 menit lagi."
  };
}
