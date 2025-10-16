/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from "vitest";
import { calculateSimilarityScore } from "./score";
import { performSimilarityCalculation } from "./scoring-logic";
import * as cvModule from "@/lib/cv";

const cv: any = (cvModule as any).default ?? cvModule;

// Mock the actual calculation to control timing
vi.mock("./scoring-logic", () => ({
  performSimilarityCalculation: vi.fn(async () => {
    // Simulate a realistic workload for a single image
    await new Promise((res) => setTimeout(res, 20));
    return 0.75;
  }),
}));

describe("Serial Similarity Scoring Performance", () => {
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

  it("should take more than 400ms to score 32 images serially", async () => {
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

    console.log(
      `Total serial scoring time for 32 images: ${totalTime.toFixed(2)} ms`,
    );

    // This test confirms that serial execution is too slow
    expect(performSimilarityCalculation).toHaveBeenCalledTimes(32);
    expect(totalTime).toBeGreaterThan(400);
  });
});
