import { describe, it, expect } from "vitest";
import { postProcessAlphaMask } from "./postprocess";

/**
 * Calculates the Intersection over Union (IoU) between two masks.
 * IoU = Area of Overlap / Area of Union
 * @param maskA - The first mask (Uint8ClampedArray, 0-255).
 * @param maskB - The second mask (Uint8ClampedArray, 0-255).
 * @returns The IoU score (0-1).
 */
function calculateIoU(
  maskA: Uint8ClampedArray,
  maskB: Uint8ClampedArray,
): number {
  if (maskA.length !== maskB.length) {
    throw new Error("Masks must have the same dimensions.");
  }

  let intersection = 0;
  let union = 0;

  for (let i = 0; i < maskA.length; i++) {
    const valA = maskA[i] > 127 ? 1 : 0; // Binarize
    const valB = maskB[i] > 127 ? 1 : 0; // Binarize

    if (valA === 1 && valB === 1) {
      intersection++;
    }
    if (valA === 1 || valB === 1) {
      union++;
    }
  }

  return union > 0 ? intersection / union : 1.0; // If union is 0, both are empty, so IoU is 1
}

describe("Segmentation IoU", () => {
  it("should produce a mask with high IoU for a simple shape", async () => {
    const width = 32;
    const height = 32;
    const size = width * height;

    // 1. Create a "ground truth" mask: a 16x16 square in the center.
    const groundTruthMask = new Uint8ClampedArray(size).fill(0);
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) {
        groundTruthMask[y * width + x] = 255;
      }
    }

    // 2. Create a "model output" mask that is slightly imperfect.
    // Let's simulate a mask that is slightly smaller and has a hole.
    const modelOutputMask = new Uint8ClampedArray(size).fill(0);
    for (let y = 9; y < 23; y++) {
      for (let x = 9; x < 23; x++) {
        modelOutputMask[y * width + x] = 255;
      }
    }
    // Add a hole
    modelOutputMask[15 * width + 15] = 0;

    // 3. Run post-processing on the imperfect mask.
    // This should fill the hole and smooth the edges.
    const processedMask = await postProcessAlphaMask(
      modelOutputMask,
      width,
      height,
    );

    // 4. Calculate IoU between the processed mask and the ground truth.
    const iou = calculateIoU(processedMask, groundTruthMask);

    console.log(`Calculated IoU: ${iou}`);

    // 5. Assert that the IoU is above a certain threshold.
    // The post-processing should have improved the mask, resulting in a high IoU.
    expect(iou).toBeGreaterThan(0.9);
  });
});
