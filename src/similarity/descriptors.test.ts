import { describe, it, expect, beforeAll } from "vitest";
import cvPromise from "@techstark/opencv-js";
import { calculateHuMoments, calculateEFD } from "./descriptors";

let cvInstance: typeof import("@techstark/opencv-js");

describe("Shape Descriptors", () => {
  beforeAll(async () => {
    cvInstance = await cvPromise;
    await cvInstance.onRuntimeInitialized;
  });

  it("should calculate Hu Moments for a given contour", () => {
    // Create a simple square contour
    const contour = new cvInstance.Mat(4, 1, cvInstance.CV_32SC2);
    contour.data32S.set([0, 0, 0, 100, 100, 100, 100, 0]);

    const huMoments = calculateHuMoments(cvInstance, contour);

    expect(huMoments).toBeDefined();
    expect(huMoments.length).toBe(7); // Hu Moments always have 7 values
    // Further assertions can be added here to check specific values for a known shape

    contour.delete();
  });

  it("should calculate Elliptic Fourier Descriptors for a given contour", () => {
    // Create a simple square contour
    const contour = new cvInstance.Mat(4, 1, cvInstance.CV_32SC2);
    contour.data32S.set([0, 0, 0, 100, 100, 100, 100, 0]);

    const numHarmonics = 10;
    const efd = calculateEFD(cvInstance, contour, numHarmonics);

    expect(efd).toBeDefined();
    expect(efd.length).toBe(numHarmonics * 4); // 4 coefficients per harmonic
    // Further assertions can be added here to check specific values for a known shape

    contour.delete();
  });
});
