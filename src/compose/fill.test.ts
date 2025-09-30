import { describe, it, expect, beforeAll } from "vitest";
import cvPromise from "@techstark/opencv-js";
import { expandAndBlurBackground } from "./fill";

let cv: typeof import("@techstark/opencv-js");

describe("Background Expansion and Blurring", () => {
  beforeAll(async () => {
    cv = await cvPromise;
    await cv.onRuntimeInitialized;
  });

  it("should expand and blur the background image", () => {
    const width = 50;
    const height = 50;

    // Create a dummy background image (e.g., a solid color)
    const bgImageData = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height * 3; i += 3) {
      bgImageData[i] = 100; // Red
      bgImageData[i + 1] = 150; // Green
      bgImageData[i + 2] = 200; // Blue
    }
    const originalBg = new cv.Mat(height, width, cv.CV_8UC3);
    originalBg.data.set(bgImageData);

    const expandedBg = expandAndBlurBackground(cv, originalBg, 1.2, 15); // Expand by 20%, blur with 15px kernel

    // Expect the expanded background to be larger
    expect(expandedBg.cols).toBeGreaterThan(width);
    expect(expandedBg.rows).toBeGreaterThan(height);

    // Expect some blurring to have occurred (e.g., pixel values near edges should be different from original)
    // This is a very basic check and might need refinement for more robust testing
    const originalCenterPixel =
      originalBg.data[((height / 2) * width + width / 2) * 3];
    const expandedCenterPixel =
      expandedBg.data[
        ((expandedBg.rows / 2) * expandedBg.cols + expandedBg.cols / 2) * 3
      ];
    // For a solid color, the center should remain the same after blurring, but edges will change.
    // A more complex test would involve checking gradients or specific blurred patterns.
    expect(expandedCenterPixel).toBe(originalCenterPixel); // Center should remain same for solid color

    originalBg.delete();
    expandedBg.delete();
  });
});
