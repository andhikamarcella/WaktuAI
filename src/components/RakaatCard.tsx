import { useEffect, useRef, useState } from "react";
import type { RakaatDetector, RakaatPosture } from "../lib/rakaatModel";

type DetectionState =
  | "idle"
  | "checking-support"
  | "requesting-camera"
  | "loading-model"
  | "detecting"
  | "camera-denied"
  | "camera-unavailable"
  | "model-unavailable"
  | "unsupported-browser"
  | "insecure-context"
  | "error";

const STATE_MESSAGES: Partial<Record<DetectionState, string>> = {
  "insecure-context": "Kamera hanya bisa dipakai di HTTPS atau localhost.",
  "camera-denied": "Izin kamera ditolak. Aktifkan izin kamera di browser atau pakai hitung manual.",
  "camera-unavailable": "Kamera tidak ditemukan. Kamu tetap bisa pakai tombol manual.",
  "model-unavailable": "Model AI deteksi gerakan belum bisa dimuat. Pakai hitung manual dulu.",
  "unsupported-browser": "Browser ini belum mendukung kamera untuk deteksi rakaat. Pakai tombol manual.",
  error: "Deteksi kamera berhenti karena ada error. Tombol manual tetap bisa dipakai."
};

const SEQUENCE: RakaatPosture[] = ["berdiri", "rukuk", "sujud", "duduk", "sujud", "berdiri"];

export function RakaatCard() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const detectorRef = useRef<RakaatDetector | null>(null);
  const phaseRef = useRef(0);
  const lastPostureRef = useRef<RakaatPosture>("unknown");
  const lastAdvanceRef = useRef(0);

  const [state, setState] = useState<DetectionState>("idle");
  const [count, setCount] = useState(0);
  const [target, setTarget] = useState<2 | 3 | 4>(4);
  const [posture, setPosture] = useState<RakaatPosture>("unknown");
  const [phase, setPhase] = useState(0);
  const [status, setStatus] = useState("Hitung manual siap dipakai kapan saja.");

  const stopDetection = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    detectorRef.current?.dispose();
    detectorRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (state === "detecting") setState("idle");
  };

  useEffect(() => stopDetection, []);

  const addManual = () => {
    setCount((value) => Math.min(target, value + 1));
    setStatus("Rakaat ditambah manual.");
  };

  const finishRakaat = () => {
    setCount((value) => Math.min(target, value + 1));
    phaseRef.current = 0;
    setPhase(0);
    setStatus("Rakaat diselesaikan manual setelah sujud kedua.");
  };

  const reset = () => {
    setCount(0);
    phaseRef.current = 0;
    setPhase(0);
    setStatus("Hitungan rakaat direset.");
  };

  const advanceByPosture = (next: RakaatPosture) => {
    const now = Date.now();
    if (next === "unknown" || next === lastPostureRef.current || now - lastAdvanceRef.current < 900) return;
    const expected = SEQUENCE[phaseRef.current];
    if (next === expected) {
      const nextPhase = phaseRef.current + 1;
      phaseRef.current = nextPhase >= SEQUENCE.length ? 0 : nextPhase;
      lastAdvanceRef.current = now;
      if (nextPhase >= SEQUENCE.length) {
        setCount((value) => Math.min(target, value + 1));
        setStatus("Satu rakaat terhitung dari urutan berdiri, rukuk, dua sujud, lalu berdiri lagi.");
      } else {
        setStatus(`Terdeteksi ${next}. Lanjutkan urutan rakaat.`);
      }
      setPhase(phaseRef.current);
    }
    lastPostureRef.current = next;
  };

  const startLoop = () => {
    const tick = () => {
      const detector = detectorRef.current;
      const video = videoRef.current;
      if (detector && video) {
        const next = detector.detect(video);
        setPosture(next);
        advanceByPosture(next);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  const requestCamera = async (): Promise<MediaStream> => {
    const base = {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 15, max: 20 }
    };
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { ...base, facingMode: { ideal: "environment" } },
        audio: false
      });
    } catch (error) {
      const first = error instanceof DOMException ? error.name : "";
      if (first === "NotAllowedError" || first === "SecurityError") throw error;
      return navigator.mediaDevices.getUserMedia({
        video: { ...base, facingMode: "user" },
        audio: false
      });
    }
  };

  const startDetection = async () => {
    stopDetection();
    setState("checking-support");
    setStatus("Mengecek dukungan kamera.");

    if (!window.isSecureContext) {
      setState("insecure-context");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported-browser");
      return;
    }

    try {
      setState("requesting-camera");
      setStatus("Meminta izin kamera.");
      const stream = await requestCamera();
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setState("loading-model");
      setStatus("Memuat model AI...");
      const modelPromise = import("../lib/rakaatModel").then((module) => module.createBrowserRakaatDetector());
      const timeoutPromise = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("Model AI terlalu lama dimuat. Coba lagi atau pakai tombol manual.")), 15_000);
      });
      detectorRef.current = await Promise.race([modelPromise, timeoutPromise]);
      setState("detecting");
      setStatus("Deteksi eksperimental aktif. Jika tidak akurat, pakai tombol manual.");
      startLoop();
    } catch (error) {
      stopDetection();
      if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
        setState("camera-denied");
        return;
      }
      if (error instanceof DOMException && (error.name === "NotFoundError" || error.name === "OverconstrainedError")) {
        setState("camera-unavailable");
        return;
      }
      if (error instanceof Error && error.message.includes("Model AI terlalu lama")) {
        setStatus(error.message);
        setState("model-unavailable");
        return;
      }
      setState("model-unavailable");
    }
  };

  const message = STATE_MESSAGES[state];
  const phaseText = phase === 0 ? "Menunggu berdiri" : `Langkah ${phase + 1} dari ${SEQUENCE.length}: ${SEQUENCE[phase]}`;

  return (
    <section className="panel rakaat-panel" id="rakaat">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Deteksi rakaat</p>
          <h2>Hitung rakaat aman dengan fallback manual</h2>
        </div>
        <span className={`status-pill ${state === "detecting" ? "ok" : ""}`}>{state}</span>
      </div>

      <div className="rakaat-grid">
        <div className="video-frame">
          <video ref={videoRef} playsInline muted aria-label="Preview kamera deteksi rakaat" />
          {state !== "detecting" && <div className="video-placeholder">Kamera aktif setelah kamu menekan Mulai Deteksi.</div>}
        </div>

        <div className="counter-box">
          <span className="counter-label">Rakaat</span>
          <strong>{count}/{target}</strong>
          <span>Postur: {posture}</span>
          <span>{phaseText}</span>
        </div>
      </div>

      {message && <p className="notice warning">{message}</p>}
      <p className="muted">{status}</p>

      <div className="button-row">
        <button onClick={startDetection}>{state === "model-unavailable" ? "Coba Muat Model Lagi" : "Mulai Deteksi"}</button>
        <button className="secondary" onClick={stopDetection}>Stop Kamera</button>
        <button className="secondary" onClick={() => setStatus("Mode manual aktif. Gunakan tombol tambah, kurang, reset, dan selesai rakaat.")}>Pakai Hitung Manual</button>
      </div>

      <div className="target-row" aria-label="Set target rakaat">
        {[2, 3, 4].map((value) => (
          <button key={value} className={target === value ? "selected" : "secondary"} onClick={() => setTarget(value as 2 | 3 | 4)}>
            Target {value}
          </button>
        ))}
      </div>

      <div className="button-row">
        <button onClick={addManual}>Tambah rakaat</button>
        <button className="secondary" onClick={() => setCount((value) => Math.max(0, value - 1))}>Kurangi rakaat</button>
        <button className="secondary" onClick={reset}>Reset</button>
        <button className="secondary" onClick={finishRakaat}>Selesai Rakaat</button>
      </div>
    </section>
  );
}
