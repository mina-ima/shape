import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import App from "./App";

// 1. Define mock functions and a mutable mock state at the top level
const mockStartProcessFlow = vi.fn(() => Promise.resolve());
const mockSetUnsplashApiKey = vi.fn();
const mockReset = vi.fn();

const mockState: any = {
  status: "idle",
  error: null,
  retryCount: 0,
  processingResolution: 720,
  unsplashApiKey: "mock-api-key",
  startProcessFlow: mockStartProcessFlow,
  setUnsplashApiKey: mockSetUnsplashApiKey,
  reset: mockReset,
};

// 2. Mock the store module to implement the selector logic
vi.mock("./core/store", () => ({
  useStore: (selector?: (state: any) => any) => {
    if (selector) {
      return selector(mockState);
    }
    return mockState;
  },
  MAX_RETRIES: 3,
}));

describe("App", () => {
  const originalLocation = window.location;
  const originalHistory = window.history;

  const mockImageBitmap = { width: 100, height: 100, close: vi.fn() };

  beforeEach(() => {
    // 3. Reset mock function history and state before each test
    vi.clearAllMocks();
    Object.assign(mockState, {
      status: "idle",
      error: null,
      retryCount: 0,
      processingResolution: 720,
      unsplashApiKey: "mock-api-key",
    });

    vi.stubGlobal("createImageBitmap", vi.fn(() => Promise.resolve(mockImageBitmap)));
    vi.stubGlobal("alert", vi.fn());

    // Mock location and history
    let currentHash = "";
    const mockLocation = {
      get hash() { return currentHash; },
      set hash(v: string) {
        currentHash = v;
        window.dispatchEvent(new Event("hashchange"));
      },
      pathname: "/",
      search: "",
      href: "http://localhost/",
      assign: vi.fn(),
      replace: vi.fn(),
      reload: vi.fn(),
    };
    Object.defineProperty(window, "location", { configurable: true, value: mockLocation });
    Object.defineProperty(window, "history", {
      configurable: true,
      value: {
        ...originalHistory,
        replaceState: vi.fn((_state, _title, url) => {
          if (url) {
            const newUrl = new URL(url, "http://localhost");
            mockLocation.hash = newUrl.hash;
          }
        }),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    Object.defineProperty(window, "history", { configurable: true, value: originalHistory });
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    render(<App />);
    expect(screen.getByText(/shape/i)).toBeInTheDocument();
  });

  it("should handle image file selection", async () => {
    render(<App />);
    const fileInput = screen.getByLabelText(/ファイルを選択/i);
    const testFile = new File(["dummy content"], "test.png", { type: "image/png" });
    await act(async () => { fireEvent.change(fileInput, { target: { files: [testFile] } }); });
    expect(createImageBitmap).toHaveBeenCalledWith(testFile);
    expect(screen.getByText(/選択中の画像: 100x100/i)).toBeInTheDocument();
  });

  it("should call startProcessFlow with the selected image when '撮影/選択' is clicked", async () => {
    render(<App />);
    const fileInput = screen.getByLabelText(/ファイルを選択/i);
    const testFile = new File(["dummy content"], "test.png", { type: "image/png" });
    await act(async () => { fireEvent.change(fileInput, { target: { files: [testFile] } }); });
    const startButton = screen.getByRole("button", { name: "撮影/選択" });
    await act(async () => { fireEvent.click(startButton); });
    expect(mockStartProcessFlow).toHaveBeenCalledWith(mockImageBitmap);
  });

  it("handles API key from URL hash", async () => {
    const testApiKey = "test-api-key-123";
    render(<App />);
    await act(async () => { window.location.hash = `#unsplash_api_key=${testApiKey}`; });
    expect(mockSetUnsplashApiKey).toHaveBeenCalledWith(testApiKey);
  });

  it("clears API key from URL hash after processing", async () => {
    const testApiKey = "test-api-key-456";
    render(<App />);
    await act(async () => { window.location.hash = `#unsplash_api_key=${testApiKey}`; });
    expect(mockSetUnsplashApiKey).toHaveBeenCalledWith(testApiKey);
    expect(window.history.replaceState).toHaveBeenCalled();
  });
});