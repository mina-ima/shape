import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import LoadingCloud from "./LoadingCloud";

describe("LoadingCloud", () => {
  it("should render the loading cloud component", () => {
    render(<LoadingCloud />);
    expect(screen.getByTestId("loading-cloud")).toBeInTheDocument();
  });

  it("should display a static message when prefers-reduced-motion is enabled", () => {
    // Mock matchMedia to simulate prefers-reduced-motion
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<LoadingCloud />);
    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
    expect(screen.queryByTestId("animated-cloud")).not.toBeInTheDocument();
  });

  it("should display the animated cloud when prefers-reduced-motion is not enabled", () => {
    // Mock matchMedia to simulate no prefers-reduced-motion
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query !== "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<LoadingCloud />);
    expect(screen.getByTestId("animated-cloud")).toBeInTheDocument();
    expect(screen.queryByText("読み込み中...")).not.toBeInTheDocument();
  });
});
