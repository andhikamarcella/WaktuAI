export type RakaatPosture = "berdiri" | "rukuk" | "sujud" | "duduk" | "unknown";

export type RakaatDetector = {
  detect(video: HTMLVideoElement): RakaatPosture;
  dispose(): void;
};

type Sample = {
  top: number;
  middle: number;
  bottom: number;
};

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 72;
  return canvas;
}

function sampleFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): Sample | null {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let top = 0;
  let middle = 0;
  let bottom = 0;
  let topCount = 0;
  let middleCount = 0;
  let bottomCount = 0;

  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const i = (y * canvas.width + x) * 4;
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const weight = brightness < 110 ? 1 : 0;
      if (y < canvas.height / 3) {
        top += weight;
        topCount++;
      } else if (y < (canvas.height * 2) / 3) {
        middle += weight;
        middleCount++;
      } else {
        bottom += weight;
        bottomCount++;
      }
    }
  }

  return {
    top: top / Math.max(1, topCount),
    middle: middle / Math.max(1, middleCount),
    bottom: bottom / Math.max(1, bottomCount)
  };
}

function classify(sample: Sample): RakaatPosture {
  const total = sample.top + sample.middle + sample.bottom;
  if (total < 0.03) return "unknown";
  if (sample.top > sample.middle * 0.9 && sample.middle > sample.bottom * 0.75) return "berdiri";
  if (sample.middle > sample.top * 1.2 && sample.middle > sample.bottom * 0.8) return "rukuk";
  if (sample.bottom > sample.middle * 1.25 && sample.bottom > sample.top * 1.7) return "sujud";
  if (sample.middle > sample.top * 0.8 && sample.bottom > sample.top * 0.9) return "duduk";
  return "unknown";
}

export async function createBrowserRakaatDetector(): Promise<RakaatDetector> {
  const canvas = createCanvas();
  return {
    detect(video: HTMLVideoElement): RakaatPosture {
      const sample = sampleFrame(video, canvas);
      return sample ? classify(sample) : "unknown";
    },
    dispose(): void {
      canvas.width = 1;
      canvas.height = 1;
    }
  };
}
