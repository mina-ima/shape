// src/processing.ts
// onnxruntime-web は「型だけ」参照し、値は動的 import で取得してコード分割する
import type { Tensor as OrtTensor } from "onnxruntime-web";
import {
  getOnnxInputDimensions,
  loadOnnxModel,
  runOnnxInference,
} from "./segmentation/model";

// 実モデルの配置に合わせて調整
const DEFAULT_MODEL_PATH = "/models/segmentation.onnx";

export async function runProcessing(
  resolution: number,
  modelPath: string = DEFAULT_MODEL_PATH
) {
  const dims = getOnnxInputDimensions(resolution); // [N, C, H, W]
  const [n, c, h, w] = dims;
  const data = new Float32Array(n * c * h * w);

  // ★ ここを動的 import に変更：静的 import をやめることで別チャンク化
  const { Tensor } = await import("onnxruntime-web");
  const inputTensor = new Tensor("float32", data, dims) as unknown as OrtTensor;

  const session = await loadOnnxModel(modelPath);
  const outputs = await runOnnxInference(session, inputTensor as any);
  return outputs;
}
