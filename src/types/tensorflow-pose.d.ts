declare module "@tensorflow-models/pose-detection" {
  export const SupportedModels: { MoveNet: unknown };
  export const movenet: { modelType: { SINGLEPOSE_LIGHTNING: string } };
  export function createDetector(model: unknown, config?: unknown): Promise<{
    estimatePoses(video: HTMLVideoElement): Promise<Array<{ keypoints?: Array<{ name: string; x: number; y: number; score?: number }> }>>;
    dispose?: () => void;
  }>;
}

declare module "@tensorflow/tfjs-backend-webgl" {}


declare module "@tensorflow/tfjs-core" {
  export function setBackend(backendName: string): Promise<boolean>;
  export function ready(): Promise<void>;
}
