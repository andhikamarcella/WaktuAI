export type PrayerName = "Subuh" | "Dzuhur" | "Ashar" | "Maghrib" | "Isya";

export interface PrayerTime {
  name: PrayerName;
  time: string;
  dateTime: string;
}

export interface HijriDate {
  day: string;
  month: string;
  monthNumber: number;
  year: string;
  weekday?: string;
  holidays: string[];
}

export interface GregorianDate {
  readable: string;
  date: string;
}

export interface PrayerSchedule {
  dateKey: string;
  source: "gps" | "city" | "fallback" | "cache";
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  prayers: PrayerTime[];
  hijri?: HijriDate;
  gregorian?: GregorianDate;
  fetchedAt: string;
}

export interface CityOption {
  name: string;
  latitude: number;
  longitude: number;
}

export interface NextPrayer {
  prayer: PrayerTime;
  target: Date;
  isTomorrow: boolean;
}
