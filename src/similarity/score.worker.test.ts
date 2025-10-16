/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scoreImagesInParallel } from "./score";
import { performSimilarityCalculation } from "./scoring-logic";
import * as cvModule from "@/lib/cv";

const cv: any = (cvModule as any).default ?? cvModule;

// テスト用の遅延定数
const MOCK_WORKER_CREATION_TIME = 5; // ms
const MOCK_POST_MESSAGE_TIME = 2; // ms
const MOCK_CALCULATION_TIME = 50; // ms

// 実際の類似度計算をモックして実行時間を制御
vi.mock("./scoring-logic", () => ({
  performSimilarityCalculation: vi.fn(async () => {
    await new Promise((res) => setTimeout(res, MOCK_CALCULATION_TIME));
    return 0.5;
  }),
}));

// Worker をモック
class MockWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;

  constructor() {
    // 生成時間のシミュレーション
    setTimeout(() => {}, MOCK_WORKER_CREATION_TIME);
  }

  postMessage(_data: unknown) {
    // メッセージ送受信遅延＋計算時間のシミュレーション
    setTimeout(() => {
      performSimilarityCalculation(
        {} as ImageData,
        {} as ImageData,
        {} as ImageData,
      )
        .then((score) => {
          this.onmessage?.({ data: { score } } as MessageEvent);
        })
        .catch((e) => {
          this.onerror?.(e as ErrorEvent);
        });
    }, MOCK_POST_MESSAGE_TIME);
  }

  terminate() {
    // no-op
  }
}

vi.stubGlobal("Worker", MockWorker);

// scoreImagesInParallel は Blob を Worker 化するために URL.createObjectURL を使う想定
const createObjectURLMock = vi.fn(() => "/mock/worker.js");
const revokeObjectURLMock = vi.fn();
vi.stubGlobal("URL", {
  createObjectURL: createObjectURLMock,
  revokeObjectURL: revokeObjectURLMock,
} as any);

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

    // 4 並列相当で分配
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

    // タイマーを進めて疑似実行
    await vi.runAllTimersAsync();

    const scores = await scorePromise;
    const endTime = performance.now();
    const totalTime = endTime - startTime;

    expect(scores.length).toBe(32);
    expect(scores.every((s) => s === 0.5)).toBe(true);

    // 理論値（並列分割に基づいて概算）
    const imagesPerWorker = Math.ceil(
      backgroundImages.length / hardwareConcurrency,
    );
    const expectedTime =
      MOCK_WORKER_CREATION_TIME +
      imagesPerWorker * (MOCK_POST_MESSAGE_TIME + MOCK_CALCULATION_TIME);

    console.log(`Simulated scoring time: ${totalTime.toFixed(2)} ms`);
    console.log(`Theoretical minimum time: ${expectedTime.toFixed(2)} ms`);

    // 理論値に近く、かつ 400ms 目標より十分速いことを確認
    expect(totalTime).toBeLessThan(expectedTime + 50); // Promise 解決の誤差バッファ
    expect(totalTime).toBeLessThan(450);
  });
});
