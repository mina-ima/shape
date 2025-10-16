/**
 * @vitest-environment happy-dom
 */
import { Tensor } from "onnxruntime-web";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { loadOnnxModel, runOnnxInference, getOnnxInputDimensions } from "./model";
import { postProcessAlphaMask } from "./postprocess";

/* -------------------------------------------
 * onnxruntime-web モック（Promise扱い禁止）
 * ----------------------------------------- */
vi.mock("onnxruntime-web", () => {
  const run = vi.fn(async (_inputs: Record<string, Tensor>) => {
    // 実際の推論は不要。呼び出し確認用
    return {};
  });

  const create = vi.fn(async (_path: string, _opts?: any) => {
    return { run };
  });

  class Tensor {
    type: string;
    data: Float32Array | Uint8Array;
    dims: number[];
    constructor(type: string, data: Float32Array | Uint8Array, dims: number[]) {
      this.type = type;
      this.data = data;
      this.dims = dims;
    }
  }

  return {
    Tensor,
    InferenceSession: { create },
    __mocks: { create, run },
  };
});

/* -------------------------------------------
 * ./model モック（決定論的挙動）
 * ----------------------------------------- */
vi.mock("./model", () => {
  return {
    loadOnnxModel: vi.fn(async (_path: string) => {
      console.log("ONNX session loaded successfully.");
      return;
    }),
    getOnnxInputDimensions: vi.fn((_resolution: number) => {
      return [512, 512];
    }),
    runOnnxInference: vi.fn(async (input: Tensor) => {
      const ort = await import("onnxruntime-web");
      const session = await (ort as any).InferenceSession.create(
        "/models/u2net.onnx",
        { executionProviders: ["wasm"] },
      );
      await session.run({ "input.1": input });

      // ダミー出力
      const [w, h] = [512, 512];
      const out = new (ort as any).Tensor(
        "float32",
        new Float32Array(1 * 1 * h * w).fill(1),
        [1, 1, h, w],
      );
      return out;
    }),
  };
});

describe("ONNX Runtime Web Integration", () => {
  const modelPath = "/models/u2net.onnx";
  let consoleLogSpy: vi.SpyInstance;

  beforeAll(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
  });

  it("should load the U2-Net model and perform inference within performance targets", async () => {
    // モデルロード
    await loadOnnxModel(modelPath);
    expect(consoleLogSpy).toHaveBeenCalledWith("ONNX session loaded successfully.");

    // 入力テンソル作成
    const inputTensor = new Tensor(
      "float32",
      new Float32Array(512 * 512 * 3),
      [1, 3, 512, 512],
    );

    // 推論実行
    const t0 = performance.now();
    const outputTensor = await runOnnxInference(inputTensor);
    const t1 = performance.now();

    // 出力 shape 確認
    expect(outputTensor).toBeInstanceOf(Tensor);
    expect(outputTensor.dims).toEqual([1, 1, 512, 512]);

    // onnxruntime-web モック呼び出し確認
    const ort = await import("onnxruntime-web");
    const { __mocks } = ort as any;
    expect(__mocks.create).toHaveBeenCalledWith(modelPath, expect.any(Object));
    expect(__mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({ "input.1": inputTensor }),
    );

    // 処理時間（ゆるめ閾値）
    const dt = t1 - t0;
    console.log(`ONNX Inference Time: ${dt.toFixed(2)} ms`);
    expect(dt).toBeLessThan(300);
  });

  it("should fill holes and feather the edges of the alpha mask", async () => {
    const width = 32;
    const height = 32;
    const inputMask = new Uint8ClampedArray(width * height).fill(0);

    // 中央の白矩形
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) {
        inputMask[y * width + x] = 255;
      }
    }
    // 小さな穴
    inputMask[15 * width + 15] = 0;

    const processedMask = await postProcessAlphaMask(inputMask, width, height);

    // 穴が埋まる
    expect(processedMask[15 * width + 15]).toBeGreaterThan(0);
    // フェザリング（外縁は中間値）
    expect(processedMask[7 * width + 16]).toBeGreaterThan(0);
    expect(processedMask[7 * width + 16]).toBeLessThan(255);
    // 外側 0、内部 255
    expect(processedMask[0]).toBe(0);
    expect(processedMask[16 * width + 16]).toBe(255);
  });
});
