import { useCallback, useEffect, useRef } from "react";
import type { PrayerName, PrayerSchedule } from "@/types/prayer";
import type { AssistantSettings, DndState } from "@/types/reminder";
import { PrayerNotificationSettings, showBrowserNotification, isDndActive } from "@/lib/notifications";
import { getDateKey, parseTimeToday } from "@/lib/time";
import { readStorage, writeStorage } from "@/lib/storage";
import { speakIndonesian } from "@/lib/speech";

export interface PrayerBannerState { prayerName: PrayerName; message: string; dateKey: string }
interface SchedulerArgs {
  enabled: boolean;
  schedule: PrayerSchedule | null;
  settings: PrayerNotificationSettings;
  assistant: AssistantSettings;
  dnd: DndState;
  completed: Record<PrayerName, boolean>;
  onToast: (message: string) => void;
  onPrayerDue: (banner: PrayerBannerState) => void;
}

const SENT_KEY = "waktuai.sentPrayerNotifications";
const SNOOZE_KEY = "waktuai.prayerSnoozeUntil";
const DISABLED_KEY = "waktuai.prayerDisabledToday";
const REPEAT_KEY = "waktuai.prayerRepeatCounts";

type SentStore = { dateKey: string; keys: string[] };

function getSent(dateKey: string): Set<string> {
  const store = readStorage<SentStore>(SENT_KEY, { dateKey, keys: [] });
  if (store.dateKey !== dateKey) return new Set();
  return new Set(store.keys);
}

function saveSent(dateKey: string, sent: Set<string>): void { writeStorage(SENT_KEY, { dateKey, keys: [...sent] }); }
function objectStore<T extends Record<string, unknown>>(key: string): T { return readStorage<T>(key, {} as T); }
function saveObjectStore<T extends Record<string, unknown>>(key: string, value: T): void { writeStorage(key, value); }

export function disablePrayerForToday(prayerName: PrayerName, dateKey = getDateKey()): void {
  const disabled = objectStore<Record<string, string>>(DISABLED_KEY);
  disabled[`${dateKey}-${prayerName}`] = new Date().toISOString();
  saveObjectStore(DISABLED_KEY, disabled);
}

export function snoozePrayer(prayerName: PrayerName, minutes = 10, dateKey = getDateKey()): void {
  const snoozes = objectStore<Record<string, string>>(SNOOZE_KEY);
  snoozes[`${dateKey}-${prayerName}`] = new Date(Date.now() + minutes * 60_000).toISOString();
  saveObjectStore(SNOOZE_KEY, snoozes);
}

export function usePrayerNotificationScheduler({ enabled, schedule, settings, assistant, dnd, completed, onToast, onPrayerDue }: SchedulerArgs): void {
  const argsRef = useRef({ enabled, schedule, settings, assistant, dnd, completed, onToast, onPrayerDue });
  argsRef.current = { enabled, schedule, settings, assistant, dnd, completed, onToast, onPrayerDue };

  const check = useCallback(() => {
    const { enabled: active, schedule: currentSchedule, settings: prefs, assistant: voiceSettings, dnd: dndState, completed: completedState, onToast: toast, onPrayerDue: due } = argsRef.current;
    if (!active || !currentSchedule || !navigator.onLine) return;
    const now = new Date();
    const dateKey = getDateKey(now);
    const sent = getSent(dateKey);
    const disabled = objectStore<Record<string, string>>(DISABLED_KEY);
    const snoozes = objectStore<Record<string, string>>(SNOOZE_KEY);
    const repeats = objectStore<Record<string, number>>(REPEAT_KEY);
    let sentChanged = false;
    let repeatChanged = false;

    for (const prayer of currentSchedule.prayers) {
      const pref = prefs[prayer.name];
      if (!pref?.enabled || completedState[prayer.name] || disabled[`${dateKey}-${prayer.name}`]) continue;
      const prayerTime = parseTimeToday(prayer.time, now).getTime();
      const offsets = pref.leadMinutes > 0 ? [pref.leadMinutes, 0] : [0];
      for (const offset of offsets) {
        const dueAt = prayerTime - offset * 60_000;
        const key = `${dateKey}-${prayer.name}-${offset}`;
        if (sent.has(key) || now.getTime() < dueAt || now.getTime() - dueAt > 90_000) continue;
        const isPre = offset > 0;
        const title = isPre ? `Sebentar Lagi ${prayer.name}` : `WaktuAI - Waktu ${prayer.name}`;
        const body = isPre ? `${prayer.name} sekitar ${offset} menit lagi. Siap-siap ya.` : `Sudah masuk waktu ${prayer.name}. Yuk sholat.`;
        if (!isDndActive(dndState, now)) {
          showBrowserNotification(title, body, voiceSettings.notificationSound, dndState);
          toast(body);
          if (voiceSettings.prayerVoiceEnabled) speakIndonesian(isPre ? `Sebentar lagi waktu ${prayer.name}.` : body, voiceSettings);
          if (!isPre) due({ prayerName: prayer.name, message: `Sudah masuk waktu ${prayer.name}`, dateKey });
        }
        sent.add(key); sentChanged = true;
      }

      const baseRepeatKey = `${dateKey}-${prayer.name}`;
      const count = repeats[baseRepeatKey] ?? 0;
      const snoozeUntil = snoozes[baseRepeatKey] ? new Date(snoozes[baseRepeatKey]).getTime() : 0;
      const mode = voiceSettings.persistentReminderMode ?? "off";
      if (mode !== "off" && !isDndActive(dndState, now) && now.getTime() >= prayerTime + 60_000 && count < (mode === "strong" ? 3 : 1)) {
        const interval = mode === "strong" ? 5 * 60_000 : 10 * 60_000;
        const nextRepeatDue = Math.max(prayerTime + interval * (count + 1), snoozeUntil);
        const repeatKey = `${dateKey}-${prayer.name}-repeat-${count + 1}`;
        if (now.getTime() >= nextRepeatDue && now.getTime() - nextRepeatDue <= 90_000 && !sent.has(repeatKey)) {
          const body = `Pengingat ${prayer.name}: kalau belum, yuk sholat.`;
          showBrowserNotification(`WaktuAI - Pengingat ${prayer.name}`, body, voiceSettings.notificationSound, dndState);
          toast(body);
          if (voiceSettings.prayerVoiceEnabled) speakIndonesian(body, voiceSettings);
          due({ prayerName: prayer.name, message: `Sudah masuk waktu ${prayer.name}`, dateKey });
          sent.add(repeatKey); sentChanged = true; repeats[baseRepeatKey] = count + 1; repeatChanged = true;
        }
      }
    }
    if (sentChanged) saveSent(dateKey, sent);
    if (repeatChanged) saveObjectStore(REPEAT_KEY, repeats);
  }, []);

  useEffect(() => {
    check();
    const interval = window.setInterval(check, 25_000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", check);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", check); };
  }, [check]);
}
