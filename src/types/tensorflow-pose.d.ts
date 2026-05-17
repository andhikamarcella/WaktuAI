declare module "https://esm.sh/@tensorflow-models/pose-detection@2.1.3?bundle" {
  export const SupportedModels: { MoveNet: unknown };
  export const movenet: { modelType: { SINGLEPOSE_LIGHTNING: string } };
  export function createDetector(model: unknown, config?: unknown): Promise<{
    estimatePoses(video: HTMLVideoElement): Promise<Array<{ keypoints?: Array<{ name: string; x: number; y: number; score?: number }> }>>;
    dispose?: () => void;
  }>;
}

declare module "https://esm.sh/@tensorflow/tfjs-core@4.22.0?bundle" {
  export function setBackend(backendName: string): Promise<boolean>;
  export function ready(): Promise<void>;
}

declare module "https://esm.sh/@tensorflow/tfjs-backend-webgl@4.22.0?bundle" {}
