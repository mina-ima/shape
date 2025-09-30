import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import AttributionToast from "./AttributionToast";

describe("AttributionToast", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks(); // 各テスト後にモックをリセット
  });

  it("should render the message and attribution when provided", () => {
    render(
      <AttributionToast
        message="動画が保存されました！"
        attribution="Photo by Unsplash"
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("動画が保存されました！")).toBeInTheDocument();
    expect(screen.getByText("Photo by Unsplash")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "閉じる" })).toBeInTheDocument();
  });

  it("should render only the message when no attribution is provided", () => {
    render(
      <AttributionToast message="動画が保存されました！" onClose={() => {}} />,
    );

    expect(screen.getByText("動画が保存されました！")).toBeInTheDocument();
    expect(screen.queryByText(/Photo by/i)).not.toBeInTheDocument();
  });

  it("should disappear after a duration", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <AttributionToast
        message="動画が保存されました！"
        onClose={onClose}
        duration={3000}
      />,
    );

    expect(screen.getByText("動画が保存されました！")).toBeInTheDocument();

    act(() => {
      vi.runAllTimers();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("動画が保存されました！"),
    ).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("should call onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <AttributionToast message="動画が保存されました！" onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("should render the attribution as a link to the provider", () => {
    render(
      <AttributionToast
        message="動画が保存されました！"
        attribution="Photo by Test User on Unsplash"
        attributionUrl="https://unsplash.com/photos/test"
        onClose={() => {}}
      />,
    );

    const link = screen.getByRole("link", {
      name: "Photo by Test User on Unsplash",
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://unsplash.com/photos/test");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
