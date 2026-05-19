export type PrayerKey = 'Subuh' | 'Dzuhur' | 'Ashar' | 'Maghrib' | 'Isya';
export type RepeatMode = 'off' | 'gentle' | 'strong';
export type Reminder = { id: string; text: string; dateTimeIso: string; notificationId?: string };
export type City = { name: string; latitude: number; longitude: number };
export type NotificationSettings = {
  enabled: boolean;
  perPrayer: Record<PrayerKey, boolean>;
  offsetMinutes: 0 | 5 | 10 | 15;
  repeatMode: RepeatMode;
};
