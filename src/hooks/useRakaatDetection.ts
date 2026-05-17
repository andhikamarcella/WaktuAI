import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { advanceRakaatState, classifyPosture, createInitialRakaatState, finishCurrentRakaat, manualDecrement, manualIncrement, resetRakaatState } from "@/src/lib/rakaatDetection";
import type { PoseLandmark, RakaatCounterState, RakaatPosture, RakaatStatus } from "@/src/types/rakaat";

type VideoRef = RefObject<HTMLVideoElement | null>;

interface PoseModel {
  estimatePoses: (video: HTMLVideoElement) => Promise<Array<{ keypoints?: PoseLandmark[] }>>;
  dispose?: () => void;
}

type CameraFacingMode = "environment" | "user";

interface PoseDetectionModule {
  createDetector: (model: unknown, config?: unknown) => Promise<PoseModel>;
  SupportedModels: { MoveNet: unknown };
  movenet: { modelType: { SINGLEPOSE_LIGHTNING: string } };
}

interface TensorFlowCoreModule {
  setBackend: (backendName: string) => Promise<boolean>;
  ready: () => Promise<void>;
}


function loadPoseModules(): Promise<[PoseDetectionModule, TensorFlowCoreModule, unknown]> {
  return Promise.all([
    import(/* @vite-ignore */ "https://esm.sh/@tensorflow-models/pose-detection@2.1.3?bundle") as Promise<PoseDetectionModule>,
    import(/* @vite-ignore */ "https://esm.sh/@tensorflow/tfjs-core@4.22.0?bundle") as Promise<TensorFlowCoreModule>,
    import(/* @vite-ignore */ "https://esm.sh/@tensorflow/tfjs-backend-webgl@4.22.0?bundle")
  ]);
}

export interface RakaatDetectionHook {
  counter: RakaatCounterState;
  posture: RakaatPosture;
  status: RakaatStatus;
  error: string | null;
  stream: MediaStream | null;
  previewVisible: boolean;
  setPreviewVisible: (visible: boolean) => void;
  setTarget: (target: 2 | 3 | 4) => void;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  increment: () => void;
  decrement: () => void;
  finishCurrent: () => boolean;
  facingMode: CameraFacingMode;
  switchCamera: () => Promise<void>;
}

function isPermissionDenied(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
}

export function useRakaatDetection(videoRef: VideoRef, onCounted?: (count: number) => void): RakaatDetectionHook {
  const [counter, setCounter] = useState<RakaatCounterState>(() => createInitialRakaatState(4));
  const [posture, setPosture] = useState<RakaatPosture>("Tidak terdeteksi");
  const [status, setStatus] = useState<RakaatStatus>("Kamera belum aktif");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [previewVisible, setPreviewVisible] = useState(true);
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("environment");
  const modelRef = useRef<PoseModel | null>(null);
  const rafRef = useRef<number | null>(null);
  const stoppedRef = useRef(true);
  const streamRef = useRef<MediaStream | null>(null);
  const lastProcessedRef = useRef(0);
  const candidateRef = useRef<{ posture: RakaatPosture; since: number; frames: number }>({ posture: "Tidak terdeteksi", since: 0, frames: 0 });

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    modelRef.current?.dispose?.();
    modelRef.current = null;
    setStatus("Kamera belum aktif");
  }, []);

  const applyStablePosture = useCallback((nextPosture: RakaatPosture) => {
    setPosture(nextPosture);
    if (nextPosture === "Tidak terdeteksi") return;
    setCounter((current) => {
      const result = advanceRakaatState(current, nextPosture);
      if (result.counted) {
        setStatus("Rakaat terdeteksi");
        onCounted?.(result.state.count);
      } else {
        setStatus("Mendeteksi gerakan");
      }
      return result.state;
    });
  }, [onCounted]);

  const detectionLoop = useCallback(async () => {
    if (stoppedRef.current || !modelRef.current || !videoRef.current) return;
    const now = performance.now();
    if (now - lastProcessedRef.current >= 80) {
      lastProcessedRef.current = now;
      try {
        const poses = await modelRef.current.estimatePoses(videoRef.current);
        const rawPosture = classifyPosture(poses[0]?.keypoints ?? []);
        const candidate = candidateRef.current;
        if (candidate.posture === rawPosture) {
          candidate.frames += 1;
        } else {
          candidateRef.current = { posture: rawPosture, since: now, frames: 1 };
        }
        const stable = candidateRef.current;
        if (stable.frames >= 4 && now - stable.since >= 400) applyStablePosture(stable.posture);
      } catch {
        setError("Model pose gagal membaca frame kamera. Kamu tetap bisa memakai tombol manual.");
      }
    }
    rafRef.current = window.requestAnimationFrame(() => { void detectionLoop(); });
  }, [applyStablePosture, videoRef]);

  const startWithFacing = useCallback(async (preferredFacingMode: CameraFacingMode) => {
    if (streamRef.current) return;
    setError(null);
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setStatus("Kamera tidak didukung");
      setError("Kamera membutuhkan HTTPS atau localhost agar aman digunakan.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Kamera tidak didukung");
      setError("Browser ini belum mendukung akses kamera.");
      return;
    }
    setStatus("Meminta izin kamera");
    try {
      const buildConstraints = (mode: CameraFacingMode): MediaStreamConstraints => ({ video: { facingMode: { ideal: mode }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 15 } }, audio: false });
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia(buildConstraints(preferredFacingMode));
        setFacingMode(preferredFacingMode);
      } catch (firstError) {
        if (isPermissionDenied(firstError)) throw firstError;
        const fallbackMode: CameraFacingMode = preferredFacingMode === "environment" ? "user" : "environment";
        media = await navigator.mediaDevices.getUserMedia(buildConstraints(fallbackMode));
        setFacingMode(fallbackMode);
      }
      streamRef.current = media;
      setStream(media);
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play();
      }
      setStatus("Kamera aktif");
      const [poseDetection, tf] = await loadPoseModules();
      await tf.setBackend("webgl").catch(() => false);
      await tf.ready();
      modelRef.current = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING });
      stoppedRef.current = false;
      setStatus("Mendeteksi gerakan");
      rafRef.current = window.requestAnimationFrame(() => { void detectionLoop(); });
    } catch (caught) {
      if (isPermissionDenied(caught)) {
        setStatus("Kamera ditolak");
        setError("Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser, atau gunakan tombol manual.");
      } else {
        setStatus("Kamera tidak didukung");
        setError("Kamera atau model deteksi tidak tersedia. Counter manual tetap bisa digunakan.");
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
      modelRef.current?.dispose?.();
      modelRef.current = null;
    }
  }, [detectionLoop, videoRef]);

  const start = useCallback(async () => {
    await startWithFacing(facingMode);
  }, [facingMode, startWithFacing]);

  const switchCamera = useCallback(async () => {
    const nextMode: CameraFacingMode = facingMode === "environment" ? "user" : "environment";
    const wasRunning = Boolean(streamRef.current);
    stop();
    setFacingMode(nextMode);
    if (wasRunning) {
      window.setTimeout(() => { void startWithFacing(nextMode); }, 150);
    }
  }, [facingMode, startWithFacing, stop]);

  const reset = useCallback(() => {
    setCounter((current) => resetRakaatState(current.target));
    setPosture("Tidak terdeteksi");
    candidateRef.current = { posture: "Tidak terdeteksi", since: 0, frames: 0 };
  }, []);

  const increment = useCallback(() => setCounter((current) => manualIncrement(current)), []);
  const decrement = useCallback(() => setCounter((current) => manualDecrement(current)), []);
  const finishCurrent = useCallback(() => {
    let counted = false;
    setCounter((current) => {
      const result = finishCurrentRakaat(current);
      counted = result.counted;
      if (result.counted) onCounted?.(result.state.count);
      return result.state;
    });
    return counted;
  }, [onCounted]);
  const setTarget = useCallback((target: 2 | 3 | 4) => setCounter((current) => ({ ...current, target, count: Math.min(current.count, target) })), []);

  useEffect(() => stop, [stop]);

  return { counter, posture, status, error, stream, previewVisible, setPreviewVisible, setTarget, start, stop, reset, increment, decrement, finishCurrent, facingMode, switchCamera };
}
