import { PrayerKey } from '../types';
export const normalizeTimings = (t: Record<string,string>): Record<PrayerKey,string> => ({
  Subuh: t.Fajr?.slice(0,5) ?? '04:30', Dzuhur: t.Dhuhr?.slice(0,5) ?? '12:00', Ashar: t.Asr?.slice(0,5) ?? '15:00', Maghrib: t.Maghrib?.slice(0,5) ?? '18:00', Isya: t.Isha?.slice(0,5) ?? '19:00'
});
export const nextPrayer = (timings: Record<PrayerKey,string>, now = new Date()) => {
  const keys: PrayerKey[] = ['Subuh','Dzuhur','Ashar','Maghrib','Isya'];
  for (const key of keys) {
    const [h,m]=timings[key].split(':').map(Number); const d=new Date(now); d.setHours(h,m,0,0);
    if (d > now) return { key, at: d };
  }
  const [h,m]=timings.Subuh.split(':').map(Number); const d=new Date(now); d.setDate(d.getDate()+1); d.setHours(h,m,0,0);
  return { key:'Subuh' as PrayerKey, at:d };
};
