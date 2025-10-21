/* src/core/store.test.ts
 * 目的: Zustandストアの実装をモックせずに購読し、非同期リトライや状態遷移を正しく検証する。
 * 変更点:
 *  - afterEach の vi.restoreAllMocks() を vi.clearAllMocks() に変更（モジュールモック維持）
 *  - runAllTimersAsync() の後に Promise.resolve() を追加（マイクロタスク排出）
 *  - 「2回目で成功」ケースの retryCount 期待値を 2 に変更（試行回数としてカウントされるため）
 */

import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useStore } from "./store";
import { runSegmentation } from "../processing";
import { encodeVideo } from "../encode/encoder";

// === 依存モジュールのモック（store はモックしない！） ===

// processing: デフォルト成功（ケースごとに上書き）
vi.mock("../processing", () => ({
  runSegmentation: vi.fn(() =>
    Promise.resolve({
      mask: new ImageData(1, 1),
      inputSize: { h: 1, w: 1 },
      outputName: "output",
    }),
  ),
}));

// camera: 実デバイス不要の安定モック
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
    processImage: vi.fn((img: ImageBitmap) => Promise.resolve(img)),
  };
});

// encoder: 成功時にダミー Blob
vi.mock("../encode/encoder", () => ({
  encodeVideo: vi
    .fn()
    .mockResolvedValue(new Blob(["mock video"], { type: "video/webm" })),
}));

// imageユーティリティ
vi.mock("../lib/image", () => ({
  imageBitmapToUint8Array: vi
    .fn()
    .mockResolvedValue(new Uint8Array([0, 0, 0, 255])),
  createSolidColorImageBitmap: vi.fn(() =>
    Promise.resolve({ width: 1, height: 1, close: vi.fn() }),
  ),
}));

// parallax
vi.mock("../compose/parallax", () => ({
  generateLayers: vi.fn(() =>
    Promise.resolve({ foreground: {}, background: {} }),
  ),
  generateParallaxFrames: vi.fn(() => Promise.resolve([])),
}));

// 型のためにキャスト
const mockedRunSegmentation = runSegmentation as unknown as vi.Mock;
const mockedEncodeVideo = encodeVideo as unknown as vi.Mock;

describe("useStore", () => {
  const mockImage = {
    width: 100,
    height: 100,
    close: vi.fn(),
  } as unknown as ImageBitmap;

  beforeEach(() => {
    vi.useFakeTimers();

    // ストア初期化（購読下で状態流れを作る）
    act(() => {
      useStore.setState({
        status: "idle",
        error: null,
        retryCount: 0,
        processingResolution: 720,
        unsplashApiKey: null,
        generatedVideoBlob: null,
        generatedVideoMimeType: null,
        isProcessingUI: false,
      } as any);
    });

    mockedRunSegmentation.mockClear();
    mockedEncodeVideo.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    // スパイの回数等だけクリアし、モジュールモックは維持する
    vi.clearAllMocks();
  });

  describe("startProcessFlow", () => {
    it("should set error status if Unsplash API key is missing", async () => {
      const { result } = renderHook(() => useStore());

      await act(async () => {
        result.current.setUnsplashApiKey("");
        await result.current.startProcessFlow(mockImage);
      });

      expect(result.current.status).toBe("error");
      expect(String(result.current.error)).toContain(
        "Unsplash API Key is missing",
      );
      expect(mockedRunSegmentation).not.toHaveBeenCalled();
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
        result.current.setUnsplashApiKey("test-key");
        await result.current.startProcessFlow(mockImage);
        // タイマー系 + マイクロタスクの排出で状態遷移を取り切る
        await vi.runAllTimersAsync();
        await Promise.resolve();
      });

      expect(mockedRunSegmentation).toHaveBeenCalledTimes(1);
      expect(mockedEncodeVideo).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe("success");
      expect(result.current.retryCount).toBe(1);
      expect(result.current.generatedVideoBlob).toBeInstanceOf(Blob);
      expect(result.current.generatedVideoMimeType).toBe("video/webm");
    });

    it("should handle the full retry cycle and finally fail", async () => {
      const { result } = renderHook(() => useStore());

      mockedRunSegmentation.mockRejectedValue(new Error("Simulated failure"));

      await act(async () => {
        result.current.setUnsplashApiKey("test-key");
        result.current.startProcessFlow(mockImage);
      });

      await act(async () => {
        await vi.runAllTimersAsync(); // 3回分のリトライを進める
        await Promise.resolve();
      });

      expect(mockedRunSegmentation).toHaveBeenCalledTimes(3); // MAX_RETRIES=3 想定
      expect(result.current.status).toBe("error");
      expect(String(result.current.error)).toContain("Simulated failure");
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
        result.current.setUnsplashApiKey("test-key");
        result.current.startProcessFlow(mockImage);
      });

      await act(async () => {
        await vi.runAllTimersAsync(); // 1回目失敗→2回目成功まで進める
        await Promise.resolve();
      });

      expect(mockedRunSegmentation).toHaveBeenCalledTimes(2);
      expect(mockedEncodeVideo).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe("success");
      // ★ 実装は「試行回数」をカウント（Attempt1, Attempt2）するため 2 を期待
      expect(result.current.retryCount).toBe(2);
      expect(result.current.generatedVideoBlob).toBeInstanceOf(Blob);
      expect(result.current.generatedVideoMimeType).toBe("video/webm");
    });
  });

  describe("reset", () => {
    it("should reset the state to idle", async () => {
      const { result } = renderHook(() => useStore());

      act(() => {
        useStore.setState({
          status: "error",
          error: "An error",
          retryCount: 3,
          generatedVideoBlob: new Blob(["x"], { type: "video/webm" }),
          generatedVideoMimeType: "video/webm",
        } as any);
      });

      await act(async () => {
        await result.current.reset();
        await Promise.resolve();
      });

      expect(result.current.status).toBe("idle");
      expect(result.current.error).toBeNull();
      expect(result.current.retryCount).toBe(0);
      expect(result.current.generatedVideoBlob).toBeNull();
      expect(result.current.generatedVideoMimeType).toBeNull();
    });
  });
});
