import { describe, it, expect, beforeAll } from "vitest";
import cvPromise from "@techstark/opencv-js";
import { generateParallaxFrames } from "./compose/parallax";
import { encodeVideo } from "./encode/encoder";
import { generateLayers } from "./compose/parallax";

let cv: typeof import("@techstark/opencv-js");

describe("Video Generation Integration Test", () => {
  beforeAll(async () => {
    cv = await cvPromise;
    await cv.onRuntimeInitialized;
  });

  it("should process a sample image and return a valid video blob", async () => {
    const width = 128;
    const height = 72;

    // 1. Create dummy input data
    const originalImage = new cv.Mat(height, width, cv.CV_8UC4, [255, 0, 0, 255]); // Red
    const background = new cv.Mat(height, width, cv.CV_8UC3, [0, 255, 0, 255]); // Green
    const mask = new cv.Mat(height, width, cv.CV_8UC1, [255, 255, 255, 255]); // White
    // Make a circle in the mask


    // 2. Generate Layers
    const { foreground } = await generateLayers(
      cv,
      originalImage,
      mask,
      background,
    );

    // 3. Generate Frames
    const frames = await generateParallaxFrames(
      cv,
      foreground,
      background,
      width,
      height,
      1, // 1 second duration
      30, // 30 fps
    );

    // 4. Encode Video
    const videoBlob = await encodeVideo(frames, 30);

    // 5. Assertions
    expect(videoBlob).toBeInstanceOf(Blob);
    expect(videoBlob.size).toBeGreaterThan(0);
    expect(["video/webm", "video/mp4"]).toContain(videoBlob.type);

    // Cleanup
    originalImage.delete();
    background.delete();
    mask.delete();
    foreground.delete();
    frames.forEach((f) => f.delete());
  }, 30000); // Increase timeout for this integration test
});
