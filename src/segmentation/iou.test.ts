// src/segmentation/iou.test.ts
import { describe, it, expect } from "vitest";

function calculateIoU(
  mask1Data: Uint8Array,
  mask1Width: number,
  mask1Height: number,
  mask2Data: Uint8Array,
  mask2Width: number,
  mask2Height: number,
): number {
  if (mask1Width !== mask2Width || mask1Height !== mask2Height) {
    throw new Error("Masks must have the same dimensions");
  }

  let intersection = 0;
  let union = 0;

  for (let i = 0; i < mask1Data.length; i++) {
    const pixel1 = mask1Data[i];
    const pixel2 = mask2Data[i];

    if (pixel1 > 0 && pixel2 > 0) intersection++;
    if (pixel1 > 0 || pixel2 > 0) union++;
  }

  // 両方空なら IoU=1 とみなす
  return union === 0 ? 1 : intersection / union;
}

describe("IoU Calculation", () => {
  it("should calculate IoU correctly for identical masks", () => {
    const maskData = new Uint8Array([255, 255, 0, 0, 255, 255, 0, 0, 255]); // 3x3
    const iou = calculateIoU(maskData, 3, 3, maskData, 3, 3);
    expect(iou).toBe(1);
  });

  it("should calculate IoU correctly for disjoint masks", () => {
    const mask1Data = new Uint8Array([255, 255, 0, 0, 0, 0, 0, 0, 0]);
    const mask2Data = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255, 255]);
    const iou = calculateIoU(mask1Data, 3, 3, mask2Data, 3, 3);
    expect(iou).toBe(0);
  });

  it("should calculate IoU correctly for overlapping masks", () => {
    const mask1Data = new Uint8Array([255, 255, 0, 255, 0, 0, 0, 0, 0]);
    const mask2Data = new Uint8Array([0, 255, 255, 0, 255, 0, 0, 0, 0]);
    // Intersection: 1, Union: 5
    const iou = calculateIoU(mask1Data, 3, 3, mask2Data, 3, 3);
    expect(iou).toBe(1 / 5);
  });

  it("should handle empty masks", () => {
    const mask1Data = new Uint8Array(9).fill(0);
    const mask2Data = new Uint8Array(9).fill(0);
    const iou = calculateIoU(mask1Data, 3, 3, mask2Data, 3, 3);
    expect(iou).toBe(1); // 両方空 → 完全一致とみなす
  });

  it("should throw error for different dimensions", () => {
    const mask1Data = new Uint8Array([255, 255, 255, 255]); // 2x2
    const mask2Data = new Uint8Array(9).fill(255); // 3x3
    expect(() => calculateIoU(mask1Data, 2, 2, mask2Data, 3, 3)).toThrow(
      "Masks must have the same dimensions",
    );
  });
});
