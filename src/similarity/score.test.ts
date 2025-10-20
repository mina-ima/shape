/**
 * @vitest-environment happy-dom
 */
import { vi, describe, it, expect } from "vitest";
import getCV from "@/lib/cv"; // 軽量なテスト用モック
import {
  calculateSimilarityScore,
  scoreImagesInParallel,
  setWorkerFactory,
} from "./score";
import { performSimilarityCalculation } from "./scoring-logic";

// opencv-loader をモックし、テスト用cvを返すようにする
vi.mock("@/lib/opencv-loader", () => ({
  default: getCV,
  loadOpenCV: getCV,
}));

// Mock the actual calculation to control timing
vi.mock("./scoring-logic", () => ({
  performSimilarityCalculation: vi.fn(async () => {
    // Simulate a realistic workload for a single image
    await new Promise((res) => setTimeout(res, 20));
    return 0.75;
  }),
}));

describe("Parallel Similarity Scoring Performance", () => {
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

  // Mock Worker for parallel testing
  class MockWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    postMessage(data: any) {
      // Simulate the worker processing the message
      performSimilarityCalculation(
        getCV(),
        data.foregroundImage,
        data.backgroundImage,
        data.foregroundMask,
      ).then((score) => {
        if (this.onmessage) {
          this.onmessage({ data: { score } } as MessageEvent);
        }
      });
    }

    terminate() {
      // Do nothing for mock worker
    }
  }

  // Set the worker factory to return our mock worker
  beforeEach(() => {
    setWorkerFactory(() => new MockWorker() as unknown as Worker);
  });

  it("should score 32 images in parallel in less than 400ms", async () => {
    const foregroundImage = createDummyImageData(100, 100);
    const foregroundMask = createDummyMaskData(100, 100);

    const backgroundImages: ImageData[] = [];
    for (let i = 0; i < 32; i++) {
      backgroundImages.push(createDummyImageData(100, 100));
    }

    const startTime = performance.now();

    const scores = await scoreImagesInParallel(
      foregroundImage,
      backgroundImages,
      foregroundMask,
    );

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    console.log(
      `Total parallel scoring time for 32 images: ${totalTime.toFixed(2)} ms`,
    );

    expect(scores.length).toBe(32);
    expect(totalTime).toBeLessThan(400);
  });
});
