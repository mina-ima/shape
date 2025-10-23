// src/segmentation/model.integration.test.ts
import { describe, it, expect, vi } from "vitest";

/**
 * 実機ONNXは RUN_REAL_ONNX=1 のときのみ。
 * それ以外は onnxruntime-web をモック。
 */
const runRealOnnx = process.env.RUN_REAL_ONNX === "1";

if (!runRealOnnx) {
  vi.mock("onnxruntime-web", async (importOriginal) => {
    const actual = await importOriginal<typeof import("onnxruntime-web")>();

    const outTensor = new actual.Tensor(
      "float32",
      new Float32Array(1 * 320 * 320).fill(1),
      [1, 1, 320, 320],
    );

    // 実装(runOnnxInference)は outputs をプレーンオブジェクトとして扱うため、
    // Map ではなくオブジェクトを返す
    const mockSession = {
      outputNames: ["out", "1959"],
      run: vi.fn().mockResolvedValue({
        out: outTensor,
        "1959": outTensor,
      }),
    };

    return {
      InferenceSession: { create: vi.fn().mockResolvedValue(mockSession) },
      Tensor: actual.Tensor,
      env: { wasm: { numThreads: 1 } },
    };
  });
}

import { Tensor } from "onnxruntime-web";
const { loadOnnxModel, runOnnxInference } = await import("./model");

describe("ONNX Model Integration (Actual)", () => {
  // 404回避のため u2netp に統一
  const modelPath = "/models/u2netp.onnx";

  it(
    "should load the U2-Net model and perform inference",
    async () => {
      await loadOnnxModel(modelPath);

      const inputTensor = new Tensor(
        "float32",
        new Float32Array(3 * 320 * 320).fill(0.5),
        [1, 3, 320, 320],
      );

      const outputTensor = await runOnnxInference(inputTensor);

      expect(outputTensor).toBeInstanceOf(Tensor);
      expect(outputTensor.dims).toEqual([1, 1, 320, 320]);
      expect(outputTensor.data.length).toBe(320 * 320);
    },
    30_000,
  );
});
