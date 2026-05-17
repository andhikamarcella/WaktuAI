import { useEffect, useRef, useState } from "react";
import { RAKAAT_SEQUENCE } from "@/src/lib/rakaatDetection";
import { useRakaatDetection } from "@/src/hooks/useRakaatDetection";
import type { RakaatExternalAction } from "@/src/types/rakaat";

interface SmartRakaatCounterCardProps {
  voiceEnabled: boolean;
  speechRate: "slow" | "normal" | "fast";
  action: { type: RakaatExternalAction; nonce: number };
  onCountChange: (count: number, target: 2 | 3 | 4) => void;
  onMobileChange: (mobile: boolean) => void;
}

function ordinalIndonesian(count: number): string {
  const words = ["nol", "pertama", "kedua", "ketiga", "keempat", "kelima", "keenam"];
  return words[count] ?? `ke-${count}`;
}

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => {
      const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const narrow = window.matchMedia("(max-width: 767px)").matches;
      const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      setMobile((coarsePointer && narrow) || mobileUa);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

export default function SmartRakaatCounterCard({ voiceEnabled, speechRate, action, onCountChange, onMobileChange }: SmartRakaatCounterCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handledActionNonceRef = useRef(0);
  const mobile = useIsMobile();
  const detector = useRakaatDetection(videoRef, (count) => {
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(`Rakaat ${ordinalIndonesian(count)} selesai.`);
    utterance.lang = "id-ID";
    utterance.rate = speechRate === "slow" ? 0.85 : speechRate === "fast" ? 1.15 : 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });

  useEffect(() => onMobileChange(mobile), [mobile, onMobileChange]);
  useEffect(() => onCountChange(detector.counter.count, detector.counter.target), [detector.counter.count, detector.counter.target, onCountChange]);
  useEffect(() => {
    if (!action.type || action.nonce === 0 || handledActionNonceRef.current === action.nonce) return;
    handledActionNonceRef.current = action.nonce;
    if (action.type === "start" && mobile) void detector.start();
    if (action.type === "stop") detector.stop();
    if (action.type === "reset" && window.confirm("Reset hitungan rakaat?")) detector.reset();
    if (action.type === "increment") detector.increment();
    if (action.type === "decrement") detector.decrement();
    if (action.type === "finish") detector.finishCurrent();
  }, [action, detector, mobile]);

  const progress = `${detector.counter.count} dari ${detector.counter.target} rakaat`;
  const cameraLabel = detector.facingMode === "environment" ? "Kamera belakang" : "Kamera depan";

  return <section className="card" aria-labelledby="rakaat-title">
    <div className="grid gap-3 sm:flex sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--primary)]">Smart Rakaat Counter</p>
        <h2 id="rakaat-title" className="break-words text-2xl font-bold text-[var(--text)]">Deteksi Rakaat</h2>
      </div>
      <label className="text-sm font-semibold text-[var(--text)]">Target
        <select className="input mt-1" value={detector.counter.target} onChange={(e) => detector.setTarget(Number(e.target.value) as 2 | 3 | 4)} aria-label="Target rakaat">
          <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
        </select>
      </label>
    </div>

    {!mobile && <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-4 text-sm text-[var(--text)]">Fitur deteksi rakaat hanya tersedia untuk HP. Counter manual tetap bisa digunakan.</div>}

    <p className="mt-4 break-words text-sm text-[var(--text-soft)]">Kamera diproses langsung di perangkat kamu dan tidak dikirim ke server.</p>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--primary-soft)] p-4 text-center sm:p-5">
        <p className="break-words text-sm font-semibold text-[var(--text)]">Status: {detector.status}</p>
        <div className="mt-3 text-6xl font-black tabular-nums text-[var(--text)] sm:text-7xl">{detector.counter.count}</div>
        <p className="mt-1 font-semibold text-[var(--text)]">{progress}</p>
        <p className="mt-3 text-sm text-[var(--text-soft)]">Postur: <strong className="text-[var(--text)]">{detector.posture}</strong></p>
        <p className="mt-2 break-words text-xs text-[var(--text-soft)]">{detector.counter.message}</p>
      </div>
      <div className="min-w-0">
        <div className="relative overflow-hidden rounded-xl bg-slate-950">
          <video ref={videoRef} className={`aspect-video w-full max-h-[360px] object-cover ${detector.previewVisible ? "opacity-100" : "opacity-0"}`} playsInline muted />
          {!detector.previewVisible && <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-[#f8fafc]">Preview disembunyikan, deteksi tetap berjalan.</div>}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] px-3 text-sm text-[var(--text)]"><input type="checkbox" checked={detector.previewVisible} onChange={(e) => detector.setPreviewVisible(e.target.checked)} /> Preview kamera</label>
          <button className="btn-secondary" onClick={() => { void detector.switchCamera(); }} disabled={!mobile}>🔄 {cameraLabel}</button>
        </div>
        {detector.error && <p className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-sm text-[var(--text)]">{detector.error}</p>}
      </div>
    </div>

    <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <button className="btn-primary" onClick={() => { if (mobile) void detector.start(); }} disabled={!mobile || detector.stream !== null}>Mulai Deteksi</button>
      <button className="btn-secondary" onClick={detector.stop}>Stop</button>
      <button className="btn-secondary" onClick={() => { if (window.confirm("Reset hitungan rakaat?")) detector.reset(); }}>Reset Rakaat</button>
      <button className="btn-secondary" onClick={detector.increment}>Tambah Manual</button>
      <button className="btn-secondary" onClick={detector.decrement}>Kurangi Manual</button>
      <button className="btn-secondary" onClick={detector.finishCurrent}>Selesai Rakaat</button>
    </div>

    <ol className="mt-5 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3" aria-label="Urutan gerakan rakaat">
      {RAKAAT_SEQUENCE.map((step) => {
        const done = detector.counter.completedSteps.includes(step);
        return <li key={step} className={`rounded-2xl border p-3 text-[var(--text)] ${done ? "border-[var(--primary)] bg-[var(--primary-soft)] font-bold" : "border-[var(--border)] bg-[var(--bg-soft)]"}`}>{done ? "✓ " : "○ "}{step}</li>;
      })}
    </ol>
    <p className="mt-4 break-words rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-4 text-sm text-[var(--text)]">Deteksi kamera bisa tidak akurat tergantung posisi HP, cahaya, dan sudut kamera. Gunakan tombol manual jika perlu.</p>
  </section>;
}
