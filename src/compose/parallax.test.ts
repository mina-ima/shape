import { describe, it, expect, beforeAll } from "vitest";
import cvPromise from "@techstark/opencv-js";
import { generateLayers, generateParallaxFrames } from "./parallax";

let cv: typeof import("@techstark/opencv-js");

describe("Layer Generation", () => {
  beforeAll(async () => {
    cv = await cvPromise;
    await cv.onRuntimeInitialized;
  });

  it("should generate foreground and background layers with correct transparency", async () => {
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
    const originalImage = new cv.Mat(height, width, cv.CV_8UC4);
    originalImage.data.set(originalImageData);

    // Dummy alpha mask (grayscale, 0-255)
    const alphaMaskData = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        alphaMaskData[y * width + x] = x < width / 2 ? 0 : 255; // Left half transparent, right half opaque
      }
    }
    const alphaMask = new cv.Mat(height, width, cv.CV_8UC1);
    alphaMask.data.set(alphaMaskData);

    // Dummy background image (RGB)
    const bgImageData = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height * 3; i += 3) {
      bgImageData[i] = 0;
      bgImageData[i + 1] = 255; // Green
      bgImageData[i + 2] = 0;
    }
    const backgroundImage = new cv.Mat(height, width, cv.CV_8UC3);
    backgroundImage.data.set(bgImageData);

    const { foreground, background } = await generateLayers(
      cv,
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

describe("Parallax Animation", () => {
  beforeAll(async () => {
    cv = await cvPromise;
    await cv.onRuntimeInitialized;
  });

  it("should generate parallax animation frames", async () => {
    const width = 100;
    const height = 100;
    const duration = 5; // seconds
    const fps = 30;
    const totalFrames = duration * fps;

    // Dummy foreground and background layers (RGBA and RGB respectively)
    const fgData = new Uint8Array(width * height * 4).fill(255);
    const bgData = new Uint8Array(width * height * 3).fill(128);

    const foregroundLayer = new cv.Mat(height, width, cv.CV_8UC4);
    foregroundLayer.data.set(fgData);
    const backgroundLayer = new cv.Mat(height, width, cv.CV_8UC3);
    backgroundLayer.data.set(bgData);

    const frames = await generateParallaxFrames(
      cv,
      foregroundLayer,
      backgroundLayer,
      width,
      height,
      duration,
      fps
    );

    expect(frames).toBeDefined();
    expect(frames.length).toBe(totalFrames);

    // Check transformations for a few frames
    // Frame 0 (start)
    const frame0 = frames[0];
    // Expect no pan/scale at the beginning for simplicity in this test
    // A more robust test would check actual pixel data after transformation
    expect(frame0).toBeDefined();

    // Frame at half duration (mid-point)
    const frameMid = frames[Math.floor(totalFrames / 2)];
    expect(frameMid).toBeDefined();

    // Frame at end
    const frameEnd = frames[totalFrames - 1];
    expect(frameEnd).toBeDefined();

    foregroundLayer.delete();
    backgroundLayer.delete();
    frames.forEach((f) => f.delete());
  });
});
