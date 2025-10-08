import { describe, it, expect, vi } from "vitest";
import { generateLowPrecisionMask } from "./lowPrecision";
import * as onnx from "onnxruntime-web";

// Mock onnxruntime-web to avoid actual ONNX operations in unit tests
vi.mock("onnxruntime-web", async (importOriginal) => {
  const actual = await importOriginal<typeof onnx>();
  return {
    ...actual,
    Tensor: vi.fn((type, data, dims) => ({ type, data, dims })),
  };
});

describe("generateLowPrecisionMask", () => {
  it("should return a placeholder ONNX Tensor with correct dimensions and data type", async () => {
    const width = 100;
    const height = 50;
    const result = await generateLowPrecisionMask(width, height);

    // Expect the mocked Tensor constructor to have been called
    expect(onnx.Tensor).toHaveBeenCalledWith(
      "float32",
      expect.any(Float32Array),
      [1, 1, height, width],
    );

    // Expect the returned object to have the correct structure
    expect(result).toHaveProperty("type", "float32");
    expect(result).toHaveProperty("dims", [1, 1, height, width]);
    expect(result.data).toBeInstanceOf(Float32Array);
    expect(result.data.length).toBe(width * height);
    // For a placeholder, we expect all values to be 1 (foreground)
    expect(result.data.every((val: number) => val === 1)).toBe(true);
  });
});
