import type { PrayerName } from "@/types/prayer";
import type { Reminder } from "@/types/reminder";

export function ToastStack({ toasts, onDismiss }: { toasts: Array<{ id: string; message: string }>; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return <div className="fixed right-3 top-3 z-50 grid w-[min(92vw,24rem)] gap-2">
    {toasts.map((toast) => <div key={toast.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-sm text-[var(--text)] shadow-[var(--shadow)]">
      <div className="flex gap-3"><p className="min-w-0 flex-1 break-words">{toast.message}</p><button className="font-bold" onClick={() => onDismiss(toast.id)} aria-label="Tutup toast">×</button></div>
    </div>)}
  </div>;
}

export function PrayerReminderBanner({ banner, onDone, onSnooze, onDisable }: { banner: { prayerName: PrayerName; message: string } | null; onDone: (name: PrayerName) => void; onSnooze: (name: PrayerName) => void; onDisable: (name: PrayerName) => void }) {
  if (!banner) return null;
  return <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-3xl rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 text-[var(--text)] shadow-[var(--shadow)]">
    <p className="font-bold">{banner.message}</p>
    <p className="mt-1 text-sm text-[var(--text-soft)]">Pilih aksi di aplikasi agar pengingat tidak berulang.</p>
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <button className="btn-primary" onClick={() => onDone(banner.prayerName)}>Sudah Sholat</button>
      <button className="btn-secondary" onClick={() => onSnooze(banner.prayerName)}>Tunda 10 Menit</button>
      <button className="btn-secondary" onClick={() => onDisable(banner.prayerName)}>Matikan Hari Ini</button>
    </div>
  </div>;
}

export function ReminderActionBanner({ banner, onDone, onSnooze, onDelete }: { banner: { reminder: Reminder; message: string } | null; onDone: (id: string) => void; onSnooze: (id: string) => void; onDelete: (id: string) => void }) {
  if (!banner) return null;
  return <div className="fixed inset-x-3 bottom-44 z-40 mx-auto max-w-3xl rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 text-[var(--text)] shadow-[var(--shadow)]">
    <p className="font-bold">Reminder</p>
    <p className="mt-1 break-words text-sm text-[var(--text-soft)]">{banner.message}</p>
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <button className="btn-primary" onClick={() => onDone(banner.reminder.id)}>Selesai</button>
      <button className="btn-secondary" onClick={() => onSnooze(banner.reminder.id)}>Tunda 10 Menit</button>
      <button className="btn-secondary" onClick={() => onDelete(banner.reminder.id)}>Hapus Reminder</button>
    </div>
  </div>;
}
