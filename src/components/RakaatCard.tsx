import { useEffect, useRef, useState } from "react";
import type { RakaatDetectionResult, RakaatDetector, RakaatLandmark, RakaatPosture } from "../lib/rakaatModel";

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
type FacingMode = "environment" | "user";
const SKELETON_CONNECTIONS: Array<[string, string]> = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"]
];

export function RakaatCard() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const detectorRef = useRef<RakaatDetector | null>(null);
  const detectingFrameRef = useRef(false);
  const phaseRef = useRef(0);
  const lastPostureRef = useRef<RakaatPosture>("unknown");
  const lastAdvanceRef = useRef(0);

  const [state, setState] = useState<DetectionState>("idle");
  const [count, setCount] = useState(0);
  const [target, setTarget] = useState<2 | 3 | 4>(4);
  const [posture, setPosture] = useState<RakaatPosture>("unknown");
  const [phase, setPhase] = useState(0);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [skeletonVisible, setSkeletonVisible] = useState(true);
  const [skeletonPoints, setSkeletonPoints] = useState(0);
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
    detectingFrameRef.current = false;
    if (videoRef.current) videoRef.current.srcObject = null;
    clearSkeleton();
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

  const clearSkeleton = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setSkeletonPoints(0);
  };

  const findLandmark = (landmarks: RakaatLandmark[], name: string): RakaatLandmark | undefined => {
    return landmarks.find((landmark) => landmark.name === name && landmark.score >= 0.25);
  };

  const drawSkeleton = (result: RakaatDetectionResult) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const width = video.videoWidth || video.clientWidth || 640;
    const height = video.videoHeight || video.clientHeight || 480;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    if (!skeletonVisible) return;

    const confident = result.landmarks.filter((landmark) => landmark.score >= 0.25);
    setSkeletonPoints(confident.length);
    context.lineWidth = Math.max(3, width / 180);
    context.strokeStyle = "#5eead4";
    context.fillStyle = "#fde68a";
    context.shadowColor = "rgba(15, 118, 110, 0.55)";
    context.shadowBlur = 10;

    for (const [from, to] of SKELETON_CONNECTIONS) {
      const start = findLandmark(result.landmarks, from);
      const end = findLandmark(result.landmarks, to);
      if (!start || !end) continue;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }

    for (const landmark of confident) {
      context.beginPath();
      context.arc(landmark.x, landmark.y, Math.max(4, width / 130), 0, Math.PI * 2);
      context.fill();
    }
    context.shadowBlur = 0;
  };

  const startLoop = () => {
    const tick = async () => {
      const detector = detectorRef.current;
      const video = videoRef.current;
      if (detector && video && !detectingFrameRef.current) {
        detectingFrameRef.current = true;
        try {
          const result = await detector.detect(video);
          drawSkeleton(result);
          setPosture(result.posture);
          advanceByPosture(result.posture);
        } catch {
          setStatus("Model AI gagal membaca frame. Deteksi dihentikan, tombol manual tetap aktif.");
          setState("error");
          stopDetection();
        } finally {
          detectingFrameRef.current = false;
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  const requestCamera = async (preferredFacingMode: FacingMode): Promise<MediaStream> => {
    const base = {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 15, max: 20 }
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { ...base, facingMode: { ideal: preferredFacingMode } },
        audio: false
      });
      setFacingMode(preferredFacingMode);
      return stream;
    } catch (error) {
      const first = error instanceof DOMException ? error.name : "";
      if (first === "NotAllowedError" || first === "SecurityError") throw error;
      const fallbackMode: FacingMode = preferredFacingMode === "environment" ? "user" : "environment";
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { ...base, facingMode: { ideal: fallbackMode } },
        audio: false
      });
      setFacingMode(fallbackMode);
      return stream;
    }
  };

  const startDetection = async (preferredFacingMode = facingMode) => {
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
      setStatus(preferredFacingMode === "user" ? "Meminta izin kamera depan." : "Meminta izin kamera belakang.");
      const stream = await requestCamera(preferredFacingMode);
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
      setStatus("Pose skeleton aktif. Rakaat tetap hanya dihitung dari urutan lengkap, bukan dari sujud saja.");
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

  const switchCamera = async (nextMode: FacingMode) => {
    setFacingMode(nextMode);
    if (state === "detecting" || state === "loading-model" || streamRef.current) {
      await startDetection(nextMode);
    } else {
      setStatus(nextMode === "user" ? "Kamera depan dipilih. Tekan Mulai Deteksi." : "Kamera belakang dipilih. Tekan Mulai Deteksi.");
    }
  };

  const message = STATE_MESSAGES[state];
  const phaseText = phase === 0 ? "Menunggu berdiri" : `Langkah ${phase + 1} dari ${SEQUENCE.length}: ${SEQUENCE[phase]}`;
  const cameraLabel = facingMode === "user" ? "Kamera depan" : "Kamera belakang";

  return (
    <section className="panel rakaat-panel enhanced-rakaat" id="rakaat">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Deteksi rakaat</p>
          <h2>AI pose skeleton dengan fallback manual</h2>
        </div>
        <span className={`status-pill ${state === "detecting" ? "ok" : ""}`}>{state}</span>
      </div>

      <div className="rakaat-grid">
        <div className="video-frame skeleton-frame">
          <video ref={videoRef} playsInline muted aria-label="Preview kamera deteksi rakaat" />
          <canvas ref={canvasRef} className="skeleton-canvas" aria-hidden="true" />
          <div className="camera-badge">{cameraLabel}</div>
          {state !== "detecting" && <div className="video-placeholder">Kamera aktif setelah kamu menekan Mulai Deteksi.</div>}
        </div>

        <div className="counter-box">
          <span className="counter-label">Rakaat</span>
          <strong>{count}/{target}</strong>
          <span>Postur: {posture}</span>
          <span>{phaseText}</span>
          <span>Skeleton points: {skeletonPoints}</span>
        </div>
      </div>

      {message && <p className="notice warning">{message}</p>}
      <p className="muted">{status}</p>

      <div className="button-row">
        <button onClick={() => { void startDetection(facingMode); }}>{state === "model-unavailable" ? "Coba Muat Model Lagi" : "Mulai Deteksi"}</button>
        <button className="secondary" onClick={stopDetection}>Stop Kamera</button>
        <button className={facingMode === "user" ? "selected" : "secondary"} onClick={() => { void switchCamera("user"); }}>Kamera Depan</button>
        <button className={facingMode === "environment" ? "selected" : "secondary"} onClick={() => { void switchCamera("environment"); }}>Kamera Belakang</button>
        <button className="secondary" onClick={() => setStatus("Mode manual aktif. Gunakan tombol tambah, kurang, reset, dan selesai rakaat.")}>Pakai Hitung Manual</button>
        <button className={skeletonVisible ? "selected" : "secondary"} onClick={() => setSkeletonVisible((visible) => !visible)}>{skeletonVisible ? "Skeleton Aktif" : "Skeleton Mati"}</button>
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
