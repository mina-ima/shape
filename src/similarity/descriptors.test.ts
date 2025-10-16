// src/similarity/descriptors.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { calculateHuMoments, calculateEFD } from "./descriptors";
import cvPromise from "@/lib/cv";

let cv: any;

beforeAll(async () => {
  cv = await cvPromise;
});

describe("Shape Descriptors", () => {
  it("should calculate Hu Moments for a given contour", () => {
    const contour = new cv.Mat(4, 1, cv.CV_32SC2);
    contour.data32S.set([0, 0, 0, 100, 100, 100, 100, 0]);

    const huMoments = calculateHuMoments(cv, contour);

    expect(huMoments).toBeDefined();
    expect(huMoments.length).toBe(7);
    expect(huMoments[0]).toBeCloseTo(0.1);

    contour.delete();
  });

  it("should calculate Elliptic Fourier Descriptors for a given contour", () => {
    const contour = new cv.Mat(4, 1, cv.CV_32SC2);
    contour.data32S.set([0, 0, 0, 100, 100, 100, 100, 0]);

    const numHarmonics = 10;
    const efd = calculateEFD(cv, contour, numHarmonics);

    expect(efd).toBeDefined();
    expect(efd.length).toBe(numHarmonics * 4);

    contour.delete();
  });
});