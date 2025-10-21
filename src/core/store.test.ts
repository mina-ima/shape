import { act, renderHook } from "@testing-library/react";
import { useStore } from "./store";
import { runSegmentation } from "../processing";
import * as cameraModule from "../camera";
import { encodeVideo } from "../encode/encoder"; // encodeVideo をインポート

// Mock the processing module
vi.mock("../processing", () => ({
  runSegmentation: vi.fn(() =>
    Promise.resolve({
      mask: new ImageData(1, 1),
      inputSize: { h: 1, w: 1 },
      outputName: "output",
    }),
  ),
}));

// Mock the camera module
vi.mock("../camera", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const mockMediaStreamTrack = { stop: vi.fn() };
  const mockMediaStream = {
    getTracks: () => [mockMediaStreamTrack],
    getVideoTracks: () => [mockMediaStreamTrack],
  };
  return {
    ...actual,
    getMediaStream: vi.fn(() => Promise.resolve(mockMediaStream)),
    // Mock processImage to return a valid ImageBitmap
    processImage: vi.fn((img: ImageBitmap) => Promise.resolve(img)),
  };
});

// Mock the encoder module
vi.mock("../encode/encoder", () => ({
  encodeVideo: vi.fn(() => Promise.resolve(new Blob(["mock video"], { type: "video/webm" }))),
}));

const mockedRunSegmentation = runSegmentation as vi.Mock;
const mockedEncodeVideo = encodeVideo as vi.Mock; // encodeVideo のモックを取得

describe("useStore", () => {
  const mockImage = {
    width: 100,
    height: 100,
    close: vi.fn(),
  } as unknown as ImageBitmap;

  beforeEach(() => {
    act(() => {
      useStore.getState().reset();
      // generatedVideoBlob もリセット
      useStore.setState({ generatedVideoBlob: null });
    });
    mockedRunSegmentation.mockClear();
    mockedEncodeVideo.mockClear(); // encodeVideo のモックをクリア
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("startProcessFlow", () => {
    it("should set error status if Unsplash API key is missing", async () => {
      const { result } = renderHook(() => useStore());
      await act(async () => {
        result.current.setUnsplashApiKey("");
        await result.current.startProcessFlow(mockImage);
      });
      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("Unsplash API Key is missing");
      expect(mockedEncodeVideo).not.toHaveBeenCalled(); // encodeVideo が呼ばれないことを確認
    });

    it("should set success status on the first attempt", async () => {
      const { result } = renderHook(() => useStore());
      mockedRunSegmentation.mockResolvedValue({
        mask: new ImageData(1, 1),
        inputSize: { h: 1, w: 1 },
        outputName: "output",
      });

      await act(async () => {
        result.current.setUnsplashApiKey("test-key");
        await result.current.startProcessFlow(mockImage);
      });

      expect(result.current.status).toBe("success");
      expect(mockedRunSegmentation).toHaveBeenCalledTimes(1);
      expect(result.current.retryCount).toBe(1);
      expect(mockedEncodeVideo).toHaveBeenCalledTimes(1); // encodeVideo が呼ばれたことを確認
      expect(result.current.generatedVideoBlob).toBeInstanceOf(Blob); // generatedVideoBlob が設定されたことを確認
    });

    it("should handle the full retry cycle and finally fail", async () => {
      const { result } = renderHook(() => useStore());
      mockedRunSegmentation.mockRejectedValue(new Error("Simulated failure"));

      await act(async () => {
        result.current.setUnsplashApiKey("test-key");
        result.current.startProcessFlow(mockImage);
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockedRunSegmentation).toHaveBeenCalledTimes(3);
      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("Simulated failure");
      expect(mockedEncodeVideo).not.toHaveBeenCalled(); // 失敗時は呼ばれないことを確認
    });

    it("should succeed on the second attempt", async () => {
      const { result } = renderHook(() => useStore());
      mockedRunSegmentation
        .mockRejectedValueOnce(new Error("Failure 1"))
        .mockResolvedValueOnce({
          mask: new ImageData(1, 1),
          inputSize: { h: 1, w: 1 },
          outputName: "output",
        });

      await act(async () => {
        result.current.setUnsplashApiKey("test-key");
        result.current.startProcessFlow(mockImage);
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockedRunSegmentation).toHaveBeenCalledTimes(2);
      expect(result.current.status).toBe("success");
      expect(mockedEncodeVideo).toHaveBeenCalledTimes(1); // 成功時は呼ばれることを確認
      expect(result.current.generatedVideoBlob).toBeInstanceOf(Blob); // generatedVideoBlob が設定されたことを確認
    });
  });

  describe("reset", () => {
    it("should reset the state to idle", async () => {
      const { result } = renderHook(() => useStore());
      act(() => {
        useStore.setState({
          status: "error",
          error: "An error",
          generatedVideoBlob: new Blob(), // ダミーのBlobを設定
        });
      });

      await act(async () => result.current.reset());

      expect(result.current.status).toBe("idle");
      expect(result.current.error).toBeNull();
      expect(result.current.retryCount).toBe(0);
      expect(result.current.generatedVideoBlob).toBeNull(); // generatedVideoBlob が null にリセットされたことを確認
    });
  });
});
