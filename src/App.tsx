import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdzanSoundSettings } from "./components/AdzanSoundSettings";
import {
  DndSettings,
  HistoryLog,
  PrayerBanner,
  PrayerName,
  PrayerTime,
  ReminderMode,
  VoiceSettings,
  WebNotificationSettings,
  usePrayerNotificationScheduler,
} from "./hooks/usePrayerNotificationScheduler";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { AdzanAudioSettings, defaultAdzanAudioSettings, playSelectedAdzanSound } from "./lib/adzanAudio";
import { Reminder, RepeatRule, parseReminderInput } from "./lib/reminders";
import { speakIndonesian } from "./lib/speech";
import { TimeFormat, clampNumber, displayDate, durationText, formatClock, formatDateTime, localDateKey, parseClockTime } from "./lib/time";
import { parseCommand, suggestedCommands } from "./lib/voiceCommands";

type Tab = "home" | "prayer" | "reminder" | "rakaat" | "settings";
type ThemeMode = "system" | "light" | "dark";
type ToastTone = "success" | "error" | "info";
type LocationSource = "GPS" | "Manual city" | "Default Jakarta";
type CameraStatus = "idle" | "requesting" | "active" | "denied" | "unavailable" | "model-unavailable" | "insecure";
type NotificationPermissionState = "unsupported" | NotificationPermission;
type WidgetKey = "time" | "nextPrayer" | "countdown" | "qibla" | "progress" | "reminders" | "tasbih" | "note" | "notification" | "voice";
type ReminderTone = "soft" | "neutral" | "firm";
type PrayerSoundMode = "full" | "voice" | "silent" | "off";

interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

interface Coordinates {
  lat: number;
  lon: number;
  city: string;
  source: LocationSource;
  accuracy?: number;
  updatedAt?: string;
}

interface PrayerSchedule {
  dateKey: string;
  city: string;
  source: LocationSource;
  timings: Record<PrayerName, string>;
  hijri?: {
    day: string;
    month: string;
    year: string;
  };
  fetchedAt: string;
}

interface PrayerTracker {
  [dateKey: string]: PrayerName[];
}

interface TasbihState {
  count: number;
  target: number;
  preset: string;
}

interface DailyNote {
  id: string;
  text: string;
  done: boolean;
}

interface DailyChecklistItem {
  id: string;
  text: string;
  custom: boolean;
  done: boolean;
}

interface CommandHistoryItem {
  id: string;
  command: string;
  intent: string;
  response: string;
  status: "success" | "error";
  time: string;
}

interface PrayerAdjustments {
  Subuh: number;
  Dzuhur: number;
  Ashar: number;
  Maghrib: number;
  Isya: number;
}

interface SubuhWakeSettings {
  enabled: boolean;
  offset: 15 | 30 | 45 | 60;
  soundMode: "voice" | "beep" | "adzan" | "silent";
}

interface FeatureFlags {
  camera: boolean;
  voiceCommand: boolean;
  adzanSound: boolean;
  strongReminders: boolean;
  experimentalKemenag: boolean;
  wakeLock: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface WakeLockSentinel extends EventTarget {
  released: boolean;
  release: () => Promise<void>;
}

const prayerNames: PrayerName[] = ["Subuh", "Dzuhur", "Ashar", "Maghrib", "Isya"];
const defaultPerPrayer = Object.fromEntries(prayerNames.map((name) => [name, true])) as Record<PrayerName, boolean>;
const dailyReminders = [
  "Jaga sholat tepat waktu hari ini.",
  "Sedikit demi sedikit, yang penting istiqamah.",
  "Gunakan waktu sebelum adzan untuk bersiap.",
  "Siapkan wudhu lebih awal saat memungkinkan.",
];

const cityOptions: Record<string, { lat: number; lon: number }> = {
  Jakarta: { lat: -6.2088, lon: 106.8456 },
  Bekasi: { lat: -6.2383, lon: 106.9756 },
  Bandung: { lat: -6.9175, lon: 107.6191 },
  Surabaya: { lat: -7.2575, lon: 112.7521 },
  Yogyakarta: { lat: -7.7956, lon: 110.3695 },
  Medan: { lat: 3.5952, lon: 98.6722 },
  Makassar: { lat: -5.1477, lon: 119.4327 },
};

const methodOptions = [
  { label: "Kemenag Indonesia", value: 20 },
  { label: "Muslim World League", value: 3 },
  { label: "Umm Al-Qura", value: 4 },
  { label: "Egyptian", value: 5 },
];

const defaultQuickActions = ["Jadwal Sholat", "Adzan Berikutnya", "Tambah Reminder", "Arah Kiblat", "Tes Notifikasi", "Hitung Rakaat", "Tasbih"];
const defaultWidgets: WidgetKey[] = ["time", "nextPrayer", "countdown", "qibla", "progress", "reminders"];
const widgetLabels: Record<WidgetKey, string> = {
  time: "Current time",
  nextPrayer: "Next prayer",
  countdown: "Countdown",
  qibla: "Qibla degree",
  progress: "Prayer progress",
  reminders: "Active reminders",
  tasbih: "Tasbih progress",
  note: "Daily note",
  notification: "Notification status",
  voice: "Voice AI status",
};
const defaultChecklistTexts = ["Sholat Subuh", "Sholat Dzuhur", "Sholat Ashar", "Sholat Maghrib", "Sholat Isya", "Dzikir pagi", "Dzikir petang", "Baca Al-Qur'an", "Sedekah", "Catatan harian"];
const defaultPrayerAdjustments: PrayerAdjustments = { Subuh: 0, Dzuhur: 0, Ashar: 0, Maghrib: 0, Isya: 0 };
const commandSuggestions = ["jam berapa sekarang", "jadwal sholat hari ini", "kapan isya", "ingatkan aku 17:46", "arah kiblat", "tes notifikasi", "tes suara ai", "hitung tasbih", "tambah rakaat", "aku bingung"];
const defaultPrayerSoundModes = Object.fromEntries(prayerNames.map((name) => [name, "full"])) as Record<PrayerName, PrayerSoundMode>;
const defaultSubuhWake: SubuhWakeSettings = { enabled: false, offset: 30, soundMode: "voice" };
const defaultFeatureFlags: FeatureFlags = {
  camera: true,
  voiceCommand: true,
  adzanSound: true,
  strongReminders: true,
  experimentalKemenag: false,
  wakeLock: true,
};

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => safeRead(key, fallback));
  useEffect(() => safeWrite(key, value), [key, value]);
  return [value, setValue] as const;
}

function makeLog(item: Omit<HistoryLog, "id" | "time">): HistoryLog {
  return {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: new Date().toISOString(),
  };
}

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "soft" }) {
  const { variant = "secondary", className = "", ...rest } = props;
  const cls = variant === "primary" ? "btn-primary" : variant === "soft" ? "btn-soft" : "btn-secondary";
  return <button className={`${cls} ${className}`} {...rest} />;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm leading-5 text-muted">{subtitle}</p> : null}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-sm font-semibold text-ink">{children}</label>;
}

function qiblaDirection(lat: number, lon: number): number {
  const kaabaLat = (21.422487 * Math.PI) / 180;
  const kaabaLon = (39.826206 * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const deltaLon = kaabaLon - lon1;
  const y = Math.sin(deltaLon);
  const x = Math.cos(lat1) * Math.tan(kaabaLat) - Math.sin(lat1) * Math.cos(deltaLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function cleanTiming(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = parseClockTime(value);
  return parsed ? `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}` : null;
}

function adjustPrayerTime(time: string, minutes: number): string {
  const parsed = parseClockTime(time);
  if (!parsed || minutes === 0) return time;
  const date = new Date();
  date.setHours(parsed.hour, parsed.minute + minutes, 0, 0);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getNotificationPermission(): NotificationPermissionState {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function createNotification(title: string, body: string): boolean {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  try {
    new Notification(title, { body, icon: "/icon.svg", badge: "/icon.svg" });
    return true;
  } catch {
    return false;
  }
}

function dndLabel(dnd: DndSettings, format: TimeFormat) {
  if (!dnd.enabled || !dnd.until) return "Tidak aktif";
  const date = new Date(dnd.until);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return "Tidak aktif";
  return `Aktif sampai ${formatClock(date, format)}`;
}

function repeatLabel(repeat: RepeatRule) {
  return {
    once: "Sekali",
    daily: "Setiap hari",
    weekdays: "Hari kerja",
    weekend: "Akhir pekan",
    weekly: "Mingguan",
  }[repeat];
}

function monthlyStats(tracker: PrayerTracker) {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const keys = Object.keys(tracker).filter((key) => key.startsWith(ym));
  const total = keys.reduce((sum, key) => sum + (tracker[key]?.length ?? 0), 0);
  const completeDays = keys.filter((key) => (tracker[key]?.length ?? 0) === 5).length;
  let activeStreak = 0;
  let fullStreak = 0;
  for (let i = 0; i < 31; i += 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const count = tracker[localDateKey(date)]?.length ?? 0;
    if (i === activeStreak && count > 0) activeStreak += 1;
    if (i === fullStreak && count === 5) fullStreak += 1;
  }
  return {
    daysTracked: keys.length,
    total,
    percentage: keys.length ? Math.round((total / (keys.length * 5)) * 100) : 0,
    completeDays,
    activeStreak,
    fullStreak,
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [theme, setTheme] = useStoredState<ThemeMode>("waktuai.theme", "system");
  const [timeFormat, setTimeFormat] = useStoredState<TimeFormat>("waktuai.timeFormat", "24h");
  const [coords, setCoords] = useStoredState<Coordinates>("waktuai.location", {
    lat: cityOptions.Jakarta.lat,
    lon: cityOptions.Jakarta.lon,
    city: "Jakarta",
    source: "Default Jakarta",
  });
  const [method, setMethod] = useStoredState<number>("waktuai.prayerMethod", 20);
  const [schedule, setSchedule] = useStoredState<PrayerSchedule | null>("waktuai.prayerSchedule", null);
  const [scheduleStatus, setScheduleStatus] = useState<"active" | "cached" | "error" | "loading">("cached");
  const [notifications, setNotifications] = useStoredState<WebNotificationSettings>("waktuai.notifications", {
    enabled: false,
    perPrayer: defaultPerPrayer,
    preReminder: 10,
    repeatMode: "gentle",
    keepPrayerDuringDnd: false,
  });
  const [voice, setVoice] = useStoredState<VoiceSettings>("waktuai.voice", {
    enabled: true,
    prayer: true,
    reminder: true,
    rate: "normal",
  });
  const [adzanAudio, setAdzanAudio] = useStoredState<AdzanAudioSettings>("waktuai.adzanAudio", defaultAdzanAudioSettings);
  const [prayerSoundModes, setPrayerSoundModes] = useStoredState<Record<PrayerName, PrayerSoundMode>>("waktuai.prayerSoundModes", defaultPrayerSoundModes);
  const [subuhWake, setSubuhWake] = useStoredState<SubuhWakeSettings>("waktuai.subuhWake", defaultSubuhWake);
  const [featureFlags, setFeatureFlags] = useStoredState<FeatureFlags>("waktuai.featureFlags", defaultFeatureFlags);
  const [lastDebugReport, setLastDebugReport] = useState("");
  const [releaseNotesOpen, setReleaseNotesOpen] = useStoredState<boolean>("waktuai.releaseNotes.2.1.0", true);
  const [selectedPrayer, setSelectedPrayer] = useState<PrayerName | null>(null);
  const [notificationHelpOpen, setNotificationHelpOpen] = useState(false);
  const [soundHelpOpen, setSoundHelpOpen] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [dnd, setDnd] = useStoredState<DndSettings>("waktuai.dnd", { enabled: false, until: null });
  const [reminders, setReminders] = useStoredState<Reminder[]>("waktuai.reminders", []);
  const [tracker, setTracker] = useStoredState<PrayerTracker>("waktuai.prayerTracker", {});
  const [tasbih, setTasbih] = useStoredState<TasbihState>("waktuai.tasbih", { count: 0, target: 33, preset: "Subhanallah" });
  const [notes, setNotes] = useStoredState<Record<string, DailyNote[]>>("waktuai.dailyNotes", {});
  const [history, setHistory] = useStoredState<HistoryLog[]>("waktuai.history", []);
  const [quickActions, setQuickActions] = useStoredState<string[]>("waktuai.quickActions", defaultQuickActions);
  const [dashboardWidgets, setDashboardWidgets] = useStoredState<WidgetKey[]>("waktuai.dashboardWidgets", defaultWidgets);
  const [checklists, setChecklists] = useStoredState<Record<string, DailyChecklistItem[]>>("waktuai.dailyChecklist", {});
  const [commandHistory, setCommandHistory] = useStoredState<CommandHistoryItem[]>("waktuai.commandHistory", []);
  const [prayerAdjustments, setPrayerAdjustments] = useStoredState<PrayerAdjustments>("waktuai.prayerAdjustments", defaultPrayerAdjustments);
  const [quranReminder, setQuranReminder] = useStoredState("waktuai.quranReminder", { enabled: false, time: "20:00" });
  const [reminderTone, setReminderTone] = useStoredState<ReminderTone>("waktuai.reminderTone", "neutral");
  const [wakeLockStatus, setWakeLockStatus] = useState<"off" | "active" | "unsupported" | "paused">("off");
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [safeMode, setSafeMode] = useStoredState<boolean>("waktuai.safeMode", false);
  const [onboardingDone, setOnboardingDone] = useStoredState<boolean>("waktuai.onboardingDone", false);
  const [dismissedTips, setDismissedTips] = useStoredState<string[]>("waktuai.dismissedTips", []);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(() => getNotificationPermission());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [clock, setClock] = useState(() => new Date());
  const [command, setCommand] = useState("");
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  const [assistantMood, setAssistantMood] = useState<"idle" | "listening" | "thinking" | "speaking" | "error">("idle");
  const [troubleshootTopic, setTroubleshootTopic] = useState<string | null>(null);
  const [prayerBanner, setPrayerBanner] = useState<PrayerBanner | null>(null);
  const [reminderBanner, setReminderBanner] = useState<{ reminderId: string; title: string; message: string } | null>(null);
  const [lastTestResult, setLastTestResult] = useState("Belum dites");
  const [lastVoiceResult, setLastVoiceResult] = useState("Belum dites");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [rakaat, setRakaat] = useStoredState("waktuai.rakaat", { count: 0, target: 4 });
  const [orientation, setOrientation] = useState(0);
  const [importText, setImportText] = useState("");
  const [newNote, setNewNote] = useState("");
  const [reminderInput, setReminderInput] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const addToast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((items) => [...items, { id, message, tone }].slice(-4));
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4500);
  }, []);

  const addLog = useCallback(
    (item: Omit<HistoryLog, "id" | "time">) => {
      setHistory((items) => [makeLog(item), ...items].slice(0, 50));
    },
    [setHistory],
  );

  const speakAssistant = useCallback((text: string) => {
    if (!voice.enabled) return false;
    setAssistantMood("speaking");
    const ok = speakIndonesian(text);
    window.setTimeout(() => setAssistantMood("idle"), 1600);
    if (!ok) addToast("Suara AI belum didukung browser ini. Jawaban teks tetap tersedia.", "info");
    return ok;
  }, [addToast, voice.enabled]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", theme === "dark" || (theme === "system" && prefersDark));
  }, [theme]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      addToast("Online kembali. Jadwal bisa diperbarui.", "success");
    };
    const onOffline = () => {
      setIsOnline(false);
      addToast("Offline - memakai data terakhir.", "info");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [addToast]);

  useEffect(() => {
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  useEffect(() => {
    if (!dnd.enabled || !dnd.until) return;
    const until = new Date(dnd.until).getTime();
    if (Number.isNaN(until) || until <= Date.now()) {
      setDnd({ enabled: false, until: null });
    }
  }, [clock, dnd, setDnd]);

  const adjustedSchedule = useMemo<PrayerSchedule | null>(() => {
    if (!schedule) return null;
    return {
      ...schedule,
      timings: Object.fromEntries(prayerNames.map((name) => [name, adjustPrayerTime(schedule.timings[name], prayerAdjustments[name] ?? 0)])) as Record<PrayerName, string>,
    };
  }, [prayerAdjustments, schedule]);

  const prayerTimes = useMemo<PrayerTime[]>(() => {
    if (!adjustedSchedule) return [];
    return prayerNames.map((name) => ({ name, time: adjustedSchedule.timings[name] })).filter((item) => Boolean(item.time));
  }, [adjustedSchedule]);

  const todayKey = localDateKey(clock);
  const completedToday = tracker[todayKey] ?? [];
  const stats = monthlyStats(tracker);
  const qibla = qiblaDirection(coords.lat, coords.lon);

  const nextPrayer = useMemo(() => {
    if (!prayerTimes.length) return null;
    const candidates = prayerTimes
      .map((item) => {
        const parsed = parseClockTime(item.time);
        if (!parsed) return null;
        const date = new Date(clock);
        date.setHours(parsed.hour, parsed.minute, 0, 0);
        return { ...item, date };
      })
      .filter(Boolean) as Array<PrayerTime & { date: Date }>;
    const upcoming = candidates.find((item) => item.date.getTime() > clock.getTime());
    if (upcoming) return upcoming;
    const subuh = candidates[0];
    if (!subuh) return null;
    const tomorrow = new Date(subuh.date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { ...subuh, date: tomorrow };
  }, [clock, prayerTimes]);

  const dailyReminderText = dailyReminders[Number(todayKey.slice(-2)) % dailyReminders.length];

  const fetchPrayerSchedule = useCallback(async () => {
    setScheduleStatus("loading");
    if (!navigator.onLine) {
      setScheduleStatus(schedule ? "cached" : "error");
      addToast("Offline - memakai jadwal terakhir.", "info");
      return;
    }
    try {
      const url = `https://api.aladhan.com/v1/timings?latitude=${coords.lat}&longitude=${coords.lon}&method=${method}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Prayer API failed");
      const json = (await response.json()) as {
        data?: {
          timings?: Record<string, string>;
          date?: { hijri?: { day?: string; year?: string; month?: { en?: string; number?: number } } };
        };
      };
      const data = json.data;
      const timings = data?.timings;
      if (!timings) throw new Error("No timings");
      const hijri = data?.date?.hijri;
      const nextSchedule: PrayerSchedule = {
        dateKey: todayKey,
        city: coords.city,
        source: coords.source,
        timings: {
          Subuh: cleanTiming(timings.Fajr) ?? "",
          Dzuhur: cleanTiming(timings.Dhuhr) ?? "",
          Ashar: cleanTiming(timings.Asr) ?? "",
          Maghrib: cleanTiming(timings.Maghrib) ?? "",
          Isya: cleanTiming(timings.Isha) ?? "",
        },
        hijri: hijri
          ? {
              day: hijri.day ?? "",
              month: hijri.month?.en ?? "",
              year: hijri.year ?? "",
            }
          : undefined,
        fetchedAt: new Date().toISOString(),
      };
      setSchedule(nextSchedule);
      setScheduleStatus("active");
      addLog({ type: "schedule", title: "Prayer schedule loaded", status: "success" });
    } catch {
      setScheduleStatus(schedule ? "cached" : "error");
      addLog({ type: "schedule", title: "Prayer schedule load failed", status: "failed", reason: "API unavailable or offline" });
      addToast("Jadwal sholat gagal dimuat. Data cache tetap dipakai jika tersedia.", "error");
    }
  }, [addLog, addToast, coords, method, schedule, setSchedule, todayKey]);

  useEffect(() => {
    fetchPrayerSchedule();
  }, [coords.lat, coords.lon, method]);

  const scheduler = usePrayerNotificationScheduler({
    prayerTimes,
    notifications: featureFlags.strongReminders ? notifications : { ...notifications, repeatMode: "off" },
    voice,
    dnd,
    adzanAudio: featureFlags.adzanSound ? adzanAudio : { ...adzanAudio, enabled: false, source: "off" },
    prayerSoundModes,
    audioUnlocked,
    completedPrayers: tracker,
    reminders,
    onSetReminders: setReminders,
    onToast: addToast,
    onPrayerBanner: setPrayerBanner,
    onReminderBanner: setReminderBanner,
    onLog: addLog,
    onAdzanAudioResult: setAdzanAudio,
  });

  useEffect(() => {
    addLog({ type: "scheduler", title: "Sistem pengingat diperiksa", status: "success" });
    scheduler.runCheck();
  }, []);

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      addToast("Browser ini belum mendukung notifikasi.", "error");
      addLog({ type: "permission", title: "Notification API unsupported", status: "failed" });
      return;
    }
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
    if (result === "granted") {
      setNotifications((current) => ({ ...current, enabled: true }));
      addToast("Notifikasi sholat aktif.", "success");
    } else if (result === "denied") {
      addToast("Izin notifikasi ditolak. Aktifkan dari pengaturan browser.", "error");
      addLog({ type: "permission", title: "Notification permission denied", status: "failed" });
    }
  };

  const sendTestNotification = () => {
    const sent = createNotification("WaktuAI - Tes Notifikasi", "Jika muncul, notifikasi web aktif saat aplikasi terbuka.");
    setLastTestResult(sent ? "Tes berhasil dikirim." : "Tes memakai fallback in-app. Periksa izin notifikasi.");
    addToast(sent ? "Notifikasi tes dikirim." : "Fallback in-app ditampilkan. Izin browser belum granted.", sent ? "success" : "info");
    addLog({ type: "test", title: "Test notification sent", status: sent ? "success" : "skipped", reason: sent ? "Browser notification sent" : "In-app fallback only" });
  };

  const testPrayerNotification = (prayer: PrayerName) => {
    const time = adjustedSchedule?.timings[prayer] ?? "--:--";
    const title = `WaktuAI - Waktu ${prayer}`;
    const body = `Sudah masuk waktu ${prayer}. Yuk sholat.`;
    const sent = createNotification(title, body);
    addToast(sent ? `Preview notifikasi ${prayer} dikirim.` : `${title}: ${body}`, sent ? "success" : "info");
    addLog({ type: "test", title: `Preview notification ${prayer}`, status: sent ? "success" : "skipped", reason: sent ? `At ${time}` : "In-app preview only" });
  };

  const testPrayerSound = async (prayer: PrayerName) => {
    const mode = prayerSoundModes[prayer] ?? "full";
    if (mode === "off" || mode === "silent") {
      addToast(`Mode suara ${prayer}: ${mode === "off" ? "off" : "silent notification"}.`, "info");
      return;
    }
    const settings = mode === "voice" ? { ...adzanAudio, enabled: true, source: "voice" as const } : adzanAudio;
    const result = await playSelectedAdzanSound({ prayerName: prayer, mode: "test", settings });
    setAudioUnlocked(result.ok);
    setAdzanAudio((current) => ({ ...current, lastTestResult: result.ok ? `Tes suara ${prayer} berhasil: ${result.source ?? "audio"}.` : result.reason ?? "Tes suara gagal.", lastFailedReason: result.ok ? undefined : result.reason }));
    addToast(result.ok ? `Suara ${prayer} dites.` : result.reason ?? "Suara gagal dites.", result.ok ? "success" : "error");
  };

  const scheduleOneMinuteTest = () => {
    const date = new Date(Date.now() + 60_000);
    const reminder: Reminder = {
      id: `${Date.now()}-test`,
      title: "Tes pengingat 1 menit WaktuAI",
      dateTime: date.toISOString(),
      status: "scheduled",
      createdAt: new Date().toISOString(),
      repeat: "once",
      firedKeys: [],
      snoozeCount: 0,
      history: ["Tes 1 menit dijadwalkan"],
    };
    setReminders((items) => [reminder, ...items]);
    addToast("Tes 1 menit dijadwalkan. Biarkan WaktuAI tetap terbuka.", "success");
    addLog({ type: "reminder", title: "Scheduled 1 minute test", status: "success" });
  };

  const activateSubuhWake = () => {
    const subuh = adjustedSchedule?.timings.Subuh;
    const parsed = subuh ? parseClockTime(subuh) : null;
    if (!parsed) {
      addToast("Jadwal Subuh belum tersedia. Muat jadwal dulu.", "error");
      return;
    }
    const date = new Date();
    date.setHours(parsed.hour, parsed.minute - subuhWake.offset, 0, 0);
    if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
    const reminder: Reminder = {
      id: `${Date.now()}-subuh-wake-mode`,
      title: `Mode Bangun Subuh ${subuhWake.offset} menit sebelum Subuh`,
      dateTime: date.toISOString(),
      status: "scheduled",
      createdAt: new Date().toISOString(),
      repeat: "daily",
      firedKeys: [],
      snoozeCount: 0,
      repeatCount: 0,
      alarmMode: subuhWake.soundMode !== "silent",
      done: false,
      history: ["Mode Bangun Subuh aktif"],
    };
    setSubuhWake((current) => ({ ...current, enabled: true }));
    setReminders((items) => [reminder, ...items]);
    addToast(`Mode Bangun Subuh aktif: ${formatClock(date, timeFormat)}.`, "success");
  };

  const copyDebugReport = async () => {
    const report = [
      "WaktuAI Debug Report",
      "Version: 2.1.0",
      `User agent: ${navigator.userAgent}`,
      `Notification permission: ${getNotificationPermission()}`,
      `SpeechSynthesis: ${"speechSynthesis" in window ? "supported" : "unsupported"}`,
      `SpeechRecognition: ${"SpeechRecognition" in window || "webkitSpeechRecognition" in window ? "supported" : "unsupported"}`,
      `Camera: ${navigator.mediaDevices && "getUserMedia" in navigator.mediaDevices ? "supported" : "unsupported"}`,
      `Geolocation: ${navigator.geolocation ? "supported" : "unsupported"}`,
      `Secure context: ${window.isSecureContext ? "yes" : "no"}`,
      `Online: ${navigator.onLine ? "yes" : "no"}`,
      `City: ${coords.city} (${coords.source})`,
      `Schedule status: ${scheduleStatus}`,
      `Last scheduler check: ${scheduler.lastCheckAt ?? "never"}`,
      `Last audio result: ${adzanAudio.lastTestResult}`,
    ].join("\n");
    setLastDebugReport(report);
    try {
      await navigator.clipboard?.writeText(report);
      addToast("Debug report disalin.", "success");
    } catch {
      addToast("Clipboard tidak tersedia. Report ditampilkan di bawah.", "info");
    }
  };

  const clearCacheItem = (kind: "prayer" | "sent" | "sound" | "all-cache") => {
    if (!window.confirm("Hapus cache yang dipilih? Pengaturan utama tidak ikut dihapus kecuali cache terkait.")) return;
    if (kind === "prayer" || kind === "all-cache") localStorage.removeItem("waktuai.prayerSchedule");
    if (kind === "sent" || kind === "all-cache") localStorage.removeItem("waktuai.sentNotificationKeys");
    if (kind === "sound" || kind === "all-cache") localStorage.removeItem("waktuai.adzanSoundCounts");
    addToast("Cache dibersihkan.", "success");
  };

  const testVoice = () => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setLastVoiceResult("SpeechSynthesis tidak didukung browser ini.");
      addToast("Browser ini belum mendukung suara AI.", "error");
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance("Halo, ini suara WaktuAI. Pengingat sholat aktif.");
      const voices = window.speechSynthesis.getVoices();
      const idVoice = voices.find((item) => item.lang.toLowerCase().startsWith("id"));
      if (idVoice) utterance.voice = idVoice;
      utterance.lang = idVoice?.lang ?? "id-ID";
      utterance.rate = voice.rate === "slow" ? 0.85 : voice.rate === "fast" ? 1.15 : 1;
      window.speechSynthesis.speak(utterance);
      setVoice((current) => ({ ...current, enabled: true }));
      setLastVoiceResult("Suara AI dites. Jika tidak terdengar, browser mungkin memblokir autoplay sampai ada interaksi.");
      addToast("Tes suara AI dijalankan.", "success");
      addLog({ type: "voice", title: "Voice AI test", status: "success" });
    } catch {
      setLastVoiceResult("Suara gagal diputar di browser ini.");
      addToast("Suara AI gagal diputar.", "error");
    }
  };

  const playBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("AudioContext unavailable");
      const ctx = new AudioContextClass();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 660;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.18);
      addToast("Beep tes diputar.", "success");
    } catch {
      addToast("Audio web dibatasi browser ini. Tes Suara AI tetap bisa dicoba.", "error");
    }
  };

  const toggleWakeLock = async () => {
    if (!featureFlags.wakeLock) {
      setWakeLockStatus("unsupported");
      addToast("Wake Lock dimatikan dari Feature Toggles.", "info");
      return;
    }
    if (wakeLockRef.current) {
      await wakeLockRef.current.release().catch(() => undefined);
      wakeLockRef.current = null;
      setWakeLockStatus("off");
      return;
    }
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } }).wakeLock;
    if (!wakeLock) {
      setWakeLockStatus("unsupported");
      addToast("Wake Lock belum didukung browser ini.", "info");
      return;
    }
    try {
      const sentinel = await wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      setWakeLockStatus("active");
      sentinel.addEventListener("release", () => setWakeLockStatus(document.visibilityState === "visible" ? "off" : "paused"));
      addToast("Layar akan dijaga tetap menyala selama tab aktif.", "success");
    } catch {
      setWakeLockStatus("paused");
      addToast("Wake Lock tidak bisa diaktifkan. Browser mungkin membatasi fitur ini.", "error");
    }
  };

  useEffect(() => {
    const restoreWakeLock = () => {
      if (document.visibilityState !== "visible" || wakeLockStatus !== "paused") return;
      void toggleWakeLock();
    };
    document.addEventListener("visibilitychange", restoreWakeLock);
    return () => {
      document.removeEventListener("visibilitychange", restoreWakeLock);
      void wakeLockRef.current?.release().catch(() => undefined);
    };
  }, [wakeLockStatus]);

  const markPrayerDone = (name: PrayerName) => {
    setTracker((current) => {
      const existing = current[todayKey] ?? [];
      return existing.includes(name) ? current : { ...current, [todayKey]: [...existing, name] };
    });
    if (prayerBanner?.prayer === name) setPrayerBanner(null);
    addToast(`${name} ditandai selesai.`, "success");
  };

  const snoozePrayer = (minutes: 5 | 10 | 15) => {
    if (!prayerBanner) return;
    const date = new Date(Date.now() + minutes * 60_000);
    const reminder: Reminder = {
      id: `${Date.now()}-${prayerBanner.prayer}-snooze`,
      title: `Tunda pengingat ${prayerBanner.prayer}`,
      dateTime: date.toISOString(),
      status: "scheduled",
      createdAt: new Date().toISOString(),
      repeat: "once",
      firedKeys: [],
      snoozeCount: 1,
      history: [`Ditunda ${minutes} menit`],
    };
    setReminders((items) => [reminder, ...items]);
    setPrayerBanner(null);
    addToast(`Pengingat ${prayerBanner.prayer} ditunda ${minutes} menit.`, "success");
  };

  const addReminderFromText = (text: string) => {
    if (/bangunin.*subuh|alarm subuh|sebelum subuh/.test(text.toLowerCase())) {
      const subuh = adjustedSchedule?.timings.Subuh;
      const parsedSubuh = subuh ? parseClockTime(subuh) : null;
      if (!parsedSubuh) {
        addToast("Jadwal Subuh belum tersedia. Muat jadwal atau pilih kota dulu.", "error");
        return;
      }
      const offsetMatch = text.match(/(\d+)\s*menit/);
      const offset = offsetMatch ? Number(offsetMatch[1]) : 30;
      const date = new Date();
      date.setHours(parsedSubuh.hour, parsedSubuh.minute - offset, 0, 0);
      if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
      const reminder: Reminder = {
        id: `${Date.now()}-subuh-wakeup`,
        title: `Bangunin ${offset} menit sebelum Subuh`,
        dateTime: date.toISOString(),
        status: "scheduled",
        createdAt: new Date().toISOString(),
        repeat: "once",
        firedKeys: [],
        snoozeCount: 0,
        alarmMode: true,
        repeatCount: 0,
        done: false,
        history: ["Bangun Subuh dijadwalkan"],
      };
      setReminders((items) => [reminder, ...items]);
      setAssistantReply(`Siap, aku akan ingatkan ${offset} menit sebelum Subuh.`);
      addToast(`Reminder Subuh dibuat ${offset} menit sebelumnya.`, "success");
      return;
    }
    const parsed = parseReminderInput(text, new Date(), adjustedSchedule?.timings ?? {}, timeFormat);
    if (!parsed) {
      addToast("Aku belum paham waktu reminder itu. Coba: ingatkan aku 17:46.", "error");
      return;
    }
    setReminders((items) => [parsed.reminder, ...items]);
    setReminderInput("");
    setAssistantReply(parsed.response);
    addToast(parsed.response, "success");
    addLog({ type: "reminder", title: parsed.reminder.title, status: "success", reason: "Reminder scheduled" });
  };

  const snoozeReminder = (id: string, minutes: 5 | 10 | 15) => {
    setReminders((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              dateTime: new Date(Date.now() + minutes * 60_000).toISOString(),
              status: "scheduled",
              snoozeCount: clampNumber(item.snoozeCount + 1, 0, 3),
              history: [...item.history, `Ditunda ${minutes} menit`].slice(-12),
            }
          : item,
      ),
    );
    setReminderBanner(null);
    addToast(`Reminder ditunda ${minutes} menit.`, "success");
  };

  const deleteReminder = (id: string) => {
    setReminders((items) => items.filter((item) => item.id !== id));
    if (reminderBanner?.reminderId === id) setReminderBanner(null);
    addToast("Reminder dihapus.", "success");
  };

  const completeReminder = (id: string) => {
    setReminders((items) => items.map((item) => (item.id === id ? { ...item, status: "done" } : item)));
    setReminderBanner(null);
    addToast("Reminder selesai.", "success");
  };

  const requestGps = () => {
    if (!window.isSecureContext) {
      addToast("Deteksi lokasi membutuhkan HTTPS atau localhost.", "error");
      return;
    }
    if (!navigator.geolocation) {
      addToast("Browser ini belum mendukung lokasi. Pilih kota manual.", "error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          city: "Lokasi GPS",
          source: "GPS",
          accuracy: position.coords.accuracy,
          updatedAt: new Date().toISOString(),
        });
        addToast("Lokasi GPS diperbarui.", "success");
      },
      (error) => {
        addToast(error.code === error.PERMISSION_DENIED ? "Izin lokasi ditolak. Kamu tetap bisa pilih kota manual." : "GPS gagal. Pilih kota manual tetap bisa.", "error");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 300_000 },
    );
  };

  const setManualCity = (city: string) => {
    const item = cityOptions[city];
    setCoords({ lat: item.lat, lon: item.lon, city, source: "Manual city", updatedAt: new Date().toISOString() });
    addToast(`Kota diubah ke ${city}.`, "success");
  };

  const requestOrientation = async () => {
    const orientationApi = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    try {
      if (orientationApi?.requestPermission) {
        const result = await orientationApi.requestPermission();
        if (result !== "granted") {
          addToast("Izin kompas ditolak. Derajat kiblat tetap ditampilkan.", "error");
          return;
        }
      }
      addToast("Kompas visual aktif jika sensor tersedia.", "success");
    } catch {
      addToast("Sensor kompas tidak tersedia. Derajat kiblat tetap bisa dipakai.", "info");
    }
  };

  useEffect(() => {
    const onOrientation = (event: DeviceOrientationEvent) => {
      const heading = event.alpha ?? 0;
      setOrientation(heading);
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, []);

  const startCamera = async () => {
    if (!featureFlags.camera) {
      setCameraStatus("model-unavailable");
      addToast("Camera features dimatikan dari Feature Toggles. Hitung manual tetap bisa.", "info");
      return;
    }
    if (safeMode) {
      setCameraStatus("model-unavailable");
      addToast("Mode aman aktif. Kamera dinonaktifkan, hitung manual tetap bisa.", "info");
      return;
    }
    if (!window.isSecureContext) {
      setCameraStatus("insecure");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unavailable");
      return;
    }
    setCameraStatus("requesting");
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15, max: 20 },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      }
      mediaStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraStatus("active");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setCameraStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
    }
  };

  const stopCamera = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraStatus("idle");
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const microphone = useSpeechRecognition({
    onFinalResult: (text) => {
      setCommand(text);
      handleCommand(text);
    },
    onStart: () => setAssistantMood("listening"),
    onSuccess: () => setAssistantMood("thinking"),
    onError: () => setAssistantMood("error"),
  });

  const runQuickAction = (action: string) => {
    const lower = action.toLowerCase();
    if (lower.includes("jadwal")) setActiveTab("prayer");
    else if (lower.includes("adzan")) setAssistantReply(nextPrayer ? `Adzan berikutnya ${nextPrayer.name} jam ${formatClock(nextPrayer.date, timeFormat)}.` : "Jadwal belum dimuat.");
    else if (lower.includes("reminder")) setActiveTab("reminder");
    else if (lower.includes("kiblat")) setActiveTab("prayer");
    else if (lower.includes("notifikasi")) sendTestNotification();
    else if (lower.includes("rakaat")) setActiveTab("rakaat");
    else if (lower.includes("tasbih")) setActiveTab("prayer");
  };

  const handleCommand = (text = command) => {
    if (/matikan mode bangun subuh|mode bangun subuh off/.test(text.toLowerCase())) {
      setSubuhWake((current) => ({ ...current, enabled: false }));
      const response = "Mode Bangun Subuh dimatikan.";
      setAssistantReply(response);
      speakAssistant(response);
      setCommand("");
      return;
    }
    const parsed = parseCommand(text);
    let commandResponse = "Perintah dijalankan.";
    let commandStatus: CommandHistoryItem["status"] = "success";
    setAssistantMood("thinking");
    setTroubleshootTopic(null);
    if (parsed.intent === "HELP") {
      commandResponse = "Tenang, aku bantu. Kamu bisa tanya jam, jadwal sholat, arah kiblat, buat reminder, aktifkan notifikasi, hitung rakaat, dan pakai tasbih.";
      setAssistantReply(commandResponse);
    } else if (parsed.intent === "TROUBLESHOOT") {
      setTroubleshootTopic(parsed.text);
      commandResponse = "Aku bantu cek pelan-pelan. Pilih tombol diagnostik yang sesuai.";
      setAssistantReply(commandResponse);
    } else if (parsed.intent === "TEST_NOTIFICATION") {
      sendTestNotification();
      commandResponse = "Tes notifikasi dikirim atau fallback in-app ditampilkan.";
      setAssistantReply(commandResponse);
    }
    else if (parsed.intent === "TEST_AI_VOICE") {
      testVoice();
      commandResponse = "Tes Suara AI dijalankan.";
      setAssistantReply(commandResponse);
    }
    else if (parsed.intent === "ENABLE_PRAYER_NOTIFICATIONS") {
      requestNotificationPermission();
      commandResponse = "Aku minta izin notifikasi dari browser. Pilih izinkan kalau muncul.";
      setAssistantReply(commandResponse);
    }
    else if (parsed.intent === "DISABLE_PRAYER_NOTIFICATIONS") {
      setNotifications((current) => ({ ...current, enabled: false }));
      addToast("Semua notifikasi sholat dimatikan.", "success");
      commandResponse = "Semua notifikasi sholat dimatikan.";
      setAssistantReply(commandResponse);
    } else if (parsed.intent === "ENABLE_STRONG_REMINDER") {
      setNotifications((current) => ({ ...current, repeatMode: "strong" }));
      commandResponse = "Mode pengingat kuat aktif. Pengingat tetap dibatasi agar tidak spam.";
      setAssistantReply(commandResponse);
    }
    else if (parsed.intent === "DISABLE_STRONG_REMINDER") {
      setNotifications((current) => ({ ...current, repeatMode: "off" }));
      commandResponse = "Pengingat berulang dimatikan.";
      setAssistantReply(commandResponse);
    }
    else if (parsed.intent === "CREATE_REMINDER") {
      addReminderFromText(text);
      commandResponse = "Reminder diproses. Cek daftar reminder untuk detailnya.";
    }
    else if (parsed.intent === "QIBLA") {
      setActiveTab("prayer");
      commandResponse = `Arah kiblat sekitar ${Math.round(qibla)} derajat dari utara. Aku buka tab Sholat.`;
      setAssistantReply(commandResponse);
    }
    else if (parsed.intent === "START_RAKAAT_DETECTION") {
      setActiveTab("rakaat");
      startCamera();
      commandResponse = "Aku buka tab Rakaat dan mencoba kamera. Hitung manual tetap bisa dipakai.";
      setAssistantReply(commandResponse);
    } else if (parsed.intent === "FALLBACK_MANUAL_RAKAAT") {
      setActiveTab("rakaat");
      commandResponse = "Aku buka hitung rakaat manual. Tombol tambah, kurang, reset, dan selesai bisa langsung dipakai.";
      setAssistantReply(commandResponse);
    }
    else if (parsed.intent === "MARK_PRAYER_DONE") {
      const found = prayerNames.find((name) => parsed.text.includes(name.toLowerCase()));
      const target = found ?? nextPrayer?.name ?? "Isya";
      markPrayerDone(target);
      commandResponse = `${target} ditandai selesai.`;
      setAssistantReply(commandResponse);
    } else if (parsed.intent === "TASBIH") {
      setActiveTab("prayer");
      commandResponse = "Aku buka tasbih di tab Sholat.";
      setAssistantReply(commandResponse);
    }
    else if (parsed.intent === "RESET_TASBIH") {
      setTasbih((current) => ({ ...current, count: 0 }));
      commandResponse = "Tasbih direset ke nol.";
      setAssistantReply(commandResponse);
    }
    else if (parsed.intent === "DND_ON") {
      const until = new Date(Date.now() + (parsed.text.includes("1 jam") ? 60 : 30) * 60_000);
      setDnd({ enabled: true, until: until.toISOString() });
      addToast(`Jangan ganggu aktif sampai ${formatClock(until, timeFormat)}.`, "success");
      commandResponse = `Mode jangan ganggu aktif sampai ${formatClock(until, timeFormat)}.`;
      setAssistantReply(commandResponse);
    } else if (parsed.intent === "DND_OFF") {
      setDnd({ enabled: false, until: null });
      commandResponse = "Mode jangan ganggu dimatikan.";
      setAssistantReply(commandResponse);
    }
    else if (parsed.intent === "SAFE_MODE") {
      setSafeMode(true);
      setNotifications((current) => ({ ...current, repeatMode: "off" }));
      setVoice((current) => ({ ...current, enabled: false }));
      stopCamera();
      addToast("Mode aman aktif. Kamera, suara otomatis, dan pengingat kuat dimatikan.", "success");
      commandResponse = "Mode aman aktif. Kamera, suara otomatis, dan pengingat kuat dimatikan.";
      setAssistantReply(commandResponse);
    } else if (parsed.intent === "NEXT_PRAYER") {
      commandResponse = nextPrayer ? `Berikutnya ${nextPrayer.name} jam ${formatClock(nextPrayer.date, timeFormat)}, ${durationText(nextPrayer.date.getTime() - clock.getTime())} lagi.` : "Jadwal belum dimuat.";
      setAssistantReply(commandResponse);
    } else if (parsed.intent === "CURRENT_TIME") {
      commandResponse = `Sekarang jam ${formatClock(clock, timeFormat)}.`;
      setAssistantReply(commandResponse);
    } else if (parsed.intent === "CURRENT_DATE") {
      commandResponse = `Hari ini ${displayDate(clock)}.`;
      setAssistantReply(commandResponse);
    } else if (parsed.intent === "ALL_PRAYER_TIMES") {
      commandResponse = prayerTimes.length
        ? `Jadwal sholat hari ini: ${prayerTimes.map((item) => `${item.name} ${formatClock(item.time, timeFormat)}`).join(", ")}.`
        : "Jadwal sholat belum dimuat. Pilih kota atau gunakan lokasi dulu.";
      setAssistantReply(commandResponse);
    } else if (parsed.intent === "PRAYER_TIME") {
      const found = prayerTimes.find((item) => parsed.text.includes(item.name.toLowerCase()));
      commandResponse = found ? `${found.name} jam ${formatClock(found.time, timeFormat)}.` : "Jadwal belum dimuat.";
      setAssistantReply(commandResponse);
    } else {
      commandStatus = "error";
      commandResponse = `Aku belum paham perintah itu. Coba: ${suggestedCommands.join(", ")}.`;
      setAssistantReply(commandResponse);
    }
    if (text.trim()) {
      setCommandHistory((items) => [
        { id: `${Date.now()}`, command: text.trim(), intent: parsed.intent, response: commandResponse, status: commandStatus, time: new Date().toISOString() },
        ...items,
      ].slice(0, 20));
    }
    if (parsed.intent !== "TEST_AI_VOICE" && commandResponse) {
      speakAssistant(commandResponse);
    }
    window.setTimeout(() => setAssistantMood("idle"), 1200);
    setCommand("");
  };

  const exportSettings = async () => {
    const payload = JSON.stringify(
      {
        version: 2,
        coords,
        notifications,
        voice,
        reminders,
        tracker,
        theme,
        tasbih,
        dnd,
        timeFormat,
        quickActions,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard?.writeText(payload);
      addToast("Backup disalin ke clipboard.", "success");
    } catch {
      setImportText(payload);
      addToast("Clipboard tidak tersedia. Teks backup ditampilkan di kotak import.", "info");
    }
  };

  const importSettings = () => {
    if (!window.confirm("Import akan menimpa pengaturan lokal WaktuAI. Lanjutkan?")) return;
    try {
      const data = JSON.parse(importText) as Partial<{
        coords: Coordinates;
        notifications: WebNotificationSettings;
        voice: VoiceSettings;
        reminders: Reminder[];
        tracker: PrayerTracker;
        theme: ThemeMode;
        tasbih: TasbihState;
        dnd: DndSettings;
        timeFormat: TimeFormat;
        quickActions: string[];
      }>;
      if (data.coords) setCoords(data.coords);
      if (data.notifications) setNotifications(data.notifications);
      if (data.voice) setVoice(data.voice);
      if (Array.isArray(data.reminders)) setReminders(data.reminders);
      if (data.tracker) setTracker(data.tracker);
      if (data.theme) setTheme(data.theme);
      if (data.tasbih) setTasbih(data.tasbih);
      if (data.dnd) setDnd(data.dnd);
      if (data.timeFormat) setTimeFormat(data.timeFormat);
      if (Array.isArray(data.quickActions)) setQuickActions(data.quickActions);
      addToast("Pengaturan berhasil diimport.", "success");
    } catch {
      addToast("JSON import tidak valid.", "error");
    }
  };

  const resetAllSettings = () => {
    if (!window.confirm("Reset semua pengaturan WaktuAI di browser ini?")) return;
    Object.keys(localStorage).filter((key) => key.startsWith("waktuai.")).forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  };

  const addDailyNote = () => {
    const text = newNote.trim();
    if (!text) return;
    setNotes((current) => ({
      ...current,
      [todayKey]: [{ id: `${Date.now()}`, text, done: false }, ...(current[todayKey] ?? [])],
    }));
    setNewNote("");
  };

  const cameraMessage = {
    idle: "Kamera belum aktif.",
    requesting: "Meminta izin kamera.",
    active: "Kamera aktif. Deteksi otomatis belum tersedia di browser/perangkat ini. Hitung manual tetap bisa digunakan.",
    denied: "Izin kamera ditolak. Hitung rakaat manual tetap bisa dipakai.",
    unavailable: "Kamera tidak tersedia. Hitung manual tetap bisa dipakai.",
    "model-unavailable": "Deteksi otomatis belum tersedia di browser/perangkat ini. Hitung manual tetap bisa digunakan.",
    insecure: "Kamera hanya bisa dipakai di HTTPS atau localhost.",
  }[cameraStatus];

  const notificationStatusText =
    notificationPermission === "unsupported" ? "unsupported" : notificationPermission === "granted" && notifications.enabled ? "aktif" : notificationPermission;

  return (
    <div className="min-h-screen bg-page pb-28 text-ink md:pb-8">
      {!isOnline ? (
        <div className="sticky top-0 z-40 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950">Offline - memakai data terakhir</div>
      ) : null}

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <div>
          <p className="text-sm font-semibold text-brand">WaktuAI Web</p>
          <h1 className="text-2xl font-black tracking-normal">Asisten Sholat</h1>
        </div>
        <Button variant="soft" onClick={() => setActiveTab("settings")} aria-label="Buka pengaturan">
          {notificationStatusText}
        </Button>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-4 px-4">
        {activeTab === "home" ? (
          <HomeTab
            clock={clock}
            nextPrayer={nextPrayer}
            schedule={adjustedSchedule}
            scheduleStatus={scheduleStatus}
            completedToday={completedToday}
            reminders={reminders}
            notificationStatus={notificationStatusText}
            voice={voice}
            dailyReminderText={dailyReminderText}
            command={command}
            setCommand={setCommand}
            handleCommand={handleCommand}
            assistantReply={assistantReply}
            troubleshootTopic={troubleshootTopic}
            runQuickAction={runQuickAction}
            quickActions={quickActions}
            setActiveTab={setActiveTab}
            markPrayerDone={markPrayerDone}
            fetchPrayerSchedule={fetchPrayerSchedule}
            timeFormat={timeFormat}
            qibla={qibla}
            rakaatTarget={rakaat.target}
            stats={stats}
            dismissedTips={dismissedTips}
            setDismissedTips={setDismissedTips}
            requestNotificationPermission={requestNotificationPermission}
            testVoice={testVoice}
            sendTestNotification={sendTestNotification}
            requestGps={requestGps}
            dashboardWidgets={dashboardWidgets}
            checklists={checklists}
            setChecklists={setChecklists}
            tasbih={tasbih}
            wakeLockStatus={wakeLockStatus}
            toggleWakeLock={toggleWakeLock}
            notificationEnabled={notifications.enabled}
            preReminder={notifications.preReminder}
            commandHistory={commandHistory}
            clearCommandHistory={() => setCommandHistory([])}
            assistantMood={assistantMood}
            microphone={microphone}
            speakAssistant={speakAssistant}
            setVoice={setVoice}
            voiceCommandEnabled={featureFlags.voiceCommand}
          />
        ) : null}

        {activeTab === "prayer" ? (
          <PrayerTab
            schedule={adjustedSchedule}
            scheduleStatus={scheduleStatus}
            fetchPrayerSchedule={fetchPrayerSchedule}
            completedToday={completedToday}
            markPrayerDone={markPrayerDone}
            tracker={tracker}
            stats={stats}
            notifications={notifications}
            setNotifications={setNotifications}
            coords={coords}
            requestGps={requestGps}
            setManualCity={setManualCity}
            qibla={qibla}
            orientation={orientation}
            requestOrientation={requestOrientation}
            tasbih={tasbih}
            setTasbih={setTasbih}
            timeFormat={timeFormat}
            clock={clock}
            method={method}
            lastUpdated={schedule?.fetchedAt ?? null}
            notificationEnabled={notifications.enabled}
            perPrayerNotification={notifications.perPrayer}
            preReminder={notifications.preReminder}
            prayerSoundModes={prayerSoundModes}
            setPrayerSoundModes={setPrayerSoundModes}
            selectedPrayer={selectedPrayer}
            setSelectedPrayer={setSelectedPrayer}
            testPrayerNotification={testPrayerNotification}
            testPrayerSound={testPrayerSound}
            prayerAdjustments={prayerAdjustments}
            setPrayerAdjustments={setPrayerAdjustments}
            clearPrayerCache={() => clearCacheItem("prayer")}
          />
        ) : null}

        {activeTab === "reminder" ? (
          <ReminderTab
            reminderInput={reminderInput}
            setReminderInput={setReminderInput}
            addReminderFromText={addReminderFromText}
            reminders={reminders}
            deleteReminder={deleteReminder}
            completeReminder={completeReminder}
            snoozeReminder={snoozeReminder}
            timeFormat={timeFormat}
            notes={notes[todayKey] ?? []}
            newNote={newNote}
            setNewNote={setNewNote}
            addDailyNote={addDailyNote}
            setNotes={setNotes}
            todayKey={todayKey}
            quranReminder={quranReminder}
            setQuranReminder={setQuranReminder}
          />
        ) : null}

        {activeTab === "rakaat" ? (
          <RakaatTab
            rakaat={rakaat}
            setRakaat={setRakaat}
            cameraStatus={cameraStatus}
            cameraMessage={cameraMessage}
            startCamera={startCamera}
            stopCamera={stopCamera}
            videoRef={videoRef}
          />
        ) : null}

        {activeTab === "settings" ? (
          <SettingsTab
            notificationPermission={notificationPermission}
            requestNotificationPermission={requestNotificationPermission}
            sendTestNotification={sendTestNotification}
            scheduleOneMinuteTest={scheduleOneMinuteTest}
            testVoice={testVoice}
            lastTestResult={lastTestResult}
            lastVoiceResult={lastVoiceResult}
            schedulerStatus={scheduler.schedulerStatus}
            lastCheckAt={scheduler.lastCheckAt}
            schedulerRunCheck={scheduler.runCheck}
            notifications={notifications}
            setNotifications={setNotifications}
            voice={voice}
            setVoice={setVoice}
            adzanAudio={adzanAudio}
            setAdzanAudio={setAdzanAudio}
            audioUnlocked={audioUnlocked}
            setAudioUnlocked={setAudioUnlocked}
            playBeep={playBeep}
            coords={coords}
            requestGps={requestGps}
            setManualCity={setManualCity}
            method={method}
            setMethod={setMethod}
            theme={theme}
            setTheme={setTheme}
            timeFormat={timeFormat}
            setTimeFormat={setTimeFormat}
            dnd={dnd}
            setDnd={setDnd}
            quickActions={quickActions}
            setQuickActions={setQuickActions}
            safeMode={safeMode}
            setSafeMode={setSafeMode}
            history={history}
            setHistory={setHistory}
            importText={importText}
            setImportText={setImportText}
            exportSettings={exportSettings}
            importSettings={importSettings}
            resetAllSettings={resetAllSettings}
            installPrompt={installPrompt}
            setInstallPrompt={setInstallPrompt}
            addToast={addToast}
            reminders={reminders}
            setReminders={setReminders}
            setTracker={setTracker}
            setCoords={setCoords}
            dashboardWidgets={dashboardWidgets}
            setDashboardWidgets={setDashboardWidgets}
            prayerAdjustments={prayerAdjustments}
            setPrayerAdjustments={setPrayerAdjustments}
            commandHistory={commandHistory}
            setCommandHistory={setCommandHistory}
            reminderTone={reminderTone}
            setReminderTone={setReminderTone}
            subuhWake={subuhWake}
            setSubuhWake={setSubuhWake}
            activateSubuhWake={activateSubuhWake}
            testPrayerSound={testPrayerSound}
            testPrayerNotification={testPrayerNotification}
            prayerSoundModes={prayerSoundModes}
            setPrayerSoundModes={setPrayerSoundModes}
            notificationHelpOpen={notificationHelpOpen}
            setNotificationHelpOpen={setNotificationHelpOpen}
            soundHelpOpen={soundHelpOpen}
            setSoundHelpOpen={setSoundHelpOpen}
            copyDebugReport={copyDebugReport}
            lastDebugReport={lastDebugReport}
            clearCacheItem={clearCacheItem}
            featureFlags={featureFlags}
            setFeatureFlags={setFeatureFlags}
            releaseNotesOpen={releaseNotesOpen}
            setReleaseNotesOpen={setReleaseNotesOpen}
            schedule={adjustedSchedule}
          />
        ) : null}
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {prayerBanner ? (
        <div className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-lg rounded-2xl border border-line bg-panel p-3 shadow-soft md:bottom-4">
          <p className="font-bold">{prayerBanner.message}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button variant="primary" onClick={() => markPrayerDone(prayerBanner.prayer)}>Sudah Sholat</Button>
            <Button onClick={() => snoozePrayer(10)}>Tunda 10</Button>
            <Button onClick={() => setPrayerBanner(null)}>Matikan Ini</Button>
          </div>
        </div>
      ) : null}

      {reminderBanner ? (
        <div className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-lg rounded-2xl border border-line bg-panel p-3 shadow-soft md:bottom-4">
          <p className="font-bold">{reminderBanner.title}</p>
          <p className="text-sm text-muted">{reminderBanner.message}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button variant="primary" onClick={() => completeReminder(reminderBanner.reminderId)}>Selesai</Button>
            <Button onClick={() => snoozeReminder(reminderBanner.reminderId, 10)}>Tunda 10</Button>
            <Button onClick={() => deleteReminder(reminderBanner.reminderId)}>Hapus</Button>
          </div>
        </div>
      ) : null}

      <div className="fixed right-3 top-3 z-50 grid gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`max-w-[min(360px,calc(100vw-24px))] rounded-xl px-4 py-3 text-sm font-semibold shadow-soft ${
              toast.tone === "success" ? "bg-emerald-600 text-white" : toast.tone === "error" ? "bg-rose-600 text-white" : "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {!onboardingDone ? (
        <Onboarding
          requestGps={requestGps}
          requestNotificationPermission={requestNotificationPermission}
          testVoice={testVoice}
          finish={() => setOnboardingDone(true)}
          skip={() => setOnboardingDone(true)}
        />
      ) : null}
    </div>
  );
}

function HomeTab(props: {
  clock: Date;
  nextPrayer: (PrayerTime & { date: Date }) | null;
  schedule: PrayerSchedule | null;
  scheduleStatus: string;
  completedToday: PrayerName[];
  reminders: Reminder[];
  notificationStatus: string;
  voice: VoiceSettings;
  dailyReminderText: string;
  command: string;
  setCommand: (value: string) => void;
  handleCommand: (text?: string) => void;
  assistantReply: string | null;
  troubleshootTopic: string | null;
  runQuickAction: (action: string) => void;
  quickActions: string[];
  setActiveTab: (tab: Tab) => void;
  markPrayerDone: (name: PrayerName) => void;
  fetchPrayerSchedule: () => void;
  timeFormat: TimeFormat;
  qibla: number;
  rakaatTarget: number;
  stats: ReturnType<typeof monthlyStats>;
  dismissedTips: string[];
  setDismissedTips: React.Dispatch<React.SetStateAction<string[]>>;
  requestNotificationPermission: () => void;
  testVoice: () => void;
  sendTestNotification: () => void;
  requestGps: () => void;
  dashboardWidgets: WidgetKey[];
  checklists: Record<string, DailyChecklistItem[]>;
  setChecklists: React.Dispatch<React.SetStateAction<Record<string, DailyChecklistItem[]>>>;
  tasbih: TasbihState;
  wakeLockStatus: "off" | "active" | "unsupported" | "paused";
  toggleWakeLock: () => void;
  notificationEnabled: boolean;
  preReminder: 0 | 5 | 10 | 15;
  commandHistory: CommandHistoryItem[];
  clearCommandHistory: () => void;
  assistantMood: "idle" | "listening" | "thinking" | "speaking" | "error";
  microphone: ReturnType<typeof useSpeechRecognition>;
  speakAssistant: (text: string) => boolean;
  setVoice: React.Dispatch<React.SetStateAction<VoiceSettings>>;
  voiceCommandEnabled: boolean;
}) {
  const next = props.nextPrayer;
  const progress = props.completedToday.length;
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const filteredSuggestions = commandSuggestions
    .filter((item) => item.includes(props.command.toLowerCase()) || props.command.trim().length < 2)
    .slice(0, 5);
  const tip = [
    "Kamu bisa ketik: ingatkan aku 17:46",
    "Tekan Tes Notifikasi untuk memastikan alarm aktif.",
    "Kalau kamera gagal, hitung rakaat manual tetap bisa dipakai.",
    "Arah kiblat tetap muncul meski kompas tidak tersedia.",
  ].find((item) => !props.dismissedTips.includes(item));
  return (
    <>
      <section className="card overflow-hidden bg-gradient-to-br from-teal-700 to-slate-900 text-white dark:from-teal-800 dark:to-slate-950">
        {next ? (
          <>
            <p className="text-sm font-semibold text-teal-100">Menuju {next.name}</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-5xl font-black">{formatClock(next.date, props.timeFormat)}</p>
                <p className="mt-2 text-2xl font-bold">{durationText(next.date.getTime() - props.clock.getTime())} lagi</p>
              </div>
              <p className="rounded-full bg-white/15 px-3 py-2 text-sm">{props.schedule?.city ?? "Jakarta"} - {props.schedule?.source ?? "Default Jakarta"}</p>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <Button variant="primary" className="bg-white text-teal-900" onClick={() => props.markPrayerDone(next.name)}>Sudah Sholat</Button>
              <Button className="border-white/20 bg-white/10 text-white" onClick={() => props.handleCommand("tunda 10 menit")}>Tunda</Button>
              <Button className="border-white/20 bg-white/10 text-white" onClick={() => props.setActiveTab("prayer")}>Jadwal</Button>
            </div>
          </>
        ) : (
          <div>
            <h2 className="text-2xl font-black">Jadwal belum dimuat</h2>
            <p className="mt-2 text-teal-100">Muat jadwal sholat untuk melihat adzan berikutnya.</p>
            <Button className="mt-4 bg-white text-teal-900" onClick={props.fetchPrayerSchedule}>Muat Jadwal Sholat</Button>
          </div>
        )}
      </section>

      <LockscreenPrayerCard
        clock={props.clock}
        nextPrayer={next}
        city={props.schedule?.city ?? "Jakarta"}
        notificationStatus={props.notificationStatus}
        wakeLockStatus={props.wakeLockStatus}
        toggleWakeLock={props.toggleWakeLock}
        timeFormat={props.timeFormat}
      />

      <PrayerReadinessCard
        scheduleLoaded={Boolean(props.schedule)}
        notificationEnabled={props.notificationEnabled}
        preReminder={props.preReminder}
        locationSource={props.schedule?.source ?? "Default Jakarta"}
        voiceEnabled={props.voice.enabled}
        hasNextPrayer={Boolean(next)}
        requestNotificationPermission={props.requestNotificationPermission}
        testVoice={props.testVoice}
        sendTestNotification={props.sendTestNotification}
        openSettings={() => props.setActiveTab("settings")}
      />

      <DashboardWidgets
        enabled={props.dashboardWidgets}
        clock={props.clock}
        nextPrayer={next}
        qibla={props.qibla}
        completedCount={progress}
        reminders={props.reminders}
        tasbih={props.tasbih}
        notes={[]}
        notificationStatus={props.notificationStatus}
        voiceEnabled={props.voice.enabled}
        timeFormat={props.timeFormat}
      />

      <DailyChecklistCard
        dateKey={localDateKey(props.clock)}
        itemsByDate={props.checklists}
        setItemsByDate={props.setChecklists}
      />

      <section className="card">
        <SectionTitle title="Ringkasan Hari Ini" subtitle={props.dailyReminderText} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatusItem label="Jam" value={formatClock(props.clock, props.timeFormat)} />
          <StatusItem label="Sholat" value={`${progress}/5 selesai`} />
          <StatusItem label="Reminder" value={`${props.reminders.filter((item) => item.status === "scheduled").length} aktif`} />
          <StatusItem label="Notifikasi" value={props.notificationStatus} />
          <StatusItem label="Suara AI" value={props.voice.enabled ? "aktif" : "nonaktif"} />
          <StatusItem label="Kiblat" value={`${Math.round(props.qibla)}°`} />
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-brand" style={{ width: `${progress * 20}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted">
          {progress === 0 ? "Yuk mulai hari ini pelan-pelan." : progress < 3 ? "Bagus, lanjutkan ya." : progress < 5 ? "Sedikit lagi lengkap." : "MasyaAllah, lengkap hari ini."}
        </p>
      </section>

      <section className="card">
        <SectionTitle title="Widget Cepat" />
        <div className="grid grid-cols-2 gap-3">
          <StatusItem label="Sekarang" value={formatClock(props.clock, props.timeFormat)} />
          <StatusItem label="Berikutnya" value={next ? next.name : "-"} />
          <StatusItem label="Countdown" value={next ? durationText(next.date.getTime() - props.clock.getTime()) : "-"} />
          <StatusItem label="Target rakaat" value={`${props.rakaatTarget}`} />
        </div>
      </section>

      {tip ? (
        <section className="card flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-ink">{tip}</p>
          <Button onClick={() => props.setDismissedTips((items) => [...items, tip])}>Tutup</Button>
        </section>
      ) : null}

      <AssistantVoicePanel
        mood={props.assistantMood}
        reply={props.assistantReply}
        voice={props.voice}
        setVoice={props.setVoice}
        microphone={props.microphone}
        speakAssistant={props.speakAssistant}
        voiceCommandEnabled={props.voiceCommandEnabled}
      />

      <section className="card">
        <SectionTitle title="Perintah Cepat" subtitle="Ketik, pilih tombol, atau pakai mic. Kalau mic gagal, ketik tetap jalan." />
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            props.handleCommand();
          }}
        >
          <input
            className="input"
            value={props.command}
            onChange={(event) => props.setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (!filteredSuggestions.length) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedSuggestion((item) => (item + 1) % filteredSuggestions.length);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedSuggestion((item) => (item - 1 + filteredSuggestions.length) % filteredSuggestions.length);
              } else if (event.key === "Enter" && props.command.trim().length === 0) {
                event.preventDefault();
                props.handleCommand(filteredSuggestions[selectedSuggestion]);
              } else if (event.key === "Escape") {
                props.setCommand("");
              }
            }}
            placeholder="Contoh: ingatkan aku 17:46"
            aria-label="Perintah WaktuAI"
          />
          <Button
            type="button"
            variant={props.microphone.listening ? "primary" : "secondary"}
            onClick={props.voiceCommandEnabled ? (props.microphone.listening ? props.microphone.stop : props.microphone.start) : props.microphone.runDiagnostic}
            aria-label={props.microphone.listening ? "Stop mikrofon" : "Mulai mikrofon"}
          >
            {!props.voiceCommandEnabled ? "Mic Off" : props.microphone.listening ? "Stop Mic" : props.microphone.requesting ? "Izin Mic" : "Mic"}
          </Button>
          <Button variant="primary" type="submit">Kirim</Button>
        </form>
        {props.microphone.interimTranscript || props.microphone.transcript ? (
          <p className="mt-2 rounded-xl border border-line bg-page p-3 text-sm text-muted">
            Mic: {props.microphone.interimTranscript || props.microphone.transcript}
          </p>
        ) : null}
        {props.microphone.error ? (
          <div className="mt-2 rounded-xl bg-rose-950/20 p-3 text-sm text-rose-200 dark:text-rose-100">
            {props.microphone.error}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" onClick={props.microphone.retry}>Coba Mic Lagi</Button>
              <Button type="button" onClick={props.microphone.runDiagnostic}>Diagnostik Mic</Button>
            </div>
          </div>
        ) : null}
        {props.microphone.diagnostics.length ? (
          <div className="mt-2 grid gap-2">
            {props.microphone.diagnostics.map((item) => (
              <div key={item.label} className="rounded-xl border border-line bg-page p-3 text-sm">
                <p className="font-bold">{item.ok ? "OK" : "Perlu cek"} - {item.label}</p>
                <p className="text-muted">{item.detail}</p>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {filteredSuggestions.map((item, index) => (
            <button
              key={item}
              className={`shrink-0 rounded-full border px-3 py-2 text-sm font-semibold ${index === selectedSuggestion ? "border-brand bg-brandSoft text-teal-950 dark:text-teal-50" : "border-line bg-page text-ink"}`}
              onClick={() => props.handleCommand(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {props.assistantReply ? <p className="mt-3 rounded-xl bg-brandSoft p-3 text-sm font-semibold text-teal-950 dark:text-teal-50">{props.assistantReply}</p> : null}
        {props.troubleshootTopic ? (
          <TroubleshootingCards
            topic={props.troubleshootTopic}
            requestNotificationPermission={props.requestNotificationPermission}
            testVoice={props.testVoice}
            sendTestNotification={props.sendTestNotification}
            requestGps={props.requestGps}
            openTab={props.setActiveTab}
          />
        ) : null}
        <CommandCenter runCommand={props.handleCommand} />
        <CommandHistory history={props.commandHistory} runCommand={props.handleCommand} clearHistory={props.clearCommandHistory} timeFormat={props.timeFormat} />
      </section>

      <section className="card">
        <SectionTitle title="Aksi Favorit" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {props.quickActions.map((action) => (
            <Button key={action} onClick={() => props.runQuickAction(action)}>{action}</Button>
          ))}
        </div>
      </section>

      <section className="card">
        <SectionTitle title="Dashboard Islami" />
        <div className="grid gap-2 text-sm">
          <p><span className="font-semibold">Masehi:</span> {displayDate(props.clock)}</p>
          <p><span className="font-semibold">Hijriah:</span> {props.schedule?.hijri ? `${props.schedule.hijri.day} ${props.schedule.hijri.month} ${props.schedule.hijri.year} H` : "Tanggal Hijriah belum tersedia."}</p>
          <p><span className="font-semibold">Streak:</span> {props.stats.activeStreak} hari aktif, lengkap 5 sholat selama {props.stats.fullStreak} hari</p>
        </div>
      </section>
    </>
  );
}

function AssistantVoicePanel(props: {
  mood: "idle" | "listening" | "thinking" | "speaking" | "error";
  reply: string | null;
  voice: VoiceSettings;
  setVoice: React.Dispatch<React.SetStateAction<VoiceSettings>>;
  microphone: ReturnType<typeof useSpeechRecognition>;
  speakAssistant: (text: string) => boolean;
  voiceCommandEnabled: boolean;
}) {
  const moodText = {
    idle: "Siap bantu",
    listening: "Mendengarkan...",
    thinking: "Memproses...",
    speaking: "Suara AI menjawab",
    error: "Mic perlu dicek",
  }[props.mood];
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative mx-auto grid h-28 w-28 shrink-0 place-items-center sm:mx-0">
          <div className={`absolute inset-0 rounded-full bg-brand/20 ${props.mood === "listening" || props.mood === "speaking" ? "animate-ping" : ""}`} />
          <div className="absolute inset-3 rounded-full bg-brandSoft" />
          <div className={`relative h-16 w-16 rounded-full border-4 ${props.mood === "error" ? "border-rose-500" : props.mood === "speaking" ? "border-emerald-400" : "border-brand"} bg-panel shadow-soft`}>
            <div className="absolute left-4 top-5 h-2 w-2 rounded-full bg-brand" />
            <div className="absolute right-4 top-5 h-2 w-2 rounded-full bg-brand" />
            <div className="absolute bottom-4 left-1/2 h-2 w-7 -translate-x-1/2 rounded-full bg-brand" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wide text-brand">Asisten Suara AI</p>
          <h2 className="mt-1 text-xl font-black">{moodText}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {props.reply ?? "Tekan Mic untuk bicara, atau ketik perintah. Jawaban bisa dibacakan kalau Suara AI aktif."}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button
              variant={props.voice.enabled ? "soft" : "secondary"}
              onClick={() => props.setVoice((current) => ({ ...current, enabled: !current.enabled }))}
            >
              Suara {props.voice.enabled ? "On" : "Off"}
            </Button>
            <Button onClick={() => props.reply ? props.speakAssistant(props.reply) : props.speakAssistant("Halo, ini suara WaktuAI. Aku siap membantu.")}>Bacakan</Button>
            <Button variant={props.microphone.listening ? "primary" : "secondary"} onClick={props.voiceCommandEnabled ? (props.microphone.listening ? props.microphone.stop : props.microphone.start) : props.microphone.runDiagnostic}>
              {!props.voiceCommandEnabled ? "Mic Off" : props.microphone.listening ? "Stop Mic" : "Mulai Mic"}
            </Button>
            <Button onClick={props.microphone.runDiagnostic}>Cek Mic</Button>
          </div>
          <p className="mt-2 text-xs text-muted">Voice command web paling stabil di Chrome atau Edge. Kalau mikrofon gagal, ketik perintah tetap bisa dipakai.</p>
        </div>
      </div>
    </section>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-page p-3">
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className="mt-1 break-words text-base font-bold text-ink">{value}</p>
    </div>
  );
}

function LockscreenPrayerCard(props: {
  clock: Date;
  nextPrayer: (PrayerTime & { date: Date }) | null;
  city: string;
  notificationStatus: string;
  wakeLockStatus: "off" | "active" | "unsupported" | "paused";
  toggleWakeLock: () => void;
  timeFormat: TimeFormat;
}) {
  const requestFullscreen = () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      void document.exitFullscreen();
    }
  };
  return (
    <section className="card bg-slate-950 text-white">
      <div className="text-center">
        <p className="text-5xl font-black">{formatClock(props.clock, props.timeFormat)}</p>
        <p className="mt-3 text-sm font-semibold text-slate-300">{props.city} - notifikasi {props.notificationStatus}</p>
        <p className="mt-5 text-lg font-bold">{props.nextPrayer ? `Menuju ${props.nextPrayer.name}` : "Jadwal belum dimuat"}</p>
        <p className="mt-1 text-4xl font-black text-teal-200">{props.nextPrayer ? durationText(props.nextPrayer.date.getTime() - props.clock.getTime()) : "--:--:--"}</p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button className="border-white/20 bg-white/10 text-white" onClick={requestFullscreen}>{document.fullscreenElement ? "Keluar Fullscreen" : "Fullscreen"}</Button>
        <Button className="border-white/20 bg-white/10 text-white" onClick={props.toggleWakeLock}>Wake Lock: {props.wakeLockStatus === "active" ? "Aktif" : props.wakeLockStatus === "unsupported" ? "Tidak didukung" : "Off"}</Button>
      </div>
    </section>
  );
}

function PrayerReadinessCard(props: {
  scheduleLoaded: boolean;
  notificationEnabled: boolean;
  preReminder: 0 | 5 | 10 | 15;
  locationSource: string;
  voiceEnabled: boolean;
  hasNextPrayer: boolean;
  requestNotificationPermission: () => void;
  testVoice: () => void;
  sendTestNotification: () => void;
  openSettings: () => void;
}) {
  const checks = [
    props.notificationEnabled,
    props.preReminder > 0,
    props.scheduleLoaded,
    Boolean(props.locationSource),
    props.voiceEnabled,
    props.hasNextPrayer,
  ];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return (
    <section className="card">
      <SectionTitle title={`Kesiapan pengingat: ${score}%`} subtitle="Berdasarkan status jadwal, lokasi, notifikasi, pre-reminder, suara, dan countdown." />
      <div className="h-3 overflow-hidden rounded-full bg-line"><div className="h-full bg-brand" style={{ width: `${score}%` }} /></div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {!props.notificationEnabled ? <Button onClick={props.requestNotificationPermission}>Aktifkan notifikasi</Button> : null}
        {!props.voiceEnabled ? <Button onClick={props.testVoice}>Tes suara AI</Button> : null}
        <Button onClick={props.sendTestNotification}>Tes notifikasi</Button>
        <Button onClick={props.openSettings}>Buka pengaturan</Button>
      </div>
    </section>
  );
}

function DashboardWidgets(props: {
  enabled: WidgetKey[];
  clock: Date;
  nextPrayer: (PrayerTime & { date: Date }) | null;
  qibla: number;
  completedCount: number;
  reminders: Reminder[];
  tasbih: TasbihState;
  notes: DailyNote[];
  notificationStatus: string;
  voiceEnabled: boolean;
  timeFormat: TimeFormat;
}) {
  const values: Record<WidgetKey, string> = {
    time: formatClock(props.clock, props.timeFormat),
    nextPrayer: props.nextPrayer?.name ?? "-",
    countdown: props.nextPrayer ? durationText(props.nextPrayer.date.getTime() - props.clock.getTime()) : "-",
    qibla: `${Math.round(props.qibla)}°`,
    progress: `${props.completedCount}/5`,
    reminders: `${props.reminders.filter((item) => item.status === "scheduled").length}`,
    tasbih: `${props.tasbih.count}/${props.tasbih.target}`,
    note: props.notes.find((item) => !item.done)?.text ?? "Belum ada",
    notification: props.notificationStatus,
    voice: props.voiceEnabled ? "aktif" : "nonaktif",
  };
  return (
    <section className="card">
      <SectionTitle title="Dashboard Widgets" subtitle="Ringkas, bisa diatur dari Pengaturan." />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {props.enabled.map((key) => <StatusItem key={key} label={widgetLabels[key]} value={values[key]} />)}
      </div>
    </section>
  );
}

function DailyChecklistCard(props: {
  dateKey: string;
  itemsByDate: Record<string, DailyChecklistItem[]>;
  setItemsByDate: React.Dispatch<React.SetStateAction<Record<string, DailyChecklistItem[]>>>;
}) {
  const [customText, setCustomText] = useState("");
  const items = props.itemsByDate[props.dateKey] ?? defaultChecklistTexts.map((text, index) => ({ id: `default-${index}`, text, custom: false, done: false }));
  const done = items.filter((item) => item.done).length;
  const save = (nextItems: DailyChecklistItem[]) => props.setItemsByDate((current) => ({ ...current, [props.dateKey]: nextItems }));
  const addCustom = () => {
    const text = customText.trim();
    if (!text) return;
    save([...items, { id: `${Date.now()}`, text, custom: true, done: false }]);
    setCustomText("");
  };
  return (
    <section className="card">
      <SectionTitle title="Checklist Harian" subtitle={`${Math.round((done / items.length) * 100)}% selesai. Pelan-pelan, cukup tandai yang sudah dilakukan.`} />
      <div className="h-3 overflow-hidden rounded-full bg-line"><div className="h-full bg-brand" style={{ width: `${(done / items.length) * 100}%` }} /></div>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <label key={item.id} className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-line bg-page px-3">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={item.done} onChange={(event) => save(items.map((entry) => entry.id === item.id ? { ...entry, done: event.target.checked } : entry))} />
              <span className={item.done ? "line-through text-muted" : ""}>{item.text}</span>
            </span>
            {item.custom ? <button className="text-sm font-semibold text-rose-600" onClick={() => save(items.filter((entry) => entry.id !== item.id))}>Hapus</button> : null}
          </label>
        ))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); addCustom(); }}>
        <input className="input" value={customText} onChange={(event) => setCustomText(event.target.value)} placeholder="Tambah checklist pribadi" aria-label="Tambah checklist pribadi" />
        <Button variant="primary" type="submit">Tambah</Button>
      </form>
    </section>
  );
}

function CommandHistory(props: {
  history: CommandHistoryItem[];
  runCommand: (command: string) => void;
  clearHistory: () => void;
  timeFormat: TimeFormat;
}) {
  if (!props.history.length) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-bold">Riwayat Command</p>
        <Button onClick={props.clearHistory}>Bersihkan</Button>
      </div>
      <div className="grid gap-2">
        {props.history.slice(0, 5).map((item) => (
          <button key={item.id} className="rounded-xl border border-line bg-page p-3 text-left" onClick={() => props.runCommand(item.command)}>
            <p className="font-semibold">{item.command}</p>
            <p className="text-xs text-muted">{item.intent} - {item.status} - {formatClock(new Date(item.time), props.timeFormat)}</p>
            <p className="mt-1 text-sm text-muted">{item.response}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function PrayerTab(props: {
  schedule: PrayerSchedule | null;
  scheduleStatus: string;
  fetchPrayerSchedule: () => void;
  completedToday: PrayerName[];
  markPrayerDone: (name: PrayerName) => void;
  tracker: PrayerTracker;
  stats: ReturnType<typeof monthlyStats>;
  notifications: WebNotificationSettings;
  setNotifications: React.Dispatch<React.SetStateAction<WebNotificationSettings>>;
  coords: Coordinates;
  requestGps: () => void;
  setManualCity: (city: string) => void;
  qibla: number;
  orientation: number;
  requestOrientation: () => void;
  tasbih: TasbihState;
  setTasbih: React.Dispatch<React.SetStateAction<TasbihState>>;
  timeFormat: TimeFormat;
  clock: Date;
  method: number;
  lastUpdated: string | null;
  notificationEnabled: boolean;
  perPrayerNotification: Record<PrayerName, boolean>;
  preReminder: 0 | 5 | 10 | 15;
  prayerSoundModes: Record<PrayerName, PrayerSoundMode>;
  setPrayerSoundModes: React.Dispatch<React.SetStateAction<Record<PrayerName, PrayerSoundMode>>>;
  selectedPrayer: PrayerName | null;
  setSelectedPrayer: React.Dispatch<React.SetStateAction<PrayerName | null>>;
  testPrayerNotification: (prayer: PrayerName) => void;
  testPrayerSound: (prayer: PrayerName) => Promise<void>;
  prayerAdjustments: PrayerAdjustments;
  setPrayerAdjustments: React.Dispatch<React.SetStateAction<PrayerAdjustments>>;
  clearPrayerCache: () => void;
}) {
  return (
    <>
      <ScheduleAuditCard
        schedule={props.schedule}
        scheduleStatus={props.scheduleStatus}
        coords={props.coords}
        method={props.method}
        lastUpdated={props.lastUpdated}
        qibla={props.qibla}
        nextPrayerName={props.clock ? undefined : undefined}
        refresh={props.fetchPrayerSchedule}
        requestGps={props.requestGps}
        setManualCity={props.setManualCity}
        clearPrayerCache={props.clearPrayerCache}
        timeFormat={props.timeFormat}
      />
      <AdzanTimeline schedule={props.schedule} clock={props.clock} timeFormat={props.timeFormat} />

      <section className="card">
        <SectionTitle title="Jadwal Sholat" subtitle={`Status: ${props.scheduleStatus}`} />
        {props.schedule ? (
          <div className="grid gap-2">
            {prayerNames.map((name) => (
              <div key={name} className="rounded-xl border border-line bg-page p-3">
                <button className="flex w-full items-center justify-between text-left" onClick={() => props.setSelectedPrayer(name)}>
                <div>
                  <p className="font-bold">{name}</p>
                  <p className="text-sm text-muted">{formatClock(props.schedule!.timings[name], props.timeFormat)}</p>
                </div>
                <Button variant={props.completedToday.includes(name) ? "soft" : "secondary"} onClick={(event) => { event.stopPropagation(); props.markPrayerDone(name); }}>
                  {props.completedToday.includes(name) ? "Selesai" : "Sudah Sholat"}
                </Button>
                </button>
                <PrayerBadges
                  prayer={name}
                  time={props.schedule!.timings[name]}
                  clock={props.clock}
                  completed={props.completedToday.includes(name)}
                  reminderOn={props.notificationEnabled && props.perPrayerNotification[name]}
                  soundMode={props.prayerSoundModes[name]}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-page p-3 text-sm text-muted">Belum ada jadwal. Muat jadwal sholat saat online.</p>
        )}
        <Button className="mt-3 w-full" onClick={props.fetchPrayerSchedule}>Refresh Jadwal</Button>
      </section>

      <NotificationPreviewCard
        schedule={props.schedule}
        timeFormat={props.timeFormat}
        testNotification={props.testPrayerNotification}
        testSound={props.testPrayerSound}
        prayerSoundModes={props.prayerSoundModes}
        setPrayerSoundModes={props.setPrayerSoundModes}
      />

      <section className="card">
        <SectionTitle title="Tracker Sholat" subtitle={`${props.completedToday.length}/5 sholat selesai`} />
        <div className="h-3 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-brand" style={{ width: `${props.completedToday.length * 20}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <StatusItem label="Bulan ini" value={`${props.stats.total} sholat`} />
          <StatusItem label="Persentase" value={`${props.stats.percentage}%`} />
          <StatusItem label="Hari dicatat" value={`${props.stats.daysTracked}`} />
          <StatusItem label="Hari lengkap" value={`${props.stats.completeDays}`} />
        </div>
      </section>

      <section className="card">
        <SectionTitle title="Notifikasi Sholat" subtitle="Web notification bekerja saat WaktuAI terbuka atau PWA aktif." />
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="font-semibold">Aktifkan notifikasi sholat</span>
          <input type="checkbox" checked={props.notifications.enabled} onChange={(event) => props.setNotifications((current) => ({ ...current, enabled: event.target.checked }))} />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {prayerNames.map((name) => (
            <label key={name} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3">
              <input
                type="checkbox"
                checked={props.notifications.perPrayer[name]}
                onChange={(event) => props.setNotifications((current) => ({ ...current, perPrayer: { ...current.perPrayer, [name]: event.target.checked } }))}
              />
              {name}
            </label>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Pre-reminder</FieldLabel>
            <select className="input" value={props.notifications.preReminder} onChange={(event) => props.setNotifications((current) => ({ ...current, preReminder: Number(event.target.value) as 0 | 5 | 10 | 15 }))}>
              <option value={0}>Off</option>
              <option value={5}>5 menit</option>
              <option value={10}>10 menit</option>
              <option value={15}>15 menit</option>
            </select>
          </div>
          <div>
            <FieldLabel>Mode Pengingat Berulang</FieldLabel>
            <select className="input" value={props.notifications.repeatMode} onChange={(event) => props.setNotifications((current) => ({ ...current, repeatMode: event.target.value as ReminderMode }))}>
              <option value="off">Off</option>
              <option value="gentle">Gentle</option>
              <option value="strong">Strong</option>
            </select>
          </div>
        </div>
      </section>

      <QiblaCard {...props} />
      <TasbihCard tasbih={props.tasbih} setTasbih={props.setTasbih} />
      <HijriMini schedule={props.schedule} />
      {props.selectedPrayer && props.schedule ? (
        <PrayerDetailModal
          prayer={props.selectedPrayer}
          time={props.schedule.timings[props.selectedPrayer]}
          clock={props.clock}
          completed={props.completedToday.includes(props.selectedPrayer)}
          notificationOn={props.notificationEnabled && props.perPrayerNotification[props.selectedPrayer]}
          soundMode={props.prayerSoundModes[props.selectedPrayer]}
          preReminder={props.preReminder}
          adjustment={props.prayerAdjustments[props.selectedPrayer]}
          onClose={() => props.setSelectedPrayer(null)}
          markDone={() => props.markPrayerDone(props.selectedPrayer!)}
          snooze={() => props.testPrayerNotification(props.selectedPrayer!)}
          testNotification={() => props.testPrayerNotification(props.selectedPrayer!)}
          testSound={() => props.testPrayerSound(props.selectedPrayer!)}
          adjust={(delta) => props.setPrayerAdjustments((current) => ({ ...current, [props.selectedPrayer!]: clampNumber(current[props.selectedPrayer!] + delta, -5, 5) }))}
          timeFormat={props.timeFormat}
        />
      ) : null}
    </>
  );
}

function ScheduleAuditCard(props: {
  schedule: PrayerSchedule | null;
  scheduleStatus: string;
  coords: Coordinates;
  method: number;
  lastUpdated: string | null;
  qibla: number;
  nextPrayerName?: PrayerName;
  refresh: () => void;
  requestGps: () => void;
  setManualCity: (city: string) => void;
  clearPrayerCache: () => void;
  timeFormat: TimeFormat;
}) {
  const checks = [
    { label: "Jadwal dimuat", ok: Boolean(props.schedule), fix: "Refresh schedule" },
    { label: "Format waktu valid", ok: Boolean(props.schedule && prayerNames.every((name) => parseClockTime(props.schedule!.timings[name]))), fix: "Refresh schedule" },
    { label: "Device time tersedia", ok: !Number.isNaN(Date.now()), fix: "Cek jam perangkat" },
    { label: "Koordinat lokasi valid", ok: Number.isFinite(props.coords.lat) && Number.isFinite(props.coords.lon), fix: "Pilih kota manual" },
    { label: "Kiblat valid", ok: Number.isFinite(props.qibla), fix: "Refresh lokasi" },
  ];
  return (
    <section className="card">
      <SectionTitle title="Audit Jadwal Adzan" subtitle="Cek cepat agar jadwal, lokasi, cache, dan perangkat terlihat sehat." />
      <div className="grid gap-2 sm:grid-cols-2">
        <StatusItem label="Kota" value={`${props.coords.city} (${props.coords.source})`} />
        <StatusItem label="Metode" value={`${props.method}`} />
        <StatusItem label="Status API/cache" value={props.scheduleStatus} />
        <StatusItem label="Update terakhir" value={props.lastUpdated ? formatDateTime(props.lastUpdated, props.timeFormat) : "Belum ada"} />
      </div>
      <div className="mt-3 grid gap-2">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-page p-3 text-sm">
            <span className="font-semibold">{check.ok ? "Aman" : "Perlu cek"} - {check.label}</span>
            {!check.ok ? <span className="text-muted">{check.fix}</span> : null}
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button onClick={props.refresh}>Refresh schedule</Button>
        <Button onClick={props.requestGps}>Gunakan GPS</Button>
        <Button onClick={() => props.setManualCity("Jakarta")}>Jakarta fallback</Button>
        <Button onClick={props.clearPrayerCache}>Reset cache</Button>
      </div>
    </section>
  );
}

function PrayerBadges(props: {
  prayer: PrayerName;
  time: string;
  clock: Date;
  completed: boolean;
  reminderOn: boolean;
  soundMode: PrayerSoundMode;
}) {
  const parsed = parseClockTime(props.time);
  const nowMinutes = props.clock.getHours() * 60 + props.clock.getMinutes();
  const prayerMinutes = parsed ? parsed.hour * 60 + parsed.minute : 0;
  const passed = parsed ? nowMinutes > prayerMinutes : false;
  const badges = [
    props.completed ? "Completed" : passed ? "Belum ditandai" : "Menunggu",
    props.reminderOn ? "Reminder on" : "Reminder off",
    props.soundMode === "full" ? "Sound on" : props.soundMode === "voice" ? "Voice only" : props.soundMode === "silent" ? "Silent" : "Sound off",
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {badges.map((badge) => (
        <span key={badge} className="rounded-full border border-line bg-panel px-2 py-1 text-xs font-semibold text-muted">{badge}</span>
      ))}
    </div>
  );
}

function NotificationPreviewCard(props: {
  schedule: PrayerSchedule | null;
  timeFormat: TimeFormat;
  testNotification: (prayer: PrayerName) => void;
  testSound: (prayer: PrayerName) => Promise<void>;
  prayerSoundModes: Record<PrayerName, PrayerSoundMode>;
  setPrayerSoundModes: React.Dispatch<React.SetStateAction<Record<PrayerName, PrayerSoundMode>>>;
}) {
  const [previewPrayer, setPreviewPrayer] = useState<PrayerName>("Maghrib");
  const time = props.schedule?.timings[previewPrayer] ?? "--:--";
  return (
    <section className="card">
      <SectionTitle title="Preview Notifikasi & Suara" subtitle="Lihat bentuk notifikasi dan tes suara per sholat sebelum dipakai." />
      <select className="input" value={previewPrayer} onChange={(event) => setPreviewPrayer(event.target.value as PrayerName)} aria-label="Pilih prayer preview">
        {prayerNames.map((name) => <option key={name}>{name}</option>)}
      </select>
      <div className="mt-3 rounded-xl border border-line bg-page p-3">
        <p className="font-bold">WaktuAI - Waktu {previewPrayer}</p>
        <p className="text-sm text-muted">Sudah masuk waktu {previewPrayer}. Yuk sholat.</p>
        <p className="mt-2 text-xs text-muted">Pre-reminder: Sebentar lagi {previewPrayer}. Siapkan wudhu dan sholat. Waktu: {formatClock(time, props.timeFormat)}</p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <select className="input" value={props.prayerSoundModes[previewPrayer]} onChange={(event) => props.setPrayerSoundModes((current) => ({ ...current, [previewPrayer]: event.target.value as PrayerSoundMode }))}>
          <option value="full">Full sound</option>
          <option value="voice">Voice only</option>
          <option value="silent">Silent notification</option>
          <option value="off">Off</option>
        </select>
        <Button onClick={() => props.testNotification(previewPrayer)}>Test notification</Button>
        <Button onClick={() => props.testSound(previewPrayer)}>Test sound</Button>
      </div>
    </section>
  );
}

function PrayerDetailModal(props: {
  prayer: PrayerName;
  time: string;
  clock: Date;
  completed: boolean;
  notificationOn: boolean;
  soundMode: PrayerSoundMode;
  preReminder: number;
  adjustment: number;
  onClose: () => void;
  markDone: () => void;
  snooze: () => void;
  testNotification: () => void;
  testSound: () => void;
  adjust: (delta: -1 | 1) => void;
  timeFormat: TimeFormat;
}) {
  const parsed = parseClockTime(props.time);
  const target = new Date(props.clock);
  if (parsed) target.setHours(parsed.hour, parsed.minute, 0, 0);
  const diff = parsed ? target.getTime() - props.clock.getTime() : 0;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/60 p-3 sm:place-items-center">
      <section className="w-full max-w-lg rounded-2xl border border-line bg-panel p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-brand">Detail sholat</p>
            <h2 className="text-2xl font-black">{props.prayer}</h2>
            <p className="text-muted">{formatClock(props.time, props.timeFormat)} - {diff >= 0 ? `${durationText(diff)} lagi` : `${durationText(Math.abs(diff))} lewat`}</p>
          </div>
          <Button onClick={props.onClose}>Tutup</Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <StatusItem label="Status" value={props.completed ? "Completed" : "Belum ditandai"} />
          <StatusItem label="Notifikasi" value={props.notificationOn ? "On" : "Off"} />
          <StatusItem label="Sound" value={props.soundMode} />
          <StatusItem label="Pre-reminder" value={`${props.preReminder} menit`} />
          <StatusItem label="Adjustment" value={`${props.adjustment} menit`} />
          <StatusItem label="Iqamah" value="Manual / belum aktif" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Button variant="primary" onClick={props.markDone}>Mark completed</Button>
          <Button onClick={props.snooze}>Snooze/test</Button>
          <Button onClick={props.testNotification}>Test notification</Button>
          <Button onClick={props.testSound}>Test sound</Button>
          <Button onClick={() => props.adjust(-1)}>Adjust -1</Button>
          <Button onClick={() => props.adjust(1)}>Adjust +1</Button>
        </div>
      </section>
    </div>
  );
}

function AdzanTimeline({ schedule, clock, timeFormat }: { schedule: PrayerSchedule | null; clock: Date; timeFormat: TimeFormat }) {
  if (!schedule) {
    return (
      <section className="card">
        <SectionTitle title="Timeline Adzan" />
        <p className="rounded-xl bg-page p-3 text-sm text-muted">Jadwal belum dimuat. Pilih kota atau gunakan lokasi untuk melihat timeline.</p>
      </section>
    );
  }
  const points = prayerNames.map((name) => {
    const parsed = parseClockTime(schedule.timings[name]);
    return { name, minutes: parsed ? parsed.hour * 60 + parsed.minute : 0, time: schedule.timings[name] };
  });
  const nowMinutes = clock.getHours() * 60 + clock.getMinutes();
  const first = Math.min(...points.map((item) => item.minutes));
  const last = Math.max(...points.map((item) => item.minutes));
  const range = Math.max(1, last - first);
  const nowPercent = clampNumber(((nowMinutes - first) / range) * 100, 0, 100);
  const next = points.find((item) => item.minutes > nowMinutes)?.name ?? "Subuh";
  return (
    <section className="card">
      <SectionTitle title="Timeline Adzan" subtitle="Marker menunjukkan posisi waktu sekarang terhadap jadwal hari ini." />
      <div className="relative mt-6 h-4 rounded-full bg-line">
        <div className="absolute top-[-6px] h-7 w-1 rounded-full bg-rose-500" style={{ left: `${nowPercent}%` }} />
        {points.map((point) => {
          const left = ((point.minutes - first) / range) * 100;
          const passed = point.minutes <= nowMinutes;
          return (
            <div key={point.name} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${left}%` }}>
              <div className={`h-4 w-4 -translate-x-1/2 rounded-full border-2 ${point.name === next ? "border-brand bg-brand" : passed ? "border-brand bg-brandSoft" : "border-muted bg-panel"}`} />
            </div>
          );
        })}
      </div>
      <div className="mt-6 grid grid-cols-5 gap-1 text-center text-xs">
        {points.map((point) => <div key={point.name}><p className="font-bold">{point.name}</p><p className="text-muted">{formatClock(point.time, timeFormat)}</p></div>)}
      </div>
    </section>
  );
}

function QiblaCard(props: {
  coords: Coordinates;
  requestGps: () => void;
  setManualCity: (city: string) => void;
  qibla: number;
  orientation: number;
  requestOrientation: () => void;
}) {
  return (
    <section className="card">
      <SectionTitle title="Arah Kiblat" subtitle="Arah dihitung dari utara searah jarum jam." />
      <div className="mx-auto grid h-48 w-48 place-items-center rounded-full border-8 border-line bg-page">
        <div className="grid h-32 w-32 place-items-center rounded-full bg-brandSoft text-center">
          <div className="text-3xl font-black text-teal-950 dark:text-teal-50" style={{ transform: `rotate(${props.qibla - props.orientation}deg)` }}>↑</div>
          <p className="text-sm font-bold text-teal-950 dark:text-teal-50">{Math.round(props.qibla)}°</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">
        Sumber lokasi: {props.coords.source} - {props.coords.city}. {props.coords.accuracy ? `Akurasi sekitar ${Math.round(props.coords.accuracy)} meter.` : ""}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={props.requestGps}>Deteksi Lokasi</Button>
        <Button onClick={props.requestOrientation}>Aktifkan Kompas</Button>
      </div>
      <select className="input mt-3" value={props.coords.city in cityOptions ? props.coords.city : "Jakarta"} onChange={(event) => props.setManualCity(event.target.value)} aria-label="Pilih kota manual">
        {Object.keys(cityOptions).map((city) => <option key={city}>{city}</option>)}
      </select>
    </section>
  );
}

function HijriMini({ schedule }: { schedule: PrayerSchedule | null }) {
  return (
    <section className="card">
      <SectionTitle title="Hijri Mini" subtitle="Tanggal Hijriah bisa berbeda mengikuti ketetapan daerah masing-masing." />
      <p className="font-bold">{schedule?.hijri ? `${schedule.hijri.day} ${schedule.hijri.month} ${schedule.hijri.year} H` : "Tanggal Hijriah belum tersedia."}</p>
      <div className="mt-3 grid gap-2 text-sm text-muted">
        {["1 Muharram", "10 Muharram", "12 Rabiul Awal", "27 Rajab", "1 Ramadan", "17 Ramadan", "1 Syawal", "10 Dzulhijjah"].map((item) => (
          <p key={item} className="rounded-xl bg-page px-3 py-2">{item}</p>
        ))}
      </div>
    </section>
  );
}

function TasbihCard({ tasbih, setTasbih }: { tasbih: TasbihState; setTasbih: React.Dispatch<React.SetStateAction<TasbihState>> }) {
  const increment = () => {
    setTasbih((current) => ({ ...current, count: current.count + 1 }));
    try {
      navigator.vibrate?.(15);
    } catch {
      // Vibration is optional on the web.
    }
  };
  return (
    <section className="card">
      <SectionTitle title="Tasbih" subtitle={`${tasbih.count}/${tasbih.target}`} />
      <button className="grid min-h-36 w-full place-items-center rounded-2xl bg-brand text-5xl font-black text-white" onClick={increment} aria-label="Tambah hitungan tasbih">
        {tasbih.count}
      </button>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-brand" style={{ width: `${Math.min(100, (tasbih.count / tasbih.target) * 100)}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {["Subhanallah", "Alhamdulillah", "Allahu Akbar", "La ilaha illallah"].map((preset) => (
          <Button key={preset} variant={tasbih.preset === preset ? "soft" : "secondary"} onClick={() => setTasbih((current) => ({ ...current, preset }))}>{preset}</Button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[33, 99].map((target) => <Button key={target} onClick={() => setTasbih((current) => ({ ...current, target }))}>{target}</Button>)}
        <Button onClick={() => setTasbih((current) => ({ ...current, target: current.target + 1 }))}>Custom +</Button>
        <Button onClick={() => setTasbih((current) => ({ ...current, count: 0 }))}>Reset</Button>
      </div>
    </section>
  );
}

function ReminderTab(props: {
  reminderInput: string;
  setReminderInput: (value: string) => void;
  addReminderFromText: (text: string) => void;
  reminders: Reminder[];
  deleteReminder: (id: string) => void;
  completeReminder: (id: string) => void;
  snoozeReminder: (id: string, minutes: 5 | 10 | 15) => void;
  timeFormat: TimeFormat;
  notes: DailyNote[];
  newNote: string;
  setNewNote: (value: string) => void;
  addDailyNote: () => void;
  setNotes: React.Dispatch<React.SetStateAction<Record<string, DailyNote[]>>>;
  todayKey: string;
  quranReminder: { enabled: boolean; time: string };
  setQuranReminder: React.Dispatch<React.SetStateAction<{ enabled: boolean; time: string }>>;
}) {
  const active = props.reminders.filter((item) => item.status === "scheduled");
  const missed = props.reminders.filter((item) => item.status === "missed" || item.status === "fired");
  return (
    <>
      <section className="card">
        <SectionTitle title="Tambah Reminder" subtitle="Contoh: 17:46, ingatkan aku 10 menit lagi, ingatkan aku maghrib." />
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            props.addReminderFromText(props.reminderInput);
          }}
        >
          <input className="input" value={props.reminderInput} onChange={(event) => props.setReminderInput(event.target.value)} placeholder="Ingatkan aku 17:46" aria-label="Tulis reminder" />
          <Button variant="primary" type="submit">Tambah Reminder</Button>
        </form>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {["10 menit lagi", "30 menit lagi", "1 jam lagi", "17:46"].map((item) => <Button key={item} onClick={() => props.addReminderFromText(item)}>{item}</Button>)}
        </div>
      </section>

      <section className="card">
        <SectionTitle title="Reminder Baca Qur'an" subtitle="Berjalan dengan scheduler web saat WaktuAI terbuka atau PWA aktif." />
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="font-semibold">Aktifkan reminder harian</span>
          <input type="checkbox" checked={props.quranReminder.enabled} onChange={(event) => props.setQuranReminder((current) => ({ ...current, enabled: event.target.checked }))} />
        </label>
        <div className="mt-3 flex gap-2">
          <input className="input" type="time" value={props.quranReminder.time} onChange={(event) => props.setQuranReminder((current) => ({ ...current, time: event.target.value }))} aria-label="Jam reminder Qur'an" />
          <Button
            variant="primary"
            onClick={() => props.addReminderFromText(`ingatkan baca quran jam ${props.quranReminder.time} setiap hari`)}
          >
            Simpan
          </Button>
        </div>
        <Button className="mt-3 w-full" onClick={() => props.addReminderFromText("ingatkan baca quran 1 menit lagi")}>Test reminder Qur'an</Button>
      </section>

      <section className="card">
        <SectionTitle title="Reminder Aktif" />
        {active.length ? (
          <div className="grid gap-2">
            {active.map((item) => (
              <ReminderRow key={item.id} item={item} timeFormat={props.timeFormat} deleteReminder={props.deleteReminder} completeReminder={props.completeReminder} snoozeReminder={props.snoozeReminder} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-page p-3 text-sm text-muted">Belum ada reminder aktif.</p>
        )}
      </section>

      <section className="card">
        <SectionTitle title="Terlewat dan Riwayat" />
        {missed.length ? (
          <div className="grid gap-2">
            {missed.map((item) => <ReminderRow key={item.id} item={item} timeFormat={props.timeFormat} deleteReminder={props.deleteReminder} completeReminder={props.completeReminder} snoozeReminder={props.snoozeReminder} />)}
          </div>
        ) : (
          <p className="rounded-xl bg-page p-3 text-sm text-muted">Tidak ada reminder terlewat.</p>
        )}
      </section>

      <section className="card">
        <SectionTitle title="Catatan Hari Ini" />
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            props.addDailyNote();
          }}
        >
          <input className="input" value={props.newNote} onChange={(event) => props.setNewNote(event.target.value)} placeholder="Contoh: Baca Al-Kahfi" aria-label="Catatan harian" />
          <Button variant="primary" type="submit">Tambah</Button>
        </form>
        <div className="mt-3 grid gap-2">
          {props.notes.length ? props.notes.map((note) => (
            <div key={note.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-page p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={note.done}
                  onChange={(event) =>
                    props.setNotes((current) => ({
                      ...current,
                      [props.todayKey]: (current[props.todayKey] ?? []).map((item) => (item.id === note.id ? { ...item, done: event.target.checked } : item)),
                    }))
                  }
                />
                <span className={note.done ? "line-through text-muted" : ""}>{note.text}</span>
              </label>
              <Button onClick={() => props.setNotes((current) => ({ ...current, [props.todayKey]: (current[props.todayKey] ?? []).filter((item) => item.id !== note.id) }))}>Hapus</Button>
            </div>
          )) : <p className="rounded-xl bg-page p-3 text-sm text-muted">Belum ada catatan hari ini.</p>}
        </div>
      </section>
    </>
  );
}

function ReminderRow(props: {
  item: Reminder;
  timeFormat: TimeFormat;
  deleteReminder: (id: string) => void;
  completeReminder: (id: string) => void;
  snoozeReminder: (id: string, minutes: 5 | 10 | 15) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-page p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{props.item.title}</p>
          <p className="text-sm text-muted">{formatDateTime(props.item.dateTime, props.timeFormat)}</p>
          <p className="text-xs font-semibold text-muted">{props.item.status} - {repeatLabel(props.item.repeat)}</p>
        </div>
        <Button onClick={() => props.deleteReminder(props.item.id)}>Hapus</Button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Button variant="primary" onClick={() => props.completeReminder(props.item.id)}>Selesai</Button>
        <Button onClick={() => props.snoozeReminder(props.item.id, 10)}>Tunda 10</Button>
        <Button onClick={() => props.snoozeReminder(props.item.id, 15)}>Tunda 15</Button>
      </div>
    </div>
  );
}

function RakaatTab(props: {
  rakaat: { count: number; target: number };
  setRakaat: React.Dispatch<React.SetStateAction<{ count: number; target: number }>>;
  cameraStatus: CameraStatus;
  cameraMessage: string;
  startCamera: () => void;
  stopCamera: () => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}) {
  return (
    <>
      <section className="card text-center">
        <SectionTitle title="Hitung Rakaat Manual" subtitle="Gunakan tombol manual jika kamera/model belum tersedia." />
        <p className="text-6xl font-black text-brand">{props.rakaat.count}/{props.rakaat.target}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[2, 3, 4].map((target) => (
            <Button key={target} variant={props.rakaat.target === target ? "soft" : "secondary"} onClick={() => props.setRakaat((current) => ({ ...current, target }))}>
              {target} rakaat
            </Button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={() => props.setRakaat((current) => ({ ...current, count: clampNumber(current.count + 1, 0, current.target) }))}>Tambah</Button>
          <Button onClick={() => props.setRakaat((current) => ({ ...current, count: clampNumber(current.count - 1, 0, current.target) }))}>Kurangi</Button>
          <Button onClick={() => props.setRakaat((current) => ({ ...current, count: 0 }))}>Reset</Button>
          <Button variant="soft" onClick={() => props.setRakaat((current) => ({ ...current, count: current.target }))}>Selesai Rakaat</Button>
        </div>
      </section>

      <section className="card">
        <SectionTitle title="Kamera Opsional" subtitle="Tidak ada deteksi pose palsu. Manual tetap fitur utama." />
        <p className="rounded-xl bg-page p-3 text-sm font-semibold text-muted">{props.cameraMessage}</p>
        <video ref={props.videoRef} className={`mt-3 w-full rounded-xl bg-slate-950 ${props.cameraStatus === "active" ? "block" : "hidden"}`} autoPlay playsInline muted />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={props.startCamera}>Mulai Kamera</Button>
          <Button onClick={props.stopCamera}>Stop Kamera</Button>
        </div>
      </section>

      <section className="card">
        <SectionTitle title="Panduan Rakaat" />
        <p className="text-sm leading-6 text-muted">
          Untuk hitung otomatis yang benar, rakaat tidak boleh dihitung dari sujud saja. Urutannya harus Berdiri, Rukuk, Sujud 1, Duduk, Sujud 2, lalu Berdiri lagi. Karena model AI belum tersedia stabil di semua browser, tombol manual selalu disediakan.
        </p>
      </section>
    </>
  );
}

function SubuhWakeCard(props: {
  settings: SubuhWakeSettings;
  setSettings: React.Dispatch<React.SetStateAction<SubuhWakeSettings>>;
  schedule: PrayerSchedule | null;
  timeFormat: TimeFormat;
  activate: () => void;
  testSound: () => void;
}) {
  const subuh = props.schedule?.timings.Subuh;
  const parsed = subuh ? parseClockTime(subuh) : null;
  const wake = parsed ? new Date() : null;
  if (wake && parsed) wake.setHours(parsed.hour, parsed.minute - props.settings.offset, 0, 0);
  return (
    <section className="card">
      <SectionTitle title="Mode Bangun Subuh" subtitle="Pengingat web bekerja saat WaktuAI terbuka atau berjalan sebagai PWA. Untuk alarm tertutup total dibutuhkan sistem push/backend." />
      <label className="flex min-h-11 items-center justify-between gap-3">
        <span className="font-semibold">Mode Bangun Subuh</span>
        <input type="checkbox" checked={props.settings.enabled} onChange={(event) => props.setSettings((current) => ({ ...current, enabled: event.target.checked }))} />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-semibold">Offset sebelum Subuh</span>
          <select className="input" value={props.settings.offset} onChange={(event) => props.setSettings((current) => ({ ...current, offset: Number(event.target.value) as SubuhWakeSettings["offset"] }))}>
            <option value={15}>15 menit</option>
            <option value={30}>30 menit</option>
            <option value={45}>45 menit</option>
            <option value={60}>60 menit</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold">Sound mode</span>
          <select className="input" value={props.settings.soundMode} onChange={(event) => props.setSettings((current) => ({ ...current, soundMode: event.target.value as SubuhWakeSettings["soundMode"] }))}>
            <option value="voice">Voice AI</option>
            <option value="beep">Beep</option>
            <option value="adzan">Adzan audio</option>
            <option value="silent">Silent banner</option>
          </select>
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatusItem label="Subuh" value={subuh ? formatClock(subuh, props.timeFormat) : "Belum tersedia"} />
        <StatusItem label="Wake reminder" value={wake ? formatClock(wake, props.timeFormat) : "Muat jadwal dulu"} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={props.testSound}>Test Bangun Subuh</Button>
        <Button variant="primary" onClick={props.activate}>Aktifkan Mode</Button>
      </div>
    </section>
  );
}

function TroubleshootingFlowCards(props: {
  notificationOpen: boolean;
  setNotificationOpen: React.Dispatch<React.SetStateAction<boolean>>;
  soundOpen: boolean;
  setSoundOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notificationPermission: NotificationPermissionState;
  notifications: WebNotificationSettings;
  dnd: DndSettings;
  schedule: PrayerSchedule | null;
  schedulerStatus: string;
  lastCheckAt: string | null;
  adzanAudio: AdzanAudioSettings;
  audioUnlocked: boolean;
  requestNotificationPermission: () => void;
  sendTestNotification: () => void;
  testAdzan: () => void;
  setAdzanAudio: React.Dispatch<React.SetStateAction<AdzanAudioSettings>>;
  setDnd: React.Dispatch<React.SetStateAction<DndSettings>>;
  timeFormat: TimeFormat;
}) {
  const notificationReason =
    props.notificationPermission !== "granted" ? "Sepertinya izin notifikasi belum aktif." :
    !props.notifications.enabled ? "Notifikasi global masih dimatikan." :
    props.dnd.enabled ? "Mode jangan ganggu sedang aktif." :
    !props.schedule ? "Jadwal sholat belum dimuat." :
    props.schedulerStatus !== "running" ? "Scheduler sedang pause karena tab tidak aktif." :
    "Konfigurasi terlihat aman. Tes notifikasi untuk memastikan browser menampilkan notifikasi.";
  const soundReason =
    !props.adzanAudio.enabled || props.adzanAudio.source === "off" ? "Sumber suara adzan sedang off." :
    !props.audioUnlocked ? "Audio belum di-unlock sesi ini. Klik Tes Suara Adzan setelah membuka aplikasi." :
    props.adzanAudio.quietHoursEnabled ? "Quiet hours bisa menahan suara adzan." :
    props.adzanAudio.source === "kemenag-url" && !props.adzanAudio.officialUrl ? "URL resmi audio belum diisi." :
    props.adzanAudio.lastFailedReason ?? "Konfigurasi suara terlihat aman. Tes suara untuk memastikan.";
  return (
    <section className="card">
      <SectionTitle title="Bantuan Notifikasi & Suara" subtitle="Jawaban untuk: kenapa notifikasi tidak masuk atau suara tidak bunyi?" />
      <div className="grid gap-2 sm:grid-cols-2">
        <Button onClick={() => props.setNotificationOpen((value) => !value)}>Kenapa notifikasi tidak masuk?</Button>
        <Button onClick={() => props.setSoundOpen((value) => !value)}>Kenapa suara tidak bunyi?</Button>
      </div>
      {props.notificationOpen ? (
        <div className="mt-3 rounded-xl border border-line bg-page p-3 text-sm">
          <p className="font-bold">{notificationReason}</p>
          <p className="mt-1 text-muted">Last scheduler check: {props.lastCheckAt ? formatDateTime(props.lastCheckAt, props.timeFormat) : "belum ada"}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={props.requestNotificationPermission}>Minta izin</Button>
            <Button onClick={props.sendTestNotification}>Tes notifikasi</Button>
            <Button onClick={() => props.setDnd({ enabled: false, until: null })}>Matikan DND</Button>
          </div>
        </div>
      ) : null}
      {props.soundOpen ? (
        <div className="mt-3 rounded-xl border border-line bg-page p-3 text-sm">
          <p className="font-bold">{soundReason}</p>
          <p className="mt-1 text-muted">Source: {props.adzanAudio.source}. Volume: {Math.round(props.adzanAudio.volume * 100)}%.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={props.testAdzan}>Test adzan sound</Button>
            <Button onClick={() => props.setAdzanAudio((current) => ({ ...current, enabled: true, source: "voice" }))}>Switch Voice AI</Button>
            <Button onClick={() => props.setAdzanAudio((current) => ({ ...current, enabled: true, source: "beep" }))}>Switch beep</Button>
            <Button onClick={() => props.setAdzanAudio((current) => ({ ...current, quietHoursEnabled: false }))}>Disable quiet hours</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CacheAndDebugCenter(props: {
  reminders: Reminder[];
  history: HistoryLog[];
  trackerDays: number;
  notesCount: number;
  copyDebugReport: () => Promise<void>;
  debugReport: string;
  clearCacheItem: (kind: "prayer" | "sent" | "sound" | "all-cache") => void;
  clearCommandHistory: () => void;
}) {
  return (
    <section className="card">
      <SectionTitle title="Cache Manager & Debug" subtitle="Hapus cache teknis tanpa menghapus semua pengaturan." />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatusItem label="Reminder" value={`${props.reminders.length}`} />
        <StatusItem label="Log" value={`${props.history.length}`} />
        <StatusItem label="Tracker days" value={`${props.trackerDays}`} />
        <StatusItem label="Notes" value={`${props.notesCount}`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={() => props.clearCacheItem("prayer")}>Clear prayer cache</Button>
        <Button onClick={() => props.clearCacheItem("sent")}>Clear sent keys</Button>
        <Button onClick={() => props.clearCacheItem("sound")}>Clear sound keys</Button>
        <Button onClick={() => props.clearCacheItem("all-cache")}>Clear all cache</Button>
        <Button onClick={props.clearCommandHistory}>Clear command history</Button>
        <Button variant="primary" onClick={props.copyDebugReport}>Copy debug report</Button>
      </div>
      {props.debugReport ? <textarea className="input mt-3 min-h-32" value={props.debugReport} readOnly aria-label="Debug report" /> : null}
    </section>
  );
}

function FeatureFlagCenter(props: {
  flags: FeatureFlags;
  setFlags: React.Dispatch<React.SetStateAction<FeatureFlags>>;
  setVoice: React.Dispatch<React.SetStateAction<VoiceSettings>>;
  setNotifications: React.Dispatch<React.SetStateAction<WebNotificationSettings>>;
  setAdzanAudio: React.Dispatch<React.SetStateAction<AdzanAudioSettings>>;
}) {
  const labels: Record<keyof FeatureFlags, string> = {
    camera: "Camera features",
    voiceCommand: "Voice command",
    adzanSound: "Adzan sound",
    strongReminders: "Strong reminders",
    experimentalKemenag: "Experimental Kemenag endpoint",
    wakeLock: "Wake lock mode",
  };
  return (
    <section className="card">
      <SectionTitle title="Safe Feature Toggles" subtitle="Matikan fitur berisiko jika browser terasa bermasalah." />
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(labels) as Array<keyof FeatureFlags>).map((key) => (
          <label key={key} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line px-3">
            <span className="font-semibold">{labels[key]}</span>
            <input type="checkbox" checked={props.flags[key]} onChange={(event) => props.setFlags((current) => ({ ...current, [key]: event.target.checked }))} />
          </label>
        ))}
      </div>
      <Button
        className="mt-3 w-full"
        onClick={() => {
          props.setFlags({ ...defaultFeatureFlags, camera: false, voiceCommand: false, adzanSound: false, strongReminders: false, wakeLock: false });
          props.setVoice((current) => ({ ...current, enabled: false }));
          props.setNotifications((current) => ({ ...current, repeatMode: "off" }));
          props.setAdzanAudio((current) => ({ ...current, enabled: false, source: "off" }));
        }}
      >
        Aktifkan Safe Mode Fitur
      </Button>
    </section>
  );
}

function SettingsTab(props: {
  notificationPermission: NotificationPermissionState;
  requestNotificationPermission: () => void;
  sendTestNotification: () => void;
  scheduleOneMinuteTest: () => void;
  testVoice: () => void;
  lastTestResult: string;
  lastVoiceResult: string;
  schedulerStatus: string;
  lastCheckAt: string | null;
  schedulerRunCheck: () => void;
  notifications: WebNotificationSettings;
  setNotifications: React.Dispatch<React.SetStateAction<WebNotificationSettings>>;
  voice: VoiceSettings;
  setVoice: React.Dispatch<React.SetStateAction<VoiceSettings>>;
  adzanAudio: AdzanAudioSettings;
  setAdzanAudio: React.Dispatch<React.SetStateAction<AdzanAudioSettings>>;
  audioUnlocked: boolean;
  setAudioUnlocked: React.Dispatch<React.SetStateAction<boolean>>;
  playBeep: () => void;
  coords: Coordinates;
  requestGps: () => void;
  setManualCity: (city: string) => void;
  method: number;
  setMethod: React.Dispatch<React.SetStateAction<number>>;
  theme: ThemeMode;
  setTheme: React.Dispatch<React.SetStateAction<ThemeMode>>;
  timeFormat: TimeFormat;
  setTimeFormat: React.Dispatch<React.SetStateAction<TimeFormat>>;
  dnd: DndSettings;
  setDnd: React.Dispatch<React.SetStateAction<DndSettings>>;
  quickActions: string[];
  setQuickActions: React.Dispatch<React.SetStateAction<string[]>>;
  safeMode: boolean;
  setSafeMode: React.Dispatch<React.SetStateAction<boolean>>;
  history: HistoryLog[];
  setHistory: React.Dispatch<React.SetStateAction<HistoryLog[]>>;
  importText: string;
  setImportText: (value: string) => void;
  exportSettings: () => void;
  importSettings: () => void;
  resetAllSettings: () => void;
  installPrompt: BeforeInstallPromptEvent | null;
  setInstallPrompt: React.Dispatch<React.SetStateAction<BeforeInstallPromptEvent | null>>;
  addToast: (message: string, tone?: ToastTone) => void;
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
  setTracker: React.Dispatch<React.SetStateAction<PrayerTracker>>;
  setCoords: React.Dispatch<React.SetStateAction<Coordinates>>;
  dashboardWidgets: WidgetKey[];
  setDashboardWidgets: React.Dispatch<React.SetStateAction<WidgetKey[]>>;
  prayerAdjustments: PrayerAdjustments;
  setPrayerAdjustments: React.Dispatch<React.SetStateAction<PrayerAdjustments>>;
  commandHistory: CommandHistoryItem[];
  setCommandHistory: React.Dispatch<React.SetStateAction<CommandHistoryItem[]>>;
  reminderTone: ReminderTone;
  setReminderTone: React.Dispatch<React.SetStateAction<ReminderTone>>;
  subuhWake: SubuhWakeSettings;
  setSubuhWake: React.Dispatch<React.SetStateAction<SubuhWakeSettings>>;
  activateSubuhWake: () => void;
  testPrayerSound: (prayer: PrayerName) => Promise<void>;
  testPrayerNotification: (prayer: PrayerName) => void;
  prayerSoundModes: Record<PrayerName, PrayerSoundMode>;
  setPrayerSoundModes: React.Dispatch<React.SetStateAction<Record<PrayerName, PrayerSoundMode>>>;
  notificationHelpOpen: boolean;
  setNotificationHelpOpen: React.Dispatch<React.SetStateAction<boolean>>;
  soundHelpOpen: boolean;
  setSoundHelpOpen: React.Dispatch<React.SetStateAction<boolean>>;
  copyDebugReport: () => Promise<void>;
  lastDebugReport: string;
  clearCacheItem: (kind: "prayer" | "sent" | "sound" | "all-cache") => void;
  featureFlags: FeatureFlags;
  setFeatureFlags: React.Dispatch<React.SetStateAction<FeatureFlags>>;
  releaseNotesOpen: boolean;
  setReleaseNotesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  schedule: PrayerSchedule | null;
}) {
  const setDndFor = (minutes: number) => props.setDnd({ enabled: true, until: new Date(Date.now() + minutes * 60_000).toISOString() });
  return (
    <>
      <section className="card">
        <SectionTitle title="Notification Test Center" subtitle="Tes ini memakai Browser Notification API asli jika izin granted." />
        <div className="grid gap-2 text-sm">
          <StatusItem label="Notification API" value={"Notification" in window ? "supported" : "unsupported"} />
          <StatusItem label="Permission" value={props.notificationPermission} />
          <StatusItem label="Global sholat" value={props.notifications.enabled ? "on" : "off"} />
          <StatusItem label="Scheduler" value={props.schedulerStatus} />
          <StatusItem label="Last check" value={props.lastCheckAt ? formatClock(new Date(props.lastCheckAt), props.timeFormat) : "-"} />
          <StatusItem label="Tes terakhir" value={props.lastTestResult} />
        </div>
        {props.notificationPermission === "denied" ? <p className="mt-3 rounded-xl bg-rose-100 p-3 text-sm font-semibold text-rose-900">Izin notifikasi ditolak. Aktifkan dari pengaturan browser.</p> : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={props.requestNotificationPermission}>Minta Izin Notifikasi</Button>
          <Button onClick={props.sendTestNotification}>Kirim Notifikasi Tes</Button>
          <Button onClick={props.scheduleOneMinuteTest}>Jadwalkan Tes 1 Menit Lagi</Button>
          <Button onClick={props.schedulerRunCheck}>Reschedule/Cek Hari Ini</Button>
          <Button onClick={() => props.setNotifications((current) => ({ ...current, enabled: false }))}>Matikan Semua Notifikasi</Button>
        </div>
        <p className="mt-3 text-sm text-muted">Notifikasi web bekerja paling baik saat aplikasi dibuka atau dipasang sebagai PWA. Untuk push saat browser benar-benar tertutup, dibutuhkan backend Web Push khusus.</p>
      </section>

      <SubuhWakeCard
        settings={props.subuhWake}
        setSettings={props.setSubuhWake}
        schedule={props.schedule}
        timeFormat={props.timeFormat}
        activate={props.activateSubuhWake}
        testSound={() => props.testPrayerSound("Subuh")}
      />

      <TroubleshootingFlowCards
        notificationOpen={props.notificationHelpOpen}
        setNotificationOpen={props.setNotificationHelpOpen}
        soundOpen={props.soundHelpOpen}
        setSoundOpen={props.setSoundHelpOpen}
        notificationPermission={props.notificationPermission}
        notifications={props.notifications}
        dnd={props.dnd}
        schedule={props.schedule}
        schedulerStatus={props.schedulerStatus}
        lastCheckAt={props.lastCheckAt}
        adzanAudio={props.adzanAudio}
        audioUnlocked={props.audioUnlocked}
        requestNotificationPermission={props.requestNotificationPermission}
        sendTestNotification={props.sendTestNotification}
        testAdzan={() => props.testPrayerSound("Isya")}
        setAdzanAudio={props.setAdzanAudio}
        setDnd={props.setDnd}
        timeFormat={props.timeFormat}
      />

      <CacheAndDebugCenter
        reminders={props.reminders}
        history={props.history}
        trackerDays={0}
        notesCount={0}
        copyDebugReport={props.copyDebugReport}
        debugReport={props.lastDebugReport}
        clearCacheItem={props.clearCacheItem}
        clearCommandHistory={() => props.setCommandHistory([])}
      />

      <FeatureFlagCenter
        flags={props.featureFlags}
        setFlags={props.setFeatureFlags}
        setVoice={props.setVoice}
        setNotifications={props.setNotifications}
        setAdzanAudio={props.setAdzanAudio}
      />

      {props.releaseNotesOpen ? (
        <section className="card">
          <SectionTitle title="Yang Baru di WaktuAI 2.1" subtitle="Ringkasan fitur baru setelah update." />
          <ul className="list-inside list-disc text-sm leading-6 text-muted">
            <li>Audit jadwal adzan dan cache.</li>
            <li>Preview notifikasi dan suara per sholat.</li>
            <li>Mode Bangun Subuh, detail sholat, dan troubleshooting audio/notifikasi.</li>
          </ul>
          <Button className="mt-3" onClick={() => props.setReleaseNotesOpen(false)}>Jangan tampilkan lagi</Button>
        </section>
      ) : null}

      <AdzanSoundSettings
        settings={props.adzanAudio}
        audioUnlocked={props.audioUnlocked}
        onSettingsChange={props.setAdzanAudio}
        onAudioUnlocked={props.setAudioUnlocked}
        onToast={props.addToast}
      />

      <section className="card">
        <SectionTitle title="Preset Rutinitas Sholat" subtitle="Preset langsung mengubah notifikasi, pre-reminder, repeat, dan suara AI." />
        <div className="grid grid-cols-2 gap-2">
          {[
            ["Minimal", "Notifikasi waktu sholat saja, tanpa voice dan repeat."],
            ["Balanced", "Pre-reminder 10 menit, notifikasi, dan Voice AI."],
            ["Strong", "Pre-reminder 15 menit, repeat terbatas, dan Voice AI."],
            ["Silent", "Banner/notifikasi tanpa suara otomatis."],
          ].map(([name, description]) => (
            <button
              key={name}
              className="rounded-xl border border-line bg-page p-3 text-left"
              onClick={() => {
                if (name === "Minimal") {
                  props.setNotifications((current) => ({ ...current, enabled: true, preReminder: 0, repeatMode: "off" }));
                  props.setVoice((current) => ({ ...current, enabled: false }));
                  props.setAdzanAudio((current) => ({ ...current, source: "off", enabled: false }));
                } else if (name === "Balanced") {
                  props.setNotifications((current) => ({ ...current, enabled: true, preReminder: 10, repeatMode: "gentle" }));
                  props.setVoice((current) => ({ ...current, enabled: true }));
                  props.setAdzanAudio((current) => ({ ...current, source: "voice", enabled: true }));
                } else if (name === "Strong") {
                  props.setNotifications((current) => ({ ...current, enabled: true, preReminder: 15, repeatMode: "strong" }));
                  props.setVoice((current) => ({ ...current, enabled: true }));
                  props.setAdzanAudio((current) => ({ ...current, source: "voice", enabled: true }));
                } else {
                  props.setNotifications((current) => ({ ...current, enabled: true, repeatMode: "off" }));
                  props.setVoice((current) => ({ ...current, enabled: false }));
                  props.setAdzanAudio((current) => ({ ...current, source: "off", enabled: false }));
                }
                props.addToast(`Preset ${name} diterapkan.`, "success");
              }}
            >
              <p className="font-bold">{name}</p>
              <p className="text-sm text-muted">{description}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <SectionTitle title="Voice AI dan Suara" subtitle="Klik Tes Suara AI sekali agar suara otomatis lebih stabil saat aplikasi terbuka." />
        <div className="grid gap-2">
          {[
            ["Suara AI aktif", "enabled"],
            ["Suara AI untuk adzan", "prayer"],
            ["Suara AI untuk reminder", "reminder"],
          ].map(([label, key]) => (
            <label key={key} className="flex min-h-11 items-center justify-between gap-3">
              <span className="font-semibold">{label}</span>
              <input type="checkbox" checked={Boolean(props.voice[key as keyof VoiceSettings])} onChange={(event) => props.setVoice((current) => ({ ...current, [key]: event.target.checked }))} />
            </label>
          ))}
          <select className="input" value={props.voice.rate} onChange={(event) => props.setVoice((current) => ({ ...current, rate: event.target.value as VoiceSettings["rate"] }))} aria-label="Kecepatan suara">
            <option value="slow">Pelan</option>
            <option value="normal">Normal</option>
            <option value="fast">Cepat</option>
          </select>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={props.testVoice}>Tes Suara AI</Button>
          <Button onClick={props.playBeep}>Tes Beep Web</Button>
        </div>
        <p className="mt-2 text-sm text-muted">{props.lastVoiceResult}</p>
      </section>

      <section className="card">
        <SectionTitle title="Permission Center" />
        <PermissionRow label="Location / Geolocation" status={navigator.geolocation ? props.coords.source : "unsupported"} action={props.requestGps} help="Izin lokasi ditolak. Kamu tetap bisa pilih kota manual." />
        <PermissionRow label="Notification" status={props.notificationPermission} action={props.requestNotificationPermission} help="Izin notifikasi ditolak. Aktifkan dari pengaturan browser." />
        <PermissionRow label="Microphone / SpeechRecognition" status={"webkitSpeechRecognition" in window || "SpeechRecognition" in window ? "supported" : "unsupported"} action={() => props.addToast("Mikrofon belum tersedia. Kamu tetap bisa ketik atau pilih tombol cepat.", "info")} help="Izin mikrofon ditolak. Kamu tetap bisa ketik perintah." />
        <PermissionRow label="Camera / getUserMedia" status={navigator.mediaDevices && "getUserMedia" in navigator.mediaDevices ? "supported" : "unsupported"} action={() => props.addToast("Cek kamera dari tab Rakaat.", "info")} help="Izin kamera ditolak. Hitung rakaat manual tetap bisa dipakai." />
        <PermissionRow label="SpeechSynthesis" status={"speechSynthesis" in window ? "supported" : "unsupported"} action={props.testVoice} help="Browser ini belum mendukung fitur suara." />
      </section>

      <section className="card">
        <SectionTitle title="Lokasi, Jadwal, dan Tampilan" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Kota manual</FieldLabel>
            <select className="input" value={props.coords.city in cityOptions ? props.coords.city : "Jakarta"} onChange={(event) => props.setManualCity(event.target.value)}>
              {Object.keys(cityOptions).map((city) => <option key={city}>{city}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Metode sholat</FieldLabel>
            <select className="input" value={props.method} onChange={(event) => props.setMethod(Number(event.target.value))}>
              {methodOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Format waktu</FieldLabel>
            <select className="input" value={props.timeFormat} onChange={(event) => props.setTimeFormat(event.target.value as TimeFormat)}>
              <option value="24h">24 jam - 17:46</option>
              <option value="12h">12 jam - 05:46 PM</option>
            </select>
          </div>
          <div>
            <FieldLabel>Tema</FieldLabel>
            <select className="input" value={props.theme} onChange={(event) => props.setTheme(event.target.value as ThemeMode)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">Jika jadwal terasa berbeda, pilih metode perhitungan yang sesuai daerah kamu.</p>
      </section>

      <section className="card">
        <SectionTitle title="Widget Beranda" subtitle="Pilih widget ringkas yang tampil di Beranda." />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(widgetLabels) as WidgetKey[]).map((key) => (
            <label key={key} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3">
              <input
                type="checkbox"
                checked={props.dashboardWidgets.includes(key)}
                onChange={(event) => props.setDashboardWidgets((items) => event.target.checked ? [...items, key] : items.filter((item) => item !== key))}
              />
              {widgetLabels[key]}
            </label>
          ))}
        </div>
        <Button className="mt-3" onClick={() => props.setDashboardWidgets(defaultWidgets)}>Reset Widget</Button>
      </section>

      <section className="card">
        <SectionTitle title="Penyesuaian Jadwal" subtitle="Gunakan jika jadwal daerah kamu berbeda beberapa menit." />
        <div className="grid gap-2 sm:grid-cols-2">
          {prayerNames.map((name) => (
            <label key={name}>
              <span className="mb-1 block text-sm font-semibold">Adjust {name}: {props.prayerAdjustments[name]} menit</span>
              <input
                className="w-full"
                type="range"
                min={-5}
                max={5}
                value={props.prayerAdjustments[name]}
                onChange={(event) => props.setPrayerAdjustments((current) => ({ ...current, [name]: Number(event.target.value) }))}
              />
            </label>
          ))}
        </div>
        <Button className="mt-3" onClick={() => props.setPrayerAdjustments(defaultPrayerAdjustments)}>Reset Adjustment</Button>
      </section>

      <section className="card">
        <SectionTitle title="Gaya Pengingat" subtitle="Semua pilihan tetap sopan dan tidak menyalahkan." />
        <select className="input" value={props.reminderTone} onChange={(event) => props.setReminderTone(event.target.value as ReminderTone)}>
          <option value="soft">Lembut</option>
          <option value="neutral">Netral</option>
          <option value="firm">Tegas</option>
        </select>
        <div className="mt-3 rounded-xl bg-page p-3 text-sm text-muted">
          {props.reminderTone === "soft" ? "Sudah masuk waktu Isya. Pelan-pelan yuk bersiap." : props.reminderTone === "firm" ? "Sudah masuk waktu Isya. Jangan lupa sholat." : "Sudah masuk waktu Isya."}
        </div>
      </section>

      <section className="card">
        <SectionTitle title="Jangan Ganggu" subtitle={dndLabel(props.dnd, props.timeFormat)} />
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => props.setDnd({ enabled: false, until: null })}>Off</Button>
          <Button onClick={() => setDndFor(30)}>30 menit</Button>
          <Button onClick={() => setDndFor(60)}>1 jam</Button>
          <Button onClick={() => {
            const until = new Date();
            until.setDate(until.getDate() + 1);
            until.setHours(5, 0, 0, 0);
            props.setDnd({ enabled: true, until: until.toISOString() });
          }}>Sampai besok</Button>
        </div>
        <label className="mt-3 flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={props.notifications.keepPrayerDuringDnd} onChange={(event) => props.setNotifications((current) => ({ ...current, keepPrayerDuringDnd: event.target.checked }))} />
          Tetap ingatkan waktu sholat
        </label>
      </section>

      <section className="card">
        <SectionTitle title="Aksi Favorit" />
        <div className="grid grid-cols-2 gap-2">
          {defaultQuickActions.map((action) => (
            <label key={action} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3">
              <input
                type="checkbox"
                checked={props.quickActions.includes(action)}
                onChange={(event) =>
                  props.setQuickActions((items) => (event.target.checked ? [...items, action] : items.filter((item) => item !== action)))
                }
              />
              {action}
            </label>
          ))}
        </div>
        <Button className="mt-3" onClick={() => props.setQuickActions(defaultQuickActions)}>Reset Default</Button>
      </section>

      <section className="card">
        <SectionTitle title="PWA dan Privasi" />
        {props.installPrompt ? (
          <Button
            variant="primary"
            onClick={async () => {
              await props.installPrompt?.prompt();
              props.setInstallPrompt(null);
            }}
          >
            Pasang WaktuAI
          </Button>
        ) : (
          <p className="rounded-xl bg-page p-3 text-sm text-muted">Jika browser mendukung, opsi install akan muncul setelah WaktuAI memenuhi syarat PWA.</p>
        )}
        <p className="mt-3 text-sm text-muted">Data WaktuAI disimpan lokal di browser. Tidak ada akun, token perangkat, atau backend push di versi web statis ini.</p>
      </section>

      <section className="card">
        <SectionTitle title="Backup dan Restore" />
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={props.exportSettings}>Export / Copy</Button>
          <Button onClick={props.importSettings}>Import JSON</Button>
        </div>
        <textarea className="input mt-3 min-h-28" value={props.importText} onChange={(event) => props.setImportText(event.target.value)} placeholder="Paste JSON backup di sini" aria-label="Import JSON settings" />
      </section>

      <section className="card">
        <SectionTitle title="Reset dan Safe Mode" />
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="font-semibold">Safe mode</span>
          <input
            type="checkbox"
            checked={props.safeMode}
            onChange={(event) => {
              props.setSafeMode(event.target.checked);
              if (event.target.checked) {
                props.setVoice((current) => ({ ...current, enabled: false }));
                props.setNotifications((current) => ({ ...current, repeatMode: "off" }));
              }
            }}
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={() => props.setHistory([])}>Reset Riwayat</Button>
          <Button onClick={() => props.setReminders([])}>Reset Reminder</Button>
          <Button onClick={() => props.setCoords({ lat: cityOptions.Jakarta.lat, lon: cityOptions.Jakarta.lon, city: "Jakarta", source: "Default Jakarta" })}>Reset Lokasi</Button>
          <Button onClick={() => props.setTracker({})}>Reset Tracker</Button>
          <Button className="col-span-2" onClick={props.resetAllSettings}>Reset Semua</Button>
        </div>
      </section>

      <section className="card">
        <SectionTitle title="Riwayat Notifikasi" />
        {props.history.length ? (
          <div className="grid max-h-96 gap-2 overflow-auto">
            {props.history.map((item) => (
              <div key={item.id} className="rounded-xl border border-line bg-page p-3 text-sm">
                <p className="font-bold">{item.title}</p>
                <p className="text-muted">{item.type} - {item.status} - {formatDateTime(item.time, props.timeFormat)}</p>
                {item.reason ? <p className="text-muted">{item.reason}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-page p-3 text-sm text-muted">Belum ada riwayat.</p>
        )}
      </section>

      <section className="card">
        <SectionTitle title="Tentang" />
        <p className="text-sm text-muted">WaktuAI 2.0.0 - Web / Vite / Vercel.</p>
        <ul className="mt-3 list-inside list-disc text-sm text-muted">
          <li>Added prayer notifications</li>
          <li>Added exact reminders</li>
          <li>Added qibla direction</li>
          <li>Added rakaat manual counter</li>
          <li>Added tasbih counter</li>
        </ul>
      </section>
    </>
  );
}

function PermissionRow({ label, status, action, help }: { label: string; status: string; action: () => void; help: string }) {
  return (
    <div className="mb-2 rounded-xl border border-line bg-page p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold">{label}</p>
          <p className="text-sm text-muted">{status}</p>
        </div>
        <Button onClick={action}>{status === "unsupported" ? "Buka Bantuan" : "Minta Izin"}</Button>
      </div>
      {status === "denied" || status === "unsupported" ? <p className="mt-2 text-sm text-muted">{status === "unsupported" ? "Browser ini belum mendukung fitur ini." : help}</p> : null}
    </div>
  );
}

function CommandCenter({ runCommand }: { runCommand: (command: string) => void }) {
  const [search, setSearch] = useState("");
  const commands = [
    ["Waktu", "Jam berapa sekarang?"],
    ["Sholat", "Jadwal sholat hari ini"],
    ["Sholat", "Isya jam berapa"],
    ["Notifikasi", "Aktifkan notifikasi sholat"],
    ["Notifikasi", "Tes notifikasi"],
    ["Reminder", "Ingatkan aku 17:46"],
    ["Reminder", "Alarm 04:30 setiap hari"],
    ["Kiblat", "Arah kiblat"],
    ["Rakaat", "Mulai deteksi rakaat"],
    ["Rakaat", "Tambah rakaat"],
    ["Tasbih", "Hitung tasbih"],
    ["Bantuan", "Aku bingung"],
  ];
  const filtered = commands.filter(([category, text]) => `${category} ${text}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="mt-4">
      <FieldLabel>Command Center</FieldLabel>
      <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari: isya, reminder, kiblat, rakaat, tasbih" aria-label="Cari command" />
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(filtered.length ? filtered : commands.slice(0, 5)).map(([category, text]) => (
          <button key={`${category}-${text}`} className="min-h-14 rounded-xl border border-line bg-page p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" onClick={() => runCommand(text)}>
            <p className="text-xs font-bold uppercase text-brand">{category}</p>
            <p className="font-semibold">{text}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function TroubleshootingCards(props: {
  topic: string;
  requestNotificationPermission: () => void;
  testVoice: () => void;
  sendTestNotification: () => void;
  requestGps: () => void;
  openTab: (tab: Tab) => void;
}) {
  const topic = props.topic;
  const cards = topic.includes("notifikasi")
    ? [
        ["Cek izin", props.requestNotificationPermission],
        ["Kirim tes", props.sendTestNotification],
        ["Buka pengaturan", () => props.openTab("settings")],
      ]
    : topic.includes("suara")
      ? [["Tes suara", props.testVoice], ["Buka voice settings", () => props.openTab("settings")]]
      : topic.includes("kiblat")
        ? [["Refresh GPS", props.requestGps], ["Buka kiblat", () => props.openTab("prayer")]]
        : topic.includes("kamera")
          ? [["Buka rakaat", () => props.openTab("rakaat")], ["Pakai manual", () => props.openTab("rakaat")]]
          : [["Buka bantuan", () => props.openTab("home")], ["Buka pengaturan", () => props.openTab("settings")]];
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      {cards.map(([label, action]) => (
        <Button key={label as string} onClick={action as () => void}>{label as string}</Button>
      ))}
    </div>
  );
}

function BottomNav({ activeTab, setActiveTab }: { activeTab: Tab; setActiveTab: (tab: Tab) => void }) {
  const items: Array<[Tab, string]> = [
    ["home", "Beranda"],
    ["prayer", "Sholat"],
    ["reminder", "Reminder"],
    ["rakaat", "Rakaat"],
    ["settings", "Pengaturan"],
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/95 px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 backdrop-blur md:sticky md:bottom-auto md:mx-auto md:mt-6 md:max-w-5xl md:rounded-2xl md:border">
      <div className="mx-auto grid max-w-5xl grid-cols-5 gap-1">
        {items.map(([tab, label]) => (
          <button
            key={tab}
            className={`min-h-14 rounded-xl px-1 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand sm:text-sm ${activeTab === tab ? "bg-brand text-white dark:text-slate-950" : "text-muted"}`}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function Onboarding(props: {
  requestGps: () => void;
  requestNotificationPermission: () => void;
  testVoice: () => void;
  finish: () => void;
  skip: () => void;
}) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: "Selamat datang",
      body: "WaktuAI bantu jadwal sholat, reminder, kiblat, dan rakaat.",
      action: null,
    },
    {
      title: "Lokasi",
      body: "Pakai GPS untuk jadwal dan kiblat lebih sesuai. Kamu juga bisa pilih kota manual nanti.",
      action: props.requestGps,
    },
    {
      title: "Notifikasi",
      body: "Aktifkan notifikasi sholat saat WaktuAI terbuka atau PWA aktif.",
      action: props.requestNotificationPermission,
    },
    {
      title: "Voice AI",
      body: "Tes suara sekali supaya browser mengizinkan suara setelah interaksi.",
      action: props.testVoice,
    },
    {
      title: "Siap digunakan",
      body: "Semua fitur utama punya fallback manual jika izin browser tidak tersedia.",
      action: null,
    },
  ];
  const current = steps[step];
  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-slate-950/55 p-3 sm:place-items-center">
      <div className="w-full max-w-md rounded-2xl bg-panel p-5 shadow-soft">
        <p className="text-sm font-bold text-brand">Langkah {step + 1}/5</p>
        <h2 className="mt-2 text-2xl font-black">{current.title}</h2>
        <p className="mt-2 text-muted">{current.body}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button onClick={props.skip}>Lewati</Button>
          {current.action ? <Button onClick={current.action}>Jalankan</Button> : null}
          <Button variant="primary" className={current.action ? "col-span-2" : ""} onClick={step === steps.length - 1 ? props.finish : () => setStep((item) => item + 1)}>
            {step === steps.length - 1 ? "Selesai" : "Lanjut"}
          </Button>
        </div>
      </div>
    </div>
  );
}
