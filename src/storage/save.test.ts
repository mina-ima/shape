import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { generateFilename, saveFile } from "./save";

describe("generateFilename", () => {
  it("should generate a filename in the format parallax_YYYYMMDD_HHMMSS.ext", () => {
    const date = new Date(2023, 10, 28, 12, 34, 56); // 2023-11-28 12:34:56
    vi.setSystemTime(date);

    const filenameWebm = generateFilename("video/webm");
    expect(filenameWebm).toBe("parallax_20231128_123456.webm");

    const filenameMp4 = generateFilename("video/mp4");
    expect(filenameMp4).toBe("parallax_20231128_123456.mp4");
  });

  it("should handle single-digit month, day, hour, minute, and second", () => {
    const date = new Date(2024, 0, 5, 7, 8, 9); // 2024-01-05 07:08:09
    vi.setSystemTime(date);

    const filename = generateFilename("video/webm");
    expect(filename).toBe("parallax_20240105_070809.webm");
  });
});

describe("saveFile", () => {
  // Mock file handle and writable stream
  const mockWritable = {
    write: vi.fn(),
    close: vi.fn(),
  };
  const mockFileHandle = {
    createWritable: vi.fn().mockResolvedValue(mockWritable),
  };

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Mock the global showSaveFilePicker
    window.showSaveFilePicker = vi.fn().mockResolvedValue(mockFileHandle);
  });

  it("should use showSaveFilePicker if available", async () => {
    const blob = new Blob(["test"], { type: "video/webm" });
    await saveFile(blob, "video/webm");

    expect(window.showSaveFilePicker).toHaveBeenCalledOnce();
    expect(window.showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: expect.stringContaining(".webm"),
    });
    expect(mockFileHandle.createWritable).toHaveBeenCalled();
    expect(mockWritable.write).toHaveBeenCalledWith(blob);
    expect(mockWritable.close).toHaveBeenCalled();
  });

  it("should fall back to <a> download if showSaveFilePicker is not available", async () => {
    window.showSaveFilePicker = undefined;
    const mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn(),
    };
    window.URL.createObjectURL = vi.fn().mockReturnValue("blob:url");
    document.createElement = vi.fn().mockReturnValue(mockLink);
    document.body.appendChild = vi.fn();
    document.body.removeChild = vi.fn();

    const blob = new Blob(["test"], { type: "video/webm" });
    await saveFile(blob, "video/webm");

    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(mockLink.href).toBe("blob:url");
    expect(mockLink.download).toContain(".webm");
    expect(mockLink.click).toHaveBeenCalled();
  });

  it("should retry with alternative MIME type if saving with preferred one fails", async () => {
    // Make the first call fail, second succeed
    let callCount = 0;
    (window.showSaveFilePicker as Mock).mockImplementation(async (_options) => {
      callCount++;
      if (callCount === 1) {
        // 最初の呼び出しは失敗
        throw new DOMException("Save failed", "AbortError");
      } else {
        // 2回目の呼び出しは成功
        return mockFileHandle;
      }
    });

    const blob = new Blob(["test"], { type: "video/webm" });
    await saveFile(blob, "video/webm");

    // Check that it was called twice
    expect(window.showSaveFilePicker).toHaveBeenCalledTimes(2);

    // Check first call with preferred type (.webm)
    expect(window.showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: expect.stringContaining(".webm"),
    });

    // Check second call with alternative type (.mp4)
    expect(window.showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: expect.stringContaining(".mp4"),
    });

    // Check that the file was written on the second attempt
    expect(mockWritable.write).toHaveBeenCalledWith(blob);
    expect(mockWritable.close).toHaveBeenCalled();
  });

  it("should fall back to <a> download if both MIME types fail", async () => {
    // Make both calls to showSaveFilePicker fail
    (window.showSaveFilePicker as Mock).mockImplementation(async (_options) => {
      throw new DOMException("Save failed", "AbortError");
    });

    const mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn(), // remove もモックに追加
    };
    window.URL.createObjectURL = vi.fn().mockReturnValue("blob:url");
    document.createElement = vi.fn().mockReturnValue(mockLink);
    document.body.appendChild = vi.fn();
    document.body.removeChild = vi.fn(); // removeChild もモックに追加

    const blob = new Blob(["test"], { type: "video/webm" });
    await saveFile(blob, "video/webm");

    // showSaveFilePicker was called twice
    expect(window.showSaveFilePicker).toHaveBeenCalledTimes(2);

    // Fallback to <a> download was triggered
    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(mockLink.click).toHaveBeenCalled();
    // It should try to download with the original preferred filename
    expect(mockLink.download).toContain(".webm");
  });
});
