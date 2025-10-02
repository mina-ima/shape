import { act, renderHook } from "@testing-library/react";
import { useStore } from "./store";

describe("zustand store", () => {
  beforeEach(() => {
    // Reset the store before each test
    act(() => {
      useStore.getState().reset();
    });
  });

  it("should handle resolution decrement correctly", () => {
    const { result } = renderHook(() => useStore());

    // Initial processingResolution should be 720
    expect(result.current.processingResolution).toBe(720);

    // Decrement to 540
    act(() => {
      result.current.decrementResolution();
    });
    expect(result.current.processingResolution).toBe(540);

    // Decrement to 360
    act(() => {
      result.current.decrementResolution();
    });
    expect(result.current.processingResolution).toBe(360);

    // Should not decrement below 360
    act(() => {
      result.current.decrementResolution();
    });
    expect(result.current.processingResolution).toBe(360);
  });

  it("should fail if resolution decrements below 360", () => {
    const { result } = renderHook(() => useStore());

    act(() => {
      result.current.decrementResolution(); // 720 -> 540
    });
    act(() => {
      result.current.decrementResolution(); // 540 -> 360
    });
    act(() => {
      result.current.decrementResolution(); // 360 -> should stay 360
    });

    // This expectation is now correct and the test should pass.
    // It expects the processingResolution to become 360, and the logic prevents it from going lower.
    expect(result.current.processingResolution).toBe(360);
  });

  it("should handle the full retry cycle: 720 -> 540 -> 360 -> error", () => {
    const { result } = renderHook(() => useStore());

    // Initial state
    expect(result.current.processingResolution).toBe(720);
    expect(result.current.status).toBe("idle");

    // 1. First failure: processingResolution should drop to 540
    act(() => {
      result.current.handleProcessingError("Memory Error");
    });
    expect(result.current.processingResolution).toBe(540);
    expect(result.current.status).toBe("processing"); // Stays in processing for a retry
    expect(result.current.error).toBe(null); // Error is not yet final

    // 2. Second failure: processingResolution should drop to 360
    act(() => {
      result.current.handleProcessingError("Memory Error");
    });
    expect(result.current.processingResolution).toBe(360);
    expect(result.current.status).toBe("processing");

    // 3. Third failure: processingResolution stays 360, status becomes 'error'
    act(() => {
      result.current.handleProcessingError("Memory Error");
    });
    expect(result.current.processingResolution).toBe(360);
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Memory Error");
  });
});

describe("logErrorToLocalStorage", () => {
  const MOCK_DATE = new Date(2025, 0, 1, 12, 0, 0); // 2025-01-01 12:00:00

  beforeEach(() => {
    vi.useFakeTimers(); // タイマーをモック
    vi.setSystemTime(MOCK_DATE); // システム時間を設定
    // localStorage のモックを beforeEach の中で設定
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {});
    vi.spyOn(localStorage, "getItem").mockImplementation(() => null); // 初期状態は空
    act(() => {
      useStore.getState().reset();
    });
  });

  afterEach(() => {
    vi.useRealTimers(); // タイマーを元に戻す
    vi.restoreAllMocks(); // すべてのモックを元に戻す
    localStorage.clear(); // localStorage をクリア
  });

  it("should save error to localStorage", () => {
    const { result } = renderHook(() => useStore());
    const errorMessage = "Test error message";

    act(() => {
      result.current.logErrorToLocalStorage(errorMessage);
    });

    expect(localStorage.getItem).toHaveBeenCalledWith("errorLog");
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "errorLog",
      JSON.stringify([
        { timestamp: MOCK_DATE.toISOString(), error: errorMessage },
      ]),
    );
  });

  it("should append new error to existing errors in localStorage", () => {
    const existingError = {
      timestamp: new Date(2024, 11, 31, 23, 59, 59).toISOString(),
      error: "Previous error",
    };
    vi.spyOn(localStorage, "getItem").mockReturnValue(
      JSON.stringify([existingError]),
    );

    const { result } = renderHook(() => useStore());
    const newErrorMessage = "New test error";

    act(() => {
      result.current.logErrorToLocalStorage(newErrorMessage);
    });

    expect(localStorage.getItem).toHaveBeenCalledWith("errorLog");
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "errorLog",
      JSON.stringify([
        existingError,
        { timestamp: MOCK_DATE.toISOString(), error: newErrorMessage },
      ]),
    );
  });
});
