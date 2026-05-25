export type RakaatPosture = "berdiri" | "rukuk" | "sujud" | "duduk" | "unknown";

export type RakaatLandmark = {
  name: string;
  x: number;
  y: number;
  score: number;
};

export type RakaatDetectionResult = {
  posture: RakaatPosture;
  landmarks: RakaatLandmark[];
};

export type RakaatDetector = {
  detect(video: HTMLVideoElement): Promise<RakaatDetectionResult>;
  dispose(): void;
};

type PoseModel = {
  estimatePoses(video: HTMLVideoElement): Promise<Array<{ keypoints?: RakaatLandmark[] }>>;
  dispose?: () => void;
};

type PoseDetectionModule = {
  createDetector(model: unknown, config?: unknown): Promise<PoseModel>;
  SupportedModels: { MoveNet: unknown };
  movenet: { modelType: { SINGLEPOSE_LIGHTNING: string } };
};

type TensorFlowCoreModule = {
  setBackend(backendName: string): Promise<boolean>;
  ready(): Promise<void>;
};

export const SKELETON_CONNECTIONS: Array<[string, string]> = [
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

function normalizeName(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).toLowerCase();
}

function point(landmarks: RakaatLandmark[], names: string[], minScore = 0.25): RakaatLandmark | null {
  const normalizedNames = names.map(normalizeName);
  return landmarks.find((landmark) => normalizedNames.includes(normalizeName(landmark.name)) && landmark.score >= minScore) ?? null;
}

function midpoint(a: RakaatLandmark, b: RakaatLandmark): RakaatLandmark {
  return {
    name: `${a.name}-${b.name}`,
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    score: Math.min(a.score, b.score)
  };
}

function classifyPose(landmarks: RakaatLandmark[]): RakaatPosture {
  const leftShoulder = point(landmarks, ["left_shoulder", "leftShoulder"]);
  const rightShoulder = point(landmarks, ["right_shoulder", "rightShoulder"]);
  const leftHip = point(landmarks, ["left_hip", "leftHip"]);
  const rightHip = point(landmarks, ["right_hip", "rightHip"]);
  const leftKnee = point(landmarks, ["left_knee", "leftKnee"]);
  const rightKnee = point(landmarks, ["right_knee", "rightKnee"]);
  const nose = point(landmarks, ["nose"]);
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftKnee || !rightKnee || !nose) return "unknown";

  const shoulder = midpoint(leftShoulder, rightShoulder);
  const hip = midpoint(leftHip, rightHip);
  const knee = midpoint(leftKnee, rightKnee);
  const bodyHeight = Math.max(1, Math.abs(knee.y - nose.y));
  const torsoDx = Math.abs(shoulder.x - hip.x) / bodyHeight;
  const shoulderHipDy = Math.abs(hip.y - shoulder.y) / bodyHeight;
  const hipKneeDy = Math.abs(knee.y - hip.y) / bodyHeight;
  const headBelowHip = (nose.y - hip.y) / bodyHeight;

  if (headBelowHip > 0.1 && shoulder.y > hip.y - bodyHeight * 0.05) return "sujud";
  if (hipKneeDy < 0.14 && shoulder.y < hip.y) return "duduk";
  if (shoulderHipDy < 0.16 && headBelowHip < 0.1) return "rukuk";
  if (shoulder.y < hip.y && hip.y < knee.y && torsoDx < 0.28 && hipKneeDy > 0.24) return "berdiri";
  return "unknown";
}

async function loadPoseModules(): Promise<[PoseDetectionModule, TensorFlowCoreModule, unknown]> {
  return Promise.all([
    import(/* @vite-ignore */ "https://esm.sh/@tensorflow-models/pose-detection@2.1.3?bundle") as Promise<PoseDetectionModule>,
    import(/* @vite-ignore */ "https://esm.sh/@tensorflow/tfjs-core@4.22.0?bundle") as Promise<TensorFlowCoreModule>,
    import(/* @vite-ignore */ "https://esm.sh/@tensorflow/tfjs-backend-webgl@4.22.0?bundle")
  ]);
}

export async function createBrowserRakaatDetector(): Promise<RakaatDetector> {
  const [poseDetection, tf] = await loadPoseModules();
  await tf.setBackend("webgl").catch(() => false);
  await tf.ready();
  const model = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
  });

  return {
    async detect(video: HTMLVideoElement): Promise<RakaatDetectionResult> {
      const poses = await model.estimatePoses(video);
      const landmarks = (poses[0]?.keypoints ?? [])
        .filter((pointItem) => Number.isFinite(pointItem.x) && Number.isFinite(pointItem.y))
        .map((pointItem) => ({
          name: normalizeName(pointItem.name),
          x: pointItem.x,
          y: pointItem.y,
          score: pointItem.score ?? 0
        }));
      return {
        posture: classifyPose(landmarks),
        landmarks
      };
    },
    dispose(): void {
      model.dispose?.();
    }
  };
}
