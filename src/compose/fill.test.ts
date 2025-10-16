// src/compose/fill.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { expandAndBlurBackground } from "./fill";
import cvPromise from "@/lib/cv";

let cv: any;

describe("Background Expansion and Blurring", () => {
  beforeAll(async () => {
    cv = await cvPromise;
  });

  it("should expand and blur the background image", () => {
    const width = 50;
    const height = 50;

    const bgImageData = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height * 3; i += 3) {
      bgImageData[i] = 100;
      bgImageData[i + 1] = 150;
      bgImageData[i + 2] = 200;
    }
    const originalBg = new cv.Mat(height, width, cv.CV_8UC3);
    originalBg.data.set(bgImageData);

    const blurredBg = expandAndBlurBackground(cv, originalBg, 1.2, 15);

    expect(blurredBg.cols).toBeGreaterThan(width);
    expect(blurredBg.rows).toBeGreaterThan(height);

    originalBg.delete();
    blurredBg.delete();
  });
});
