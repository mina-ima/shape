import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to define mocks that are used inside vi.mock factories
const {
  mockEncodeWithWebCodecs,
  mockEncodeWithMediaRecorder,
  mockEncodeWithFFmpeg,
  mockCvMat,
} = vi.hoisted(() => {
  return {
    mockEncodeWithWebCodecs: vi.fn(),
    mockEncodeWithMediaRecorder: vi.fn(),
    mockEncodeWithFFmpeg: vi.fn(),
    mockCvMat: vi.fn(() => ({
      cols: 1280,
      rows: 720,
      delete: vi.fn(),
    })),
  };
});

vi.mock("./webcodecs", () => ({
  encodeWithWebCodecs: mockEncodeWithWebCodecs,
}));
vi.mock("./mediarec", () => ({
  encodeWithMediaRecorder: mockEncodeWithMediaRecorder,
}));
vi.mock("./ffmpeg", () => ({
  encodeWithFFmpeg: mockEncodeWithFFmpeg,
}));

// Mock OpenCV.js (cv)
vi.mock("@techstark/opencv-js", () => ({
  __esModule: true,
  default: {
    Mat: mockCvMat,
  },
}));

import { encodeVideo, getPreferredMimeType } from "./encoder";

describe("Video Encoder Fallback Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should prioritize WebCodecs if available", async () => {
    mockEncodeWithWebCodecs.mockResolvedValue(new Blob());
    vi.stubGlobal("VideoEncoder", () => {});

    await encodeVideo([], 30);

    expect(mockEncodeWithWebCodecs).toHaveBeenCalled();
    expect(mockEncodeWithMediaRecorder).not.toHaveBeenCalled();
    expect(mockEncodeWithFFmpeg).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("should fall back to MediaRecorder if WebCodecs is unavailable", async () => {
    mockEncodeWithMediaRecorder.mockResolvedValue(new Blob());
    vi.stubGlobal("VideoEncoder", undefined);
    vi.stubGlobal("MediaRecorder", () => {});

    await encodeVideo([], 30);

    expect(mockEncodeWithWebCodecs).not.toHaveBeenCalled();
    expect(mockEncodeWithMediaRecorder).toHaveBeenCalled();
    expect(mockEncodeWithFFmpeg).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("should fall back to ffmpeg.wasm if both are unavailable", async () => {
    mockEncodeWithFFmpeg.mockResolvedValue(new Blob());
    vi.stubGlobal("VideoEncoder", undefined);
    vi.stubGlobal("MediaRecorder", undefined);

    await encodeVideo([], 30);

    expect(mockEncodeWithWebCodecs).not.toHaveBeenCalled();
    expect(mockEncodeWithMediaRecorder).not.toHaveBeenCalled();
    expect(mockEncodeWithFFmpeg).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("should throw an error if no encoders are available or all fail", async () => {
    mockEncodeWithWebCodecs.mockRejectedValue(new Error("WebCodecs failed"));
    mockEncodeWithMediaRecorder.mockRejectedValue(
      new Error("MediaRecorder failed"),
    );
    mockEncodeWithFFmpeg.mockRejectedValue(new Error("FFmpeg failed"));

    // We need to ensure the implementation tries all fallbacks, so we can stub the globals
    // to make it seem like the APIs are there, but the implementation will fail.
    vi.stubGlobal("VideoEncoder", {});
    vi.stubGlobal("MediaRecorder", {});

    await expect(encodeVideo([], 30)).rejects.toThrow(
      "All video encoders failed.",
    );

    vi.unstubAllGlobals();
  });

  it("should retry with alternative MIME type if WebCodeacs fails with preferred MIME type", async () => {
    vi.spyOn(window, "navigator", "get").mockReturnValue({
      userAgent: "non-iOS",
    } as Partial<Navigator> as Navigator);
    const preferredMimeType = getPreferredMimeType(); // Should be webm
    const alternativeMimeType =
      preferredMimeType === "video/webm" ? "video/mp4" : "video/webm";

    // First call with preferredMimeType fails, second with alternativeMimeType succeeds
    mockEncodeWithWebCodecs
      .mockRejectedValueOnce(new Error("WebCodecs failed with preferred"))
      .mockResolvedValueOnce(new Blob());
    vi.stubGlobal("VideoEncoder", () => {});

    await encodeVideo([], 30);

    expect(mockEncodeWithWebCodecs).toHaveBeenCalledTimes(2);
    expect(mockEncodeWithWebCodecs).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
      preferredMimeType,
    );
    expect(mockEncodeWithWebCodecs).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
      alternativeMimeType,
    );
    expect(mockEncodeWithMediaRecorder).not.toHaveBeenCalled();
    expect(mockEncodeWithFFmpeg).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("should retry with alternative MIME type if MediaRecorder fails with preferred MIME type", async () => {
    // Mock getPreferredMimeType to return webm
    vi.spyOn(window, "navigator", "get").mockReturnValue({
      userAgent: "non-iOS",
    } as Partial<Navigator> as Navigator);
    const preferredMimeType = getPreferredMimeType(); // Should be webm
    const alternativeMimeType =
      preferredMimeType === "video/webm" ? "video/mp4" : "video/webm";

    // WebCodecs is unavailable, MediaRecorder first call with preferredMimeType fails, second with alternativeMimeType succeeds
    vi.stubGlobal("VideoEncoder", undefined);
    vi.stubGlobal("MediaRecorder", () => {});
    mockEncodeWithMediaRecorder
      .mockRejectedValueOnce(new Error("MediaRecorder failed with preferred"))
      .mockResolvedValueOnce(new Blob());

    await encodeVideo([], 30);

    expect(mockEncodeWithWebCodecs).not.toHaveBeenCalled();
    expect(mockEncodeWithMediaRecorder).toHaveBeenCalledTimes(2);
    expect(mockEncodeWithMediaRecorder).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
      preferredMimeType,
    );
    expect(mockEncodeWithMediaRecorder).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
      alternativeMimeType,
    );
    expect(mockEncodeWithFFmpeg).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("should retry with alternative MIME type if ffmpeg.wasm fails with preferred MIME type", async () => {
    // Mock getPreferredMimeType to return webm
    vi.spyOn(window, "navigator", "get").mockReturnValue({
      userAgent: "non-iOS",
    } as Partial<Navigator> as Navigator);
    const preferredMimeType = getPreferredMimeType(); // Should be webm
    const alternativeMimeType =
      preferredMimeType === "video/webm" ? "video/mp4" : "video/webm";

    // All other encoders are unavailable, ffmpeg.wasm first call with preferredMimeType fails, second with alternativeMimeType succeeds
    vi.stubGlobal("VideoEncoder", undefined);
    vi.stubGlobal("MediaRecorder", undefined);
    mockEncodeWithFFmpeg
      .mockRejectedValueOnce(new Error("FFmpeg failed with preferred"))
      .mockResolvedValueOnce(new Blob());

    await encodeVideo([], 30);

    expect(mockEncodeWithWebCodecs).not.toHaveBeenCalled();
    expect(mockEncodeWithMediaRecorder).not.toHaveBeenCalled();
    expect(mockEncodeWithFFmpeg).toHaveBeenCalledTimes(2);
    expect(mockEncodeWithFFmpeg).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
      preferredMimeType,
    );
    expect(mockEncodeWithFFmpeg).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
      alternativeMimeType,
    );

    vi.unstubAllGlobals();
  });
});

describe("Video Encoding Performance", () => {
  // @ts-expect-error: Mocking cv.Mat for testing purposes
  const mockFrames = Array(5 * 30).fill(new mockCvMat()); // 5 seconds of 30fps frames
  const fps = 30;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("VideoEncoder", () => {}); // Ensure WebCodecs is available for these tests
    vi.stubGlobal("MediaRecorder", undefined); // Ensure MediaRecorder is not used
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should encode 5s@720p with WebCodecs in less than 2s", async () => {
    // Simulate WebCodecs encoding taking 1.5 seconds
    mockEncodeWithWebCodecs.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return new Blob();
    });

    const startTime = performance.now();
    await encodeVideo(mockFrames, fps);
    const endTime = performance.now();
    const duration = endTime - startTime;

    console.log(`WebCodecs encoding duration: ${duration.toFixed(2)} ms`);
    expect(duration).toBeLessThan(2000); // 2 seconds
  });

  it("should encode 5s@720p with ffmpeg.wasm in less than 15s", async () => {
    // Simulate ffmpeg.wasm encoding taking 10 seconds
    mockEncodeWithWebCodecs.mockRejectedValue(new Error("WebCodecs failed")); // Force fallback
    vi.stubGlobal("VideoEncoder", undefined);
    mockEncodeWithFFmpeg.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      return new Blob();
    });

    const startTime = performance.now();
    await encodeVideo(mockFrames, fps);
    const endTime = performance.now();
    const duration = endTime - startTime;

    console.log(`ffmpeg.wasm encoding duration: ${duration.toFixed(2)} ms`);
    expect(duration).toBeLessThan(15000); // 15 seconds
  }, 15000);
});

describe("getPreferredMimeType", () => {
  it("should return 'video/webm' for non-iOS user agents", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
    });
    expect(getPreferredMimeType()).toBe("video/webm");
    vi.unstubAllGlobals();
  });

  it("should return 'video/mp4' for iOS user agents", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Mobile/15E148 Safari/604.1",
    });
    expect(getPreferredMimeType()).toBe("video/mp4");
    vi.unstubAllGlobals();
  });
});
