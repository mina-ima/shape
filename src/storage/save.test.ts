import { describe, it, expect, vi } from "vitest";
import { generateFilename } from "./save";

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
