import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import App from "./App";
import { useStore, MAX_RETRIES } from "./core/store";

describe("App Component", () => {
  beforeEach(() => {
    // すべてのテストは同じ初期状態から開始
    act(() => {
      useStore.getState().reset();
      useStore.setState({ unsplashApiKey: "test-key" });
    });
    // location ハッシュはクリア
    window.location.hash = "";
  });

  it("should render the initial button and start processing on click (UI assertion)", async () => {
    render(<App />);
    const startButton = screen.getByRole("button", { name: "撮影/選択" });
    expect(startButton).toBeInTheDocument();
    expect(startButton).not.toBeDisabled();

    fireEvent.click(startButton);

    // startProcessFlow が動くと status=processing → ローディングUIが出るはず
    await waitFor(() => {
      expect(screen.getByTestId("loading-cloud")).toBeInTheDocument();
    });
    expect(screen.getByText("処理中... (解像度: 720)")).toBeInTheDocument();
  });

  it("should disable button and show warning if API key is missing", () => {
    act(() => {
      useStore.setState({ unsplashApiKey: null });
    });
    render(<App />);
    const startButton = screen.getByRole("button", { name: "撮影/選択" });
    expect(startButton).toBeDisabled();
    expect(screen.getByText(/Unsplash API Key is missing/)).toBeInTheDocument();
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

  it("should display success UI and go back to idle on 'もう一度' click", async () => {
    act(() => {
      useStore.setState({ status: "success" });
    });
    render(<App />);
    expect(screen.getByText("成功!")).toBeInTheDocument();

    const onceMoreButton = screen.getByRole("button", { name: "もう一度" });
    fireEvent.click(onceMoreButton);

    await waitFor(() => {
      // idle に戻ると初期ボタンが再び表示される想定
      expect(screen.getByRole("button", { name: "撮影/選択" })).toBeInTheDocument();
    });

    // 念のためストアの状態も確認
    expect(useStore.getState().status).toBe("idle");
  });

  it("should display error UI and go back to idle on 'リトライ' click", async () => {
    act(() => {
      useStore.setState({ status: "error", error: "A test error" });
    });
    render(<App />);
    expect(screen.getByText("エラー")).toBeInTheDocument();
    expect(screen.getByText("A test error")).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "リトライ" });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "撮影/選択" })).toBeInTheDocument();
    });
    expect(useStore.getState().status).toBe("idle");
  });

  it("should read API key from URL fragment on initial load", async () => {
    const setUnsplashApiKeySpy = vi.spyOn(useStore.getState(), "setUnsplashApiKey");
    window.location.hash = "#unsplash_api_key=key-from-url";

    render(<App />);

    await waitFor(() => {
      expect(setUnsplashApiKeySpy).toHaveBeenCalledWith("key-from-url");
    });

    setUnsplashApiKeySpy.mockRestore();
  });
});
