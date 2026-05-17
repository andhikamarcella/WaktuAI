"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type SpeechRecognitionEventLike = Event & { results: { [index: number]: { [index: number]: { transcript: string } } } };
type SpeechRecognitionErrorLike = Event & { error?: string };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; abort: () => void; onstart: (() => void) | null; onend: (() => void) | null; onerror: ((event: SpeechRecognitionErrorLike) => void) | null; onresult: ((event: SpeechRecognitionEventLike) => void) | null };
type RecognitionCtor = new () => Recognition;

declare global { interface Window { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor; } }

export default function VoiceAssistant({ command, response, onSubmit, onQuickAction }: { command: string; response: string; onSubmit: (text: string) => void; onQuickAction: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const supported = useMemo(() => typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition), []);

  const startListening = () => {
    setError(null);
    if (!supported) { setError("Browser ini belum mendukung Speech Recognition. Ketik perintah manual di bawah."); return; }
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;
    try {
      recognitionRef.current?.abort();
      const rec = new Ctor();
      rec.lang = "id-ID"; rec.interimResults = false; rec.continuous = false;
      rec.onstart = () => setListening(true);
      rec.onend = () => setListening(false);
      rec.onerror = (event) => { setListening(false); setError(event.error === "not-allowed" ? "Izin mikrofon ditolak. Ketik perintah manual." : "Mikrofon gagal menangkap suara. Coba lagi atau ketik manual."); };
      rec.onresult = (event) => { const transcript = event.results[0]?.[0]?.transcript?.trim(); if (transcript) onSubmit(transcript); };
      recognitionRef.current = rec;
      rec.start();
    } catch { setListening(false); setError("Mikrofon belum siap. Coba lagi atau ketik perintah manual."); }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.code === "Space" || event.key.toLowerCase() === "m") { event.preventDefault(); startListening(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); recognitionRef.current?.abort(); };
  });

  const submitText = (event: FormEvent) => { event.preventDefault(); const value = text.trim(); if (!value) return; onSubmit(value); setText(""); };
  const actions = ["Jam sekarang", "Jadwal sholat hari ini", "Adzan berikutnya", "Aktifkan notifikasi", "Tambah reminder jam 7 malam", "Arah kiblat", "Mulai deteksi rakaat"];
  return <section className="card p-5" aria-labelledby="voice-title"><div className="text-center"><p className="text-sm font-semibold text-fuchsia-700 dark:text-fuchsia-300">Asisten Suara Lokal</p><h2 id="voice-title" className="text-2xl font-bold">Tanya WaktuAI</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Tekan tombol mikrofon, Space, atau M. Browser tidak mengizinkan wake word selalu aktif demi privasi.</p>
    <button type="button" onClick={startListening} disabled={listening} aria-label="Mulai perintah suara" className="mt-5 inline-grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br from-emerald-400 via-cyan-400 to-indigo-500 text-5xl shadow-xl shadow-emerald-500/20 transition hover:scale-105 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-emerald-500 active:scale-95 disabled:animate-pulse">{listening ? "🎙️" : "🎤"}</button>
    <p className="mt-3 font-medium" aria-live="polite">{listening ? "Mendengarkan..." : supported ? "Siap mendengarkan" : "Mikrofon tidak didukung"}</p>{error && <p className="mt-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{error}</p>}</div>
    <form onSubmit={submitText} className="mt-5 flex gap-2"><input className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ketik perintah, misalnya: jadwal sholat hari ini" aria-label="Input perintah teks" /><button className="btn-primary" type="submit">Kirim</button></form>
    <div className="mt-4 flex flex-wrap gap-2">{actions.map((a) => <button key={a} className="btn-secondary" onClick={() => onQuickAction(a)}>{a}</button>)}</div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-white/60 p-4 dark:bg-white/5"><p className="text-sm font-semibold">Perintah dikenali</p><p className="mt-1 text-slate-700 dark:text-slate-200">{command || "Belum ada perintah."}</p></div><div className="rounded-2xl bg-emerald-500/10 p-4"><p className="text-sm font-semibold">Jawaban asisten</p><p className="mt-1 text-slate-700 dark:text-slate-200" aria-live="polite">{response || "Aku siap membantu jadwal sholat, waktu, kiblat, dan reminder."}</p></div></div>
    <button className="fixed bottom-5 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-2xl text-white shadow-xl sm:hidden" onClick={startListening} aria-label="Mikrofon cepat">🎤</button>
  </section>;
}
