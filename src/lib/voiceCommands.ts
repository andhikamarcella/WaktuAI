export type Cmd='help'|'notif_on'|'notif_off'|'schedule'|'clock'|'unknown';
export const parseVoiceCommand=(s:string):Cmd=>{const t=s.toLowerCase();
if(/aku bingung|cara pakainya|bisa apa aja|command apa aja|tolong jelasin/.test(t)) return 'help';
if(/aktifkan notifikasi/.test(t)) return 'notif_on';
if(/matikan notifikasi/.test(t)) return 'notif_off';
if(/jadwal sholat/.test(t)) return 'schedule';
if(/jam berapa/.test(t)) return 'clock';
return 'unknown';};
