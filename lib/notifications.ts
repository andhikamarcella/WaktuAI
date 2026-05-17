import type { PrayerName, PrayerSchedule } from "@/types/prayer";
import type { Reminder, DndState } from "@/types/reminder";
import { parseTimeToday } from "./time";

export type LeadMinutes = 0 | 5 | 10 | 15;
export type NotificationPermissionState = "unsupported" | NotificationPermission;

export interface PrayerNotificationPreference {
  enabled: boolean;
  leadMinutes: LeadMinutes;
}

export type PrayerNotificationSettings = Record<PrayerName, PrayerNotificationPreference>;

export const DEFAULT_NOTIFICATION_SETTINGS: PrayerNotificationSettings = {
  Subuh: { enabled: true, leadMinutes: 0 },
  Dzuhur: { enabled: true, leadMinutes: 0 },
  Ashar: { enabled: true, leadMinutes: 0 },
  Maghrib: { enabled: true, leadMinutes: 0 },
  Isya: { enabled: true, leadMinutes: 0 }
};

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.requestPermission();
}

export function isDndActive(dnd: DndState, now = new Date()): boolean {
  return Boolean(dnd.until && new Date(dnd.until).getTime() > now.getTime());
}

export function showBrowserNotification(title: string, body: string, sound: boolean, dnd: DndState): boolean {
  if (getNotificationPermission() !== "granted" || isDndActive(dnd)) return false;
  try {
    new Notification(title, { body, icon: "/icon.svg", badge: "/icon.svg" });
    if (sound && typeof Audio !== "undefined") {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.04;
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      window.setTimeout(() => { oscillator.stop(); void audioContext.close(); }, 180);
    }
    return true;
  } catch {
    return false;
  }
}

export function schedulePrayerNotifications(schedule: PrayerSchedule, settings: PrayerNotificationSettings, sound: boolean, dnd: DndState): () => void {
  const timers: number[] = [];
  const sent = new Set<string>();
  const now = Date.now();
  for (const prayer of schedule.prayers) {
    const pref = settings[prayer.name];
    if (!pref?.enabled) continue;
    const target = parseTimeToday(prayer.time).getTime() - pref.leadMinutes * 60_000;
    const delay = target - now;
    if (delay < 0 || delay > 86_400_000) continue;
    const key = `${schedule.dateKey}-${prayer.name}-${pref.leadMinutes}`;
    const timer = window.setTimeout(() => {
      if (sent.has(key)) return;
      sent.add(key);
      const pre = pref.leadMinutes > 0;
      showBrowserNotification(
        pre ? `Sebentar Lagi ${prayer.name}` : `WaktuAI - Waktu ${prayer.name}`,
        pre ? `${prayer.name} sekitar ${pref.leadMinutes} menit lagi. Siap-siap ya.` : `Sudah masuk waktu ${prayer.name}. Yuk sholat.`,
        sound,
        dnd
      );
    }, delay);
    timers.push(timer);
  }
  return () => timers.forEach((timer) => window.clearTimeout(timer));
}

export function scheduleReminders(reminders: Reminder[], sound: boolean, dnd: DndState, onFire?: (id: string) => void): () => void {
  const timers: number[] = [];
  const now = Date.now();
  for (const reminder of reminders) {
    const delay = new Date(reminder.scheduledAt).getTime() - now;
    if (delay < 0 || delay > 86_400_000 * 7) continue;
    timers.push(window.setTimeout(() => {
      showBrowserNotification("WaktuAI - Reminder", reminder.label, sound, dnd);
      onFire?.(reminder.id);
    }, delay));
  }
  return () => timers.forEach((timer) => window.clearTimeout(timer));
}
