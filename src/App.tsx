import { useCallback, useEffect, useMemo, useState } from "react";
import ClockCard from "@/components/ClockCard";
import CommandCenter, { HelpCards } from "@/components/CommandCenter";
import { PrayerReminderBanner, ReminderActionBanner, ToastStack } from "@/components/InAppBanners";
import NextPrayerCard from "@/components/NextPrayerCard";
import NotificationSettings from "@/components/NotificationSettings";
import PrayerScheduleCard from "@/components/PrayerScheduleCard";
import ReminderList from "@/components/ReminderList";
import ThemeToggle from "@/components/ThemeToggle";
import VoiceAssistant from "@/components/VoiceAssistant";
import SmartRakaatCounterCard from "@/src/components/SmartRakaatCounterCard";
import QiblaCard from "@/src/components/QiblaCard";
import { DEFAULT_NOTIFICATION_SETTINGS, getNotificationPermission, requestNotificationPermission, showBrowserNotification } from "@/lib/notifications";
import { CITIES, JAKARTA, fetchPrayerSchedule, findNextPrayer, getCachedPrayerSchedule, getHijriMonthGrid } from "@/lib/prayer";
import { buildReminder, prunePastReminders } from "@/lib/reminders";
import { speakIndonesian } from "@/lib/speech";
import { readStorage, writeStorage } from "@/lib/storage";
import { formatClock, formatIndonesianDate, getDateKey, getPassedPrayerCount } from "@/lib/time";
import { ParsedCommand, UNKNOWN_RESPONSE, parseVoiceCommand } from "@/lib/voiceCommands";
import { usePrayerNotificationScheduler, disablePrayerForToday, snoozePrayer, type PrayerBannerState } from "@/src/hooks/usePrayerNotificationScheduler";
import { useReminderScheduler, type ReminderBannerState } from "@/src/hooks/useReminderScheduler";
import type { CityOption, PrayerName, PrayerSchedule } from "@/types/prayer";
import type { AssistantSettings, CommandHistoryItem, DndState, Reminder } from "@/types/reminder";
import type { RakaatExternalAction } from "@/src/types/rakaat";
import { useQibla } from "@/src/hooks/useQibla";

const quotes = ["Sholat tepat waktu adalah latihan terbaik untuk disiplin hati.", "Mulai dari satu kebaikan kecil, jaga konsistensinya.", "Waktu adalah amanah; gunakan untuk yang mendekatkan pada Allah."];
const defaultAssistant: AssistantSettings = { voiceEnabled: true, speechRate: "normal", notificationSound: false, prayerVoiceEnabled: true, reminderVoiceEnabled: true, persistentReminderMode: "off" };
const defaultCompleted: Record<PrayerName, boolean> = { Subuh: false, Dzuhur: false, Ashar: false, Maghrib: false, Isya: false };
const HELP_RESPONSE = "Tenang, aku bantu. Kamu bisa pakai WaktuAI untuk tanya jam, jadwal sholat, arah kiblat, reminder, notifikasi sholat, dan hitung rakaat.";

export default function App() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [online, setOnline] = useState(true);
  const [schedule, setSchedule] = useState<PrayerSchedule | null>(null);
  const [city, setCity] = useState<CityOption>(JAKARTA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [response, setResponse] = useState("");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [history, setHistory] = useState<CommandHistoryItem[]>([]);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [permission, setPermission] = useState("default");
  const [notifSettings, setNotifSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [assistant, setAssistant] = useState(defaultAssistant);
  const [dnd, setDnd] = useState<DndState>({ until: null });
  const [completed, setCompleted] = useState<Record<PrayerName, boolean>>(defaultCompleted);
  const [onboarding, setOnboarding] = useState(false);
  const [rakaatAction, setRakaatAction] = useState<{ type: RakaatExternalAction; nonce: number }>({ type: null, nonce: 0 });
  const [rakaatInfo, setRakaatInfo] = useState<{ count: number; target: 2 | 3 | 4; mobile: boolean }>({ count: 0, target: 4, mobile: false });
  const [toasts, setToasts] = useState<Array<{ id: string; message: string }>>([]);
  const [prayerBanner, setPrayerBanner] = useState<PrayerBannerState | null>(null);
  const [reminderBanner, setReminderBanner] = useState<ReminderBannerState | null>(null);
  const [helpMode, setHelpMode] = useState(false);

  const addToast = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setToasts((items) => [{ id, message }, ...items].slice(0, 4));
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 8000);
  }, []);

  useEffect(() => {
    setMounted(true);
    setTheme(readStorage("waktuai.theme", "light"));
    setOnline(navigator.onLine);
    setCity(readStorage("waktuai.city", JAKARTA));
    setReminders(prunePastReminders(readStorage("waktuai.reminders", [])));
    setHistory(readStorage("waktuai.history", []));
    setNotifEnabled(readStorage("waktuai.notifEnabled", false));
    setNotifSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, ...readStorage("waktuai.notifSettings", DEFAULT_NOTIFICATION_SETTINGS) });
    setAssistant({ ...defaultAssistant, ...readStorage("waktuai.assistant", defaultAssistant) });
    setDnd(readStorage("waktuai.dnd", { until: null }));
    setCompleted({ ...defaultCompleted, ...readStorage(`waktuai.completed.${getDateKey()}`, defaultCompleted) });
    setOnboarding(!readStorage("waktuai.onboarded", false));
    setPermission(getNotificationPermission());
  }, []);
  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); writeStorage("waktuai.theme", theme); }, [theme]);
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 1000); const on = () => setOnline(true); const off = () => setOnline(false); window.addEventListener("online", on); window.addEventListener("offline", off); return () => { window.clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", off); }; }, []);
  useEffect(() => { writeStorage("waktuai.reminders", reminders); }, [reminders]);
  useEffect(() => { writeStorage("waktuai.history", history); }, [history]);
  useEffect(() => { writeStorage("waktuai.notifEnabled", notifEnabled); writeStorage("waktuai.notifSettings", notifSettings); writeStorage("waktuai.assistant", assistant); writeStorage("waktuai.dnd", dnd); writeStorage(`waktuai.completed.${getDateKey()}`, completed); }, [notifEnabled, notifSettings, assistant, dnd, completed]);

  const loadSchedule = useCallback(async (selected: CityOption, source: PrayerSchedule["source"] = "city") => {
    setLoading(true); setError(null); const cached = getCachedPrayerSchedule(); if (cached && cached.city === selected.name) setSchedule(cached);
    if (!navigator.onLine) { setLoading(false); if (!cached) setError("Sedang offline dan belum ada cache jadwal hari ini. Pilih Coba lagi saat internet tersedia."); return; }
    try { const data = await fetchPrayerSchedule(selected, source); setSchedule(data); }
    catch (e) { if (!cached) setError(e instanceof Error ? e.message : "Gagal mengambil jadwal sholat."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!mounted) return; void loadSchedule(city, city.name === "Jakarta" ? "fallback" : "city"); writeStorage("waktuai.city", city); }, [city, loadSchedule, mounted]);

  usePrayerNotificationScheduler({ enabled: notifEnabled, schedule, settings: notifSettings, assistant, dnd, completed, onToast: addToast, onPrayerDue: setPrayerBanner });
  useReminderScheduler({ reminders, assistant, dnd, onToast: addToast, onFire: setReminderBanner });

  const nextPrayer = useMemo(() => schedule ? findNextPrayer(schedule.prayers, now) : null, [schedule, now]);
  const qibla = useQibla(city);
  const progressPassed = schedule ? getPassedPrayerCount(schedule.prayers, now) : 0;
  const hijriDay = Number(schedule?.hijri?.day ?? 1);
  const hijriGrid = schedule?.hijri ? getHijriMonthGrid(hijriDay, schedule.hijri.month, schedule.hijri.year) : [];

  const handleRakaatCountChange = useCallback((count: number, target: 2 | 3 | 4) => setRakaatInfo((info) => info.count === count && info.target === target ? info : { ...info, count, target }), []);
  const handleRakaatMobileChange = useCallback((mobile: boolean) => setRakaatInfo((info) => info.mobile === mobile ? info : { ...info, mobile }), []);

  const speak = useCallback((text: string) => { speakIndonesian(text, assistant); }, [assistant]);
  const respond = useCallback((input: string, output: string) => { setCommand(input); setResponse(output); setHistory((items) => [{ id: crypto.randomUUID(), command: input, response: output, createdAt: new Date().toISOString() }, ...items].slice(0, 10)); if (output !== UNKNOWN_RESPONSE) speak(output); }, [speak]);

  const enableNotifications = useCallback(() => {
    setNotifEnabled(true);
    void requestNotificationPermission().then((p) => { setPermission(p); if (p === "denied") addToast("Izin notifikasi ditolak. Aktifkan lagi dari pengaturan browser."); if (p === "unsupported") addToast("Browser belum mendukung notifikasi. Toast dalam aplikasi tetap aktif."); });
  }, [addToast]);
  const sendTestNotification = useCallback(() => {
    if (getNotificationPermission() === "default") { enableNotifications(); return; }
    const delivered = showBrowserNotification("WaktuAI - Tes Notifikasi", "Notifikasi aktif dan siap dipakai.", assistant.notificationSound, dnd);
    addToast(delivered ? "Tes notifikasi dikirim." : "Toast tes: notifikasi browser belum aktif, tapi fallback dalam aplikasi berjalan.");
    setPermission(getNotificationPermission());
  }, [addToast, assistant.notificationSound, dnd, enableNotifications]);
  const testVoice = useCallback(() => { const ok = speakIndonesian("Halo, ini suara WaktuAI. Pengingat sholat aktif.", assistant); addToast(ok ? "Tes suara AI diputar." : "SpeechSynthesis belum didukung browser ini."); }, [addToast, assistant]);

  const createReminderFromParsed = useCallback((parsed: ParsedCommand): string => {
    const at = parsed.reminderAt ?? (parsed.prayerName && schedule ? new Date(schedule.prayers.find((p) => p.name === parsed.prayerName)?.dateTime ?? Date.now()) : null);
    if (at && at.getTime() > Date.now()) {
      const label = parsed.reminderLabel ?? (parsed.prayerName ? `Ingatkan sholat ${parsed.prayerName}` : "Reminder WaktuAI");
      setReminders((r) => [...r, buildReminder(label, at, parsed.prayerName ? "prayer" : "voice", parsed.prayerName)]);
      return parsed.reminderResponse ?? `Siap, aku ingatkan pada ${at.toLocaleString("id-ID")}.`;
    }
    return "Aku belum bisa membaca waktu reminder itu. Coba: ingatkan aku 17:46 atau ingatkan aku 10 menit lagi.";
  }, [schedule]);

  const handleParsed = useCallback((parsed: ParsedCommand) => {
    let out = UNKNOWN_RESPONSE;
    setHelpMode(false);
    if (parsed.type === "HELP") { out = HELP_RESPONSE; setHelpMode(true); }
    if (parsed.type === "GET_CURRENT_TIME") out = `Sekarang jam ${formatClock(new Date())}.`;
    if (parsed.type === "GET_CURRENT_DATE") out = `Hari ini ${formatIndonesianDate(new Date())}.`;
    if (parsed.type === "GET_ALL_PRAYER_TIMES") out = schedule ? `Jadwal sholat hari ini: ${schedule.prayers.map((p) => `${p.name} ${p.time}`).join(", ")}.` : "Jadwal sholat belum tersedia.";
    if (parsed.type === "GET_PRAYER_TIME") out = schedule && parsed.prayerName ? `Adzan ${parsed.prayerName} pukul ${schedule.prayers.find((p) => p.name === parsed.prayerName)?.time ?? "belum tersedia"}.` : "Nama sholat belum jelas.";
    if (["ENABLE_ADZAN_NOTIFICATION", "ENABLE_PRAYER_NOTIFICATIONS"].includes(parsed.type)) { setNotifEnabled(true); if (parsed.prayerName) setNotifSettings((s) => ({ ...s, [parsed.prayerName!]: { enabled: true, leadMinutes: parsed.leadMinutes ?? s[parsed.prayerName!].leadMinutes } })); out = parsed.prayerName ? `Notifikasi ${parsed.prayerName} aktif.` : "Notifikasi sholat aktif."; enableNotifications(); }
    if (["DISABLE_ADZAN_NOTIFICATION", "DISABLE_PRAYER_NOTIFICATIONS"].includes(parsed.type)) { if (parsed.prayerName) setNotifSettings((s) => ({ ...s, [parsed.prayerName!]: { ...s[parsed.prayerName!], enabled: false } })); else setNotifEnabled(false); out = parsed.prayerName ? `Notifikasi ${parsed.prayerName} dimatikan.` : "Notifikasi sholat dimatikan."; }
    if (parsed.type === "TEST_NOTIFICATION") { sendTestNotification(); out = "Aku kirim notifikasi tes jika izin browser sudah aktif. Fallback toast juga ditampilkan."; }
    if (parsed.type === "TEST_AI_VOICE") { testVoice(); out = "Tes suara AI diputar jika browser mendukung."; }
    if (parsed.type === "ENABLE_STRONG_REMINDER") { setAssistant((a) => ({ ...a, persistentReminderMode: "strong" })); out = "Mode Pengingat Berulang disetel ke Strong, maksimal 4 notifikasi per waktu sholat."; }
    if (parsed.type === "DISABLE_STRONG_REMINDER") { setAssistant((a) => ({ ...a, persistentReminderMode: "off" })); out = "Mode Pengingat Berulang dimatikan."; }
    if (parsed.type === "CREATE_REMINDER" || parsed.type === "CREATE_EXACT_TIME_REMINDER") out = createReminderFromParsed(parsed);
    if (parsed.type === "SET_LOCATION" && parsed.cityName) { const c = CITIES.find((x) => x.name === parsed.cityName); if (c) { writeStorage("waktuai.cityTouched", true); setCity(c); out = `Lokasi diganti ke ${c.name}.`; } }
    if (parsed.type === "SHOW_QIBLA") out = `Arah kiblat dari ${qibla.city.name} sekitar ${Math.round(qibla.qiblaBearing)} derajat dari utara.`;
    if (parsed.type === "ENABLE_DND") { const until = new Date(Date.now() + (parsed.dndMinutes ?? 60) * 60_000).toISOString(); setDnd({ until }); out = `Mode jangan ganggu aktif sampai ${new Date(until).toLocaleString("id-ID")}.`; }
    if (parsed.type === "DISABLE_DND") { setDnd({ until: null }); out = "Mode jangan ganggu dimatikan."; }
    if (parsed.type === "START_RAKAAT_DETECTION") { setRakaatAction({ type: "start", nonce: Date.now() }); out = "Memulai deteksi rakaat. Jika kamera atau model tidak tersedia, pakai tombol manual di kartu rakaat."; }
    if (parsed.type === "FALLBACK_MANUAL_RAKAAT") { setRakaatAction({ type: "increment", nonce: Date.now() }); out = "Mode manual siap. Kamu bisa tambah, kurangi, reset, set target 2/3/4, dan selesai rakaat dari kartu rakaat."; }
    if (parsed.type === "STOP_RAKAAT_DETECTION") { setRakaatAction({ type: "stop", nonce: Date.now() }); out = "Deteksi rakaat dihentikan."; }
    if (parsed.type === "RESET_RAKAAT") { setRakaatAction({ type: "reset", nonce: Date.now() }); out = "Hitungan rakaat direset."; }
    if (parsed.type === "INCREMENT_RAKAAT") { setRakaatAction({ type: "increment", nonce: Date.now() }); out = "Rakaat ditambah manual."; }
    if (parsed.type === "DECREMENT_RAKAAT") { setRakaatAction({ type: "decrement", nonce: Date.now() }); out = "Rakaat dikurangi manual."; }
    if (parsed.type === "GET_RAKAAT_COUNT") out = `Saat ini ${rakaatInfo.count} dari ${rakaatInfo.target} rakaat.`;
    if (parsed.type === "UNKNOWN") setHelpMode(true);
    respond(parsed.raw, out);
  }, [createReminderFromParsed, enableNotifications, qibla.city.name, qibla.qiblaBearing, rakaatInfo, respond, schedule, sendTestNotification, testVoice]);
  const submitCommand = (text: string) => handleParsed(parseVoiceCommand(text));

  const markPrayerDone = (name: PrayerName) => { setCompleted((c) => ({ ...c, [name]: true })); setPrayerBanner(null); addToast(`${name} ditandai sudah sholat.`); };
  const snoozePrayerAction = (name: PrayerName) => { snoozePrayer(name, 10); setPrayerBanner(null); addToast(`Pengingat ${name} ditunda 10 menit.`); };
  const disablePrayerAction = (name: PrayerName) => { disablePrayerForToday(name); setPrayerBanner(null); addToast(`Pengingat ${name} dimatikan untuk hari ini.`); };
  const removeSentReminder = (id: string) => writeStorage("waktuai.sentReminderIds", readStorage<string[]>("waktuai.sentReminderIds", []).filter((item) => item !== id));
  const finishReminder = (id: string) => { setReminders((items) => items.map((item) => item.id === id ? { ...item, completed: true } : item).filter((item) => item.id !== id)); setReminderBanner(null); };
  const snoozeReminder = (id: string) => { removeSentReminder(id); setReminders((items) => items.map((item) => item.id === id ? { ...item, snoozedUntil: new Date(Date.now() + 10 * 60_000).toISOString() } : item)); setReminderBanner(null); addToast("Reminder ditunda 10 menit."); };
  const deleteReminder = (id: string) => { setReminders((items) => items.filter((item) => item.id !== id)); setReminderBanner(null); };
  const resetSettings = () => { if (!window.confirm("Reset semua pengaturan WaktuAI di perangkat ini?")) return; Object.keys(window.localStorage).filter((key) => key.startsWith("waktuai.")).forEach((key) => window.localStorage.removeItem(key)); window.location.reload(); };

  if (!mounted) return <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] px-3 py-4 sm:px-4 sm:py-6 md:px-6 safe-bottom"><div className="mx-auto w-full max-w-6xl"><div className="card h-64 animate-pulse" /></div></main>;
  return <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] px-3 py-4 sm:px-4 sm:py-6 md:px-6 safe-bottom"><div className="mx-auto w-full max-w-6xl overflow-hidden">
    <ToastStack toasts={toasts} onDismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
    <PrayerReminderBanner banner={prayerBanner} onDone={markPrayerDone} onSnooze={snoozePrayerAction} onDisable={disablePrayerAction} />
    <ReminderActionBanner banner={reminderBanner} onDone={finishReminder} onSnooze={snoozeReminder} onDelete={deleteReminder} />
    {!online && <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--primary-soft)] p-3 text-sm text-[var(--text)]">Offline: WaktuAI memakai cache jadwal jika tersedia.</div>}
    {onboarding && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-3"><section className="card max-h-[90vh] max-w-lg overflow-auto p-4 sm:p-6"><h1 className="text-2xl font-bold sm:text-3xl">Selamat datang di WaktuAI</h1><p className="mt-3 text-[var(--text-soft)]">Izinkan lokasi untuk jadwal akurat, aktifkan notifikasi saat siap, dan gunakan suara atau teks. Semua preferensi tersimpan lokal.</p><div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2"><button className="btn-primary" onClick={() => { writeStorage("waktuai.onboarded", true); setOnboarding(false); }}>Mulai</button><button className="btn-secondary" onClick={() => { writeStorage("waktuai.onboarded", true); setOnboarding(false); }}>Lewati</button></div></section></div>}
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-[var(--primary)]">AI Islamic Productivity</p><h1 className="text-3xl font-black tracking-tight sm:text-4xl">WaktuAI</h1></div><ThemeToggle theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} /></header>
    <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3"><div className="grid min-w-0 gap-4 sm:gap-5 lg:col-span-2"><ClockCard now={now} /><VoiceAssistant command={command} response={response} onSubmit={submitCommand} onQuickAction={submitCommand} />{helpMode && <section className="card"><h2 className="text-2xl font-bold text-[var(--text)]">Panduan Cepat</h2><p className="mt-2 break-words text-sm text-[var(--text-soft)]">{HELP_RESPONSE}</p><div className="mt-4"><HelpCards onRun={submitCommand} /></div>{response === UNKNOWN_RESPONSE && <div className="mt-4 grid gap-2 sm:grid-cols-3"><button className="btn-secondary" onClick={() => submitCommand("Jadwal sholat hari ini")}>Jadwal Sholat</button><button className="btn-secondary" onClick={() => submitCommand("Ingatkan aku 17:46")}>Reminder 17:46</button><button className="btn-secondary" onClick={() => submitCommand("Aku bingung")}>Buka Bantuan</button></div>}</section>}<CommandCenter onRun={submitCommand} /><PrayerScheduleCard schedule={schedule} loading={loading} error={error} completed={completed} onToggleComplete={(name) => setCompleted((c) => ({ ...c, [name]: !c[name] }))} onRetry={() => loadSchedule(city)} onCityChange={(name) => { const c = CITIES.find((x) => x.name === name); if (c) { writeStorage("waktuai.cityTouched", true); setCity(c); } }} cities={CITIES.map((c) => c.name)} /><NotificationSettings enabled={notifEnabled} permission={permission} settings={notifSettings} assistant={assistant} dnd={dnd} onEnable={enableNotifications} onDisable={() => setNotifEnabled(false)} onPrayerChange={(name, patch) => setNotifSettings((s) => ({ ...s, [name]: { ...s[name], ...patch } }))} onAssistantChange={(patch) => setAssistant((a) => ({ ...a, ...patch }))} onDnd={(minutes) => setDnd({ until: minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null })} onTestNotification={sendTestNotification} onTestVoice={testVoice} /></div>
      <aside className="grid min-w-0 gap-4 sm:gap-5"><NextPrayerCard nextPrayer={nextPrayer} now={now} /><SmartRakaatCounterCard voiceEnabled={assistant.voiceEnabled} speechRate={assistant.speechRate} action={rakaatAction} onCountChange={handleRakaatCountChange} onMobileChange={handleRakaatMobileChange} /><section className="card"><p className="text-sm font-semibold text-[var(--primary)]">Dashboard Harian</p><h2 className="text-2xl font-bold">{schedule?.hijri ? `${schedule.hijri.day} ${schedule.hijri.month} ${schedule.hijri.year} H` : "Tanggal Hijri"}</h2><p className="mt-2 text-sm text-[var(--text-soft)]">{formatIndonesianDate(now)} · {city.name}</p><p className="mt-3">Berikutnya: <strong>{nextPrayer?.prayer.name ?? "-"}</strong></p><p className="mt-1 text-sm">{quotes[now.getDate() % quotes.length]}</p><div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--bg-soft)]"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${(progressPassed / 5) * 100}%` }} /></div><p className="mt-1 text-xs">{progressPassed} dari 5 waktu telah masuk.</p></section>
      <QiblaCard qibla={qibla} onManualCityChange={(name) => { const selected = CITIES.find((item) => item.name === name); if (selected) { writeStorage("waktuai.cityTouched", true); setCity(selected); } }} />
      <section className="card"><h2 className="text-2xl font-bold">Kalender Hijri</h2><div className="mt-4 grid grid-cols-5 gap-2">{hijriGrid.map((d) => <div key={d.day} title={d.label} className={`rounded-xl p-2 text-center text-sm ${d.isToday ? "bg-[var(--primary)] font-bold text-[var(--primary-text)]" : "border border-[var(--border)] bg-[var(--bg-soft)]"}`}>{d.day}{d.important && <span className="block text-xs">★</span>}</div>)}</div></section><ReminderList reminders={reminders} history={history} onDelete={deleteReminder} onClearHistory={() => setHistory([])} /></aside></div>
    <footer className="grid gap-3 py-8 text-center text-sm text-[var(--muted)]"><p>Install WaktuAI dari menu browser “Add to Home Screen”. Notifikasi bekerja saat app terbuka/aktif; push tertutup penuh butuh backend Web Push.</p><button className="btn-secondary mx-auto" onClick={resetSettings}>Reset Pengaturan</button></footer>
  </div></main>;
}
