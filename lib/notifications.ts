import type { PrayerName } from "@/types/prayer";
import type { DndState } from "@/types/reminder";

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

export function playRespectfulBeep(): void {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return;
  try {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    window.setTimeout(() => { oscillator.stop(); void audioContext.close(); }, 180);
  } catch {}
}

export function showBrowserNotification(title: string, body: string, sound: boolean, dnd: DndState): boolean {
  if (getNotificationPermission() !== "granted" || isDndActive(dnd)) return false;
  try {
    new Notification(title, { body, icon: "/icon.svg", badge: "/icon.svg" });
    if (sound) playRespectfulBeep();
    return true;
  } catch {
    return false;
  }
}
