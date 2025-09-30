import { describe, it, expect, beforeAll } from "vitest";
import cv from "@techstark/opencv-js";
import { generateLayers } from "./parallax";

let cvInstance: typeof cv;

describe("Layer Generation", () => {
  beforeAll(async () => {
    await cv.onRuntimeInitialized;
    cvInstance = cv;
  });

  it("should generate foreground and background layers with correct transparency", () => {
    const width = 10;
    const height = 10;

    // Dummy original image (RGBA)
    const originalImageData = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height * 4; i += 4) {
      originalImageData[i] = 255; // Red
      originalImageData[i + 1] = 0;
      originalImageData[i + 2] = 0;
      originalImageData[i + 3] = 255; // Opaque
    }
    const originalImage = cvInstance.matFromImageData({
      width: width,
      height: height,
      data: originalImageData,
    });

    // Dummy alpha mask (grayscale, 0-255)
    const alphaMaskData = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        alphaMaskData[y * width + x] = x < width / 2 ? 0 : 255; // Left half transparent, right half opaque
      }
    }
    const alphaMask = new cvInstance.Mat(height, width, cvInstance.CV_8UC1);
    alphaMask.data.set(alphaMaskData);

    // Dummy background image (RGB)
    const bgImageData = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height * 3; i += 3) {
      bgImageData[i] = 0;
      bgImageData[i + 1] = 255; // Green
      bgImageData[i + 2] = 0;
    }
    const backgroundImage = cvInstance.matFromImageData({
      width: width,
      height: height,
      data: bgImageData,
    });

    const { foreground, background } = generateLayers(
      cvInstance,
      originalImage,
      alphaMask,
      backgroundImage,
    );

    expect(foreground).toBeDefined();
    expect(background).toBeDefined();
    expect(foreground.channels()).toBe(4); // FG should be RGBA
    expect(background.channels()).toBe(3); // BG should be RGB

    // Verify transparency in foreground
    // Left half of FG should be transparent (alpha = 0)
    expect(foreground.data[3]).toBe(0);
    // Right half of FG should be opaque (alpha = 255)
    expect(foreground.data[width * 4 + 3]).toBe(255);

    originalImage.delete();
    alphaMask.delete();
    backgroundImage.delete();
    foreground.delete();
    background.delete();
  });
});
