import cv from "@techstark/opencv-js";
import { performSimilarityCalculation } from "./scoring-logic";

export async function scoreImagesInParallel(
  foregroundImage: ImageData,
  backgroundImages: ImageData[],
  foregroundMask: ImageData,
): Promise<number[]> {
  const numWorkers = Math.min(
    navigator.hardwareConcurrency || 4,
    backgroundImages.length,
  );
  const workers: Worker[] = [];
  for (let i = 0; i < numWorkers; i++) {
    workers.push(
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
    );
  }

  const scores = new Array(backgroundImages.length);
  let imageIndex = 0;

  const promises = workers.map((worker, _workerIndex) => {
    return new Promise<void>((resolve, _reject) => {
      const processNextImage = () => {
        if (imageIndex >= backgroundImages.length) {
          resolve();
          return;
        }

        const currentIndex = imageIndex++;
        const backgroundImage = backgroundImages[currentIndex];

        worker.onmessage = (event) => {
          if (event.data.error) {
            console.error(
              `Worker error for image ${currentIndex}:`,
              event.data.error,
            );
            scores[currentIndex] = 0; // Assign a default score on error
          } else {
            scores[currentIndex] = event.data.score;
          }
          processNextImage(); // Process the next image
        };

        worker.onerror = (error) => {
          console.error(`Worker failed for image ${currentIndex}:`, error);
          scores[currentIndex] = 0; // Assign a default score on failure
          processNextImage();
        };

        worker.postMessage({
          foregroundImage,
          backgroundImage,
          foregroundMask,
        });
      };

      processNextImage(); // Start processing for this worker
    });
  });

  await Promise.all(promises);

  workers.forEach((worker) => worker.terminate());

  return scores;
}

export async function calculateSimilarityScore(
  foregroundImage: ImageData,
  backgroundImage: ImageData,
  foregroundMask: ImageData,
): Promise<number> {
  const cvInstance = await cv;
  return performSimilarityCalculation(
    cvInstance,
    foregroundImage,
    backgroundImage,
    foregroundMask,
  );
}
