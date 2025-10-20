/**
 * @vitest-environment happy-dom
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import getCV from "@/lib/cv"; // 軽量なテスト用モック
import { postprocess, initialize, runInference } from "./onnx";

// opencv-loader をモックし、テスト用cvを返すようにする
vi.mock("@/lib/opencv-loader", () => ({
  default: getCV,
  loadOpenCV: getCV,
}));
import { loadOnnxModel, runOnnxInference } from "./model";
import { postProcessAlphaMask } from "./postprocess";

/* -------------------------------------------
 * onnxruntime-web モック（Promise扱い禁止）
 * ----------------------------------------- */
vi.mock("onnxruntime-web", () => {
  const run = vi.fn(async (_inputs: Record<string, any>) => {
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
 * モック済みの onnxruntime-web を import して利用
 * ----------------------------------------- */
vi.mock("./model", async () => {
  const ort = await import("onnxruntime-web"); // ← ここで“モック後の”モジュールを取得
  return {
    loadOnnxModel: vi.fn(async (_path: string) => {
      console.log("ONNX session loaded successfully.");
    }),
    getOnnxInputDimensions: vi.fn((_resolution: number) => [512, 512]),
    runOnnxInference: vi.fn(async (input: InstanceType<typeof ort.Tensor>) => {
      const session = await ort.InferenceSession.create("/models/u2net.onnx", {
        executionProviders: ["wasm"],
      });
      await session.run({ "input.1": input });
      // ダミー出力（1x1x512x512）
      const [w, h] = [512, 512];
      return new ort.Tensor(
        "float32",
        new Float32Array(1 * 1 * h * w).fill(1),
        [1, 1, h, w],
      );
    }),
  };
});

describe("ONNX Runtime Web Integration", () => {
  const modelPath = "/models/u2net.onnx";
  let consoleLogSpy: vi.SpyInstance;
  let TensorCtor: any;
  let ort: any;

  beforeAll(async () => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // モック適用済みの onnxruntime-web を取得
    ort = await import("onnxruntime-web");
    TensorCtor = ort.Tensor;
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
  });

  it("should load the U2-Net model and perform inference within performance targets", async () => {
    await loadOnnxModel(modelPath);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "ONNX session loaded successfully.",
    );

    const inputTensor = new TensorCtor(
      "float32",
      new Float32Array(512 * 512 * 3),
      [1, 3, 512, 512],
    );

    const t0 = performance.now();
    const outputTensor = await runOnnxInference(inputTensor);
    const t1 = performance.now();

    expect(outputTensor).toBeInstanceOf(TensorCtor);
    expect(outputTensor.dims).toEqual([1, 1, 512, 512]);

    expect(ort.__mocks.create).toHaveBeenCalledWith(
      modelPath,
      expect.any(Object),
    );
    expect(ort.__mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({ "input.1": inputTensor }),
    );

    const dt = t1 - t0;
    console.log(`ONNX Inference Time: ${dt.toFixed(2)} ms`);
    expect(dt).toBeLessThan(300);
  });

  it("should fill holes and feather the edges of the alpha mask", async () => {
    const width = 32;
    const height = 32;
    const inputMask = new Uint8ClampedArray(width * height).fill(0);

    // 中央の白矩形 + 穴
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) {
        inputMask[y * width + x] = 255;
      }
    }
    inputMask[15 * width + 15] = 0;

    const processedMask = await postProcessAlphaMask(inputMask, width, height);

    expect(processedMask[15 * width + 15]).toBeGreaterThan(0);
    expect(processedMask[7 * width + 16]).toBeGreaterThan(0);
    expect(processedMask[7 * width + 16]).toBeLessThan(255);
    expect(processedMask[0]).toBe(0);
    expect(processedMask[16 * width + 16]).toBe(255);
  });
});
