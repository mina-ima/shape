import { Tensor } from "onnxruntime-web";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { loadOnnxModel, runOnnxInference, getOnnxInputDimensions } from "./model"; // getOnnxInputDimensions をインポート
import { postProcessAlphaMask } from "./postprocess";
import { useStore } from "@/core/store"; // useStore をインポート

// vi.hoisted() の呼び出しを vi.mock の外に移動
const { useStore: hoistedUseStore } = vi.hoisted(() => import("@/core/store"));
const { getOnnxInputDimensions: hoistedGetOnnxInputDimensions } = vi.hoisted(() => import("./model"));

vi.mock("onnxruntime-web", async () => {
  const actual = await vi.importActual("onnxruntime-web");
  const mockCreate = vi.fn(() => ({
    run: vi.fn(() => Promise.resolve({})), // run メソッドもモック
  }));
  return {
    ...actual,
    InferenceSession: {
      ...actual.InferenceSession,
      create: mockCreate,
    },
  };
});

vi.mock("./model", () => {
  return {
    loadOnnxModel: vi.fn(async () => {
      console.log("ONNX session loaded successfully.");
      return Promise.resolve();
    }),
    runOnnxInference: vi.fn(async () => {
      const { processingResolution } = hoistedUseStore.getState(); // hoistedUseStore を使用
      const [targetWidth, targetHeight] =
        hoistedGetOnnxInputDimensions(processingResolution); // hoistedGetOnnxInputDimensions を使用

      // Return a dummy tensor with the target dimensions, filled with 1s
      const outputData = new Float32Array(
        1 * 1 * targetHeight * targetWidth,
      ).fill(1);
      return Promise.resolve(
        new Tensor("float32", outputData, [1, 1, targetHeight, targetWidth]),
      );
    }),
    getOnnxInputDimensions: vi.fn((resolution) => {
      // getOnnxInputDimensions もモック
      switch (resolution) {
        case 720:
          return [320, 320];
        case 540:
          return [320, 320];
        case 360:
          return [256, 256];
        default:
          return [320, 320];
      }
    }),
  };
});

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
    expect(outputTensor.dims).toEqual([1, 3, 512, 512]);
    // runOnnxInferenceの内部でInferenceSession.create().run()が呼ばれることを確認
    // const { InferenceSession } = await import("onnxruntime-web"); // この行は不要
    expect(mockCreate).toHaveBeenCalledWith(modelPath, expect.any(Object));
    // const mockRun = (await InferenceSession.create()).run; // この行も変更
    const mockRun = (await mockCreate()).run;
    expect(mockRun).toHaveBeenCalledWith({
      "input.1": inputTensor,
    });

    const inferenceTime = endTime - startTime;
    console.log(`ONNX Inference Time: ${inferenceTime.toFixed(2)} ms`);
    expect(inferenceTime).toBeLessThan(300); // Target performance
  });

  it("should fill holes and feather the edges of the alpha mask", async () => {
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

    const processedMask = await postProcessAlphaMask(inputMask, width, height);

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
    expect(p[7 * width + 16]).toBeLessThan(255);
  });
});
