import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import App from "./App";

describe("App", () => {
  const originalLocation = window.location;
  const originalHistory = window.history;

  beforeEach(() => {
    // Create a mock location object with writable hash
    const mockLocation = {
      hash: "",
      pathname: "/",
      search: "",
      href: "http://localhost/",
      assign: vi.fn(),
      replace: vi.fn(),
      reload: vi.fn(),
      // Add other properties as needed, ensuring they are writable or mocked
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
  });

  it("renders without crashing", () => {
    render(<App />);
    expect(screen.getByText(/Vite \+ React/i)).toBeInTheDocument();
  });

  it("handles API key from URL hash", () => {
    const testApiKey = "test-api-key-123";
    // Set the hash on the mocked window.location
    window.location.hash = `#key=${testApiKey}`;

    render(<App />);

    expect(screen.getByText(/Vite \+ React/i)).toBeInTheDocument();
    // Further assertions would go here to check if the API key was used.
  });

  it("clears API key from URL hash after processing", () => {
    const testApiKey = "test-api-key-456";
    const initialHash = `#key=${testApiKey}`;
    window.location.hash = initialHash; // Set initial hash

    render(<App />);

    // Expect replaceState to be called to clear the hash
    expect(window.history.replaceState).toHaveBeenCalledWith(
      {},
      "",
      window.location.pathname + window.location.search,
    );
    // After replaceState is called, our mock should have updated the hash
    expect(window.location.hash).toBe("");
  });
});
