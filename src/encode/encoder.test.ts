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

import { encodeVideo } from "./encoder";

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
