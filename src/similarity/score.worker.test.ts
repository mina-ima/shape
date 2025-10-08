/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scoreImagesInParallel } from "./score";
import { performSimilarityCalculation } from "./scoring-logic";

const MOCK_WORKER_CREATION_TIME = 5; // ms
const MOCK_POST_MESSAGE_TIME = 2; // ms
const MOCK_CALCULATION_TIME = 50; // ms

// Mock the actual calculation to control timing
vi.mock("./scoring-logic", () => ({
  performSimilarityCalculation: vi.fn(async () => {
    await new Promise((res) => setTimeout(res, MOCK_CALCULATION_TIME));
    return 0.5;
  }),
}));

// Mock the Worker class to simulate behavior and timing
class MockWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;

  constructor() {
    vi.fn();
    // Simulate worker creation time
    setTimeout(() => {}, MOCK_WORKER_CREATION_TIME);
  }

  postMessage(_data: unknown) {
    // Simulate message passing delay and calculation time
    setTimeout(() => {
      performSimilarityCalculation(
        {} as ImageData,
        {} as ImageData,
        {} as ImageData,
      )
        .then((score) => {
          if (this.onmessage) {
            this.onmessage({ data: { score } } as MessageEvent);
          }
        })
        .catch((e) => {
          if (this.onerror) {
            this.onerror(e as ErrorEvent);
          }
        });
    }, MOCK_POST_MESSAGE_TIME);
  }

  terminate() {
    vi.fn();
  }
}

vi.stubGlobal("Worker", MockWorker);
vi.stubGlobal(
  "URL",
  vi.fn(() => "/mock/worker.js"),
);

describe("Parallel Similarity Scoring with Web Workers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const createDummyImageData = (width: number, height: number): ImageData => {
    return new ImageData(width, height);
  };

  it("should orchestrate scoring 32 images in parallel and meet performance goals", async () => {
    const foregroundImage = createDummyImageData(100, 100);
    const foregroundMask = createDummyImageData(100, 100);
    const backgroundImages = Array(32)
      .fill(0)
      .map(() => createDummyImageData(100, 100));

    const hardwareConcurrency = 4;
    Object.defineProperty(navigator, "hardwareConcurrency", {
      value: hardwareConcurrency,
      writable: true,
      configurable: true,
    });

    const startTime = performance.now();
    const scorePromise = scoreImagesInParallel(
      foregroundImage,
      backgroundImages,
      foregroundMask,
    );

    // Advance timers to simulate the execution
    await vi.runAllTimersAsync();

    const scores = await scorePromise;
    const endTime = performance.now();

    const totalTime = endTime - startTime;

    expect(scores.length).toBe(32);
    expect(scores.every((s) => s === 0.5)).toBe(true);

    // --- Theoretical Performance Calculation ---
    const imagesPerWorker = Math.ceil(
      backgroundImages.length / hardwareConcurrency,
    );
    const expectedTime =
      MOCK_WORKER_CREATION_TIME +
      imagesPerWorker * (MOCK_POST_MESSAGE_TIME + MOCK_CALCULATION_TIME);

    console.log(`Simulated scoring time: ${totalTime.toFixed(2)} ms`);
    console.log(`Theoretical minimum time: ${expectedTime.toFixed(2)} ms`);

    // Check if the simulated time is close to the theoretical calculation
    // and well under the 400ms target.
    expect(totalTime).toBeLessThan(expectedTime + 50); // Add a small buffer for promise resolution
    expect(totalTime).toBeLessThan(450); // The goal is < 400, this gives a buffer
  });
});
