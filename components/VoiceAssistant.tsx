import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSpeechRecognition } from "@/src/hooks/useSpeechRecognition";

const QUICK_COMMANDS = [
  "Jam sekarang",
  "Tanggal hari ini",
  "Jadwal sholat",
  "Adzan berikutnya",
  "Arah kiblat",
  "Aktifkan notifikasi",
  "Tambah reminder jam 7 malam",
  "Mulai deteksi rakaat",
  "Reset rakaat"
];

const SUGGESTED_COMMANDS = [
  "Jam berapa sekarang?",
  "Kapan adzan Maghrib?",
  "Jadwal sholat hari ini",
  "Ingatkan aku jam 7 malam",
  "Arah kiblat",
  "Mulai deteksi rakaat"
];

export default function VoiceAssistant({ command, response, onSubmit, onQuickAction }: { command: string; response: string; onSubmit: (text: string) => void; onQuickAction: (text: string) => void }) {
  const [text, setText] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const speech = useSpeechRecognition({
    onFinalResult: onSubmit
  });

  const suggestions = useMemo(() => {
    const value = text.trim().toLowerCase();
    if (!value) return [];
    return [...QUICK_COMMANDS, ...SUGGESTED_COMMANDS]
      .filter((item, index, items) => items.indexOf(item) === index)
      .filter((item) => item.toLowerCase().includes(value) || value.split(" ").some((part) => part.length > 2 && item.toLowerCase().includes(part)))
      .slice(0, 5);
  }, [text]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) return;
      if (event.code === "Space" || event.key.toLowerCase() === "m") {
        event.preventDefault();
        void speech.start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [speech]);

  useEffect(() => setSuggestionIndex(0), [text]);

  const submitText = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSubmit(value);
    setText("");
  };

  const chooseSuggestion = (value: string) => {
    onSubmit(value);
    setText("");
    inputRef.current?.focus();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSuggestionIndex((index) => (index + 1) % suggestions.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSuggestionIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    }
    if (event.key === "Escape") {
      setText("");
    }
    if (event.key === "Enter" && text.trim().length > 0 && suggestions[suggestionIndex]) {
      event.preventDefault();
      chooseSuggestion(suggestions[suggestionIndex]);
    }
  };

  const micLabel = speech.requesting ? "Meminta izin mikrofon..." : speech.listening ? "Mendengarkan..." : speech.supported ? "Siap mendengarkan" : "Mikrofon tidak didukung";
  const micDisabled = speech.requesting || !speech.supported;

  return <section className="card" aria-labelledby="voice-title">
    <div className="text-center">
      <p className="text-sm font-semibold text-[var(--primary)]">Asisten Suara Lokal</p>
      <h2 id="voice-title" className="text-2xl font-bold">Tanya WaktuAI</h2>
      <p className="mt-2 text-sm text-[var(--text-soft)]">Voice command web paling stabil di Chrome/Edge. Jika gagal, gunakan ketik perintah atau tombol cepat.</p>
      <button type="button" onClick={() => { void speech.start(); }} disabled={micDisabled || speech.listening} aria-label="Mulai perintah suara" className="mt-5 inline-grid h-24 w-24 sm:h-28 sm:w-28 place-items-center rounded-full bg-gradient-to-br from-emerald-400 via-cyan-400 to-indigo-500 text-5xl shadow-xl shadow-emerald-500/20 transition hover:scale-105 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:filter">
        {speech.requesting ? "⏳" : speech.listening ? "🎙️" : "🎤"}
      </button>
      <p className="mt-3 font-medium" aria-live="polite">{micLabel}</p>
      {speech.interimTranscript && <p className="mt-2 text-sm text-[var(--text-soft)]">Mendengar: “{speech.interimTranscript}”</p>}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {speech.listening && <button className="btn-secondary" onClick={speech.stop}>Stop</button>}
        {speech.error && <button className="btn-primary" onClick={() => { void speech.retry(); }}>Coba Mikrofon Lagi</button>}
        <button className="btn-secondary" onClick={() => inputRef.current?.focus()}>Ketik Perintah</button>
        <button className="btn-secondary" onClick={() => { void speech.runDiagnostic(); }}>Cek Mikrofon</button>
      </div>
      {speech.error && <p className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-sm text-[var(--text)]" role="alert">{speech.error}</p>}
      {speech.diagnostics.length > 0 && <div className="mt-4 grid gap-2 text-left">
        {speech.diagnostics.map((item) => <div key={item.label} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-sm"><p className="font-semibold">{item.ok ? "✅" : "⚠️"} {item.label}</p><p className="text-[var(--text-soft)]">{item.detail}</p></div>)}
      </div>}
    </div>

    <form onSubmit={submitText} className="relative mt-5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
      <input ref={inputRef} className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onInputKeyDown} placeholder="Ketik perintah, misalnya: jadwal sholat hari ini" aria-label="Input perintah teks" aria-autocomplete="list" aria-expanded={suggestions.length > 0} />
      <button className="btn-primary" type="submit">Kirim</button>
      {suggestions.length > 0 && <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]" role="listbox">
        {suggestions.map((item, index) => <button key={item} type="button" className={`block w-full px-4 py-3 text-left text-sm ${index === suggestionIndex ? "bg-emerald-500/15 font-semibold" : "hover:bg-[var(--bg-soft)]"}`} onClick={() => chooseSuggestion(item)} role="option" aria-selected={index === suggestionIndex}>{item}</button>)}
      </div>}
    </form>

    <div className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-2" aria-label="Contoh perintah">
      {SUGGESTED_COMMANDS.map((item) => <button key={item} className="btn-secondary shrink-0 text-sm" onClick={() => onQuickAction(item)}>“{item}”</button>)}
    </div>
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{QUICK_COMMANDS.map((item) => <button key={item} className="btn-secondary" onClick={() => onQuickAction(item)}>{item}</button>)}</div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-4"><p className="text-sm font-semibold">Perintah dikenali</p><p className="mt-1 break-words text-[var(--text-soft)]">{command || speech.transcript || "Belum ada perintah."}</p></div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--primary-soft)] p-4"><p className="text-sm font-semibold">Jawaban asisten</p><p className="mt-1 break-words text-[var(--text-soft)]" aria-live="polite">{response || "Aku siap membantu jadwal sholat, waktu, kiblat, dan reminder."}</p></div>
    </div>
    <button className="fixed bottom-5 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-[var(--primary)] text-2xl text-[var(--primary-text)] shadow-[var(--shadow)] disabled:filter sm:hidden" onClick={() => { void speech.start(); }} disabled={micDisabled || speech.listening} aria-label="Mikrofon cepat">🎤</button>
  </section>;
}
