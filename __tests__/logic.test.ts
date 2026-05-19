import { getQiblaDirection } from '../src/lib/qibla';
import { parseReminder } from '../src/lib/reminders';
import { normalizeTimings, nextPrayer } from '../src/lib/prayer';
import { parseVoiceCommand } from '../src/lib/voiceCommands';

test('Qibla Jakarta around 295',()=>{const d=getQiblaDirection(-6.2088,106.8456); expect(d).toBeGreaterThan(294); expect(d).toBeLessThan(296.5);});
test('Parse exact 17:46',()=>{const r=parseReminder('ingatkan aku 17:46', new Date('2026-05-19T10:00:00')); expect(r?.when.getHours()).toBe(17); expect(r?.when.getMinutes()).toBe(46);});
test('17:46 passed -> tomorrow',()=>{const r=parseReminder('17:46', new Date('2026-05-19T20:00:00')); expect(r?.when.getDate()).toBe(20);});
test('normalize prayer names',()=>{const n=normalizeTimings({Fajr:'04:31',Dhuhr:'11:57',Asr:'15:12',Maghrib:'17:51',Isha:'19:00'}); expect(n.Isya).toBe('19:00');});
test('next prayer',()=>{const np=nextPrayer({Subuh:'04:30',Dzuhur:'12:00',Ashar:'15:00',Maghrib:'18:00',Isya:'19:00'}, new Date('2026-05-19T16:00:00')); expect(np.key).toBe('Maghrib');});
test('help command',()=>expect(parseVoiceCommand('aku bingung')).toBe('help'));
test('notif command',()=>expect(parseVoiceCommand('aktifkan notifikasi sholat')).toBe('notif_on'));
test('unknown command',()=>expect(parseVoiceCommand('xyz')).toBe('unknown'));
