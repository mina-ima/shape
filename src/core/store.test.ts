import { act, renderHook } from "@testing-library/react";
import { useStore } from "./store";
import { runProcessing } from "../processing";

vi.mock("../processing", () => ({
  runProcessing: vi.fn(),
}));

const mockedRunProcessing = runProcessing as vi.Mock;

describe("useStore", () => {
  let hook: ReturnType<
    typeof renderHook<{ current: ReturnType<typeof useStore> }>
  >;

  beforeEach(() => {
    hook = renderHook(() => useStore());
    act(() => {
      useStore.getState().reset();
    });
    mockedRunProcessing.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("startProcessFlow", () => {
    it("should set error status if Unsplash API key is missing", async () => {
      await act(async () => {
        hook.result.current.setUnsplashApiKey("");
        await hook.result.current.startProcessFlow();
      });
      expect(hook.result.current.status).toBe("error");
      expect(hook.result.current.error).toContain(
        "Unsplash API Key is missing",
      );
    });

    it("should set success status on the first attempt", async () => {
      mockedRunProcessing.mockResolvedValue(undefined);

      await act(async () => {
        hook.result.current.setUnsplashApiKey("test-key");
        await hook.result.current.startProcessFlow();
      });

      expect(hook.result.current.status).toBe("success");
      expect(mockedRunProcessing).toHaveBeenCalledTimes(1);
      expect(hook.result.current.retryCount).toBe(1);
    });

    it("should handle the full retry cycle and finally fail", async () => {
      mockedRunProcessing.mockRejectedValue(new Error("Simulated failure"));

      await act(async () => {
        hook.result.current.setUnsplashApiKey("test-key");
        hook.result.current.startProcessFlow();
      });

      // 1回目
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(mockedRunProcessing).toHaveBeenCalledTimes(1);
      expect(hook.result.current.retryCount).toBe(2);
      expect(hook.result.current.processingResolution).toBe(540);

      // 2回目
      await act(async () => vi.advanceTimersByTimeAsync(1000));
      expect(mockedRunProcessing).toHaveBeenCalledTimes(2);
      expect(hook.result.current.retryCount).toBe(3);
      expect(hook.result.current.processingResolution).toBe(360);

      // 3回目
      await act(async () => vi.advanceTimersByTimeAsync(2000));
      expect(mockedRunProcessing).toHaveBeenCalledTimes(3);

      // 実装は最終メッセージとして "Simulated failure" を保持
      expect(hook.result.current.status).toBe("error");
      expect(hook.result.current.error).toContain("Simulated failure");
    });

    it("should succeed on the second attempt", async () => {
      mockedRunProcessing
        .mockRejectedValueOnce(new Error("Failure 1"))
        .mockResolvedValueOnce(undefined);

      await act(async () => {
        hook.result.current.setUnsplashApiKey("test-key");
        hook.result.current.startProcessFlow();
      });

      // 1回目失敗 → リトライ
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(mockedRunProcessing).toHaveBeenCalledTimes(1);
      expect(hook.result.current.retryCount).toBe(2);

      // 2回目成功
      await act(async () => vi.advanceTimersByTimeAsync(1000));
      expect(mockedRunProcessing).toHaveBeenCalledTimes(2);
      expect(hook.result.current.status).toBe("success");
    });
  });

  describe("reset", () => {
    it("should reset the state to idle", async () => {
      act(() => {
        hook.result.current.setUnsplashApiKey("some-key");
        hook.result.current._setError("An error");
      });

      await act(async () => hook.result.current.reset());

      expect(hook.result.current.status).toBe("idle");
      expect(hook.result.current.error).toBeNull();
      expect(hook.result.current.retryCount).toBe(0);
    });
  });
});
