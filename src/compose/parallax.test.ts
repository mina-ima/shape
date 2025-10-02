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
    expect(foreground.data[3]).toBe(0); // y=0, x=0, alpha
    // Right half of FG should be opaque (alpha = 255)
    // Check a pixel on the right half (e.g., x=width-1, y=0) which should be opaque
    const rightPixelIndex = (width - 1) * 4 + 3;
    expect(foreground.data[rightPixelIndex]).toBe(255);

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
      fps,
      0, // crossfadeDuration
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

  it("should apply crossfade to the start and end of the animation", async () => {
    const width = 100;
    const height = 100;
    const duration = 5; // seconds
    const fps = 30;
    const totalFrames = duration * fps;
    const crossfadeDuration = 1; // second

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
      fps,
      crossfadeDuration,
    );

    expect(frames.length).toBe(totalFrames);

    // Frame 0 (start) - should be almost fully transparent
    const frame0 = frames[0];
    const frame0Alpha = frame0.data[3]; // Alpha of the first pixel
    expect(frame0Alpha).toBeLessThan(50);

    // Frame in the middle - should be fully opaque
    const frameMid = frames[Math.floor(totalFrames / 2)];
    const frameMidAlpha = frameMid.data[3];
    expect(frameMidAlpha).toBe(255);

    // Last frame - should be almost fully transparent
    const frameEnd = frames[totalFrames - 1];
    const frameEndAlpha = frameEnd.data[3];
    expect(frameEndAlpha).toBeLessThan(50);

    foregroundLayer.delete();
    backgroundLayer.delete();
    frames.forEach((f) => f.delete());
  });

  it("should return an empty array when duration is 0", async () => {
    const width = 100;
    const height = 100;
    const duration = 0; // 0 seconds
    const fps = 30;

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
      fps,
      0,
    );

    expect(frames).toBeInstanceOf(Array);
    expect(frames.length).toBe(0);

    foregroundLayer.delete();
    backgroundLayer.delete();
  });

  it("should handle crossfade duration equal to total duration", async () => {
    const width = 100;
    const height = 100;
    const duration = 4; // seconds
    const fps = 10;
    const totalFrames = duration * fps; // 40
    const crossfadeDuration = 4; // seconds, equal to total duration

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
      fps,
      crossfadeDuration,
    );

    expect(frames.length).toBe(totalFrames);

    // The middle frame should be fully opaque
    const midFrameIndex = Math.floor(totalFrames / 2);
    const midFrame = frames[midFrameIndex];
    const midFrameAlpha = midFrame.data[3]; // Alpha of the first pixel

    // The alpha of the merged frame is tested. The underlying layers are opaque.
    expect(midFrameAlpha).toBe(255);

    foregroundLayer.delete();
    backgroundLayer.delete();
    frames.forEach((f) => f.delete());
  });
});
