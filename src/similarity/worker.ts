import { performSimilarityCalculation } from "./scoring-logic";

self.onmessage = async (event) => {
  const { foregroundImage, backgroundImage, foregroundMask } = event.data;

  try {
    const score = await performSimilarityCalculation(
      foregroundImage,
      backgroundImage,
      foregroundMask,
    );
    self.postMessage({ score });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
