import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdzanAudioSettings, playSelectedAdzanSound } from "../lib/adzanAudio";
import { Reminder, nextRepeatDate } from "../lib/reminders";
import { dateAtLocalTime, localDateKey, parseClockTime } from "../lib/time";

export type PrayerName = "Subuh" | "Dzuhur" | "Ashar" | "Maghrib" | "Isya";
export type ReminderMode = "off" | "gentle" | "strong";
export type NotificationStatus = "success" | "failed" | "skipped";

export interface PrayerTime {
  name: PrayerName;
  time: string;
}

export interface WebNotificationSettings {
  enabled: boolean;
  perPrayer: Record<PrayerName, boolean>;
  preReminder: 0 | 5 | 10 | 15;
  repeatMode: ReminderMode;
  keepPrayerDuringDnd: boolean;
}

export interface VoiceSettings {
  enabled: boolean;
  prayer: boolean;
  reminder: boolean;
  rate: "slow" | "normal" | "fast";
}

export interface DndSettings {
  enabled: boolean;
  until: string | null;
}

export type PrayerSoundMode = "full" | "voice" | "silent" | "off";

export interface HistoryLog {
  id: string;
  type: string;
  title: string;
  time: string;
  status: NotificationStatus;
  reason?: string;
}

export interface PrayerBanner {
  kind: "prayer" | "preparation";
  prayer: PrayerName;
  message: string;
  dateKey: string;
}

export interface FiredReminderBanner {
  reminderId: string;
  title: string;
  message: string;
}

interface SchedulerArgs {
  prayerTimes: PrayerTime[];
  notifications: WebNotificationSettings;
  voice: VoiceSettings;
  dnd: DndSettings;
  adzanAudio: AdzanAudioSettings;
  prayerSoundModes: Record<PrayerName, PrayerSoundMode>;
  audioUnlocked: boolean;
  completedPrayers: Record<string, PrayerName[]>;
  reminders: Reminder[];
  onSetReminders: (updater: (items: Reminder[]) => Reminder[]) => void;
  onToast: (message: string, tone?: "success" | "error" | "info") => void;
  onPrayerBanner: (banner: PrayerBanner) => void;
  onReminderBanner: (banner: FiredReminderBanner) => void;
  onLog: (item: Omit<HistoryLog, "id" | "time">) => void;
  onAdzanAudioResult: (settings: AdzanAudioSettings) => void;
}

const sentStorageKey = "waktuai.sentNotificationKeys";
const repeatStorageKey = "waktuai.strongReminderCounts";
const schedulerWindowMs = 11_000;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function canUseNotification() {
  return typeof window !== "undefined" && "Notification" in window;
}

function sendBrowserNotification(title: string, body: string): boolean {
  if (!canUseNotification() || Notification.permission !== "granted") return false;
  try {
    new Notification(title, {
      body,
      icon: "/icon.svg",
      badge: "/icon.svg",
    });
    return true;
  } catch {
    return false;
  }
}

function speak(text: string, voice: VoiceSettings, kind: "prayer" | "reminder"): boolean {
  if (!voice.enabled) return false;
  if (kind === "prayer" && !voice.prayer) return false;
  if (kind === "reminder" && !voice.reminder) return false;
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const indonesian = voices.find((item) => item.lang.toLowerCase().startsWith("id"));
    if (indonesian) utterance.voice = indonesian;
    utterance.lang = indonesian?.lang ?? "id-ID";
    utterance.rate = voice.rate === "slow" ? 0.85 : voice.rate === "fast" ? 1.15 : 1;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

function isDndActive(dnd: DndSettings): boolean {
  if (!dnd.enabled || !dnd.until) return false;
  const until = new Date(dnd.until).getTime();
  return !Number.isNaN(until) && until > Date.now();
}

export function usePrayerNotificationScheduler(args: SchedulerArgs) {
  const {
    prayerTimes,
    notifications,
    voice,
    dnd,
    adzanAudio,
    audioUnlocked,
    completedPrayers,
    reminders,
    onSetReminders,
    onToast,
    onPrayerBanner,
    onReminderBanner,
    onLog,
    onAdzanAudioResult,
  } = args;
  const [schedulerStatus, setSchedulerStatus] = useState<"running" | "paused">("running");
  const [lastCheckAt, setLastCheckAt] = useState<string | null>(null);
  const argsRef = useRef(args);

  useEffect(() => {
    argsRef.current = args;
  }, [args]);

  const checkPrayer = useCallback((now: Date) => {
    const current = argsRef.current;
    if (!current.notifications.enabled) {
      current.onLog({ type: "scheduler", title: "Prayer notification check", status: "skipped", reason: "Global notification off" });
      return;
    }
    const dateKey = localDateKey(now);
    const sent = readJson<string[]>(sentStorageKey, []).filter((key) => key.startsWith(dateKey));
    const sentSet = new Set(sent);
    const repeatCounts = readJson<Record<string, number>>(repeatStorageKey, {});
    const completed = new Set(current.completedPrayers[dateKey] ?? []);
    const dndActive = isDndActive(current.dnd);

    current.prayerTimes.forEach((prayer) => {
      const parsed = parseClockTime(prayer.time);
      if (!parsed) return;
      if (!current.notifications.perPrayer[prayer.name]) return;
      if (completed.has(prayer.name)) {
        current.onLog({ type: "prayer", title: `${prayer.name} notification skipped`, status: "skipped", reason: "Prayer already completed" });
        return;
      }
      if (dndActive && !current.notifications.keepPrayerDuringDnd) {
        current.onLog({ type: "prayer", title: `${prayer.name} notification skipped`, status: "skipped", reason: "Do Not Disturb active" });
        return;
      }

      const offsets = current.notifications.preReminder > 0 ? [-current.notifications.preReminder, 0] : [0];
      const repeats = current.notifications.repeatMode === "strong" ? [0, 5, 10, 15] : current.notifications.repeatMode === "gentle" ? [0] : [0];
      const allOffsets = Array.from(new Set([...offsets, ...(current.notifications.repeatMode === "off" ? [0] : repeats)]));

      allOffsets.forEach((offset) => {
        const target = dateAtLocalTime(now, parsed.hour, parsed.minute);
        target.setMinutes(target.getMinutes() + offset);
        const diff = now.getTime() - target.getTime();
        if (diff < 0 || diff > schedulerWindowMs) return;
        const key = `${dateKey}-${prayer.name}-${offset}`;
        if (sentSet.has(key)) return;
        if (offset > 0) {
          const countKey = `${dateKey}-${prayer.name}`;
          const count = repeatCounts[countKey] ?? 0;
          if (count >= 4) return;
          repeatCounts[countKey] = count + 1;
        }

        const isPre = offset < 0;
        const title = isPre ? `Sebentar Lagi ${prayer.name}` : `WaktuAI - Waktu ${prayer.name}`;
        const body = isPre ? `${prayer.name} sekitar ${Math.abs(offset)} menit lagi. Siap-siap ya.` : `Sudah masuk waktu ${prayer.name}. Yuk sholat.`;
        const browserSent = sendBrowserNotification(title, body);
        current.onToast(body, "info");
        current.onPrayerBanner({
          kind: isPre ? "preparation" : "prayer",
          prayer: prayer.name,
          message: isPre ? `Sebentar lagi ${prayer.name}. Siapkan wudhu dan sholat.` : `Sudah masuk waktu ${prayer.name}`,
          dateKey,
        });
        const soundKey = `${dateKey}-${prayer.name}-adzan-sound`;
        const shouldTryAdzanSound = offset <= 0 && !sentSet.has(soundKey);
        const shouldTryPreparationSound = offset < 0;
        const soundMode = current.prayerSoundModes[prayer.name] ?? "full";
        if ((shouldTryAdzanSound || shouldTryPreparationSound) && soundMode !== "off" && soundMode !== "silent") {
          const soundSettings = soundMode === "voice" ? { ...current.adzanAudio, enabled: true, source: "voice" as const } : current.adzanAudio;
          void playSelectedAdzanSound({
            prayerName: prayer.name,
            mode: isPre ? "preReminder" : "time",
            settings: soundSettings,
          }).then((result) => {
            current.onAdzanAudioResult({
              ...soundSettings,
              lastTestResult: result.ok ? `Suara adzan: ${result.source ?? "audio"} berhasil.` : result.reason ?? "Suara adzan gagal.",
              lastPlayedAt: result.ok ? new Date().toISOString() : soundSettings.lastPlayedAt,
              lastFailedReason: result.ok ? undefined : result.reason,
            });
            current.onLog({
              type: "audio",
              title: `${prayer.name} adzan sound`,
              status: result.ok ? "success" : "failed",
              reason: result.reason ?? result.source ?? (current.audioUnlocked ? "Audio attempted" : "Audio attempted before unlock"),
            });
          });
          if (shouldTryAdzanSound) sentSet.add(soundKey);
        }
        const didSpeak = current.adzanAudio.source === "voice" && current.adzanAudio.enabled
          ? false
          : speak(isPre ? `Sebentar lagi waktu ${prayer.name}.` : `Sudah masuk waktu ${prayer.name}. Yuk sholat.`, current.voice, "prayer");
        sentSet.add(key);
        current.onLog({
          type: "prayer",
          title,
          status: browserSent || !canUseNotification() ? "success" : "skipped",
          reason: browserSent ? "Browser notification sent" : "In-app fallback shown",
        });
        if (didSpeak) current.onLog({ type: "voice", title: `${prayer.name} voice announcement`, status: "success" });
      });
    });

    writeJson(sentStorageKey, Array.from(sentSet));
    writeJson(repeatStorageKey, repeatCounts);
  }, []);

  const checkReminders = useCallback((now: Date) => {
    const current = argsRef.current;
    const dndActive = isDndActive(current.dnd);
    onSetReminders((items) =>
      items.map((reminder) => {
        if (!["scheduled", "missed"].includes(reminder.status)) return reminder;
        const target = new Date(reminder.dateTime);
        if (Number.isNaN(target.getTime()) || now.getTime() < target.getTime()) return reminder;
        const fireKey = `${reminder.id}-${localDateKey(target)}-${target.getHours()}-${target.getMinutes()}`;
        if (reminder.firedKeys.includes(fireKey)) return reminder;

        if (dndActive) {
          current.onLog({ type: "reminder", title: reminder.title, status: "skipped", reason: "Do Not Disturb active" });
          return { ...reminder, status: "missed" };
        }

        const browserSent = sendBrowserNotification("WaktuAI - Pengingat", reminder.title);
        current.onToast(reminder.title, "info");
        current.onReminderBanner({ reminderId: reminder.id, title: reminder.title, message: "Ini pengingat kamu." });
        const didSpeak = speak("Ini pengingat kamu.", current.voice, "reminder");
        current.onLog({
          type: "reminder",
          title: reminder.title,
          status: browserSent || !canUseNotification() ? "success" : "skipped",
          reason: browserSent ? "Browser notification sent" : "In-app fallback shown",
        });
        if (didSpeak) current.onLog({ type: "voice", title: "Reminder voice announcement", status: "success" });

        const next = nextRepeatDate(target, reminder.repeat);
        if (next) {
          return {
            ...reminder,
            dateTime: next.toISOString(),
            firedKeys: [...reminder.firedKeys, fireKey],
            status: "scheduled",
            history: [...reminder.history, `Berulang ke ${next.toISOString()}`].slice(-12),
          };
        }

        return {
          ...reminder,
          status: "fired",
          firedKeys: [...reminder.firedKeys, fireKey],
          history: [...reminder.history, `Berbunyi ${now.toISOString()}`].slice(-12),
        };
      }),
    );
  }, [onSetReminders]);

  const runCheck = useCallback(() => {
    const now = new Date();
    setLastCheckAt(now.toISOString());
    setSchedulerStatus(document.visibilityState === "hidden" ? "paused" : "running");
    checkPrayer(now);
    checkReminders(now);
  }, [checkPrayer, checkReminders]);

  useEffect(() => {
    runCheck();
    const interval = window.setInterval(runCheck, 10_000);
    const onVisible = () => runCheck();
    const onFocus = () => runCheck();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [runCheck, prayerTimes, notifications, voice, dnd, completedPrayers, reminders.length]);

  return useMemo(() => ({ schedulerStatus, lastCheckAt, runCheck }), [lastCheckAt, runCheck, schedulerStatus]);
}
