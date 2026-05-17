export type RakaatPosture = "Berdiri" | "Rukuk" | "Sujud" | "Duduk" | "Tidak terdeteksi";

export type RakaatMachineState =
  | "IDLE"
  | "STANDING_STARTED"
  | "RUKU_DETECTED"
  | "FIRST_SUJUD_DETECTED"
  | "SITTING_BETWEEN_SUJUD_DETECTED"
  | "SECOND_SUJUD_DETECTED"
  | "WAITING_FOR_NEXT_STANDING";

export type RakaatStatus =
  | "Kamera belum aktif"
  | "Meminta izin kamera"
  | "Kamera aktif"
  | "Mendeteksi gerakan"
  | "Rakaat terdeteksi"
  | "Kamera ditolak"
  | "Kamera tidak didukung";

export interface PoseLandmark {
  name: string;
  x: number;
  y: number;
  score?: number;
}

export interface RakaatDetectionThresholds {
  minConfidence: number;
  verticalTorsoMaxDxRatio: number;
  standingLegMinRatio: number;
  rukuShoulderHipDyRatio: number;
  sujudHeadBelowHipRatio: number;
  sittingHipKneeDyRatio: number;
}

export interface RakaatCounterState {
  count: number;
  target: 2 | 3 | 4;
  machineState: RakaatMachineState;
  lastCountedAt: number;
  completedSteps: string[];
  message: string;
}

export interface RakaatTransitionResult {
  state: RakaatCounterState;
  counted: boolean;
}

export type RakaatExternalAction = "start" | "stop" | "reset" | "increment" | "decrement" | "finish" | null;
