"use client";
import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { advanceRakaatState, classifyPosture, createInitialRakaatState, finishCurrentRakaat, manualDecrement, manualIncrement, resetRakaatState } from "@/src/lib/rakaatDetection";
import type { PoseLandmark, RakaatCounterState, RakaatPosture, RakaatStatus } from "@/src/types/rakaat";

type VideoRef = RefObject<HTMLVideoElement | null>;

interface PoseModel {
  estimatePoses: (video: HTMLVideoElement) => Promise<Array<{ keypoints?: PoseLandmark[] }>>;
  dispose?: () => void;
}

interface PoseDetectionModule {
  createDetector: (model: unknown, config?: unknown) => Promise<PoseModel>;
  SupportedModels: { MoveNet: unknown };
  movenet: { modelType: { SINGLEPOSE_LIGHTNING: string } };
}

interface TensorFlowCoreModule {
  setBackend: (backendName: string) => Promise<boolean>;
  ready: () => Promise<void>;
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

  const start = useCallback(async () => {
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
      const constraints: MediaStreamConstraints = { video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 15 } }, audio: false };
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstError) {
        if (isPermissionDenied(firstError)) throw firstError;
        media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 15 } }, audio: false });
      }
      streamRef.current = media;
      setStream(media);
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play();
      }
      setStatus("Kamera aktif");
      const [poseDetection, tf] = await Promise.all([
        import("@tensorflow-models/pose-detection") as Promise<PoseDetectionModule>,
        import("@tensorflow/tfjs-core") as Promise<TensorFlowCoreModule>,
        import("@tensorflow/tfjs-backend-webgl")
      ]);
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

  return { counter, posture, status, error, stream, previewVisible, setPreviewVisible, setTarget, start, stop, reset, increment, decrement, finishCurrent };
}
