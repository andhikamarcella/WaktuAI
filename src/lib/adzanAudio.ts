import { localDateKey, parseClockTime } from "./time";

export type AdzanAudioSource = "kemenag-url" | "local" | "voice" | "beep" | "off";
export type AdzanFallback = "voice" | "beep" | "silent";
export type AdzanFadeMode = "none" | "in" | "out";
export type DailySoundLimit = "none" | "1" | "3" | "5";

export type AdzanAudioResult = {
  ok: boolean;
  reason?: string;
  source?: AdzanAudioSource | "silent";
};

export type AdzanAudioSettings = {
  enabled: boolean;
  source: AdzanAudioSource;
  officialUrl: string;
  volume: number;
  fallback: AdzanFallback;
  fade: AdzanFadeMode;
  dailyLimit: DailySoundLimit;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  allowVoiceDuringQuietHours: boolean;
  lastTestResult: string;
  lastPlayedAt?: string;
  lastFailedReason?: string;
};

export const defaultAdzanAudioSettings: AdzanAudioSettings = {
  enabled: true,
  source: "voice",
  officialUrl: "",
  volume: 0.75,
  fallback: "voice",
  fade: "none",
  dailyLimit: "none",
  quietHoursEnabled: false,
  quietStart: "22:00",
  quietEnd: "04:00",
  allowVoiceDuringQuietHours: false,
  lastTestResult: "Belum dites",
};

const soundCountKey = "waktuai.adzanSoundCounts";

export function validateAudioUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" && !/[<>"'`]/.test(url);
  } catch {
    return false;
  }
}

function loadAudio(src: string, volume: number, fade: AdzanFadeMode): Promise<AdzanAudioResult> {
  return new Promise((resolve) => {
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = fade === "in" ? 0 : volume;
    let settled = false;
    const settle = (result: AdzanAudioResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const timer = window.setTimeout(() => settle({ ok: false, reason: "Audio terlalu lama dimuat." }), 10_000);
    audio.addEventListener("loadedmetadata", () => {
      window.clearTimeout(timer);
      audio
        .play()
        .then(() => {
          if (fade === "in") {
            const startedAt = performance.now();
            const step = () => {
              const progress = Math.min(1, (performance.now() - startedAt) / 1000);
              audio.volume = volume * progress;
              if (progress < 1) requestAnimationFrame(step);
            };
            step();
          }
          if (fade === "out") {
            audio.addEventListener("timeupdate", () => {
              if (audio.duration && audio.duration - audio.currentTime <= 2) {
                audio.volume = Math.max(0, volume * ((audio.duration - audio.currentTime) / 2));
              }
            });
          }
          settle({ ok: true });
        })
        .catch(() => settle({ ok: false, reason: "Browser memblokir suara otomatis. Tekan Tes Suara Adzan sekali setelah membuka aplikasi." }));
    });
    audio.addEventListener("error", () => {
      window.clearTimeout(timer);
      settle({ ok: false, reason: "Audio gagal dimuat." });
    });
    audio.src = src;
  });
}

export async function testRemoteAdzanAudio(url: string): Promise<AdzanAudioResult> {
  if (!validateAudioUrl(url)) return { ok: false, source: "kemenag-url", reason: "URL harus berupa https:// resmi dan aman." };
  const result = await loadAudio(url, 0.5, "none");
  return { ...result, source: "kemenag-url" };
}

export async function playRemoteAdzanAudio(url: string, volume: number, fade: AdzanFadeMode = "none"): Promise<AdzanAudioResult> {
  if (!validateAudioUrl(url)) return { ok: false, source: "kemenag-url", reason: "URL audio resmi belum valid." };
  const result = await loadAudio(url, volume, fade);
  return { ...result, source: "kemenag-url" };
}

export async function playLocalAdzanAudio(volume: number, fade: AdzanFadeMode = "none"): Promise<AdzanAudioResult> {
  const result = await loadAudio("/audio/adzan.mp3", volume, fade);
  return { ...result, source: "local" };
}

export async function playVoiceAdzan(prayerName: string, mode: "time" | "preReminder"): Promise<AdzanAudioResult> {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return { ok: false, source: "voice", reason: "SpeechSynthesis belum didukung browser ini." };
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(mode === "preReminder" ? `Sebentar lagi waktu ${prayerName}.` : `Sudah masuk waktu ${prayerName}. Yuk sholat.`);
    const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith("id"));
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "id-ID";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    return { ok: true, source: "voice" };
  } catch {
    return { ok: false, source: "voice", reason: "Suara AI gagal diputar." };
  }
}

export async function playBeep(volume: number): Promise<AdzanAudioResult> {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return { ok: false, source: "beep", reason: "Web Audio API belum didukung browser ini." };
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    gain.gain.value = Math.max(0.02, Math.min(1, volume)) * 0.18;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.22);
    return { ok: true, source: "beep" };
  } catch {
    return { ok: false, source: "beep", reason: "Beep gagal diputar." };
  }
}

function readSoundCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(soundCountKey);
    return raw ? JSON.parse(raw) as Record<string, number> : {};
  } catch {
    return {};
  }
}

function writeSoundCounts(value: Record<string, number>) {
  localStorage.setItem(soundCountKey, JSON.stringify(value));
}

function isQuietHoursActive(settings: AdzanAudioSettings, now = new Date()): boolean {
  if (!settings.quietHoursEnabled) return false;
  const start = parseClockTime(settings.quietStart);
  const end = parseClockTime(settings.quietEnd);
  if (!start || !end) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;
  return startMinutes <= endMinutes
    ? currentMinutes >= startMinutes && currentMinutes < endMinutes
    : currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function dailyLimitReached(limit: DailySoundLimit): boolean {
  if (limit === "none") return false;
  const dateKey = localDateKey();
  const counts = readSoundCounts();
  return (counts[dateKey] ?? 0) >= Number(limit);
}

function incrementDailySoundCount() {
  const dateKey = localDateKey();
  const counts = readSoundCounts();
  writeSoundCounts({ [dateKey]: (counts[dateKey] ?? 0) + 1 });
}

async function playFallback(settings: AdzanAudioSettings, prayerName: string, reason: string): Promise<AdzanAudioResult> {
  if (settings.fallback === "voice") {
    const result = await playVoiceAdzan(prayerName, "time");
    return result.ok ? result : { ok: false, source: "voice", reason: result.reason ?? reason };
  }
  if (settings.fallback === "beep") {
    const result = await playBeep(settings.volume);
    return result.ok ? result : { ok: false, source: "beep", reason: result.reason ?? reason };
  }
  return { ok: true, source: "silent", reason };
}

export async function playSelectedAdzanSound(options: {
  prayerName: string;
  mode: "time" | "preReminder" | "test";
  settings: AdzanAudioSettings;
}): Promise<AdzanAudioResult> {
  const { prayerName, mode, settings } = options;
  if (!settings.enabled || settings.source === "off") return { ok: true, source: "silent", reason: "Suara adzan dimatikan." };
  if (isQuietHoursActive(settings) && !(settings.allowVoiceDuringQuietHours && settings.source === "voice")) {
    return { ok: true, source: "silent", reason: "Quiet hours aktif. Banner/notifikasi tetap berjalan." };
  }
  if (mode === "preReminder") {
    if (settings.source === "beep") return playBeep(settings.volume);
    return playVoiceAdzan(prayerName, "preReminder");
  }
  if (mode === "time" && dailyLimitReached(settings.dailyLimit)) {
    return { ok: true, source: "silent", reason: "Batas suara adzan harian tercapai." };
  }

  let result: AdzanAudioResult;
  if (settings.source === "kemenag-url") result = await playRemoteAdzanAudio(settings.officialUrl, settings.volume, settings.fade);
  else if (settings.source === "local") result = await playLocalAdzanAudio(settings.volume, settings.fade);
  else if (settings.source === "voice") result = await playVoiceAdzan(prayerName, "time");
  else if (settings.source === "beep") result = await playBeep(settings.volume);
  else result = { ok: true, source: "silent" };

  if (!result.ok && settings.source !== "voice" && settings.source !== "beep") {
    result = await playFallback(settings, prayerName, result.reason ?? "Sumber suara utama gagal.");
  }
  if (result.ok && mode === "time" && result.source !== "silent" && result.source !== "voice" && result.source !== "beep") {
    incrementDailySoundCount();
  }
  return result;
}
