import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PreviewScreen from "./PreviewScreen";
import { saveFile } from "../storage/save";

// saveFile関数をモック
vi.mock("../storage/save", () => ({
  saveFile: vi.fn(),
  generateFilename: vi.fn(() => "test_video.webm"),
}));

describe("PreviewScreen", () => {
  const mockVideoBlob = new Blob(["test video data"], { type: "video/webm" });
  const mockVideoUrl = "blob:http://localhost/mock-video-url";

  beforeEach(() => {
    // URL.createObjectURLとURL.revokeObjectURLをモック
    vi.spyOn(URL, "createObjectURL").mockReturnValue(mockVideoUrl);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render a video element with autoplay and loop", () => {
    render(<PreviewScreen videoBlob={mockVideoBlob} />);

    const videoElement = screen.getByTestId("preview-video");
    expect(videoElement).toBeInTheDocument();
    expect(videoElement).toHaveAttribute("src", mockVideoUrl);
    expect(videoElement).toHaveAttribute("autoplay");
    expect(videoElement).toHaveAttribute("loop");
    expect(videoElement).toHaveAttribute("playsinline");
    expect(videoElement).toHaveProperty("muted", true);
  });

  it("should render a '保存' button", () => {
    render(<PreviewScreen videoBlob={mockVideoBlob} />);

    const saveButton = screen.getByRole("button", { name: "保存" });
    expect(saveButton).toBeInTheDocument();
  });

  it("should call saveFile when the '保存' button is clicked", async () => {
    render(<PreviewScreen videoBlob={mockVideoBlob} />);

    const saveButton = screen.getByRole("button", { name: "保存" });
    fireEvent.click(saveButton);

    expect(saveFile).toHaveBeenCalledWith(mockVideoBlob, "video/webm");
  });

  it("should render a '共有' button", () => {
    render(<PreviewScreen videoBlob={mockVideoBlob} />);

    const shareButton = screen.getByRole("button", { name: "共有" });
    expect(shareButton).toBeInTheDocument();
  });

  it("should revoke object URL on unmount", () => {
    const { unmount } = render(<PreviewScreen videoBlob={mockVideoBlob} />);
    expect(URL.createObjectURL).toHaveBeenCalledWith(mockVideoBlob);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockVideoUrl);
  });
});
