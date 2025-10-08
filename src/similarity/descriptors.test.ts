// src/similarity/descriptors.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import cvPromise from "@/lib/cv";
import { calculateHuMoments, calculateEFD } from "./descriptors";

let cv: typeof import("@techstark/opencv-js");

describe("Shape Descriptors", () => {
  beforeAll(async () => {
    cv = await cvPromise;
    await (cv as any).onRuntimeInitialized;
  });

  it("should calculate Hu Moments for a given contour", () => {
    // 正方形の簡易輪郭を作成
    const contour = new cv.Mat(4, 1, cv.CV_32SC2);
    contour.data32S.set([0, 0, 0, 100, 100, 100, 100, 0]);

    const huMoments = calculateHuMoments(cv, contour);

    expect(huMoments).toBeDefined();
    expect(huMoments.length).toBe(7); // Hu Momentsは常に7要素

    contour.delete();
  });

  it("should calculate Elliptic Fourier Descriptors for a given contour", () => {
    // 正方形の簡易輪郭を作成
    const contour = new cv.Mat(4, 1, cv.CV_32SC2);
    contour.data32S.set([0, 0, 0, 100, 100, 100, 100, 0]);

    const numHarmonics = 10;
    const efd = calculateEFD(cv, contour, numHarmonics);

    expect(efd).toBeDefined();
    expect(efd.length).toBe(numHarmonics * 4); // 調和数×4係数

    contour.delete();
  });
});
