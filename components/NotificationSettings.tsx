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
  const dndActive = dnd.until && new Date(dnd.until).getTime() > Date.now();
  return <section className="card p-5" aria-labelledby="notif-title">
    <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">Pengaturan</p><h2 id="notif-title" className="text-2xl font-bold">Notifikasi & Suara</h2></div><button className={enabled ? "btn-secondary" : "btn-primary"} onClick={enabled ? onDisable : onEnable} aria-label="Toggle notifikasi adzan">{enabled ? "Matikan" : "Aktifkan"}</button></div>
    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Status izin: {permission}. Notifikasi dan reminder bekerja saat tab aplikasi masih terbuka; browser dapat membatasi saat ditutup penuh.</p>
    {permission === "denied" && <p className="mt-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Izin ditolak. Buka pengaturan situs di browser untuk mengaktifkan ulang notifikasi.</p>}
    <div className="mt-4 grid gap-3">{PRAYER_NAMES.map((name) => <div key={name} className="rounded-2xl bg-white/60 p-3 dark:bg-white/5"><div className="flex items-center justify-between gap-3"><span className="font-semibold">{name}</span><button className={settings[name].enabled ? "btn-primary" : "btn-secondary"} onClick={() => onPrayerChange(name, { enabled: !settings[name].enabled })}>{settings[name].enabled ? "Aktif" : "Nonaktif"}</button></div><label className="mt-3 block text-sm">Reminder sebelum adzan<select className="input mt-1" value={settings[name].leadMinutes} onChange={(e) => onPrayerChange(name, { leadMinutes: Number(e.target.value) as LeadMinutes })}><option value={0}>Saat waktu sholat</option><option value={5}>5 menit sebelum</option><option value={10}>10 menit sebelum</option><option value={15}>15 menit sebelum</option></select></label></div>)}</div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><label className="rounded-2xl bg-white/60 p-3 dark:bg-white/5"><input type="checkbox" checked={assistant.voiceEnabled} onChange={(e) => onAssistantChange({ voiceEnabled: e.target.checked })} /> <span className="ml-2">Suara asisten</span></label><label className="rounded-2xl bg-white/60 p-3 dark:bg-white/5"><input type="checkbox" checked={assistant.notificationSound} onChange={(e) => onAssistantChange({ notificationSound: e.target.checked })} /> <span className="ml-2">Bunyi notif</span></label><label className="rounded-2xl bg-white/60 p-3 dark:bg-white/5">Kecepatan<select className="input mt-1" value={assistant.speechRate} onChange={(e) => onAssistantChange({ speechRate: e.target.value as AssistantSettings["speechRate"] })}><option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option></select></label></div>
    <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><p className="font-semibold">Mode Jangan Ganggu</p><p className="text-sm text-slate-600 dark:text-slate-300">{dndActive ? `Aktif sampai ${new Date(dnd.until!).toLocaleString("id-ID")}` : "Tidak aktif"}</p><div className="mt-3 flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => onDnd(30)}>30 menit</button><button className="btn-secondary" onClick={() => onDnd(60)}>1 jam</button><button className="btn-secondary" onClick={() => onDnd(24 * 60)}>Sampai besok</button><button className="btn-secondary" onClick={() => onDnd(null)}>Matikan</button></div></div>
    <div className="mt-5 rounded-2xl bg-emerald-500/10 p-4 text-sm"><p className="font-semibold">Privasi</p><p>Perintah suara diproses lokal di browser. Reminder dan preferensi tersimpan di localStorage. Lokasi hanya dipakai untuk jadwal sholat dan arah kiblat, tanpa backend kustom.</p></div>
  </section>;
}
