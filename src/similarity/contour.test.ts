// src/similarity/contour.test.ts
import { describe, it, expect } from "vitest";
import { extractLargestContour } from "./contour";

describe("Contour Extraction", () => {
  it("should extract the largest contour from an image", async () => {
    // 100x100 の単純な RGBA ImageData（中央が白）
    const width = 100;
    const height = 100;
    const data = new Uint8ClampedArray(width * height * 4).fill(0);
    for (let y = 25; y <= 75; y++) {
      for (let x = 25; x <= 75; x++) {
        const i = (y * width + x) * 4;
        data[i] = 255; // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
        data[i + 3] = 255; // A
      }
    }
    const img = new ImageData(data, width, height);

    const contour = await extractLargestContour(img);

    expect(contour).toBeDefined();
    // 実装は 128 サンプルの Point[] を返す
    expect(contour.length).toBe(128);
    // ざっくり要素の形も確認
    expect(typeof contour[0].x).toBe("number");
    expect(typeof contour[0].y).toBe("number");
  });
});
