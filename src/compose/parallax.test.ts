// src/compose/parallax.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { generateLayers, generateParallaxFrames } from "./parallax";
import getCV from "@/lib/cv";

let cv: any;

beforeAll(async () => {
  cv = await getCV();
});

describe("Layer Generation", () => {
  it("should generate foreground and background layers with correct transparency", async () => {
    const width = 10;
    const height = 10;

    const originalImageData = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height * 4; i += 4) {
      originalImageData[i] = 255;     // R
      originalImageData[i + 1] = 0;   // G
      originalImageData[i + 2] = 0;   // B
      originalImageData[i + 3] = 255; // A
    }

    const alphaMaskData = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        alphaMaskData[y * width + x] = x < width / 2 ? 0 : 255;
      }
    }

    const bgImageData = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height * 4; i += 4) {
      bgImageData[i] = 0;
      bgImageData[i + 1] = 255; // Green
      bgImageData[i + 2] = 0;
      bgImageData[i + 3] = 255;
    }

    // parallax.ts は cv を引数に取らない実装なので渡さない
    const { foreground, background } = await generateLayers(
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
    expect(foreground.channels()).toBe(4); // RGBA
    expect(background.channels()).toBe(3); // parallax.ts で RGB に変換

    // 端のα確認
    expect(foreground.ptr(0, 0)[3]).toBe(0);
    expect(foreground.ptr(0, width - 1)[3]).toBe(255);

    foreground.delete();
    background.delete();
  });
});

describe("Parallax Animation", () => {
  it("should generate parallax animation frames", async () => {
    const width = 100;
    const height = 100;
    const duration = 1;
    const fps = 30;
    const totalFrames = duration * fps;

    const fgData = new Uint8Array(width * height * 4).fill(255);
    const bgData = new Uint8Array(width * height * 3).fill(128);

    const foregroundLayer = new cv.Mat(height, width, cv.CV_8UC4);
    foregroundLayer.data.set(fgData);
    const backgroundLayer = new cv.Mat(height, width, cv.CV_8UC3);
    backgroundLayer.data.set(bgData);

    // parallax.ts の API に合わせて options は渡さない
    const frames = await generateParallaxFrames(
      foregroundLayer,
      backgroundLayer,
      width,
      height,
      duration,
      fps,
      0,
    );

    expect(frames).toBeDefined();
    expect(frames.length).toBe(totalFrames);

    foregroundLayer.delete();
    backgroundLayer.delete();
    frames.forEach((f) => f.delete());
  });
});
