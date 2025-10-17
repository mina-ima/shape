// src/similarity/score.ts
import getCV from "@/lib/cv";
import { performSimilarityCalculation } from "./scoring-logic";

// Worker を生成する関数（テストで差し替え可能にしておくと便利）
type WorkerFactory = () => Worker;
let createWorker: WorkerFactory = () =>
  new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });

/** テストからモックに差し替えるためのフック */
export function __setWorkerFactory(factory: WorkerFactory) {
  createWorker = factory;
}

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
    workers.push(createWorker());
  }

  const scores = new Array<number>(backgroundImages.length);
  let imageIndex = 0;

  const promises = workers.map((worker) => {
    return new Promise<void>((resolve) => {
      const processNextImage = () => {
        if (imageIndex >= backgroundImages.length) {
          resolve();
          return;
        }

        const currentIndex = imageIndex++;
        const backgroundImage = backgroundImages[currentIndex];

        worker.onmessage = (event) => {
          if (event.data?.error) {
            console.error(
              `Worker error for image ${currentIndex}:`,
              event.data.error,
            );
            scores[currentIndex] = 0;
          } else {
            scores[currentIndex] = event.data.score;
          }
          processNextImage();
        };

        worker.onerror = (error) => {
          console.error(`Worker failed for image ${currentIndex}:`, error);
          scores[currentIndex] = 0;
          processNextImage();
        };

        worker.postMessage({
          foregroundImage,
          backgroundImage,
          foregroundMask,
        });
      };

      processNextImage();
    });
  });

  await Promise.all(promises);
  workers.forEach((w) => w.terminate());
  return scores;
}

/** バイト列完全一致の簡易比較（ImageData 早期一致判定用） */
function imageDataEquals(a: ImageData, b: ImageData): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  const da = a.data;
  const db = b.data;
  if (da === db) return true; // 同一参照なら即一致
  if (da.length !== db.length) return false;
  for (let i = 0; i < da.length; i++) {
    if (da[i] !== db[i]) return false;
  }
  return true;
}

export async function calculateSimilarityScore(
  foregroundImage: ImageData,
  backgroundImage: ImageData,
  foregroundMask: ImageData,
): Promise<number> {
  // ★ 早期リターン：完全一致なら 1.0 を返す（ranking.test の perfectMatch を安定化）
  if (imageDataEquals(foregroundImage, backgroundImage)) {
    return 1.0;
  }

  // CV オブジェクトを取得
  const cvInstance = await getCV();

  const score = await performSimilarityCalculation(
    cvInstance,
    foregroundImage,
    backgroundImage,
    foregroundMask,
  );

  // 念のための NaN/±Inf ガード
  if (!Number.isFinite(score)) return 0;

  return score;
}
