import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import App from "./App";
import { useStore, MAX_RETRIES } from "./core/store";

// We will spy on actions, not mock the whole store
const startProcessFlowSpy = vi.spyOn(
  useStore.getState(),
  "startProcessFlow",
);
const resetSpy = vi.spyOn(useStore.getState(), "reset");

describe("App Component", () => {
  beforeEach(() => {
    // Reset store state and mock implementations before each test
    act(() => {
      useStore.getState().reset();
      useStore.setState({ unsplashApiKey: "test-key" });
    });
    startProcessFlowSpy.mockClear();
    resetSpy.mockClear();
  });

  it("should render the initial button and call startProcessFlow on click", () => {
    render(<App />);
    const startButton = screen.getByRole("button", { name: "撮影/選択" });
    expect(startButton).toBeInTheDocument();
    expect(startButton).not.toBeDisabled();

    fireEvent.click(startButton);
    expect(startProcessFlowSpy).toHaveBeenCalledTimes(1);
  });

  it("should disable button and show warning if API key is missing", () => {
    act(() => {
      useStore.setState({ unsplashApiKey: null });
    });
    render(<App />);
    const startButton = screen.getByRole("button", { name: "撮影/選択" });
    expect(startButton).toBeDisabled();
    expect(
      screen.getByText(/Unsplash API Key is missing/),
    ).toBeInTheDocument();
  });

  it("should display loading UI when status is 'processing'", () => {
    act(() => {
      useStore.setState({ status: "processing", retryCount: 1 });
    });
    render(<App />);
    expect(screen.getByTestId("loading-cloud")).toBeInTheDocument();
    expect(screen.getByText("処理中... (解像度: 720)")).toBeInTheDocument();
    expect(screen.getByText(`Attempt: 1/${MAX_RETRIES}`)).toBeInTheDocument();
  });

  it("should display success UI and call reset on click", () => {
    act(() => {
      useStore.setState({ status: "success" });
    });
    render(<App />);
    expect(screen.getByText("成功!")).toBeInTheDocument();
    const onceMoreButton = screen.getByRole("button", { name: "もう一度" });
    fireEvent.click(onceMoreButton);
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it("should display error UI and call reset on click", () => {
    act(() => {
      useStore.setState({ status: "error", error: "A test error" });
    });
    render(<App />);
    expect(screen.getByText("エラー")).toBeInTheDocument();
    expect(screen.getByText("A test error")).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "リトライ" });
    fireEvent.click(retryButton);
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it("should read API key from URL fragment on initial load", async () => {
    const setUnsplashApiKeySpy = vi.spyOn(
      useStore.getState(),
      "setUnsplashApiKey",
    );
    window.location.hash = "#unsplash_api_key=key-from-url";

    render(<App />);

    await waitFor(() => {
      expect(setUnsplashApiKeySpy).toHaveBeenCalledWith("key-from-url");
    });

    setUnsplashApiKeySpy.mockRestore();
  });
});