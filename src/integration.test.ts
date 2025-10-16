// src/integration.test.ts
import { describe, it, expect } from "vitest";
import { generateParallaxFrames, generateLayers } from "./compose/parallax";
import { encodeVideo } from "./encode/encoder";

describe("Video Generation Integration Test", () => {
  it(
    "should process a sample image and return a valid video blob",
    async () => {
      const width = 128;
      const height = 72;

      // 1. Create dummy input data (配列)
      const originalImageRGBA = new Uint8Array(width * height * 4).fill(0);
      for (let i = 0; i < originalImageRGBA.length; i += 4) {
        originalImageRGBA[i] = 255; // R
        originalImageRGBA[i + 3] = 255; // A
      }

      // 背景は 3ch 相当のデータでも OK（cv 側で RGBA Mat に入れて利用）
      const backgroundRGB = new Uint8Array(width * height * 3).fill(0);
      for (let i = 0; i < backgroundRGB.length; i += 3) {
        backgroundRGB[i + 1] = 255; // G
      }

      const maskGray = new Uint8Array(width * height).fill(255); // 白マスク

      // 2. Generate Layers
      const { foreground, background } = await generateLayers(
        originalImageRGBA,
        width,
        height,
        maskGray,
        width,
        height,
        backgroundRGB,
        width,
        height,
      );

      // 3. Generate Frames
      const frames = await generateParallaxFrames(
        foreground,
        background,
        width,
        height,
        1, // 1 second
        30, // 30 fps
      );

      // 4. Encode Video
      const videoBlob = await encodeVideo(frames, 30);

      // 5. Assertions
      expect(videoBlob).toBeInstanceOf(Blob);
      expect(videoBlob.size).toBeGreaterThan(0);
      expect(["video/webm", "video/mp4"]).toContain(videoBlob.type);

      // Cleanup
      foreground.delete();
      background.delete();
      frames.forEach((f) => f.delete());
    },
    30_000,
  );
});
