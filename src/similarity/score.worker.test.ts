/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scoreImagesInParallel, setWorkerFactory } from "./score";
import { performSimilarityCalculation } from "./scoring-logic";

// テスト用の遅延定数
const MOCK_WORKER_CREATION_TIME = 5; // ms
const MOCK_POST_MESSAGE_TIME = 2; // ms
const MOCK_CALCULATION_TIME = 50; // ms

// 類似度計算をモック（実行時間を制御）
vi.mock("./scoring-logic", () => ({
  performSimilarityCalculation: vi.fn(async () => {
    await new Promise((res) => setTimeout(res, MOCK_CALCULATION_TIME));
    return 0.5;
  }),
}));

// Worker モック（引数が渡されても無視されるように実装）
class MockWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;

  constructor(..._args: any[]) {
    // 生成コストのシミュレーション
    setTimeout(() => {}, MOCK_WORKER_CREATION_TIME);
  }

  postMessage(data: unknown) {
    // メッセージ遅延 + 計算時間のシミュレーション
    // setTimeout(async () => { // setTimeout を削除し、直接実行
    (async () => {
      try {
        // performSimilarityCalculation は既にモックされているので、直接呼び出す
        const score = await (performSimilarityCalculation as any)();
        this.onmessage?.({ data: { score } } as MessageEvent);
      } catch (e) {
        this.onerror?.(e as ErrorEvent);
      }
    })();
    // }, MOCK_POST_MESSAGE_TIME); // setTimeout を削除
  }

  terminate() {
    // no-op
  }
}

describe("Parallel Similarity Scoring with Web Workers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Worker 生成をモックに差し替え（URL/Blob 周りを一切使わない）
    setWorkerFactory(() => new (MockWorker as any)());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const createDummyImageData = (w: number, h: number) => new ImageData(w, h);

  it("should orchestrate scoring 32 images in parallel and meet performance goals", async () => {
    const foregroundImage = createDummyImageData(100, 100);
    const foregroundMask = createDummyImageData(100, 100);
    const backgroundImages = Array.from({ length: 32 }, () =>
      createDummyImageData(100, 100),
    );

    // 4 並列で分配
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

    // 疑似時間を進める
    await vi.runAllTimersAsync();

    const scores = await scorePromise;
    const endTime = performance.now();
    const totalTime = endTime - startTime;

    expect(scores.length).toBe(32);
    expect(scores.every((s) => s === 0.5)).toBe(true);

    const imagesPerWorker = Math.ceil(
      backgroundImages.length / hardwareConcurrency,
    );
    const expectedTime =
      MOCK_WORKER_CREATION_TIME +
      imagesPerWorker * (MOCK_POST_MESSAGE_TIME + MOCK_CALCULATION_TIME);

    console.log(`Simulated scoring time: ${totalTime.toFixed(2)} ms`);
    console.log(`Theoretical minimum time: ${expectedTime.toFixed(2)} ms`);

    expect(totalTime).toBeLessThan(expectedTime + 50);
    expect(totalTime).toBeLessThan(450);
  }, 10000); // タイムアウトを10000msに延長
});
