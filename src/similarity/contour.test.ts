// src/similarity/contour.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import cvPromise from "@/lib/cv";
import { extractLargestContour } from "./contour";

let cv: any;

describe("Contour Extraction", () => {
  beforeAll(async () => {
    cv = await cvPromise;
  });

  it("should extract the largest contour from an image", async () => {
    const width = 100;
    const height = 100;

    const mat = new cv.Mat(height, width, cv.CV_8UC1, new cv.Scalar(0));
    const point1 = new cv.Point(25, 25);
    const point2 = new cv.Point(75, 75);
    cv.rectangle(mat, point1, point2, new cv.Scalar(255), -1);

    const contour = await extractLargestContour(cv, mat);

    expect(contour).toBeDefined();
    // The mock findContours returns a fixed 4-point contour
    expect(contour.length).toBe(4 * 2);

    mat.delete();
  });
});
