// src/similarity/score.ts
// 方針：perfect=1.0 は「target==candidate かつ 両者に前景あり」のときのみ。
// それ以外は IoU(mask, candidate) を返し、1.0 相当は 0.998 にキャップする。

const EPS = 1e-12 as const;
const NON_PERFECT_CAP = 0.998 as const;

/** RGBA -> RGB二値(前景=1, 背景=0)。R|G|B の合計 > 0 を前景とみなす（Alphaは無視）。 */
function rgbBinary(image: ImageData): Uint8Array {
  const src = image.data;
  const n = src.length;
  const bin = new Uint8Array(n / 4);
  let j = 0;
  for (let i = 0; i < n; i += 4) {
    const r = src[i],
      g = src[i + 1],
      b = src[i + 2];
    bin[j++] = (r | g | b) > 0 ? 1 : 0;
  }
  return bin;
}

/** 二値配列の完全一致 */
function equalBinary(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** RGBA配列（生バイト）の完全一致 */
function equalRGBA(a: ImageData, b: ImageData): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  const ad = a.data,
    bd = b.data;
  if (ad.length !== bd.length) return false;
  for (let i = 0; i < ad.length; i++) if (ad[i] !== bd[i]) return false;
  return true;
}

/** 前景が1pxでもあるか（二値） */
function hasForeground(a: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] === 1) return true;
  return false;
}

/** IoU（0..1）。union=0 の場合は一致なら 1、非一致なら 0。 */
function iou(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  let inter = 0,
    union = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i],
      bv = b[i];
    if (av | bv) union++;
    if (av & bv) inter++;
  }
  if (union === 0) return equalBinary(a, b) ? 1 : 0;
  return inter / union;
}

/**
 * 類似度スコア（0..1）を返す。
 * - foregroundImage: ターゲット画像（RGBA）
 * - backgroundImage: 候補画像（RGBA）
 * - foregroundMask: ターゲットの前景マスク（RGBA, ただしRGBで判定）
 */
import { performSimilarityCalculation } from "./scoring-logic";
import loadOpenCV from "@/lib/opencv-loader";

// WorkerFactory の型定義
type WorkerFactory = () => Worker;

// デフォルトの WorkerFactory (ブラウザの Worker を使用)
let workerFactory: WorkerFactory = () =>
  new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });

/**
 * Web Worker のファクトリ関数を差し替える (テスト用)
 * @param factory 新しいファクトリ関数
 */
export function setWorkerFactory(factory: WorkerFactory) {
  workerFactory = factory;
}

// ... 既存のコード ...

export async function calculateSimilarityScore(
  foregroundImage: ImageData,
  backgroundImage: ImageData,
  foregroundMask: ImageData,
): Promise<number> {
  const cv = await loadOpenCV();
  // performSimilarityCalculation を呼び出す
  return performSimilarityCalculation(
    cv,
    foregroundImage,
    backgroundImage,
    foregroundMask,
  );
}

/**
 * 複数の背景画像に対して並列で類似度スコアを計算する。
 * @param foregroundImage 前景画像
 * @param backgroundImages 背景画像の配列
 * @param foregroundMask 前景マスク
 * @returns 各背景画像に対する類似度スコアの配列
 */
export async function scoreImagesInParallel(
  foregroundImage: ImageData,
  backgroundImages: ImageData[],
  foregroundMask: ImageData,
): Promise<number[]> {
  const numWorkers = navigator.hardwareConcurrency || 4;
  const workers = Array.from({ length: numWorkers }, () => workerFactory());
  const results = new Array<number>(backgroundImages.length);
  const taskQueue = backgroundImages.map((_, index) => index);
  let completedCount = 0;

  return new Promise((resolve, reject) => {
    const processNext = (worker: Worker) => {
      if (taskQueue.length === 0) {
        if (completedCount === backgroundImages.length) {
          workers.forEach((w) => w.terminate());
          resolve(results);
        }
        return;
      }

      const imageIndex = taskQueue.shift();
      if (imageIndex === undefined) return;

      worker.onmessage = (event) => {
        if (event.data.error) {
          // エラーが発生した場合、Promiseをreject
          workers.forEach((w) => w.terminate());
          reject(new Error(event.data.error));
          return;
        }
        results[imageIndex] = event.data.score;
        completedCount++;
        processNext(worker);
      };

      worker.onerror = (error) => {
        workers.forEach((w) => w.terminate());
        reject(error);
      };

      worker.postMessage({
        foregroundImage,
        backgroundImage: backgroundImages[imageIndex],
        foregroundMask,
      });
    };

    workers.forEach(processNext);
  });
}
