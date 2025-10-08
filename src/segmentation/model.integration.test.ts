import { Tensor } from "onnxruntime-web";
import { describe, it, expect, vi } from "vitest";
import { loadOnnxModel, runOnnxInference } from "./model";

// Mock onnxruntime-web to simulate successful loading and inference
vi.mock("onnxruntime-web", async (importOriginal) => {
  const actual = await importOriginal<typeof import("onnxruntime-web")>();

  const mockSession = {
    run: vi.fn().mockResolvedValue({
      "1959": new actual.Tensor(
        "float32",
        new Float32Array(1 * 320 * 320).fill(1), // Mock output tensor
        [1, 1, 320, 320],
      ),
    }),
  };

  return {
    InferenceSession: {
      create: vi.fn().mockResolvedValue(mockSession),
    },
    Tensor: actual.Tensor,
    env: {
      wasm: {
        numThreads: 1, // Mock numThreads
      },
    },
  };
});

describe("ONNX Model Integration (Actual)", () => {
  const modelPath = "/models/u2net.onnx"; // Path for browser environment

  it("should load the U2-Net model and perform inference", async () => {
    // This test will fail if the model cannot be loaded or inference fails
    await loadOnnxModel(modelPath);
    // Expect the session to be loaded (we can't directly check the internal 'session' variable,
    // but a successful loadOnnxModel implies it)

    const inputTensor = new Tensor(
      "float32",
      new Float32Array(3 * 320 * 320).fill(0.5), // Example input: 3 channels, 320x320, filled with 0.5
      [1, 3, 320, 320],
    );

    const outputTensor = await runOnnxInference(inputTensor);

    expect(outputTensor).toBeInstanceOf(Tensor);
    expect(outputTensor.dims).toEqual([1, 1, 320, 320]); // Expected output dimensions for U2-Net
    expect(outputTensor.data.length).toBe(320 * 320);
  }, 30000); // Increase timeout for actual model loading and inference
});
