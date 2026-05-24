import type { CityOption, NextPrayer, PrayerName, PrayerSchedule, PrayerTime } from "../types/prayer";
import { getDateKey, parseTimeToday } from "./time";
import { calculateQiblaBearing } from "../src/lib/qibla";

export const PRAYER_NAMES: PrayerName[] = ["Subuh", "Dzuhur", "Ashar", "Maghrib", "Isya"];
export const JAKARTA: CityOption = { name: "Jakarta", latitude: -6.2088, longitude: 106.8456 };
export const CITIES: CityOption[] = [
  JAKARTA,
  { name: "Bekasi", latitude: -6.2383, longitude: 106.9756 },
  { name: "Bandung", latitude: -6.9175, longitude: 107.6191 },
  { name: "Surabaya", latitude: -7.2575, longitude: 112.7521 },
  { name: "Yogyakarta", latitude: -7.7956, longitude: 110.3695 },
  { name: "Semarang", latitude: -6.9667, longitude: 110.4167 },
  { name: "Medan", latitude: 3.5952, longitude: 98.6722 },
  { name: "Makassar", latitude: -5.1477, longitude: 119.4327 },
  { name: "Palembang", latitude: -2.9761, longitude: 104.7754 },
  { name: "Tangerang", latitude: -6.1783, longitude: 106.6319 },
  { name: "Depok", latitude: -6.4025, longitude: 106.7942 },
  { name: "Bogor", latitude: -6.5971, longitude: 106.8060 }
];

const STORAGE_PREFIX = "waktuai.prayer.";

interface AladhanResponse {
  code: number;
  data?: {
    timings?: Record<string, string>;
    date?: {
      readable?: string;
      gregorian?: { date?: string };
      hijri?: {
        day?: string;
        year?: string;
        month?: { en?: string; number?: number };
        weekday?: { en?: string };
        holidays?: string[];
      };
    };
    meta?: { timezone?: string };
  };
}

export function normalizePrayerTimes(timings: Record<string, string>, base = new Date()): PrayerTime[] {
  const map: Array<[PrayerName, string]> = [
    ["Subuh", "Fajr"],
    ["Dzuhur", "Dhuhr"],
    ["Ashar", "Asr"],
    ["Maghrib", "Maghrib"],
    ["Isya", "Isha"]
  ];
  return map.map(([name, key]) => {
    const raw = timings[key]?.trim().slice(0, 5) || "00:00";
    return { name, time: raw, dateTime: parseTimeToday(raw, base).toISOString() };
  });
}

export function getCachedPrayerSchedule(dateKey = getDateKey()): PrayerSchedule | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${dateKey}`);
    return raw ? (JSON.parse(raw) as PrayerSchedule) : null;
  } catch {
    return null;
  }
}

export function cachePrayerSchedule(schedule: PrayerSchedule): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${schedule.dateKey}`, JSON.stringify(schedule));
  } catch {}
}

export async function fetchPrayerSchedule(city: CityOption, source: PrayerSchedule["source"] = "city", signal?: AbortSignal): Promise<PrayerSchedule> {
  const today = new Date();
  const dateForApi = `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${today.getFullYear()}`;
  const url = `https://api.aladhan.com/v1/timings/${dateForApi}?latitude=${city.latitude}&longitude=${city.longitude}&method=20`;
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) throw new Error("Gagal mengambil jadwal sholat dari server.");
  const json = (await res.json()) as AladhanResponse;
  if (json.code !== 200 || !json.data?.timings) throw new Error("Format jadwal sholat tidak valid.");
  const schedule: PrayerSchedule = {
    dateKey: getDateKey(today),
    source,
    city: city.name,
    latitude: city.latitude,
    longitude: city.longitude,
    timezone: json.data.meta?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    prayers: normalizePrayerTimes(json.data.timings, today),
    hijri: json.data.date?.hijri
      ? {
          day: json.data.date.hijri.day ?? "",
          month: json.data.date.hijri.month?.en ?? "Hijri",
          monthNumber: json.data.date.hijri.month?.number ?? 0,
          year: json.data.date.hijri.year ?? "",
          weekday: json.data.date.hijri.weekday?.en,
          holidays: json.data.date.hijri.holidays ?? []
        }
      : undefined,
    gregorian: { readable: json.data.date?.readable ?? dateForApi, date: json.data.date?.gregorian?.date ?? dateForApi },
    fetchedAt: new Date().toISOString()
  };
  cachePrayerSchedule(schedule);
  return schedule;
}

export function findNextPrayer(prayers: PrayerTime[], now = new Date()): NextPrayer | null {
  if (prayers.length === 0) return null;
  for (const prayer of prayers) {
    const target = parseTimeToday(prayer.time, now);
    if (target.getTime() > now.getTime()) return { prayer, target, isTomorrow: false };
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return { prayer: prayers[0], target: parseTimeToday(prayers[0].time, tomorrow), isTomorrow: true };
}

export function calculateQiblaDirection(latitude: number, longitude: number): number {
  return calculateQiblaBearing(latitude, longitude);
}

export function getHijriMonthGrid(day: number, month: string, year: string): Array<{ day: number; label: string; isToday: boolean; important?: string }> {
  const important: Record<number, string> = { 1: "Awal bulan", 10: month.toLowerCase().includes("muharram") ? "Asyura" : "", 12: month.toLowerCase().includes("rabi") ? "Maulid" : "", 27: month.toLowerCase().includes("rajab") ? "Isra Mi'raj" : "" };
  return Array.from({ length: 30 }, (_, i) => ({ day: i + 1, label: `${i + 1} ${month} ${year}`, isToday: i + 1 === day, important: important[i + 1] || undefined }));
}
