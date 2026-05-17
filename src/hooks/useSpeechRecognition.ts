"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SpeechRecognitionErrorCode = "aborted" | "audio-capture" | "bad-grammar" | "language-not-supported" | "network" | "no-speech" | "not-allowed" | "phrases-not-supported" | "service-not-allowed";
type SpeechRecognitionState = "idle" | "requesting" | "listening" | "stopping" | "error" | "unsupported";

type SpeechRecognitionEventLike = Event & {
  results: SpeechRecognitionResultList;
  resultIndex: number;
};

type SpeechRecognitionErrorLike = Event & {
  error?: SpeechRecognitionErrorCode | "permission-denied";
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface UseSpeechRecognitionOptions {
  onFinalResult: (text: string) => void;
  onStart?: () => void;
  onSuccess?: () => void;
  onError?: () => void;
}

interface MicrophoneDiagnostic {
  label: string;
  ok: boolean;
  detail: string;
}

interface UseSpeechRecognitionResult {
  state: SpeechRecognitionState;
  listening: boolean;
  requesting: boolean;
  supported: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  diagnostics: MicrophoneDiagnostic[];
  start: () => Promise<void>;
  stop: () => void;
  retry: () => Promise<void>;
  runDiagnostic: () => Promise<void>;
}

const NO_RESULT_TIMEOUT_MS = 8000;
const STOP_COOLDOWN_MS = 1000;

function isLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function isSecureEnough(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext || isLocalhost();
}

function getFriendlyError(error?: string): string {
  if (error === "not-allowed" || error === "permission-denied" || error === "service-not-allowed") return "Izin mikrofon ditolak. Aktifkan izin mikrofon di pengaturan browser.";
  if (error === "no-speech") return "Aku belum menangkap suara. Coba bicara lebih dekat atau pakai ketik perintah.";
  if (error === "audio-capture") return "Mikrofon tidak terdeteksi. Cek perangkat mikrofon kamu.";
  if (error === "network") return "Koneksi bermasalah saat mengenali suara. Coba lagi.";
  if (error === "unsupported") return "Browser ini belum mendukung voice command. Pakai Chrome/Edge atau ketik perintah.";
  if (error === "insecure") return "Halaman harus HTTPS atau localhost agar mikrofon bisa dipakai.";
  return "Mikrofon gagal menangkap suara. Coba lagi atau ketik perintah.";
}

export function useSpeechRecognition({ onFinalResult, onStart, onSuccess, onError }: UseSpeechRecognitionOptions): UseSpeechRecognitionResult {
  const RecognitionConstructor = useMemo(() => (typeof window === "undefined" ? undefined : window.SpeechRecognition ?? window.webkitSpeechRecognition), []);
  const supported = Boolean(RecognitionConstructor);
  const [state, setState] = useState<SpeechRecognitionState>(supported ? "idle" : "unsupported");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(supported ? null : getFriendlyError("unsupported"));
  const [diagnostics, setDiagnostics] = useState<MicrophoneDiagnostic[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const startingRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const cooldownUntilRef = useRef(0);
  const finalDeliveredRef = useRef(false);
  const endedAfterErrorRef = useRef(false);

  const clearTimeoutGuard = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const resetActiveState = useCallback((nextState: SpeechRecognitionState = "idle") => {
    clearTimeoutGuard();
    activeRef.current = false;
    startingRef.current = false;
    cooldownUntilRef.current = Date.now() + STOP_COOLDOWN_MS;
    setState(supported ? nextState : "unsupported");
  }, [clearTimeoutGuard, supported]);

  const stop = useCallback(() => {
    clearTimeoutGuard();
    if (!activeRef.current && !startingRef.current) {
      setState(supported ? "idle" : "unsupported");
      return;
    }
    setState("stopping");
    activeRef.current = false;
    startingRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      recognitionRef.current?.abort();
      resetActiveState("idle");
    }
  }, [clearTimeoutGuard, resetActiveState, supported]);

  const requestAudioPermission = useCallback(async (): Promise<boolean> => {
    if (!isSecureEnough()) {
      setError(getFriendlyError("insecure"));
      setState("error");
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Browser tidak mendukung akses mikrofon. Pakai ketik perintah atau tombol cepat.");
      setState("unsupported");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getAudioTracks().forEach((track) => track.stop());
      return true;
    } catch (caught) {
      const name = caught instanceof DOMException ? caught.name : "";
      const denied = name === "NotAllowedError" || name === "PermissionDeniedError";
      const notFound = name === "NotFoundError" || name === "DevicesNotFoundError";
      setError(getFriendlyError(denied ? "not-allowed" : notFound ? "audio-capture" : undefined));
      setState("error");
      onError?.();
      return false;
    }
  }, [onError]);

  const start = useCallback(async () => {
    if (!supported || !RecognitionConstructor) {
      setState("unsupported");
      setError(getFriendlyError("unsupported"));
      onError?.();
      return;
    }
    if (activeRef.current || startingRef.current || Date.now() < cooldownUntilRef.current) return;
    startingRef.current = true;
    finalDeliveredRef.current = false;
    endedAfterErrorRef.current = false;
    setTranscript("");
    setInterimTranscript("");
    setError(null);
    setState("requesting");

    const allowed = await requestAudioPermission();
    if (!allowed) {
      startingRef.current = false;
      return;
    }

    const recognition = new RecognitionConstructor();
    recognition.lang = "id-ID";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => {
      activeRef.current = true;
      startingRef.current = false;
      setState("listening");
      onStart?.();
      clearTimeoutGuard();
      timeoutRef.current = window.setTimeout(() => {
        endedAfterErrorRef.current = true;
        setError(getFriendlyError("no-speech"));
        onError?.();
        recognitionRef.current?.abort();
        resetActiveState("error");
      }, NO_RESULT_TIMEOUT_MS);
    };
    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results.item(index);
        const text = result.item(0)?.transcript?.trim() ?? "";
        if (result.isFinal) finalText += text;
        else interim += text;
      }
      setInterimTranscript(interim);
      if (finalText.trim()) {
        finalDeliveredRef.current = true;
        clearTimeoutGuard();
        const clean = finalText.trim();
        setTranscript(clean);
        onFinalResult(clean);
        onSuccess?.();
        recognitionRef.current?.stop();
      }
    };
    recognition.onerror = (event) => {
      clearTimeoutGuard();
      endedAfterErrorRef.current = true;
      const message = getFriendlyError(event.error);
      setError(message);
      setState(event.error === "not-allowed" || event.error === "service-not-allowed" ? "error" : "error");
      onError?.();
      activeRef.current = false;
      startingRef.current = false;
      cooldownUntilRef.current = Date.now() + STOP_COOLDOWN_MS;
    };
    recognition.onend = () => {
      if (endedAfterErrorRef.current) {
        resetActiveState("error");
        return;
      }
      const shouldShowNoSpeech = !finalDeliveredRef.current && activeRef.current;
      if (shouldShowNoSpeech) setError(getFriendlyError("no-speech"));
      resetActiveState(finalDeliveredRef.current ? "idle" : shouldShowNoSpeech ? "error" : "idle");
    };
    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      recognition.abort();
      endedAfterErrorRef.current = true;
      setError("Mikrofon belum siap. Tunggu sebentar lalu coba lagi atau pakai ketik perintah.");
      resetActiveState("error");
      onError?.();
    }
  }, [RecognitionConstructor, clearTimeoutGuard, onError, onFinalResult, onStart, onSuccess, requestAudioPermission, resetActiveState, supported]);

  const retry = useCallback(async () => {
    setError(null);
    await start();
  }, [start]);

  const runDiagnostic = useCallback(async () => {
    const items: MicrophoneDiagnostic[] = [];
    const secure = isSecureEnough();
    items.push({ label: secure ? "Halaman aman untuk mikrofon" : "Halaman harus HTTPS", ok: secure, detail: secure ? "HTTPS atau localhost terdeteksi." : "Pastikan website dibuka lewat HTTPS, bukan HTTP." });
    const mediaSupported = Boolean(navigator.mediaDevices?.getUserMedia);
    items.push({ label: mediaSupported ? "Akses mikrofon tersedia" : "Akses mikrofon tidak tersedia", ok: mediaSupported, detail: mediaSupported ? "Browser mendukung getUserMedia." : "Kalau mikrofon gagal, kamu tetap bisa pakai tombol cepat atau ketik perintah." });
    items.push({ label: supported ? "Browser mendukung voice command" : "Browser tidak mendukung voice command", ok: supported, detail: supported ? "Speech recognition tersedia." : "Voice command paling stabil di Chrome atau Edge." });
    items.push({ label: "Text command tetap bisa digunakan", ok: true, detail: "Ketik perintah dan tombol cepat selalu menjadi fallback." });
    items.push({ label: "Speech synthesis", ok: typeof window !== "undefined" && "speechSynthesis" in window, detail: "Dipakai untuk membacakan jawaban asisten jika tersedia." });

    if (navigator.permissions?.query) {
      try {
        const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
        items.push({ label: permission.state === "granted" ? "Izin mikrofon aktif" : permission.state === "denied" ? "Izin mikrofon ditolak" : "Izin mikrofon belum dipilih", ok: permission.state !== "denied", detail: permission.state === "denied" ? "Aktifkan izin mikrofon di pengaturan browser." : "Browser akan meminta izin saat mikrofon dipakai." });
      } catch {
        items.push({ label: "Status izin mikrofon tidak bisa dibaca", ok: true, detail: "Permissions API tidak didukung, izin akan dicek saat mulai bicara." });
      }
    } else {
      items.push({ label: "Status izin mikrofon tidak bisa dibaca", ok: true, detail: "Permissions API tidak didukung, izin akan dicek saat mulai bicara." });
    }
    setDiagnostics(items);
  }, [supported]);

  useEffect(() => () => {
    clearTimeoutGuard();
    recognitionRef.current?.abort();
    activeRef.current = false;
    startingRef.current = false;
  }, [clearTimeoutGuard]);

  return { state, listening: state === "listening", requesting: state === "requesting", supported, transcript, interimTranscript, error, diagnostics, start, stop, retry, runDiagnostic };
}
