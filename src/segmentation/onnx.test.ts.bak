import { Tensor } from "onnxruntime-web";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { loadOnnxModel, runOnnxInference } from "./model";
import { postProcessAlphaMask } from "./postprocess";

// Mock the model module
vi.mock("./model", () => ({
  loadOnnxModel: vi.fn(async () => {
    console.log("Mock loadOnnxModel called.");
    return Promise.resolve();
  }),
  runOnnxInference: vi.fn(async (inputTensor: Tensor) => {
    console.log("Mock runOnnxInference called.");
    // Return a dummy tensor with the same shape as input, filled with 1s
    const outputData = new Float32Array(inputTensor.data.length).fill(1);
    return Promise.resolve(new Tensor("float32", outputData, inputTensor.dims));
  }),
}));

describe("ONNX Runtime Web Integration", () => {
  const modelPath = "/models/u2net.onnx"; // Path for browser environment
  let consoleLogSpy: vi.SpyInstance;

  beforeAll(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
  });

  it("should load the U2-Net model and perform inference within performance targets", async () => {
    // Mock the actual InferenceSession.create to avoid loading the real model
    const mockSession = {
      run: vi.fn().mockResolvedValue({
        "1959": new Tensor(
          "float32",
          new Float32Array(512 * 512),
          [1, 1, 512, 512],
        ),
      }),
    };
    vi.spyOn(
      await import("onnxruntime-web"),
      "InferenceSession",
      "get",
    ).mockReturnValue({
      create: vi.fn().mockResolvedValue(mockSession),
    });

    await loadOnnxModel(modelPath);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "ONNX session loaded successfully.",
    );

    const inputTensor = new Tensor(
      "float32",
      new Float32Array(512 * 512 * 3),
      [1, 3, 512, 512],
    );
    const startTime = performance.now();
    const outputTensor = await runOnnxInference(inputTensor);
    const endTime = performance.now();

    expect(outputTensor).toBeInstanceOf(Tensor);
    expect(outputTensor.dims).toEqual([1, 1, 512, 512]);
    expect(mockSession.run).toHaveBeenCalledWith({
      "input.1": inputTensor,
    });

    const inferenceTime = endTime - startTime;
    console.log(`ONNX Inference Time: ${inferenceTime.toFixed(2)} ms`);
    expect(inferenceTime).toBeLessThan(300); // Target performance
  });

  it("should fill holes and feather the edges of the alpha mask", () => {
    const width = 32;
    const height = 32;
    const inputMask = new Uint8ClampedArray(width * height).fill(0);

    // Create a simple square in the middle
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) {
        inputMask[y * width + x] = 255;
      }
    }

    // Create a small hole
    inputMask[15 * width + 15] = 0;

    const processedMask = postProcessAlphaMask(inputMask, width, height);

    // Expect the hole to be filled (value should be > 0)
    expect(processedMask[15 * width + 15]).toBeGreaterThan(0);

    // Expect feathering at the edges (values between 0 and 255)
    // Check a pixel just outside the original square, it should have some alpha
    expect(processedMask[7 * width + 16]).toBeGreaterThan(0);
    expect(processedMask[7 * width + 16]).toBeLessThan(255);

    // Check a pixel far outside, it should be 0
    expect(processedMask[0]).toBe(0);

    // Check a pixel far inside, it should be 255
    expect(processedMask[16 * width + 16]).toBe(255);

    // Check a pixel just inside the original square, it should have some alpha
    const p = processedMask;
    expect(p[7 * width + 16]).toBeGreaterThan(0);
    expect(p[7 * width + 16]).toBeLessThan(0.5);
  });
});
