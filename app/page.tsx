"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import ClockCard from "@/components/ClockCard";
import NextPrayerCard from "@/components/NextPrayerCard";
import NotificationSettings from "@/components/NotificationSettings";
import PrayerScheduleCard from "@/components/PrayerScheduleCard";
import ReminderList from "@/components/ReminderList";
import ThemeToggle from "@/components/ThemeToggle";
import VoiceAssistant from "@/components/VoiceAssistant";
import SmartRakaatCounterCard from "@/src/components/SmartRakaatCounterCard";
import { DEFAULT_NOTIFICATION_SETTINGS, getNotificationPermission, requestNotificationPermission, schedulePrayerNotifications, scheduleReminders } from "@/lib/notifications";
import { CITIES, JAKARTA, calculateQiblaDirection, fetchPrayerSchedule, findNextPrayer, getCachedPrayerSchedule, getHijriMonthGrid } from "@/lib/prayer";
import { buildReminder, prunePastReminders } from "@/lib/reminders";
import { readStorage, writeStorage } from "@/lib/storage";
import { formatClock, formatIndonesianDate, getDateKey, getPassedPrayerCount } from "@/lib/time";
import { ParsedCommand, UNKNOWN_RESPONSE, parseVoiceCommand } from "@/lib/voiceCommands";
import type { CityOption, PrayerName, PrayerSchedule } from "@/types/prayer";
import type { AssistantSettings, CommandHistoryItem, DndState, Reminder } from "@/types/reminder";
import type { RakaatExternalAction } from "@/src/types/rakaat";

const quotes = ["Sholat tepat waktu adalah latihan terbaik untuk disiplin hati.", "Mulai dari satu kebaikan kecil, jaga konsistensinya.", "Waktu adalah amanah; gunakan untuk yang mendekatkan pada Allah."];
const defaultAssistant: AssistantSettings = { voiceEnabled: true, speechRate: "normal", notificationSound: false };

export default function Home() {
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
  const [completed, setCompleted] = useState<Record<PrayerName, boolean>>({ Subuh: false, Dzuhur: false, Ashar: false, Maghrib: false, Isya: false });
  const [onboarding, setOnboarding] = useState(false);
  const [heading, setHeading] = useState(0);
  const [rakaatAction, setRakaatAction] = useState<{ type: RakaatExternalAction; nonce: number }>({ type: null, nonce: 0 });
  const [rakaatInfo, setRakaatInfo] = useState<{ count: number; target: 2 | 3 | 4; mobile: boolean }>({ count: 0, target: 4, mobile: false });

  useEffect(() => { setMounted(true); setTheme(readStorage("waktuai.theme", "light")); setOnline(navigator.onLine); setCity(readStorage("waktuai.city", JAKARTA)); setReminders(prunePastReminders(readStorage("waktuai.reminders", []))); setHistory(readStorage("waktuai.history", [])); setNotifEnabled(readStorage("waktuai.notifEnabled", false)); setNotifSettings(readStorage("waktuai.notifSettings", DEFAULT_NOTIFICATION_SETTINGS)); setAssistant(readStorage("waktuai.assistant", defaultAssistant)); setDnd(readStorage("waktuai.dnd", { until: null })); setCompleted(readStorage(`waktuai.completed.${getDateKey()}`, { Subuh: false, Dzuhur: false, Ashar: false, Maghrib: false, Isya: false })); setOnboarding(!readStorage("waktuai.onboarded", false)); setPermission(getNotificationPermission()); }, []);
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
  useEffect(() => { if (!mounted || !("geolocation" in navigator) || readStorage("waktuai.cityTouched", false)) return; navigator.geolocation.getCurrentPosition((pos) => { const gps = { name: "Lokasi GPS", latitude: pos.coords.latitude, longitude: pos.coords.longitude }; setCity(gps); void loadSchedule(gps, "gps"); }, () => undefined, { enableHighAccuracy: false, timeout: 6000, maximumAge: 3_600_000 }); }, [loadSchedule, mounted]);
  useEffect(() => { const onOrientation = (event: DeviceOrientationEvent) => { if (typeof event.alpha === "number") setHeading(event.alpha); }; window.addEventListener("deviceorientation", onOrientation); return () => window.removeEventListener("deviceorientation", onOrientation); }, []);
  useEffect(() => { if (!notifEnabled || !schedule) return; return schedulePrayerNotifications(schedule, notifSettings, assistant.notificationSound, dnd); }, [notifEnabled, schedule, notifSettings, assistant.notificationSound, dnd]);
  useEffect(() => scheduleReminders(reminders, assistant.notificationSound, dnd, (id) => setReminders((items) => items.filter((r) => r.id !== id))), [reminders, assistant.notificationSound, dnd]);

  const nextPrayer = useMemo(() => schedule ? findNextPrayer(schedule.prayers, now) : null, [schedule, now]);
  const qibla = useMemo(() => calculateQiblaDirection(city.latitude, city.longitude), [city]);
  const progressPassed = schedule ? getPassedPrayerCount(schedule.prayers, now) : 0;
  const hijriDay = Number(schedule?.hijri?.day ?? 1);
  const hijriGrid = schedule?.hijri ? getHijriMonthGrid(hijriDay, schedule.hijri.month, schedule.hijri.year) : [];

  const handleRakaatCountChange = useCallback((count: number, target: 2 | 3 | 4) => {
    setRakaatInfo((info) => info.count === count && info.target === target ? info : { ...info, count, target });
  }, []);
  const handleRakaatMobileChange = useCallback((mobile: boolean) => {
    setRakaatInfo((info) => info.mobile === mobile ? info : { ...info, mobile });
  }, []);

  const speak = useCallback((text: string) => { if (!assistant.voiceEnabled || !("speechSynthesis" in window)) return; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = "id-ID"; u.rate = assistant.speechRate === "slow" ? 0.85 : assistant.speechRate === "fast" ? 1.15 : 1; window.speechSynthesis.speak(u); }, [assistant]);
  const respond = useCallback((input: string, output: string) => { setCommand(input); setResponse(output); setHistory((items) => [{ id: crypto.randomUUID(), command: input, response: output, createdAt: new Date().toISOString() }, ...items].slice(0, 10)); speak(output); }, [speak]);
  const handleParsed = useCallback((parsed: ParsedCommand) => {
    let out = UNKNOWN_RESPONSE;
    if (parsed.type === "GET_CURRENT_TIME") out = `Sekarang jam ${formatClock(new Date())}.`;
    if (parsed.type === "GET_CURRENT_DATE") out = `Hari ini ${formatIndonesianDate(new Date())}.`;
    if (parsed.type === "GET_ALL_PRAYER_TIMES") out = schedule ? `Jadwal sholat hari ini: ${schedule.prayers.map((p) => `${p.name} ${p.time}`).join(", ")}.` : "Jadwal sholat belum tersedia.";
    if (parsed.type === "GET_PRAYER_TIME") out = schedule && parsed.prayerName ? `Adzan ${parsed.prayerName} pukul ${schedule.prayers.find((p) => p.name === parsed.prayerName)?.time ?? "belum tersedia"}.` : "Nama sholat belum jelas.";
    if (parsed.type === "ENABLE_ADZAN_NOTIFICATION") { setNotifEnabled(true); if (parsed.prayerName) setNotifSettings((s) => ({ ...s, [parsed.prayerName!]: { enabled: true, leadMinutes: parsed.leadMinutes ?? s[parsed.prayerName!].leadMinutes } })); out = parsed.prayerName ? `Notifikasi ${parsed.prayerName} aktif.` : "Notifikasi adzan aktif."; void requestNotificationPermission().then((p) => setPermission(p)); }
    if (parsed.type === "DISABLE_ADZAN_NOTIFICATION") { if (parsed.prayerName) setNotifSettings((s) => ({ ...s, [parsed.prayerName!]: { ...s[parsed.prayerName!], enabled: false } })); else setNotifEnabled(false); out = parsed.prayerName ? `Notifikasi ${parsed.prayerName} dimatikan.` : "Notifikasi adzan dimatikan."; }
    if (parsed.type === "CREATE_REMINDER") { const at = parsed.reminderAt ?? (parsed.prayerName && schedule ? new Date(schedule.prayers.find((p) => p.name === parsed.prayerName)?.dateTime ?? Date.now()) : null); if (at && at.getTime() > Date.now()) { setReminders((r) => [...r, buildReminder(parsed.reminderLabel ?? "Reminder WaktuAI", at, parsed.prayerName ? "prayer" : "voice")]); out = `Siap, aku ingatkan pada ${at.toLocaleString("id-ID")}.`; } else out = "Aku belum bisa membaca waktu reminder itu. Coba: ingatkan aku jam 7 malam."; }
    if (parsed.type === "SET_LOCATION" && parsed.cityName) { const c = CITIES.find((x) => x.name === parsed.cityName); if (c) { writeStorage("waktuai.cityTouched", true); setCity(c); out = `Lokasi diganti ke ${c.name}.`; } }
    if (parsed.type === "SHOW_QIBLA") out = `Arah kiblat dari ${city.name} sekitar ${Math.round(qibla)} derajat dari utara.`;
    if (parsed.type === "ENABLE_DND") { const until = new Date(Date.now() + (parsed.dndMinutes ?? 60) * 60_000).toISOString(); setDnd({ until }); out = `Mode jangan ganggu aktif sampai ${new Date(until).toLocaleString("id-ID")}.`; }
    if (parsed.type === "DISABLE_DND") { setDnd({ until: null }); out = "Mode jangan ganggu dimatikan."; }
    if (parsed.type === "START_RAKAAT_DETECTION") { if (!rakaatInfo.mobile) out = "Fitur deteksi rakaat hanya tersedia di HP."; else { setRakaatAction({ type: "start", nonce: Date.now() }); out = "Memulai deteksi rakaat. Pastikan mulai dari posisi berdiri."; } }
    if (parsed.type === "STOP_RAKAAT_DETECTION") { setRakaatAction({ type: "stop", nonce: Date.now() }); out = "Deteksi rakaat dihentikan."; }
    if (parsed.type === "RESET_RAKAAT") { setRakaatAction({ type: "reset", nonce: Date.now() }); out = "Hitungan rakaat direset."; }
    if (parsed.type === "INCREMENT_RAKAAT") { setRakaatAction({ type: "increment", nonce: Date.now() }); out = "Rakaat ditambah manual."; }
    if (parsed.type === "DECREMENT_RAKAAT") { setRakaatAction({ type: "decrement", nonce: Date.now() }); out = "Rakaat dikurangi manual."; }
    if (parsed.type === "GET_RAKAAT_COUNT") out = `Saat ini ${rakaatInfo.count} dari ${rakaatInfo.target} rakaat.`;
    respond(parsed.raw, out);
  }, [city.name, qibla, rakaatInfo, respond, schedule]);
  const submitCommand = (text: string) => handleParsed(parseVoiceCommand(text));

  if (!mounted) return <main className="min-h-screen p-4 sm:p-6"><div className="mx-auto max-w-6xl"><div className="card h-64 animate-pulse" /></div></main>;
  return <main className="min-h-screen p-4 sm:p-6"><div className="mx-auto max-w-6xl">
    {!online && <div className="mb-4 rounded-2xl bg-amber-100 p-3 text-amber-950 dark:bg-amber-950 dark:text-amber-100">Offline: WaktuAI memakai cache jadwal jika tersedia.</div>}
    {onboarding && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4"><section className="card max-w-lg p-6"><h1 className="text-3xl font-bold">Selamat datang di WaktuAI</h1><p className="mt-3 text-slate-600 dark:text-slate-300">Izinkan lokasi untuk jadwal akurat, aktifkan notifikasi saat siap, dan gunakan suara atau teks. Semua preferensi tersimpan lokal.</p><div className="mt-5 flex gap-2"><button className="btn-primary" onClick={() => { writeStorage("waktuai.onboarded", true); setOnboarding(false); }}>Mulai</button><button className="btn-secondary" onClick={() => { writeStorage("waktuai.onboarded", true); setOnboarding(false); }}>Lewati</button></div></section></div>}
    <header className="mb-6 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">AI Islamic Productivity</p><h1 className="text-4xl font-black tracking-tight">WaktuAI</h1></div><ThemeToggle theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} /></header>
    <div className="grid gap-5 lg:grid-cols-3"><div className="grid gap-5 lg:col-span-2"><ClockCard now={now} /><VoiceAssistant command={command} response={response} onSubmit={submitCommand} onQuickAction={submitCommand} /><PrayerScheduleCard schedule={schedule} loading={loading} error={error} completed={completed} onToggleComplete={(name) => setCompleted((c) => ({ ...c, [name]: !c[name] }))} onRetry={() => loadSchedule(city)} onCityChange={(name) => { const c = CITIES.find((x) => x.name === name); if (c) { writeStorage("waktuai.cityTouched", true); setCity(c); } }} cities={CITIES.map((c) => c.name)} /><NotificationSettings enabled={notifEnabled} permission={permission} settings={notifSettings} assistant={assistant} dnd={dnd} onEnable={() => { setNotifEnabled(true); void requestNotificationPermission().then((p) => setPermission(p)); }} onDisable={() => setNotifEnabled(false)} onPrayerChange={(name, patch) => setNotifSettings((s) => ({ ...s, [name]: { ...s[name], ...patch } }))} onAssistantChange={(patch) => setAssistant((a) => ({ ...a, ...patch }))} onDnd={(minutes) => setDnd({ until: minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null })} /></div>
      <aside className="grid gap-5"><NextPrayerCard nextPrayer={nextPrayer} now={now} /><SmartRakaatCounterCard voiceEnabled={assistant.voiceEnabled} speechRate={assistant.speechRate} action={rakaatAction} onCountChange={handleRakaatCountChange} onMobileChange={handleRakaatMobileChange} /><section className="card p-5"><p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Dashboard Harian</p><h2 className="text-2xl font-bold">{schedule?.hijri ? `${schedule.hijri.day} ${schedule.hijri.month} ${schedule.hijri.year} H` : "Tanggal Hijri"}</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{formatIndonesianDate(now)} · {city.name}</p><p className="mt-3">Berikutnya: <strong>{nextPrayer?.prayer.name ?? "-"}</strong></p><p className="mt-1 text-sm">{quotes[now.getDate() % quotes.length]}</p><div className="mt-4 h-3 rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${(progressPassed / 5) * 100}%` }} /></div><p className="mt-1 text-xs">{progressPassed} dari 5 waktu telah masuk.</p></section>
      <section className="card p-5"><h2 className="text-2xl font-bold">Arah Kiblat</h2><div className="mx-auto mt-5 grid h-48 w-48 place-items-center rounded-full border-8 border-emerald-200 bg-gradient-to-br from-white to-emerald-50 dark:border-emerald-900 dark:from-slate-900 dark:to-emerald-950"><div className="text-center" style={{ transform: `rotate(${qibla - heading}deg)` }}><div className="text-5xl">▲</div><p className="font-bold">Kiblat</p></div></div><p className="mt-3 text-center text-lg font-bold">{Math.round(qibla)}° dari utara</p><p className="text-center text-sm text-slate-600 dark:text-slate-300">Kompas perangkat dipakai jika browser mendukung orientasi.</p></section>
      <section className="card p-5"><h2 className="text-2xl font-bold">Kalender Hijri</h2><div className="mt-4 grid grid-cols-5 gap-2">{hijriGrid.map((d) => <div key={d.day} title={d.label} className={`rounded-xl p-2 text-center text-sm ${d.isToday ? "bg-emerald-500 font-bold text-white" : "bg-white/60 dark:bg-white/5"}`}>{d.day}{d.important && <span className="block text-[10px]">★</span>}</div>)}</div></section><ReminderList reminders={reminders} history={history} onDelete={(id) => setReminders((r) => r.filter((x) => x.id !== id))} onClearHistory={() => setHistory([])} /></aside></div>
    <footer className="py-8 text-center text-sm text-slate-600 dark:text-slate-400">Install WaktuAI dari menu browser “Add to Home Screen”. Jalankan lokal: npm install, npm run dev, npm run build; deploy langsung ke Vercel.</footer>
  </div></main>;
}
