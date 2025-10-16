import { act, renderHook } from "@testing-library/react";
import { useStore } from "./store";
import { runSegmentation } from "../processing";
import * as cameraModule from "../camera";

// Mock the processing module
vi.mock("../processing", () => ({
  runSegmentation: vi.fn(() => Promise.resolve({ mask: new ImageData(1, 1), inputSize: { h: 1, w: 1 }, outputName: 'output' })),
}));

// Mock the camera module
vi.mock("../camera", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const mockMediaStreamTrack = { stop: vi.fn() };
  const mockMediaStream = { getTracks: () => [mockMediaStreamTrack], getVideoTracks: () => [mockMediaStreamTrack] };
  return {
    ...actual,
    getMediaStream: vi.fn(() => Promise.resolve(mockMediaStream)),
    // Mock processImage to return a valid ImageBitmap
    processImage: vi.fn((img: ImageBitmap) => Promise.resolve(img)),
  };
});

const mockedRunSegmentation = runSegmentation as vi.Mock;

describe("useStore", () => {
  const mockImage = { width: 100, height: 100, close: vi.fn() } as unknown as ImageBitmap;

  beforeEach(() => {
    act(() => { useStore.getState().reset(); });
    mockedRunSegmentation.mockClear();
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
    });

    it("should set success status on the first attempt", async () => {
      const { result } = renderHook(() => useStore());
      mockedRunSegmentation.mockResolvedValue({ mask: new ImageData(1, 1), inputSize: { h: 1, w: 1 }, outputName: 'output' });

      await act(async () => {
        result.current.setUnsplashApiKey("test-key");
        await result.current.startProcessFlow(mockImage);
      });

      expect(result.current.status).toBe("success");
      expect(mockedRunSegmentation).toHaveBeenCalledTimes(1);
      expect(result.current.retryCount).toBe(1);
    });

    it("should handle the full retry cycle and finally fail", async () => {
      const { result } = renderHook(() => useStore());
      mockedRunSegmentation.mockRejectedValue(new Error("Simulated failure"));

      await act(async () => {
        result.current.setUnsplashApiKey("test-key");
        // No await here, as the process is expected to run in the background with timers
        result.current.startProcessFlow(mockImage);
      });

      // Wait for all retries to complete
      await act(async () => { await vi.runAllTimersAsync(); });

      expect(mockedRunSegmentation).toHaveBeenCalledTimes(3);
      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("Simulated failure");
    });

    it("should succeed on the second attempt", async () => {
      const { result } = renderHook(() => useStore());
      mockedRunSegmentation
        .mockRejectedValueOnce(new Error("Failure 1"))
        .mockResolvedValueOnce({ mask: new ImageData(1, 1), inputSize: { h: 1, w: 1 }, outputName: 'output' });

      await act(async () => {
        result.current.setUnsplashApiKey("test-key");
        result.current.startProcessFlow(mockImage);
      });

      // Wait for the retry to be scheduled and executed
      await act(async () => { await vi.runAllTimersAsync(); });

      expect(mockedRunSegmentation).toHaveBeenCalledTimes(2);
      expect(result.current.status).toBe("success");
    });
  });

  describe("reset", () => {
    it("should reset the state to idle", async () => {
      const { result } = renderHook(() => useStore());
      act(() => {
        useStore.setState({ status: 'error', error: 'An error' });
      });

      await act(async () => result.current.reset());

      expect(result.current.status).toBe("idle");
      expect(result.current.error).toBeNull();
      expect(result.current.retryCount).toBe(0);
    });
  });
});