// src/compose/parallax.test.ts
import { describe, it, expect, beforeAll } from "vitest";

import { generateLayers, generateParallaxFrames } from "./parallax";
import { ParallaxOptions } from "@/core/types";
import cvPromise from "@/lib/cv";

let cv: typeof import("@techstark/opencv-js");

describe("Layer Generation", () => {
  beforeAll(async () => {
    cv = await cvPromise;
    await (cv as any).onRuntimeInitialized;
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

    // Dummy background image (RGBA)
    const bgImageData = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height * 4; i += 4) {
      bgImageData[i] = 0;
      bgImageData[i + 1] = 255; // Green
      bgImageData[i + 2] = 0;
      bgImageData[i + 3] = 255; // Opaque
    }
    const backgroundImageRGBA = new cv.Mat(height, width, cv.CV_8UC4);
    backgroundImageRGBA.data.set(bgImageData);

    const backgroundImage = new cv.Mat();
    cv.cvtColor(backgroundImageRGBA, backgroundImage, cv.COLOR_RGBA2RGB);
    backgroundImageRGBA.delete();

    const { foreground, background } = await generateLayers(
      cv,
      originalImageData,
      width,
      height,
      alphaMaskData,
      width,
      height,
      bgImageData,
      width,
      height,
    );

    expect(foreground).toBeDefined();
    expect(background).toBeDefined();
    expect(foreground.channels()).toBe(4); // FG should be RGBA
    expect(background.channels()).toBe(4); // BG should be RGBA in test environment

    // Verify transparency in foreground
    // Left half of FG should be transparent (alpha = 0)
    expect(foreground.ptr(0, 0)[3]).toBe(0); // y=0, x=0, alpha
    // Right half of FG should be opaque (alpha = 255)
    expect(foreground.ptr(0, width - 1)[3]).toBe(255);

    originalImage.delete();
    alphaMask.delete();
    backgroundImage.delete();
    foreground.delete();
    background.delete();
  });
});

describe("Parallax Animation", () => {
  const defaultParallaxOptions: ParallaxOptions = {
    panAmount: 0.05,
    fgScale: 1.1,
    bgScale: 1.2,
    brightness: 1.0,
  };

  beforeAll(async () => {
    cv = await cvPromise;
    await (cv as any).onRuntimeInitialized;
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
      defaultParallaxOptions,
    );

    expect(frames).toBeDefined();
    expect(frames.length).toBe(totalFrames);

    // Spot checks
    const frame0 = frames[0];
    expect(frame0).toBeDefined();

    const frameMid = frames[Math.floor(totalFrames / 2)];
    expect(frameMid).toBeDefined();

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
      defaultParallaxOptions,
    );

    expect(frames.length).toBe(totalFrames);

    // Frame 0 (start) - should be almost fully transparent
    const frame0 = frames[0];
    const frame0Alpha = frame0.ptr(0, 0)[3];
    expect(frame0Alpha).toBeLessThan(50);

    // Middle - fully opaque
    const frameMid = frames[Math.floor(totalFrames / 2)];
    const frameMidAlpha = frameMid.ptr(0, 0)[3];
    expect(frameMidAlpha).toBe(255);

    // End - almost fully transparent
    const frameEnd = frames[totalFrames - 1];
    const frameEndAlpha = frameEnd.ptr(0, 0)[3];
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
      defaultParallaxOptions,
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
      defaultParallaxOptions,
    );

    expect(frames.length).toBe(totalFrames);

    // The middle frame should be fully opaque
    const midFrameIndex = Math.floor(totalFrames / 2);
    const midFrame = frames[midFrameIndex];
    expect(midFrame.ptr(0, 0)[3]).toBe(255);

    foregroundLayer.delete();
    backgroundLayer.delete();
    frames.forEach((f) => f.delete());
  });
});
