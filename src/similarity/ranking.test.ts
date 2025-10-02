import { describe, it, expect, beforeAll } from "vitest";
import cvPromise from "@techstark/opencv-js";
import { calculateSimilarityScore } from "./score";

let cv: typeof import("@techstark/opencv-js");

// Helper to create ImageData for a shape
const createShapeImageData = (
  shape: "square" | "rectangle" | "circle" | "rotated-square",
  width: number,
  height: number,
): ImageData => {
  const mat = new cv.Mat(height, width, cv.CV_8UC1, new cv.Scalar(0));
  const white = new cv.Scalar(255);

  switch (shape) {
    case "square":
      cv.rectangle(mat, new cv.Point(25, 25), new cv.Point(75, 75), white, -1);
      break;
    case "rotated-square":
      const points = [
        { x: 50, y: 10 },
        { x: 90, y: 50 },
        { x: 50, y: 90 },
        { x: 10, y: 50 },
      ];
      const contour = cv.matFromArray(4, 1, cv.CV_32SC2, [
        points[0].x,
        points[0].y,
        points[1].x,
        points[1].y,
        points[2].x,
        points[2].y,
        points[3].x,
        points[3].y,
      ]);
      const contours = new cv.MatVector();
      contours.push_back(contour);
      cv.drawContours(mat, contours, 0, white, -1);
      contour.delete();
      contours.delete();
      break;
    case "rectangle":
      cv.rectangle(mat, new cv.Point(20, 40), new cv.Point(80, 60), white, -1);
      break;
    case "circle":
      cv.circle(mat, new cv.Point(50, 50), 25, white, -1);
      break;
  }

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
  beforeAll(async () => {
    cv = await cvPromise;
    await cv.onRuntimeInitialized;
  });

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

    console.log("Similarity Scores:", scores);

    // A perfect match should have a score near 1.0
    expect(scores.perfectMatch).toBeGreaterThan(0.99);

    // Check the ranking
    expect(scores.perfectMatch).toBeGreaterThan(scores.similar);
  });
});
