import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to define mocks that are used inside vi.mock factories
const {
  mockEncodeWithWebCodecs,
  mockEncodeWithMediaRecorder,
  mockEncodeWithFFmpeg,
} = vi.hoisted(() => {
  return {
    mockEncodeWithWebCodecs: vi.fn(),
    mockEncodeWithMediaRecorder: vi.fn(),
    mockEncodeWithFFmpeg: vi.fn(),
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
