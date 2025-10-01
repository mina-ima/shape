/// <reference types="vitest" />

import { render, screen, fireEvent, act } from "@testing-library/react";
import type { Mock } from "vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "./App";
import { useStore } from "./core/store";

// Mock the processing module that will be used in App.tsx
vi.mock("./processing", () => ({
  runProcessing: vi.fn(),
}));

import { runProcessing } from "./processing";

describe("App", () => {
  beforeEach(() => {
    // Reset store and mocks before each test
    act(() => {
      useStore.getState().reset();
    });
    vi.clearAllMocks();
  });

  it("should render the initial button", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "撮影/選択" })).toBeInTheDocument();
  });

  it("should automatically cycle through resolutions on failure and end in an error state", async () => {
    // Setup the mock to consistently fail
    (runProcessing as Mock).mockRejectedValue(new Error("Memory limit exceeded"));

    render(<App />);

    // 1. Start the process
    fireEvent.click(screen.getByRole("button", { name: "撮影/選択" }));

    // The component will now automatically try to process, fail, and retry.
    // We wait for the final state.

    // It should try 720p, 540p, 360p, and then fail.
    await screen.findByText("エラー");

    // Check the final state
    expect(screen.getByText("Memory limit exceeded")).toBeInTheDocument();
    expect(useStore.getState().status).toBe("error");

    // Check that runProcessing was called three times in total for the three resolutions.
    expect(runProcessing).toHaveBeenCalledTimes(3);

    // Also check that it was called with the correct resolutions in the store.
    // Note: This is harder to test precisely due to the async loop.
    // We can check the console logs if needed, but the number of calls is a good proxy.

    // 4. Check reset functionality
    fireEvent.click(screen.getByRole("button", { name: "リトライ" }));
    expect(screen.getByRole("button", { name: "撮影/選択" })).toBeInTheDocument();
    expect(useStore.getState().status).toBe("idle");
    expect(useStore.getState().resolution).toBe(720);
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
  });
});