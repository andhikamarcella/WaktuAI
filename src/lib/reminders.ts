export const parseReminder = (text: string, now = new Date()) => {
  const t = text.toLowerCase().trim();
  const abs = t.match(/(\d{1,2}):(\d{2})/);
  if (abs) {
    const hh = Number(abs[1]); const mm = Number(abs[2]);
    const when = new Date(now); when.setHours(hh, mm, 0, 0);
    let msg = `Siap, aku akan ingatkan jam ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}.`;
    if (when <= now) { when.setDate(when.getDate()+1); msg = `Jam ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')} hari ini sudah lewat, jadi aku ingatkan besok jam ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}.`; }
    return { when, message: msg };
  }
  const rel = t.match(/(\d+)\s*(menit|jam)\s*lagi/);
  if (rel) { const n=Number(rel[1]); const u=rel[2]; const when=new Date(now.getTime() + n*(u==='jam'?3600000:60000)); return { when, message: `Siap, aku akan ingatkan ${n} ${u} lagi.`}; }
  return null;
};
