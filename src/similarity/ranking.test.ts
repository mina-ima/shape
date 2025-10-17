// src/similarity/ranking.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import getCV from "@/lib/cv";
import { calculateSimilarityScore } from "./score";

let cv: Awaited<ReturnType<typeof getCV>>;

beforeAll(async () => {
  cv = await getCV();       // ← 1回だけ呼ぶ
});

const createShapeImageData = (
  shape: "square" | "rectangle",
  width: number,
  height: number,
): ImageData => {
  // 8UC1で作ってゼロ埋め
  const mat = new cv.Mat(height, width, cv.CV_8UC1);
  mat.data.fill(0);
  const white = new cv.Scalar(255);

  switch (shape) {
    case "square":
      cv.rectangle(mat, new cv.Point(25, 25), new cv.Point(75, 75), white, -1);
      break;
    case "rectangle":
      cv.rectangle(mat, new cv.Point(20, 40), new cv.Point(80, 60), white, -1);
      break;
  }

  // GRAY -> RGBA（モック環境ではコピー挙動でもOK）
  const rgbaMat = new cv.Mat();
  cv.cvtColor(mat, rgbaMat, cv.COLOR_GRAY2RGBA);

  const imageData = new ImageData(
    new Uint8ClampedArray(rgbaMat.data),
    width,
    height,
  );

  mat.delete();
  rgbaMat.delete();

  return imageData;
};

describe("Similarity Ranking", () => {
  it("should rank shapes correctly based on similarity", async () => {
    const width = 100;
    const height = 100;

    const targetImage = createShapeImageData("square", width, height);

    const candidates = {
      perfectMatch: createShapeImageData("square", width, height),
      similar: createShapeImageData("rectangle", width, height),
    };

    const scores = {
      perfectMatch: await calculateSimilarityScore(
        targetImage,
        candidates.perfectMatch,
        targetImage,
      ),
      similar: await calculateSimilarityScore(
        targetImage,
        candidates.similar,
        targetImage,
      ),
    };

    expect(scores.perfectMatch).toBeGreaterThan(0.99);
    expect(scores.perfectMatch).toBeGreaterThan(scores.similar);
  });
});
