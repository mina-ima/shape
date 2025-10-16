import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import App from "./App";
import { useStore } from "./core/store"; // Import the actual store
import licensesMarkdown from "./docs/licenses.md?raw"; // Import licenses.md as raw string for testing

// Mock the useStore hook
const mockSetUnsplashApiKey = vi.fn();
const mockStartProcessFlow = vi.fn();
const mockReset = vi.fn();

vi.mock("./core/store", () => ({
  useStore: () => ({
    status: "idle",
    error: null,
    retryCount: 0,
    processingResolution: 720,
    unsplashApiKey: undefined,
    setUnsplashApiKey: mockSetUnsplashApiKey,
    startProcessFlow: mockStartProcessFlow,
    reset: mockReset,
  }),
}));

describe("App", () => {
  const originalLocation = window.location;
  const originalHistory = window.history;

  beforeEach(() => {
    // Create a mock location object with writable hash
    let currentHash = "";
    const mockLocation = {
      get hash() {
        return currentHash;
      },
      set hash(v: string) {
        currentHash = v;
        window.dispatchEvent(new Event("hashchange"));
      },
      pathname: "/",
      search: "",
      href: "http://localhost/",
      assign: vi.fn(),
      replace: vi.fn((_state, _title, url) => {
        if (url) {
          const newUrl = new URL(url, "http://localhost");
          currentHash = newUrl.hash;
          mockLocation.pathname = newUrl.pathname;
          mockLocation.search = newUrl.search;
          mockLocation.href = newUrl.href;
        }
      }),
      reload: vi.fn(),
    };

    // Mock window.location
    Object.defineProperty(window, "location", {
      configurable: true,
      value: mockLocation,
    });

    // Mock window.history.replaceState
    Object.defineProperty(window, "history", {
      configurable: true,
      value: {
        ...originalHistory, // Keep other history methods
        replaceState: vi.fn((_state, _title, url) => {
          // Simulate the effect of replaceState on location
          if (url) {
            const newUrl = new URL(url, "http://localhost");
            mockLocation.hash = newUrl.hash;
            mockLocation.pathname = newUrl.pathname;
            mockLocation.search = newUrl.search;
            mockLocation.href = newUrl.href;
          }
        }),
      },
    });

    mockSetUnsplashApiKey.mockClear(); // Clear mock calls before each test
    mockStartProcessFlow.mockClear();
    mockReset.mockClear();
  });

  afterEach(() => {
    // Restore original window.location and window.history
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    Object.defineProperty(window, "history", {
      configurable: true,
      value: originalHistory,
    });
    vi.restoreAllMocks();
    vi.clearAllMocks(); // Clear mocks for useStore as well
  });

  it("renders without crashing", () => {
    render(<App />);
    expect(screen.getByText(/shape/i)).toBeInTheDocument();
  });

  it("handles API key from URL hash", async () => {
    const testApiKey = "test-api-key-123";
    // Manually set the hash on our mockLocation
    render(<App />);
    await act(async () => {
      window.location.hash = `#key=${testApiKey}`;
    });

    // Expect setUnsplashApiKey to be called
    expect(mockSetUnsplashApiKey).toHaveBeenCalledWith(testApiKey);

    expect(screen.getByText(/shape/i)).toBeInTheDocument();
  });

  it("clears API key from URL hash after processing", async () => {
    const testApiKey = "test-api-key-456";
    const initialHash = `#key=${testApiKey}`;
    render(<App />);
    await act(async () => {
      window.location.hash = initialHash; // Set initial hash
    });

    // Expect setUnsplashApiKey to be called
    expect(mockSetUnsplashApiKey).toHaveBeenCalledWith(testApiKey);

    // Expect replaceState to be called to clear the hash
    expect(window.history.replaceState).toHaveBeenCalledWith(
      {},
      "",
      window.location.pathname + window.location.search,
    );
    // After replaceState is called, our mock should have updated the hash
    expect(window.location.hash).toBe("");
  });

  it("should display licenses when 'Licenses' button is clicked", async () => {
    render(<App />);
    const licensesButton = screen.getByRole("button", { name: /Licenses/i });
    expect(licensesButton).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(licensesButton);
    });

    // Expect some content from licenses.md to be displayed
    const licensesModalContent = screen.getByTestId("licenses-modal-content");
    expect(licensesModalContent).toBeInTheDocument();
    expect(licensesModalContent).toHaveTextContent(
      /Licenses and Attributions/i,
    );
    expect(licensesModalContent).toHaveTextContent(/React: MIT License/i);
    expect(licensesModalContent).toHaveTextContent(/Unsplash License/i);
    expect(screen.getByRole("button", { name: /\u00D7/i })).toBeInTheDocument(); // Close button
  });
});
