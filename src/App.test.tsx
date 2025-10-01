import { render, screen, fireEvent, act } from "@testing-library/react";
import type { Mock } from "vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import App from "./App";
import { useStore, MAX_RETRIES } from "./core/store";

// Mock the processing module that will be used in App.tsx
vi.mock("./processing", () => ({
  runProcessing: vi.fn(),
}));

import { runProcessing } from "./processing";

describe("App", () => {
  let localStorageSetItemSpy: vi.SpyInstance;
  let consoleLogSpy: vi.SpyInstance;

  beforeEach(() => {
    // Reset store and mocks before each test
    act(() => {
      useStore.getState().reset();
    });
    vi.clearAllMocks();
    vi.useFakeTimers(); // Use fake timers for exponential backoff testing

    // Mock localStorage
    localStorageSetItemSpy = vi
      .spyOn(localStorage, "setItem")
      .mockImplementation(() => {});
    vi.spyOn(localStorage, "getItem").mockImplementation(() => "[]");

    // Spy on console.log to check backoff messages
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers(); // Restore real timers
    localStorageSetItemSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it("should render the initial button", () => {
    render(<App />);
    expect(
      screen.getByRole("button", { name: "撮影/選択" }),
    ).toBeInTheDocument();
  });

  it("should automatically cycle through resolutions on failure with exponential backoff and log error", async () => {
    // Setup the mock to consistently fail
    (runProcessing as Mock).mockRejectedValue(new Error("Simulated failure"));

    render(<App />);

    // 1. Start the process (Attempt 1)
    fireEvent.click(screen.getByRole("button", { name: "撮影/選択" }));

    // Expect initial processing message
    await screen.findByText("処理中... (解像度: 720)");
    expect(runProcessing).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      `Attempt 1 with resolution 720. Next retry in 0.1s.`,
    ); // Initial delay is 0.1s for first attempt

    // --- Attempt 2 (after 1s backoff) ---
    await act(async () => {
      vi.advanceTimersByTime(1000); // Advance by 1 second
    });
    await screen.findByText("処理中... (解像度: 540)");
    expect(runProcessing).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      `Attempt 2 with resolution 540. Next retry in 1s.`,
    );

    // --- Attempt 3 (after 2s backoff) ---
    await act(async () => {
      vi.advanceTimersByTime(2000); // Advance by 2 seconds
    });
    await screen.findByText("処理中... (解像度: 360)");
    expect(runProcessing).toHaveBeenCalledTimes(3);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      `Attempt 3 with resolution 360. Next retry in 2s.`,
    );

    // --- Attempt 4 (after 4s backoff) - Should fail and log ---
    await act(async () => {
      vi.advanceTimersByTime(4000); // Advance by 4 seconds
    });

    // Expect error state
    await screen.findByText("エラー");
    expect(screen.getByText("Simulated failure")).toBeInTheDocument();
    expect(runProcessing).toHaveBeenCalledTimes(MAX_RETRIES);
    expect(useStore.getState().status).toBe("error");

    // Check localStorage logging
    expect(localStorageSetItemSpy).toHaveBeenCalledWith(
      "errorLog",
      expect.stringContaining("Simulated failure"),
    );

    // Check reset functionality
    fireEvent.click(screen.getByRole("button", { name: "リトライ" }));
    expect(
      screen.getByRole("button", { name: "撮影/選択" }),
    ).toBeInTheDocument();
    expect(useStore.getState().status).toBe("idle");
    expect(useStore.getState().resolution).toBe(720);
    expect(useStore.getState().retryCount).toBe(0);
  });

  it("should show success screen if processing succeeds", async () => {
    // Mock processing to succeed this time
    (runProcessing as Mock).mockResolvedValue(undefined);

    render(<App />);

    // Start the process
    fireEvent.click(screen.getByRole("button", { name: "撮影/選択" }));

    // It should show processing at 720p
    await screen.findByText("処理中... (解像度: 720)");

    // Since runProcessing resolves, the app should transition to the success state.
    await screen.findByText("成功!");
    expect(useStore.getState().status).toBe("success");
    expect(runProcessing).toHaveBeenCalledTimes(1);
    expect(useStore.getState().retryCount).toBe(1); // Initial attempt counts as 1
  });
});
