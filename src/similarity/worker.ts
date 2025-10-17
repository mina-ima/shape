import cv from "@techstark/opencv-js";
import { performSimilarityCalculation } from "./scoring-logic";

let getCV: Promise<typeof cv> | null = null;

// Define a type for the potentially nested module structure
type CvModule = { default: typeof cv };

const initialize = () => {
  if (!getCV) {
    // thenable誤認を避けるため、.thenは使わずasync IIFEで正規化
    getCV = (async () => {
      const mod = cv as unknown as CvModule | typeof cv;
      // default有無を吸収してcvインスタンスを返す
      return (mod as CvModule).default ?? (mod as typeof cv);
    })();
  }
  return getCV;
};

self.onmessage = async (event) => {
  const { foregroundImage, backgroundImage, foregroundMask } = event.data;

  try {
    const cvInstance = await initialize();

    const score = await performSimilarityCalculation(
      cvInstance,
      foregroundImage,
      backgroundImage,
      foregroundMask,
    );
    self.postMessage({ score });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    self.postMessage({ error: errorMessage });
  }
};
