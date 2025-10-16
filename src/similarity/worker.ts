import cv from "@techstark/opencv-js";
import { performSimilarityCalculation } from "./scoring-logic";

let cvPromise: Promise<typeof cv> | null = null;

// Define a type for the potentially nested module structure
type CvModule = { default: typeof cv };

const initialize = () => {
  if (!cvPromise) {
    // Wrap the 'thenable' cv object in a standard Promise to ensure compatibility
    cvPromise = Promise.resolve(cv).then((cvModule) => {
      // The resolved value might be the module itself, or a module with a default export
      return (cvModule as unknown as CvModule).default || cvModule;
    });
  }
  return cvPromise;
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
