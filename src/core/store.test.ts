import { act, renderHook } from "@testing-library/react";
import { useStore, AppState } from "./store"; // AppState をインポート
import { runSegmentation } from "../processing";
import * as cameraModule from "../camera";
import { encodeVideo } from "../encode/encoder";

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

// Mock image utility functions
vi.mock("../lib/image", () => ({
  imageBitmapToUint8Array: vi.fn(() => Promise.resolve(new Uint8Array([0, 0, 0, 255]))),
  createSolidColorImageBitmap: vi.fn(() => Promise.resolve({ width: 1, height: 1, close: vi.fn() })),
}));

// Mock parallax functions
vi.mock("../compose/parallax", () => ({
  generateLayers: vi.fn(() => Promise.resolve({ foreground: {}, background: {} })),
  generateParallaxFrames: vi.fn(() => Promise.resolve([])),
}));

const mockedRunSegmentation = runSegmentation as vi.Mock;

const mockedEncodeVideo = encodeVideo as vi.Mock;



// useStore のモック状態

let mockAppState: AppState; // let で宣言し、beforeEach で初期化



// useStore のモック

vi.mock("./store", () => ({

  useStore: vi.fn((selector?: (state: AppState) => any) => {

    if (selector) {

      return selector(mockAppState);

    }

    return mockAppState;

  }),

  MAX_RETRIES: 3,

}));



describe("useStore", () => {

  const mockImage = {

    width: 100,

    height: 100,

    close: vi.fn(),

  } as unknown as ImageBitmap;



  beforeEach(() => {

    // mockAppState を初期化

    mockAppState = {

      status: "idle",

      error: null,

      retryCount: 0,

      processingResolution: 720,

      unsplashApiKey: "mock-api-key",

      generatedVideoBlob: null,

      generatedVideoMimeType: null,

      setUnsplashApiKey: vi.fn(),

      setProcessingResolution: vi.fn(),

      reset: vi.fn(),

      startProcessFlow: vi.fn(),

      _setError: vi.fn(),

    };



    // useStore.getState と useStore.setState のモックを定義

    (useStore as any).getState = () => mockAppState;

    (useStore as any).setState = (updater: Partial<AppState> | ((state: AppState) => AppState)) => {

      if (typeof updater === 'function') {

        Object.assign(mockAppState, updater(mockAppState));

      } else {

        Object.assign(mockAppState, updater);

      }

    };



    // アクションもモックをクリア

    mockAppState.setUnsplashApiKey.mockClear();

    mockAppState.setProcessingResolution.mockClear();

    mockAppState.reset.mockClear();

    mockAppState.startProcessFlow.mockClear();

    mockAppState._setError.mockClear();



    mockedRunSegmentation.mockClear();

    mockedEncodeVideo.mockClear();

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
        mockAppState.setUnsplashApiKey(""); // 直接モックのアクションを呼び出す
        await useStore.getState().startProcessFlow(mockImage); // useStore.getState() を使用
      });
      expect(useStore.getState().status).toBe("error");
      expect(useStore.getState().error).toContain("Unsplash API Key is missing");
      expect(mockedEncodeVideo).not.toHaveBeenCalled();
    });

    it("should set success status on the first attempt", async () => {
      const { result } = renderHook(() => useStore());
      mockedRunSegmentation.mockResolvedValue({
        mask: new ImageData(1, 1),
        inputSize: { h: 1, w: 1 },
        outputName: "output",
      });

      await act(async () => {
        mockAppState.setUnsplashApiKey("test-key");
        await useStore.getState().startProcessFlow(mockImage); // useStore.getState() を使用
      });

      expect(useStore.getState().status).toBe("success");
      expect(mockedRunSegmentation).toHaveBeenCalledTimes(1);
      expect(useStore.getState().retryCount).toBe(1);
      expect(mockedEncodeVideo).toHaveBeenCalledTimes(1);
      expect(useStore.getState().generatedVideoBlob).toBeInstanceOf(Blob);
      expect(useStore.getState().generatedVideoMimeType).toBe("video/webm");
    });

    it("should handle the full retry cycle and finally fail", async () => {
      const { result } = renderHook(() => useStore());
      mockedRunSegmentation.mockRejectedValue(new Error("Simulated failure"));

      await act(async () => {
        mockAppState.setUnsplashApiKey("test-key");
        useStore.getState().startProcessFlow(mockImage); // useStore.getState() を使用
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockedRunSegmentation).toHaveBeenCalledTimes(3);
      expect(useStore.getState().status).toBe("error");
      expect(useStore.getState().error).toContain("Simulated failure");
      expect(mockedEncodeVideo).not.toHaveBeenCalled();
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
        mockAppState.setUnsplashApiKey("test-key");
        useStore.getState().startProcessFlow(mockImage); // useStore.getState() を使用
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(useStore.getState().status).toBe("success");
      expect(mockedRunSegmentation).toHaveBeenCalledTimes(2);
      expect(useStore.getState().retryCount).toBe(1);
      expect(mockedEncodeVideo).toHaveBeenCalledTimes(1);
      expect(useStore.getState().generatedVideoBlob).toBeInstanceOf(Blob);
      expect(useStore.getState().generatedVideoMimeType).toBe("video/webm");
    });
  });

  describe("reset", () => {
    it("should reset the state to idle", async () => {
      const { result } = renderHook(() => useStore());
      act(() => {
        useStore.setState({
          status: "error",
          error: "An error",
          generatedVideoBlob: new Blob(),
          generatedVideoMimeType: "video/webm",
        });
      });

      await act(async () => useStore.getState().reset()); // useStore.getState() を使用

      expect(useStore.getState().status).toBe("idle");
      expect(useStore.getState().error).toBeNull();
      expect(useStore.getState().retryCount).toBe(0);
      expect(useStore.getState().generatedVideoBlob).toBeNull();
      expect(useStore.getState().generatedVideoMimeType).toBeNull();
    });
  });
});
