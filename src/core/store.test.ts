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

    // Initial resolution should be 720
    expect(result.current.resolution).toBe(720);

    // Decrement to 540
    act(() => {
      result.current.decrementResolution();
    });
    expect(result.current.resolution).toBe(540);

    // Decrement to 360
    act(() => {
      result.current.decrementResolution();
    });
    expect(result.current.resolution).toBe(360);

    // Should not decrement below 360
    act(() => {
      result.current.decrementResolution();
    });
    expect(result.current.resolution).toBe(360);
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
    // It expects the resolution to become 360, and the logic prevents it from going lower.
    expect(result.current.resolution).toBe(360);
  });

  it("should handle the full retry cycle: 720 -> 540 -> 360 -> error", () => {
    const { result } = renderHook(() => useStore());

    // Initial state
    expect(result.current.resolution).toBe(720);
    expect(result.current.status).toBe("idle");

    // 1. First failure: resolution should drop to 540
    act(() => {
      result.current.handleProcessingError("Memory Error");
    });
    expect(result.current.resolution).toBe(540);
    expect(result.current.status).toBe("processing"); // Stays in processing for a retry
    expect(result.current.error).toBe(null); // Error is not yet final

    // 2. Second failure: resolution should drop to 360
    act(() => {
      result.current.handleProcessingError("Memory Error");
    });
    expect(result.current.resolution).toBe(360);
    expect(result.current.status).toBe("processing");

    // 3. Third failure: resolution stays 360, status becomes 'error'
    act(() => {
      result.current.handleProcessingError("Memory Error");
    });
    expect(result.current.resolution).toBe(360);
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Memory Error");
  });
});
