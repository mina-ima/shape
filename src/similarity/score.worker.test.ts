/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { scoreImagesInParallel } from "./score";

// Mock the actual calculation to isolate the worker logic and control timing
vi.mock("./scoring-logic", () => ({
  performSimilarityCalculation: vi.fn(async () => {
    // Simulate some work
    await new Promise((res) => setTimeout(res, 10));
    return 0.5;
  }),
}));

// Mock the Worker class
const mockWorker = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  onmessage: null as ((this: Worker, ev: MessageEvent) => void) | null,
  onerror: null as ((this: Worker, ev: ErrorEvent) => void) | null,
};

vi.stubGlobal(
  "Worker",
  vi.fn(() => mockWorker),
);
vi.stubGlobal(
  "URL",
  vi.fn(() => "/mock/worker.js"),
);

describe("Parallel Similarity Scoring with Web Workers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock worker's message handler for each test
    mockWorker.postMessage.mockImplementation((_data) => {
      // Simulate the worker receiving the message and posting back a result
      if (mockWorker.onmessage) {
        mockWorker.onmessage({ data: { score: 0.5 } } as MessageEvent);
      }
    });
  });

  const createDummyImageData = (width: number, height: number): ImageData => {
    return new ImageData(width, height);
  };

  const createDummyMaskData = (width: number, height: number): ImageData => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i + 3] = 255; // Full alpha
    }
    return new ImageData(data, width, height);
  };

  it("should score 32 images in less than 400ms using Web Workers", async () => {
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
      `Total scoring time for 32 images with workers: ${totalTime.toFixed(2)} ms`,
    );

    expect(scores.length).toBe(32);
    expect(scores.every((s) => s === 0.5)).toBe(true);
    expect(totalTime).toBeLessThan(400);
  });
});
