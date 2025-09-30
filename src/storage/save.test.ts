import { describe, it, expect, vi } from "vitest";
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
  it("should use showSaveFilePicker if available", async () => {
    const mockWritable = {
      write: vi.fn(),
      close: vi.fn(),
    };
    const mockFileHandle = {
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    };
    window.showSaveFilePicker = vi.fn().mockResolvedValue(mockFileHandle);

    const blob = new Blob(["test"], { type: "text/plain" });
    await saveFile(blob, "test.txt");

    expect(window.showSaveFilePicker).toHaveBeenCalled();
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

    const blob = new Blob(["test"], { type: "text/plain" });
    await saveFile(blob, "test.txt");

    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(mockLink.href).toBe("blob:url");
    expect(mockLink.download).toBe("test.txt");
    expect(mockLink.click).toHaveBeenCalled();
  });
});
