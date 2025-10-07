import { describe, it, expect } from "vitest";
import cvPromise from "@techstark/opencv-js";

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
    const valA = maskA[i] > 127 ? 1 : 0;
    const valB = maskB[i] > 127 ? 1 : 0;
    if (valA === 1 && valB === 1) intersection++;
    if (valA === 1 || valB === 1) union++;
  }
  return union > 0 ? intersection / union : 1.0;
}

function logMask(name: string, mask: Uint8ClampedArray, width: number): string {
  let output = `--- ${name} ---\n`;
  for (let y = 0; y < mask.length / width; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const val = mask[y * width + x];
      if (val > 200) row += "#";
      else if (val > 50) row += "+";
      else row += ".";
    }
    output += row + "\n";
  }
  return output;
}

describe("Segmentation IoU", () => {
  it("should produce a mask with high IoU for a simple shape", async () => {
    const width = 32;
    const height = 32;
    const size = width * height;
    let logs = "";

    const groundTruthMask = new Uint8ClampedArray(size).fill(0);
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) {
        groundTruthMask[y * width + x] = 255;
      }
    }

    const modelOutputMask = new Uint8ClampedArray(size).fill(0);
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) {
        modelOutputMask[y * width + x] = 255;
      }
    }

    logs += logMask("Ground Truth", groundTruthMask, width);
    logs += logMask("Model Output (Before)", modelOutputMask, width);

    // --- Inlined ORIGINAL postProcessAlphaMask for debugging ---
    const cv = await cvPromise;
    const grayMat = new cv.Mat(height, width, cv.CV_8UC1);
    grayMat.data.set(modelOutputMask);
    logs += logMask(
      "After grayMat.data.set",
      new Uint8ClampedArray(grayMat.data),
      width,
    );

    const openKernel = cv.Mat.ones(3, 3, cv.CV_8U);
    const openedMat = new cv.Mat();
    cv.morphologyEx(grayMat, openedMat, cv.MORPH_OPEN, openKernel);
    logs += logMask(
      "After Opening",
      new Uint8ClampedArray(openedMat.data),
      width,
    );

    const closeKernel = cv.Mat.ones(7, 7, cv.CV_8U);
    const closedMat = new cv.Mat();
    cv.morphologyEx(openedMat, closedMat, cv.MORPH_CLOSE, closeKernel);
    logs += logMask(
      "After Closing",
      new Uint8ClampedArray(closedMat.data),
      width,
    );

    const dilatedMat = new cv.Mat();
    const dilateKernel = cv.Mat.ones(3, 3, cv.CV_8U);
    const anchor = new cv.Point(-1, -1);
    cv.dilate(closedMat, dilatedMat, dilateKernel, anchor, 2);
    logs += logMask(
      "After Dilation",
      new Uint8ClampedArray(dilatedMat.data),
      width,
    );

    const featheredMat = new cv.Mat();
    const ksize = new cv.Size(5, 5);
    cv.GaussianBlur(dilatedMat, featheredMat, ksize, 0, 0, cv.BORDER_DEFAULT);
    logs += logMask(
      "After Blur",
      new Uint8ClampedArray(featheredMat.data),
      width,
    );

    logs += logMask(
      "Before processedMask creation (featheredMat.data)",
      new Uint8ClampedArray(featheredMat.data),
      width,
    );
    console.error(`Type of featheredMat: ${typeof featheredMat}`);
    const featheredMatClone = featheredMat.clone();
    const processedMask = new Uint8ClampedArray(featheredMatClone.data);

    grayMat.delete();
    openKernel.delete();
    openedMat.delete();
    closeKernel.delete();
    closedMat.delete();
    dilatedMat.delete();
    dilateKernel.delete();
    featheredMat.delete();
    featheredMatClone.delete();
    // --- End Inlined ---

    const iou = calculateIoU(processedMask, groundTruthMask);
    logs += `\nCalculated IoU: ${iou}\n`;

    // Force log output
    console.error(logs);

    expect(iou).toBeGreaterThan(0.7);
  });
});
