import { describe, it, expect, beforeAll } from "vitest";
import { calculateSimilarityScore } from "./score";
import cvPromise from "@techstark/opencv-js";

describe("Similarity Scoring Performance", () => {
  beforeAll(async () => {
    await cvPromise;
  });

  // Helper to create dummy ImageData
  const createDummyImageData = (width: number, height: number): ImageData => {
    return new ImageData(width, height);
  };

  // Helper to create a dummy mask (all opaque)
  const createDummyMaskData = (width: number, height: number): ImageData => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i + 3] = 255; // Full alpha
    }
    return new ImageData(data, width, height);
  };

  it("should score 32 images in less than 400ms (without WebWorker parallelization)", async () => {
    const foregroundImage = createDummyImageData(100, 100);
    const foregroundMask = createDummyMaskData(100, 100);

    const backgroundImages: ImageData[] = [];
    for (let i = 0; i < 32; i++) {
      backgroundImages.push(createDummyImageData(100, 100));
    }

    const startTime = performance.now();

    for (let i = 0; i < backgroundImages.length; i++) {
      await calculateSimilarityScore(
        foregroundImage,
        backgroundImages[i],
        foregroundMask,
      );
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    console.log(`Total scoring time for 32 images: ${totalTime.toFixed(2)} ms`);

    // This test is expected to fail initially if not optimized with Web Workers
    expect(totalTime).toBeLessThan(400);
  });
});
