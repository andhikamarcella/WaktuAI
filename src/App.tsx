import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CommandCenter } from "./components/CommandCenter";
import { HelpCards } from "./components/HelpCards";
import { RakaatCard } from "./components/RakaatCard";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { PrayerBanner, PrayerNotificationPreferences, usePrayerNotificationScheduler } from "./hooks/usePrayerNotificationScheduler";
import { ReminderBanner, useReminderScheduler } from "./hooks/useReminderScheduler";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { getNotificationPermissionState, NotificationPermissionState, requestNotificationPermission, sendBrowserNotification } from "./lib/notifications";
import { parseReminderInput, Reminder } from "./lib/reminders";
import { speakIndonesian } from "./lib/speech";
import { buildTodayPrayerSchedule, formatHHMM, formatLocalDate, PrayerName, PrayerTime, toLocalDateTimeText } from "./lib/time";
import { parseVoiceCommand } from "./lib/voiceCommands";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DEFAULT_PRAYER_PREFS: PrayerNotificationPreferences = {
  enabled: false,
  prayers: {
    Subuh: true,
    Dzuhur: true,
    Ashar: true,
    Maghrib: true,
    Isya: true
  },
  preReminderMinutes: 10,
  reminderMode: "gentle",
  doNotDisturb: false,
  voiceEnabled: true
};

function makeToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function App() {
  const [prayerTimes, setPrayerTimes] = useLocalStorage<PrayerTime[]>("waktuai.prayerTimes", buildTodayPrayerSchedule());
  const [preferences, setPreferences] = useLocalStorage<PrayerNotificationPreferences>("waktuai.prayerPrefs", DEFAULT_PRAYER_PREFS);
  const [sentPrayerKeys, setSentPrayerKeys] = useLocalStorage<string[]>("waktuai.sentPrayerKeys", []);
  const [completedPrayerKeys, setCompletedPrayerKeys] = useLocalStorage<string[]>("waktuai.completedPrayerKeys", []);
  const [disabledTodayKeys, setDisabledTodayKeys] = useLocalStorage<string[]>("waktuai.disabledTodayKeys", []);
  const [reminders, setReminders] = useLocalStorage<Reminder[]>("waktuai.reminders", []);
  const [sentReminderIds, setSentReminderIds] = useLocalStorage<string[]>("waktuai.sentReminderIds", []);
  const [command, setCommand] = useState("");
  const [assistantText, setAssistantText] = useState("Assalamu'alaikum. Tulis perintah, buat reminder, atau buka bantuan kalau bingung.");
  const [showHelp, setShowHelp] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string }>>([]);
  const [prayerBanner, setPrayerBanner] = useState<PrayerBanner | null>(null);
  const [reminderBanner, setReminderBanner] = useState<ReminderBanner | null>(null);
  const [notificationState, setNotificationState] = useState<NotificationPermissionState>(getNotificationPermissionState());
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const today = formatLocalDate(new Date());
  const prayerTimeMap = useMemo(
    () => Object.fromEntries(prayerTimes.map((item) => [item.name, item.time])) as Partial<Record<PrayerName, string>>,
    [prayerTimes]
  );

  const showToast = (message: string) => {
    const id = makeToastId();
    setToasts((items) => [...items, { id, message }].slice(-4));
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 5500);
  };

  const answer = (message: string) => {
    setAssistantText(message);
    if (preferences.voiceEnabled) speakIndonesian(message);
  };

  const speech = useSpeechRecognition({
    onFinalResult: (text) => runCommand(text),
    onStart: () => showToast("Mikrofon aktif. Silakan bicara."),
    onSuccess: () => showToast("Perintah suara diterima."),
    onError: () => showToast("Mikrofon belum bisa dipakai. Kamu tetap bisa ketik perintah.")
  });

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    setSentPrayerKeys((keys) => keys.filter((key) => key.startsWith(today)));
  }, [setSentPrayerKeys, today]);

  usePrayerNotificationScheduler({
    prayerTimes,
    preferences,
    sentKeys: sentPrayerKeys,
    completedKeys: completedPrayerKeys,
    disabledTodayKeys,
    onSentKeysChange: setSentPrayerKeys,
    onPrayerBanner: setPrayerBanner,
    onToast: showToast
  });

  useReminderScheduler({
    reminders,
    sentReminderIds,
    voiceEnabled: preferences.voiceEnabled,
    onSentReminderIdsChange: setSentReminderIds,
    onReminderBanner: setReminderBanner,
    onToast: showToast,
    onReminderRepeat: (id) => {
      setReminders((items) =>
        items.map((item) => {
          if (item.id !== id) return item;
          const nextDate = new Date();
          nextDate.setMinutes(nextDate.getMinutes() + 1);
          return { ...item, dateTime: nextDate.toISOString(), repeatCount: item.repeatCount + 1 };
        })
      );
    }
  });

  const enableNotifications = async () => {
    const result = await requestNotificationPermission();
    setNotificationState(result);
    if (result === "granted") {
      setPreferences((prefs) => ({ ...prefs, enabled: true }));
      answer("Notifikasi sholat aktif selama WaktuAI terbuka atau PWA aktif.");
      showToast("Notifikasi sholat aktif selama WaktuAI terbuka atau PWA aktif.");
    } else if (result === "denied") {
      answer("Izin notifikasi ditolak. Aktifkan lagi dari pengaturan browser.");
      showToast("Izin notifikasi ditolak. Aktifkan lagi dari pengaturan browser.");
    } else {
      answer("Browser ini belum mendukung Notification API. Aku tetap tampilkan pengingat di dalam aplikasi.");
      showToast("Browser ini belum mendukung Notification API.");
    }
  };

  const sendTest = () => {
    const delivered = sendBrowserNotification("WaktuAI - Tes Notifikasi", "Notifikasi aktif saat aplikasi terbuka atau PWA aktif.");
    answer(delivered ? "Notifikasi tes dikirim." : "Notifikasi browser belum aktif. Fallback in-app ditampilkan.");
    showToast(delivered ? "Notifikasi tes dikirim." : "Notifikasi browser belum aktif. Fallback in-app ditampilkan.");
    setNotificationState(getNotificationPermissionState());
  };

  const disableNotifications = () => {
    setPreferences((prefs) => ({ ...prefs, enabled: false }));
    setPrayerBanner(null);
    answer("Semua notifikasi sholat dari WaktuAI dimatikan.");
    showToast("Semua notifikasi sholat dari WaktuAI dimatikan.");
  };

  const testVoice = () => {
    const spoken = speakIndonesian("Halo, ini suara WaktuAI. Pengingat sholat aktif.");
    setAssistantText(spoken ? "Tes suara AI diputar." : "SpeechSynthesis tidak didukung browser ini.");
    showToast(spoken ? "Tes suara AI diputar." : "SpeechSynthesis tidak didukung browser ini.");
  };

  const createReminder = (input: string) => {
    const parsed = parseReminderInput(input, { prayerTimes: prayerTimeMap });
    answer(parsed.response);
    if (parsed.ok) {
      setReminders((items) => [...items, parsed.reminder]);
      showToast(parsed.response);
    } else {
      showToast(parsed.response);
    }
  };

  function runCommand(input: string) {
    const parsed = parseVoiceCommand(input);
    setCommand(input);
    if (parsed.intent === "HELP") {
      setShowHelp(true);
      answer("Tenang, aku bantu. Kamu bisa pakai WaktuAI untuk tanya jam, jadwal sholat, arah kiblat, reminder, notifikasi sholat, dan hitung rakaat.");
      return;
    }
    if (parsed.intent === "ASK_TIME") {
      answer(`Sekarang jam ${formatHHMM(new Date())}.`);
      return;
    }
    if (parsed.intent === "PRAYER_SCHEDULE") {
      answer(prayerTimes.map((item) => `${item.name} ${item.time}`).join(" | "));
      return;
    }
    if (parsed.intent === "QIBLA") {
      answer("Arah kiblat perlu kompas perangkat dan izin sensor. Jika sensor tidak tersedia, gunakan aplikasi kompas lalu arahkan sekitar 295 derajat dari Jakarta.");
      return;
    }
    if (parsed.intent === "TEST_NOTIFICATION") {
      sendTest();
      return;
    }
    if (parsed.intent === "TEST_AI_VOICE") {
      testVoice();
      return;
    }
    if (parsed.intent === "ENABLE_PRAYER_NOTIFICATIONS") {
      void enableNotifications();
      return;
    }
    if (parsed.intent === "DISABLE_PRAYER_NOTIFICATIONS") {
      disableNotifications();
      return;
    }
    if (parsed.intent === "ENABLE_STRONG_REMINDER") {
      setPreferences((prefs) => ({ ...prefs, reminderMode: "strong" }));
      answer("Mode Pengingat Berulang diatur ke Strong. Maksimal 4 notifikasi per sholat.");
      return;
    }
    if (parsed.intent === "DISABLE_STRONG_REMINDER") {
      setPreferences((prefs) => ({ ...prefs, reminderMode: "off" }));
      answer("Mode Pengingat Berulang dimatikan.");
      return;
    }
    if (parsed.intent === "CREATE_EXACT_TIME_REMINDER" && parsed.reminderText) {
      createReminder(parsed.reminderText);
      return;
    }
    if (parsed.intent === "START_RAKAAT_DETECTION") {
      document.getElementById("rakaat")?.scrollIntoView({ behavior: "smooth", block: "start" });
      answer("Buka kartu Deteksi Rakaat lalu tekan Mulai Deteksi. Hitung manual tetap bisa dipakai kapan saja.");
      return;
    }
    if (parsed.intent === "FALLBACK_MANUAL_RAKAAT") {
      document.getElementById("rakaat")?.scrollIntoView({ behavior: "smooth", block: "start" });
      answer("Mode manual tersedia di kartu Deteksi Rakaat: tambah, kurang, reset, target 2/3/4, dan selesai rakaat.");
      return;
    }
    answer("Aku belum paham perintah itu. Coba salah satu tombol saran di bawah.");
    setShowHelp(true);
  }

  const submitCommand = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runCommand(command);
  };

  const updatePrayerTime = (name: PrayerName, time: string) => {
    setPrayerTimes((items) => items.map((item) => (item.name === name ? { ...item, time } : item)));
  };

  const markPrayerDone = (prayer: PrayerName) => {
    setCompletedPrayerKeys((keys) => [...new Set([...keys, `${today}-${prayer}`])]);
    setPrayerBanner(null);
    showToast(`${prayer} ditandai sudah sholat.`);
  };

  const snoozePrayer = (prayer: PrayerName) => {
    const target = new Date();
    target.setMinutes(target.getMinutes() + 10);
    const reminder: Reminder = {
      id: `snooze-${prayer}-${Date.now()}`,
      title: `Tunda sholat ${prayer}`,
      dateTime: target.toISOString(),
      createdAt: new Date().toISOString(),
      alarmMode: false,
      repeatCount: 0,
      done: false
    };
    setReminders((items) => [...items, reminder]);
    setPrayerBanner(null);
    showToast(`${prayer} ditunda 10 menit.`);
  };

  const disablePrayerToday = (prayer: PrayerName) => {
    setDisabledTodayKeys((keys) => [...new Set([...keys, `${today}-${prayer}`])]);
    setPrayerBanner(null);
    showToast(`Pengingat ${prayer} dimatikan untuk hari ini.`);
  };

  const markReminderDone = (id: string) => {
    setReminders((items) => items.map((item) => (item.id === id ? { ...item, done: true } : item)));
    setReminderBanner(null);
  };

  const snoozeReminder = (id: string) => {
    setReminders((items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        const next = new Date();
        next.setMinutes(next.getMinutes() + 10);
        return { ...item, dateTime: next.toISOString(), done: false, repeatCount: 0 };
      })
    );
    setSentReminderIds((ids) => ids.filter((item) => !item.startsWith(`${id}:`)));
    setReminderBanner(null);
    showToast("Reminder ditunda 10 menit.");
  };

  const deleteReminder = (id: string) => {
    setReminders((items) => items.filter((item) => item.id !== id));
    setSentReminderIds((ids) => ids.filter((item) => !item.startsWith(`${id}:`)));
    setReminderBanner(null);
  };

  const installPwa = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const micStatus = speech.requesting
    ? "Meminta izin mikrofon..."
    : speech.listening
      ? "Mendengarkan perintah..."
      : speech.supported
        ? "Mikrofon siap"
        : "Mikrofon tidak didukung browser ini";

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">WaktuAI</p>
          <h1>Asisten sholat, reminder, dan hitung rakaat</h1>
          <p>Notifikasi bekerja saat aplikasi dibuka atau aktif sebagai PWA. Untuk push saat aplikasi benar-benar tertutup, dibutuhkan backend Web Push khusus.</p>
        </div>
        <div className="hero-actions">
          <button onClick={() => runCommand("Aku bingung")}>Buka Bantuan</button>
          <button className="secondary" onClick={() => document.getElementById("settings")?.scrollIntoView({ behavior: "smooth" })}>Pengaturan</button>
        </div>
      </section>

      <section className="panel assistant-panel !overflow-visible">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="status-pill">{micStatus}</span>
              {speech.transcript && <span className="status-pill">Terdengar: {speech.transcript}</span>}
            </div>
            <form onSubmit={submitCommand} className="command-form">
              <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Contoh: ingatkan aku 17:46" aria-label="Perintah WaktuAI" />
              <button type="submit">Jalankan</button>
            </form>
            {speech.interimTranscript && <p className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--panel-soft)] p-3 text-sm text-[var(--text)]">Mendengar: {speech.interimTranscript}</p>}
            {speech.error && <p className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--warning-bg)] p-3 text-sm text-[var(--warning)]">{speech.error}</p>}
          </div>

          <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel-soft)] p-4 text-center">
            <button
              type="button"
              className={`mx-auto grid h-24 w-24 place-items-center rounded-full text-base font-black shadow-xl transition ${speech.listening ? "animate-pulse bg-red-500 text-white" : "bg-[var(--primary)] text-white"}`}
              onClick={() => {
                if (speech.listening) speech.stop();
                else void speech.start();
              }}
              disabled={speech.requesting || !speech.supported}
              aria-label={speech.listening ? "Stop mikrofon" : "Mulai mikrofon"}
            >
              {speech.listening ? "STOP" : "MIC"}
            </button>
            <p className="text-sm font-semibold text-[var(--text)]">{micStatus}</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="secondary" type="button" onClick={() => { void speech.retry(); }} disabled={speech.requesting || !speech.supported}>Coba Lagi</button>
              <button className="secondary" type="button" onClick={() => { void speech.runDiagnostic(); }}>Cek Mic</button>
            </div>
          </div>
        </div>

        {speech.diagnostics.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {speech.diagnostics.map((item) => (
              <div key={item.label} className="rounded-lg border border-[var(--border)] bg-[var(--panel-soft)] p-3 text-sm">
                <strong>{item.ok ? "OK" : "Perlu dicek"} - {item.label}</strong>
                <p className="mt-1 text-[var(--muted)]">{item.detail}</p>
              </div>
            ))}
          </div>
        )}

        <p className="assistant-text mt-4 rounded-lg border border-[var(--border)] bg-[var(--panel-soft)] p-4 text-base" aria-live="polite">{assistantText}</p>
        {showHelp && <HelpCards onRunCommand={runCommand} />}
      </section>

      <div className="layout-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Jadwal sholat</p>
              <h2>Jadwal hari ini</h2>
            </div>
          </div>
          <div className="prayer-list">
            {prayerTimes.map((prayer) => (
              <label key={prayer.name} className="prayer-row">
                <span>{prayer.name}</span>
                <input type="time" value={prayer.time} onChange={(event) => updatePrayerTime(prayer.name, event.target.value)} />
                <input
                  type="checkbox"
                  checked={preferences.prayers[prayer.name]}
                  onChange={(event) => setPreferences((prefs) => ({ ...prefs, prayers: { ...prefs.prayers, [prayer.name]: event.target.checked } }))}
                  aria-label={`Aktifkan ${prayer.name}`}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="panel" id="settings">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Notifikasi</p>
              <h2>Pengingat sholat dan suara</h2>
            </div>
            <span className="status-pill">{notificationState}</span>
          </div>
          <p className="notice">Notifikasi WaktuAI bekerja paling baik saat aplikasi dibuka atau dipasang sebagai PWA. Untuk push notifikasi saat aplikasi benar-benar tertutup, dibutuhkan backend Web Push khusus.</p>
          {notificationState === "denied" && <p className="notice warning">Izin notifikasi ditolak. Aktifkan lagi dari pengaturan browser.</p>}
          <div className="button-row">
            <button onClick={enableNotifications}>Aktifkan Notifikasi Sholat</button>
            <button className="secondary" onClick={sendTest}>Kirim Notifikasi Tes</button>
            <button className="secondary" onClick={disableNotifications}>Matikan Semua Notifikasi</button>
          </div>
          <div className="settings-grid">
            <label>
              Pre-reminder
              <select value={preferences.preReminderMinutes} onChange={(event) => setPreferences((prefs) => ({ ...prefs, preReminderMinutes: Number(event.target.value) as 0 | 5 | 10 | 15 }))}>
                <option value={0}>Off</option>
                <option value={5}>5 menit</option>
                <option value={10}>10 menit</option>
                <option value={15}>15 menit</option>
              </select>
            </label>
            <label>
              Mode Pengingat Berulang
              <select value={preferences.reminderMode} onChange={(event) => setPreferences((prefs) => ({ ...prefs, reminderMode: event.target.value as PrayerNotificationPreferences["reminderMode"] }))}>
                <option value="off">Off</option>
                <option value="gentle">Gentle</option>
                <option value="strong">Strong</option>
              </select>
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={preferences.voiceEnabled} onChange={(event) => setPreferences((prefs) => ({ ...prefs, voiceEnabled: event.target.checked }))} />
              Suara AI untuk semua jawaban dan pengingat
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={preferences.doNotDisturb} onChange={(event) => setPreferences((prefs) => ({ ...prefs, doNotDisturb: event.target.checked }))} />
              Do Not Disturb
            </label>
          </div>
          <div className="button-row">
            <button className="secondary" onClick={testVoice}>Tes Suara AI</button>
            {installPrompt && <button className="secondary" onClick={installPwa}>Pasang PWA</button>}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Custom reminder</p>
            <h2>Reminder dan alarm lokal</h2>
          </div>
        </div>
        <form className="command-form" onSubmit={(event) => {
          event.preventDefault();
          createReminder(command);
        }}>
          <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Contoh: alarm 04:30 atau ingatkan aku 10 menit lagi" />
          <button type="submit">Tambah Reminder</button>
        </form>
        <div className="reminder-list">
          {reminders.filter((item) => !item.done).map((reminder) => (
            <div key={reminder.id} className="reminder-row">
              <div>
                <strong>{reminder.title}</strong>
                <span>{toLocalDateTimeText(reminder.dateTime)}{reminder.alarmMode ? " - alarm" : ""}</span>
              </div>
              <button className="secondary" onClick={() => deleteReminder(reminder.id)}>Hapus</button>
            </div>
          ))}
          {reminders.filter((item) => !item.done).length === 0 && <p className="muted">Belum ada reminder aktif.</p>}
        </div>
      </section>

      <RakaatCard />
      <CommandCenter onRunCommand={runCommand} />

      {prayerBanner && (
        <div className="sticky-banner" role="status">
          <strong>{prayerBanner.message}</strong>
          <div className="button-row">
            <button onClick={() => markPrayerDone(prayerBanner.prayer)}>Sudah Sholat</button>
            <button className="secondary" onClick={() => snoozePrayer(prayerBanner.prayer)}>Tunda 10 Menit</button>
            <button className="secondary" onClick={() => disablePrayerToday(prayerBanner.prayer)}>Matikan Hari Ini</button>
          </div>
        </div>
      )}

      {reminderBanner && (
        <div className="sticky-banner reminder" role="status">
          <strong>{reminderBanner.message}</strong>
          <div className="button-row">
            <button onClick={() => markReminderDone(reminderBanner.reminder.id)}>Selesai</button>
            <button className="secondary" onClick={() => snoozeReminder(reminderBanner.reminder.id)}>Tunda 10 Menit</button>
            <button className="secondary" onClick={() => deleteReminder(reminderBanner.reminder.id)}>Hapus Reminder</button>
          </div>
        </div>
      )}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => <div key={toast.id} className="toast">{toast.message}</div>)}
      </div>
    </main>
  );
}

export default App;
