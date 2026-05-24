import { useCallback, useEffect } from "react";
import { sendBrowserNotification } from "../lib/notifications";
import { speakIndonesian } from "../lib/speech";
import { dateFromHHMMForToday, formatLocalDate, PrayerName, PrayerTime } from "../lib/time";

export type ReminderMode = "off" | "gentle" | "strong";

export type PrayerNotificationPreferences = {
  enabled: boolean;
  prayers: Record<PrayerName, boolean>;
  preReminderMinutes: 0 | 5 | 10 | 15;
  reminderMode: ReminderMode;
  doNotDisturb: boolean;
  voiceEnabled: boolean;
};

export type PrayerBanner = {
  id: string;
  prayer: PrayerName;
  message: string;
};

type UsePrayerSchedulerOptions = {
  prayerTimes: PrayerTime[];
  preferences: PrayerNotificationPreferences;
  sentKeys: string[];
  completedKeys: string[];
  disabledTodayKeys: string[];
  onSentKeysChange: (keys: string[]) => void;
  onPrayerBanner: (banner: PrayerBanner) => void;
  onToast: (message: string) => void;
};

function hasKey(keys: string[], key: string): boolean {
  return keys.includes(key);
}

function addKey(keys: string[], key: string): string[] {
  return hasKey(keys, key) ? keys : [...keys, key];
}

export function usePrayerNotificationScheduler(options: UsePrayerSchedulerOptions): void {
  const {
    prayerTimes,
    preferences,
    sentKeys,
    completedKeys,
    disabledTodayKeys,
    onSentKeysChange,
    onPrayerBanner,
    onToast
  } = options;

  const check = useCallback(() => {
    if (!preferences.enabled || preferences.doNotDisturb || !navigator.onLine) return;

    const now = new Date();
    const today = formatLocalDate(now);
    let nextSentKeys = sentKeys.filter((key) => key.startsWith(today));
    let changed = nextSentKeys.length !== sentKeys.length;

    for (const prayer of prayerTimes) {
      if (!preferences.prayers[prayer.name]) continue;
      const disabledKey = `${today}-${prayer.name}`;
      if (hasKey(completedKeys, disabledKey) || hasKey(disabledTodayKeys, disabledKey)) continue;
      const target = dateFromHHMMForToday(prayer.time, now);
      if (!target) continue;

      const checks: Array<{ offset: number; title: string; body: string; speech: string }> = [];
      if (preferences.preReminderMinutes > 0) {
        checks.push({
          offset: -preferences.preReminderMinutes,
          title: `Sebentar Lagi ${prayer.name}`,
          body: `${prayer.name} sekitar ${preferences.preReminderMinutes} menit lagi. Siap-siap ya.`,
          speech: `Sebentar lagi waktu ${prayer.name}.`
        });
      }
      checks.push({
        offset: 0,
        title: `WaktuAI - Waktu ${prayer.name}`,
        body: `Sudah masuk waktu ${prayer.name}. Yuk sholat.`,
        speech: `Sudah masuk waktu ${prayer.name}. Yuk sholat.`
      });

      const repeatOffsets = preferences.reminderMode === "strong"
        ? [5, 10, 15]
        : preferences.reminderMode === "gentle"
          ? [10]
          : [];
      for (const offset of repeatOffsets) {
        checks.push({
          offset,
          title: `Pengingat ${prayer.name}`,
          body: `Sudah masuk waktu ${prayer.name}. Jangan lupa sholat.`,
          speech: `Pengingat waktu ${prayer.name}.`
        });
      }

      for (const item of checks) {
        const fireAt = new Date(target);
        fireAt.setMinutes(fireAt.getMinutes() + item.offset);
        const diff = now.getTime() - fireAt.getTime();
        const notificationWindowMs = item.offset < 0 ? 90_000 : 60 * 60_000;
        if (diff < 0 || diff > notificationWindowMs) continue;

        const sentKey = `${today}-${prayer.name}-${item.offset}`;
        if (hasKey(nextSentKeys, sentKey)) continue;

        sendBrowserNotification(item.title, item.body);
        onToast(item.body);
        if (preferences.voiceEnabled) speakIndonesian(item.speech);
        nextSentKeys = addKey(nextSentKeys, sentKey);
        changed = true;

        if (item.offset >= 0) {
          onPrayerBanner({
            id: `${today}-${prayer.name}`,
            prayer: prayer.name,
            message: `Sudah masuk waktu ${prayer.name}`
          });
        }
      }
    }

    if (changed) onSentKeysChange(nextSentKeys);
  }, [completedKeys, disabledTodayKeys, onPrayerBanner, onSentKeysChange, onToast, prayerTimes, preferences, sentKeys]);

  useEffect(() => {
    check();
    const interval = window.setInterval(check, 25_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", check);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", check);
    };
  }, [check]);
}
