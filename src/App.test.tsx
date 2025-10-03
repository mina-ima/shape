import { render, screen, fireEvent, act } from "@testing-library/react";
import type { Mock } from "vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import App from "./App";
import { useStore, MAX_RETRIES } from "./core/store";

// vi.hoisted を使用してモック関数を定義
const { mockLoadOnnxModel } = vi.hoisted(() => {
  return {
    mockLoadOnnxModel: vi.fn(),
  };
});

// src/segmentation/model モジュールをモック
vi.mock("./segmentation/model", () => ({
  loadOnnxModel: mockLoadOnnxModel,
}));

// Mock the processing module that will be used in App.tsx
vi.mock("./processing", () => ({
  runProcessing: vi.fn(),
}));

import { runProcessing } from "./processing";

describe("App", () => {
  let originalLocationHashDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers(); // タイマーをモック
    vi.setSystemTime(MOCK_DATE); // システム時間を設定

    // Mock localStorage
    localStorageSetItemSpy = vi
      .spyOn(localStorage, "setItem")
      .mockImplementation(() => {});
    vi.spyOn(localStorage, "getItem").mockImplementation(() => "[]");

    // Mock console.warn
    consoleLogSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Mock window.location.hash
    originalLocationHashDescriptor = Object.getOwnPropertyDescriptor(
      window.location,
      "hash",
    );
    Object.defineProperty(window.location, "hash", {
      configurable: true,
      get: vi.fn(() => ""), // デフォルト値を設定
      set: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers(); // Restore real timers
    vi.restoreAllMocks(); // すべてのモックを元に戻す
    localStorage.clear(); // localStorage をクリア
    if (originalLocationHashDescriptor) {
      Object.defineProperty(
        window.location,
        "hash",
        originalLocationHashDescriptor,
      );
    }
  });

  it("should render the initial button", () => {
    render(<App />);
    expect(
      screen.getByRole("button", { name: "撮影/選択" }),
    ).toBeInTheDocument();
  });

  it("should not load the ONNX model until processing starts", async () => {
    render(<App />);

    // Model should not be loaded immediately on app render
    expect(mockLoadOnnxModel).not.toHaveBeenCalled();

    // Start the process
    fireEvent.click(screen.getByRole("button", { name: "撮影/選択" }));

    // Wait for processing to start, which should trigger model loading
    await screen.findByText("処理中... (解像度: 720)");

    // Model should now be loaded
    expect(mockLoadOnnxModel).toHaveBeenCalledTimes(1);
    expect(mockLoadOnnxModel).toHaveBeenCalledWith("/public/models/u2net.onnx");
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
    expect(useStore.getState().processingResolution).toBe(720);
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

  it("should read API key from URL fragment and store it", async () => {
    const testApiKey = "test-api-key-from-url";
    Object.defineProperty(window.location, "hash", {
      configurable: true,
      get: vi.fn(() => `#unsplash_api_key=${testApiKey}`),
    });

    render(<App />);

    // Ensure the API key is set in the store
    expect(useStore.getState().unsplashApiKey).toBe(testApiKey);

    // Click the button to start processing
    fireEvent.click(screen.getByRole("button", { name: "撮影/選択" }));

    // Ensure runProcessing is called with the API key
    expect(runProcessing).toHaveBeenCalledWith(testApiKey);
  });

  it("should display a warning if API key is missing", async () => {
    Object.defineProperty(window.location, "hash", {
      configurable: true,
      get: vi.fn(() => ""),
    });

    render(<App />);

    // Ensure API key is null in store
    expect(useStore.getState().unsplashApiKey).toBeNull();

    // Click the button to start processing
    fireEvent.click(screen.getByRole("button", { name: "撮影/選択" }));

    // Expect an error message to be displayed
    await screen.findByText(
      /Unsplash API Key is missing. Please provide it in the URL fragment/,
    );
    expect(useStore.getState().status).toBe("error");
    expect(runProcessing).not.toHaveBeenCalled();
  });
});
