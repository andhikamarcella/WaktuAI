import type { PoseLandmark, RakaatCounterState, RakaatDetectionThresholds, RakaatPosture, RakaatTransitionResult } from "../types/rakaat";

export const RAKAAT_SEQUENCE = ["Berdiri", "Rukuk", "Sujud 1", "Duduk", "Sujud 2", "Berdiri lagi"] as const;

export const RAKAAT_THRESHOLDS: RakaatDetectionThresholds = {
  minConfidence: 0.35,
  verticalTorsoMaxDxRatio: 0.28,
  standingLegMinRatio: 0.24,
  rukuShoulderHipDyRatio: 0.16,
  sujudHeadBelowHipRatio: 0.10,
  sittingHipKneeDyRatio: 0.14
};

const COUNT_COOLDOWN_MS = 2000;

export function createInitialRakaatState(target: 2 | 3 | 4 = 4): RakaatCounterState {
  return { count: 0, target, machineState: "IDLE", lastCountedAt: 0, completedSteps: [], message: "Mulai dari posisi berdiri agar deteksi lebih akurat." };
}

export function resetRakaatState(target: 2 | 3 | 4 = 4): RakaatCounterState {
  return createInitialRakaatState(target);
}

export function manualIncrement(state: RakaatCounterState, now = Date.now()): RakaatCounterState {
  const count = Math.min(state.target, state.count + 1);
  return { ...state, count, lastCountedAt: now, machineState: "IDLE", completedSteps: [], message: `Rakaat manual disetel ke ${count}.` };
}

export function manualDecrement(state: RakaatCounterState): RakaatCounterState {
  const count = Math.max(0, state.count - 1);
  return { ...state, count, machineState: "IDLE", completedSteps: [], message: `Rakaat manual disetel ke ${count}.` };
}

export function finishCurrentRakaat(state: RakaatCounterState, now = Date.now()): RakaatTransitionResult {
  if (state.machineState !== "SECOND_SUJUD_DETECTED" && state.machineState !== "WAITING_FOR_NEXT_STANDING") return { state, counted: false };
  if (now - state.lastCountedAt < COUNT_COOLDOWN_MS) return { state, counted: false };
  const count = Math.min(state.target, state.count + 1);
  return {
    counted: true,
    state: { ...state, count, lastCountedAt: now, machineState: "IDLE", completedSteps: [], message: `Rakaat ${count} selesai secara manual.` }
  };
}

export function advanceRakaatState(state: RakaatCounterState, posture: RakaatPosture, now = Date.now()): RakaatTransitionResult {
  if (posture === "Tidak terdeteksi") return { state, counted: false };

  switch (state.machineState) {
    case "IDLE":
      if (posture === "Berdiri") return { counted: false, state: { ...state, machineState: "STANDING_STARTED", completedSteps: ["Berdiri"], message: "Berdiri terdeteksi." } };
      return { counted: false, state: { ...state, message: "Mulai dari posisi berdiri agar deteksi lebih akurat." } };
    case "STANDING_STARTED":
      if (posture === "Rukuk") return { counted: false, state: { ...state, machineState: "RUKU_DETECTED", completedSteps: ["Berdiri", "Rukuk"], message: "Rukuk terdeteksi." } };
      return { state, counted: false };
    case "RUKU_DETECTED":
      if (posture === "Sujud") return { counted: false, state: { ...state, machineState: "FIRST_SUJUD_DETECTED", completedSteps: ["Berdiri", "Rukuk", "Sujud 1"], message: "Sujud pertama terdeteksi." } };
      return { state, counted: false };
    case "FIRST_SUJUD_DETECTED":
      if (posture === "Duduk") return { counted: false, state: { ...state, machineState: "SITTING_BETWEEN_SUJUD_DETECTED", completedSteps: ["Berdiri", "Rukuk", "Sujud 1", "Duduk"], message: "Duduk antara dua sujud terdeteksi." } };
      return { state, counted: false };
    case "SITTING_BETWEEN_SUJUD_DETECTED":
      if (posture === "Sujud") return { counted: false, state: { ...state, machineState: "SECOND_SUJUD_DETECTED", completedSteps: ["Berdiri", "Rukuk", "Sujud 1", "Duduk", "Sujud 2"], message: "Sujud kedua terdeteksi. Rakaat belum dihitung sampai berdiri lagi." } };
      return { state, counted: false };
    case "SECOND_SUJUD_DETECTED":
    case "WAITING_FOR_NEXT_STANDING":
      if (posture !== "Berdiri") return { counted: false, state: state.machineState === "WAITING_FOR_NEXT_STANDING" ? state : { ...state, machineState: "WAITING_FOR_NEXT_STANDING" } };
      if (now - state.lastCountedAt < COUNT_COOLDOWN_MS) return { state, counted: false };
      const count = Math.min(state.target, state.count + 1);
      return {
        counted: true,
        state: { ...state, count, lastCountedAt: now, machineState: "STANDING_STARTED", completedSteps: ["Berdiri"], message: `Rakaat ${count} selesai.` }
      };
    default:
      return { state, counted: false };
  }
}

function point(landmarks: PoseLandmark[], names: string[], minConfidence: number): PoseLandmark | null {
  const found = landmarks.find((landmark) => names.includes(landmark.name));
  if (!found || (found.score ?? 1) < minConfidence) return null;
  return found;
}

function midpoint(a: PoseLandmark, b: PoseLandmark): PoseLandmark {
  return { name: `${a.name}-${b.name}`, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, score: Math.min(a.score ?? 1, b.score ?? 1) };
}

export function classifyPosture(landmarks: PoseLandmark[], thresholds = RAKAAT_THRESHOLDS): RakaatPosture {
  const leftShoulder = point(landmarks, ["left_shoulder", "leftShoulder"], thresholds.minConfidence);
  const rightShoulder = point(landmarks, ["right_shoulder", "rightShoulder"], thresholds.minConfidence);
  const leftHip = point(landmarks, ["left_hip", "leftHip"], thresholds.minConfidence);
  const rightHip = point(landmarks, ["right_hip", "rightHip"], thresholds.minConfidence);
  const leftKnee = point(landmarks, ["left_knee", "leftKnee"], thresholds.minConfidence);
  const rightKnee = point(landmarks, ["right_knee", "rightKnee"], thresholds.minConfidence);
  const nose = point(landmarks, ["nose"], thresholds.minConfidence);
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftKnee || !rightKnee || !nose) return "Tidak terdeteksi";

  const shoulder = midpoint(leftShoulder, rightShoulder);
  const hip = midpoint(leftHip, rightHip);
  const knee = midpoint(leftKnee, rightKnee);
  const bodyHeight = Math.max(1, Math.abs(knee.y - nose.y));
  const torsoDx = Math.abs(shoulder.x - hip.x) / bodyHeight;
  const shoulderHipDy = Math.abs(hip.y - shoulder.y) / bodyHeight;
  const hipKneeDy = Math.abs(knee.y - hip.y) / bodyHeight;
  const headBelowHip = (nose.y - hip.y) / bodyHeight;

  if (headBelowHip > thresholds.sujudHeadBelowHipRatio && shoulder.y > hip.y - bodyHeight * 0.05) return "Sujud";
  if (hipKneeDy < thresholds.sittingHipKneeDyRatio && shoulder.y < hip.y) return "Duduk";
  if (shoulderHipDy < thresholds.rukuShoulderHipDyRatio && headBelowHip < thresholds.sujudHeadBelowHipRatio) return "Rukuk";
  if (shoulder.y < hip.y && hip.y < knee.y && torsoDx < thresholds.verticalTorsoMaxDxRatio && hipKneeDy > thresholds.standingLegMinRatio) return "Berdiri";
  return "Tidak terdeteksi";
}
