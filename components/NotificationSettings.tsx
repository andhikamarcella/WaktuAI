import type { PrayerName } from "@/types/prayer";
import type { DndState, AssistantSettings } from "@/types/reminder";
import type { LeadMinutes, PrayerNotificationSettings } from "@/lib/notifications";
import { PRAYER_NAMES } from "@/lib/prayer";

export default function NotificationSettings({ enabled, permission, settings, assistant, dnd, onEnable, onDisable, onPrayerChange, onAssistantChange, onDnd }: {
  enabled: boolean;
  permission: string;
  settings: PrayerNotificationSettings;
  assistant: AssistantSettings;
  dnd: DndState;
  onEnable: () => void;
  onDisable: () => void;
  onPrayerChange: (name: PrayerName, patch: Partial<{ enabled: boolean; leadMinutes: LeadMinutes }>) => void;
  onAssistantChange: (patch: Partial<AssistantSettings>) => void;
  onDnd: (minutes: number | null) => void;
}) {
  const sendTestNotification = async () => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      window.alert("Browser ini belum mendukung notifikasi.");
      return;
    }
    const result = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (result === "granted") new Notification("WaktuAI - Tes Notifikasi", { body: "Notifikasi aktif dan siap dipakai.", icon: "/icon.svg" });
    else window.alert("Izin notifikasi ditolak. Aktifkan dari pengaturan situs di browser.");
  };
  const dndActive = dnd.until && new Date(dnd.until).getTime() > Date.now();
  return <section className="card" aria-labelledby="notif-title">
    <div className="grid gap-3 sm:flex sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-[var(--primary)]">Pengaturan</p><h2 id="notif-title" className="text-2xl font-bold text-[var(--text)]">Notifikasi & Suara</h2></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><button className={enabled ? "btn-secondary" : "btn-primary"} onClick={enabled ? onDisable : onEnable} aria-label="Toggle notifikasi adzan">{enabled ? "Matikan" : "Aktifkan"}</button><button className="btn-secondary" onClick={() => { void sendTestNotification(); }}>Kirim Tes</button></div></div>
    <p className="mt-3 break-words text-sm text-[var(--text-soft)]">Status izin: {permission}. Notifikasi dan reminder bekerja saat tab aplikasi masih terbuka; browser dapat membatasi saat ditutup penuh.</p>
    {permission === "denied" && <p className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-sm text-[var(--text)]">Izin ditolak. Buka pengaturan situs di browser untuk mengaktifkan ulang notifikasi.</p>}
    <div className="mt-4 grid gap-3">{PRAYER_NAMES.map((name) => <div key={name} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-3"><div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center"><span className="font-semibold text-[var(--text)]">{name}</span><button className={settings[name].enabled ? "btn-primary" : "btn-secondary"} onClick={() => onPrayerChange(name, { enabled: !settings[name].enabled })}>{settings[name].enabled ? "Aktif" : "Nonaktif"}</button></div><label className="mt-3 block text-sm text-[var(--text-soft)]">Reminder sebelum adzan<select className="input mt-1" value={settings[name].leadMinutes} onChange={(e) => onPrayerChange(name, { leadMinutes: Number(e.target.value) as LeadMinutes })}><option value={0}>Saat waktu sholat</option><option value={5}>5 menit sebelum</option><option value={10}>10 menit sebelum</option><option value={15}>15 menit sebelum</option></select></label></div>)}</div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><label className="rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-[var(--text)]"><input type="checkbox" checked={assistant.voiceEnabled} onChange={(e) => onAssistantChange({ voiceEnabled: e.target.checked })} /> <span className="ml-2">Suara asisten</span></label><label className="rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-[var(--text)]"><input type="checkbox" checked={assistant.notificationSound} onChange={(e) => onAssistantChange({ notificationSound: e.target.checked })} /> <span className="ml-2">Bunyi notif</span></label><label className="rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-[var(--text)]">Kecepatan<select className="input mt-1" value={assistant.speechRate} onChange={(e) => onAssistantChange({ speechRate: e.target.value as AssistantSettings["speechRate"] })}><option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option></select></label></div>
    <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-4"><p className="font-semibold text-[var(--text)]">Mode Jangan Ganggu</p><p className="text-sm text-[var(--text-soft)]">{dndActive ? `Aktif sampai ${new Date(dnd.until!).toLocaleString("id-ID")}` : "Tidak aktif"}</p><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><button className="btn-secondary" onClick={() => onDnd(30)}>30 menit</button><button className="btn-secondary" onClick={() => onDnd(60)}>1 jam</button><button className="btn-secondary" onClick={() => onDnd(24 * 60)}>Sampai besok</button><button className="btn-secondary" onClick={() => onDnd(null)}>Matikan</button></div></div>
    <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--primary-soft)] p-4 text-sm text-[var(--text)]"><p className="font-semibold">Privasi</p><p className="break-words">Perintah suara diproses lokal di browser. Reminder dan preferensi tersimpan di localStorage. Lokasi hanya dipakai untuk jadwal sholat dan arah kiblat, tanpa backend kustom.</p></div>
  </section>;
}
