import {
  AdzanAudioSettings,
  defaultAdzanAudioSettings,
  playBeep,
  playLocalAdzanAudio,
  playSelectedAdzanSound,
  playVoiceAdzan,
  testRemoteAdzanAudio,
  validateAudioUrl,
} from "../lib/adzanAudio";

type Props = {
  settings: AdzanAudioSettings;
  audioUnlocked: boolean;
  onSettingsChange: (settings: AdzanAudioSettings) => void;
  onAudioUnlocked: (unlocked: boolean) => void;
  onToast: (message: string, tone?: "success" | "error" | "info") => void;
};

function update(settings: AdzanAudioSettings, patch: Partial<AdzanAudioSettings>): AdzanAudioSettings {
  return { ...settings, ...patch };
}

export function AdzanSoundSettings({ settings, audioUnlocked, onSettingsChange, onAudioUnlocked, onToast }: Props) {
  const setResult = (message: string, ok: boolean) => {
    onSettingsChange(update(settings, { lastTestResult: message, lastFailedReason: ok ? undefined : message, lastPlayedAt: ok ? new Date().toISOString() : settings.lastPlayedAt }));
    onToast(message, ok ? "success" : "error");
  };

  const testSelected = async () => {
    const result = await playSelectedAdzanSound({ prayerName: "Isya", mode: "test", settings });
    onAudioUnlocked(result.ok);
    setResult(result.ok ? `Tes suara adzan berhasil: ${result.source ?? "audio"}.` : result.reason ?? "Tes suara adzan gagal.", result.ok);
  };

  const testUrl = async () => {
    if (!validateAudioUrl(settings.officialUrl)) {
      setResult("URL harus berupa https:// resmi dan aman.", false);
      return;
    }
    const result = await testRemoteAdzanAudio(settings.officialUrl);
    onAudioUnlocked(result.ok);
    setResult(result.ok ? "Audio URL resmi berhasil diputar." : result.reason ?? "Audio URL resmi gagal diputar.", result.ok);
  };

  const testLocal = async () => {
    const result = await playLocalAdzanAudio(settings.volume, settings.fade);
    onAudioUnlocked(result.ok);
    setResult(result.ok ? "Audio lokal tersedia dan berhasil diputar." : "File adzan lokal belum tersedia. Menggunakan fallback.", result.ok);
  };

  const testVoice = async () => {
    const result = await playVoiceAdzan("Isya", "time");
    onAudioUnlocked(result.ok);
    setResult(result.ok ? "Voice AI adzan berhasil dites." : result.reason ?? "Voice AI gagal dites.", result.ok);
  };

  const testBeep = async () => {
    const result = await playBeep(settings.volume);
    onAudioUnlocked(result.ok);
    setResult(result.ok ? "Beep berhasil diputar." : result.reason ?? "Beep gagal diputar.", result.ok);
  };

  return (
    <section className="card">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-ink">Suara Adzan</h2>
        <p className="mt-1 text-sm leading-5 text-muted">
          Kemenag/official hanya dipakai jika kamu memasukkan URL publik resmi yang kamu miliki. WaktuAI tidak menyertakan audio berhak cipta atau URL tidak resmi.
        </p>
      </div>

      <label className="flex min-h-11 items-center justify-between gap-3">
        <span className="font-semibold">Suara adzan aktif</span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => onSettingsChange(update(settings, { enabled: event.target.checked }))}
        />
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-semibold">Sumber suara adzan</span>
          <select className="input" value={settings.source} onChange={(event) => onSettingsChange(update(settings, { source: event.target.value as AdzanAudioSettings["source"] }))}>
            <option value="kemenag-url">Kemenag / Official URL</option>
            <option value="local">Local audio file</option>
            <option value="voice">Voice AI</option>
            <option value="beep">Simple beep</option>
            <option value="off">Off</option>
          </select>
        </label>

        <label>
          <span className="mb-1 block text-sm font-semibold">Volume</span>
          <select className="input" value={settings.volume} onChange={(event) => onSettingsChange(update(settings, { volume: Number(event.target.value) }))}>
            <option value={0.25}>25%</option>
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
          </select>
        </label>

        <label className="sm:col-span-2">
          <span className="mb-1 block text-sm font-semibold">URL audio adzan resmi</span>
          <input
            className="input"
            value={settings.officialUrl}
            onChange={(event) => onSettingsChange(update(settings, { officialUrl: event.target.value }))}
            placeholder="https://domain-resmi/contoh-audio-adzan.mp3"
            aria-label="URL audio adzan resmi"
          />
          <span className="mt-1 block text-xs text-muted">Endpoint resmi yang butuh izin/API harus kamu sediakan sendiri. Jangan masukkan token privat di frontend.</span>
        </label>

        <label>
          <span className="mb-1 block text-sm font-semibold">Fallback jika gagal</span>
          <select className="input" value={settings.fallback} onChange={(event) => onSettingsChange(update(settings, { fallback: event.target.value as AdzanAudioSettings["fallback"] }))}>
            <option value="voice">Voice AI</option>
            <option value="beep">Beep</option>
            <option value="silent">Silent banner</option>
          </select>
        </label>

        <label>
          <span className="mb-1 block text-sm font-semibold">Fade audio</span>
          <select className="input" value={settings.fade} onChange={(event) => onSettingsChange(update(settings, { fade: event.target.value as AdzanAudioSettings["fade"] }))}>
            <option value="none">No fade</option>
            <option value="in">Fade in 1 detik</option>
            <option value="out">Fade out 2 detik</option>
          </select>
        </label>

        <label>
          <span className="mb-1 block text-sm font-semibold">Batas full adzan harian</span>
          <select className="input" value={settings.dailyLimit} onChange={(event) => onSettingsChange(update(settings, { dailyLimit: event.target.value as AdzanAudioSettings["dailyLimit"] }))}>
            <option value="none">Tanpa batas</option>
            <option value="1">Maks 1 kali</option>
            <option value="3">Maks 3 kali</option>
            <option value="5">Maks 5 kali</option>
          </select>
        </label>

        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3">
          <input
            type="checkbox"
            checked={settings.quietHoursEnabled}
            onChange={(event) => onSettingsChange(update(settings, { quietHoursEnabled: event.target.checked }))}
          />
          Quiet hours aktif
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button className="btn-primary" onClick={testSelected}>Tes Suara Adzan</button>
        <button className="btn-secondary" onClick={testVoice}>Tes Voice AI</button>
        <button className="btn-secondary" onClick={testBeep}>Tes Beep</button>
        <button className="btn-secondary" onClick={testLocal}>Cek Audio Lokal</button>
        <button className="btn-secondary" onClick={testUrl}>Cek URL Resmi</button>
        <button className="btn-secondary" onClick={() => onSettingsChange(defaultAdzanAudioSettings)}>Reset Suara</button>
      </div>

      <div className="mt-3 rounded-xl bg-page p-3 text-sm text-muted">
        <p><span className="font-semibold text-ink">Status:</span> {settings.lastTestResult}</p>
        <p><span className="font-semibold text-ink">Audio unlocked sesi ini:</span> {audioUnlocked ? "ya" : "belum"}</p>
        <p>Browser bisa memblokir suara otomatis. Klik Tes Suara Adzan sekali setelah membuka aplikasi agar suara otomatis lebih stabil.</p>
      </div>
    </section>
  );
}
