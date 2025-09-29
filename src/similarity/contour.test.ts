import { describe, it, expect, beforeAll } from "vitest";
import cvPromise from "@techstark/opencv-js";
import { extractLargestContour } from "./contour";

let cv: typeof import("@techstark/opencv-js");

describe("Contour Extraction", () => {
  beforeAll(async () => {
    cv = await cvPromise;
    await cv.onRuntimeInitialized;
  });

  it("should extract the largest contour from an image and sample 128 points", async () => {
    // Create a simple image with a white square on a black background
    const width = 100;
    const height = 100;
    const mat = new cv.Mat(height, width, cv.CV_8UC1, new cv.Scalar(0));
    const point1 = new cv.Point(25, 25);
    const point2 = new cv.Point(75, 75);
    cv.rectangle(mat, point1, point2, new cv.Scalar(255), -1);

    // Extract the contour
    const contour = await extractLargestContour(mat);

    // Expect 128 sampled points
    expect(contour).toBeDefined();
    expect(contour.length).toBe(128);

    // Optional: Check if the points are within the image boundaries
    for (const point of contour) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(height);
    }

    mat.delete();
  });
});
